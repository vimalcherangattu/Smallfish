/**
 * Getting the rows there, and holding the keys that let us (S2-02) —
 * server-side only.
 *
 * `integrations.ts` decides what leaves and what each destination refuses, with
 * no network and no secrets. This file is the part that cannot be tested
 * without somebody's live account, so it is deliberately thin and its
 * judgement calls are written down rather than buried in a request.
 *
 * ## Credentials
 *
 * A HubSpot private-app token or a Smartlead key is the customer's, and it does
 * far more than we need it to — a HubSpot token that can write companies can
 * usually read every contact they have. Storing that in plain text in a table
 * means a database leak is a breach of every customer's CRM, not of ours.
 *
 * So the token is encrypted with AES-256-GCM before it is stored, under a key
 * held in the environment as `INTEGRATION_SECRET_KEY` and nowhere else, and the
 * limits of that are worth being exact about:
 *
 *   - It defends against a **database** leak — a dump, a stolen backup, a
 *     misconfigured view like the one 0006 closed. That is the likely one.
 *   - It defends against **nothing** if the running server is compromised,
 *     because the server necessarily has the key.
 *   - There is no key rotation without re-encrypting every row, which is a
 *     migration and is not written yet.
 *
 * A KMS or a vault would fix the second point. We do not have one, and
 * pretending the envelope is stronger than it is would be worse than saying
 * this. What is stored beside the ciphertext is a hint — the last four
 * characters — so a customer can tell which key is connected without our being
 * able to show it back to them.
 *
 * ## Webhooks
 *
 * We sign; they verify. The signature covers the timestamp as well as the body,
 * so a delivery that is captured cannot be replayed a week later against an
 * endpoint that only checks the digest.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  DESTINATIONS,
  HUBSPOT_GROUP,
  HUBSPOT_PROPERTIES,
  assertNoRefusalText,
  hubspotUpsertBody,
  instantlyBodies,
  missingProperties,
  smartleadBody,
  type DestinationKind,
  type PushRow,
} from "@/lib/integrations";

// ---------------------------------------------------------- the envelope --

const KEY_ENV = "INTEGRATION_SECRET_KEY";

function key(): Buffer {
  const raw = process.env[KEY_ENV] ?? "";
  // 32 bytes, as hex or base64. Refusing a short key is the point: a 6-character
  // "secret" padded to length would encrypt perfectly and protect nothing.
  const buf = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `${KEY_ENV} must be 32 bytes, as 64 hex characters or base64. ` +
        "Generate one with: openssl rand -hex 32",
    );
  }
  return buf;
}

export const encryptionConfigured = () => {
  try {
    key();
    return true;
  } catch {
    return false;
  }
};

/** `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version prefix is what
 *  makes a future rotation possible without guessing at old rows. */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

export function openSecret(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) {
    throw new Error("This stored credential is not in a format this build understands.");
  }
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

/** What a customer is shown instead of their key. Never the key. */
export const secretHint = (plain: string) =>
  plain.length <= 4 ? "••••" : `••••${plain.slice(-4)}`;

// ------------------------------------------------------------- signatures --

/**
 * `t=<unix>,v1=<hex>` over `<timestamp>.<body>`, the shape Stripe uses.
 *
 * Borrowed rather than invented because a customer verifying it can follow any
 * of a hundred existing write-ups, and because the timestamp being *inside* the
 * signed string is the part people leave out when they invent their own.
 */
export function signWebhook(secret: string, body: string, atSeconds: number): string {
  const mac = createHmac("sha256", secret).update(`${atSeconds}.${body}`).digest("hex");
  return `t=${atSeconds},v1=${mac}`;
}

/** For the docs and for our own tests: verify the way a customer should. */
export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSeconds - t) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(parts.v1 ?? ""), "utf8");
  // Length has to match before `timingSafeEqual`, which throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

// ------------------------------------------------------------- delivering --

export interface Delivery {
  ok: boolean;
  sent: number;
  /** What the destination said, when it said no. Shown to the customer as-is:
   *  "HubSpot said X" is more use than "the push failed". */
  error?: string;
  /** Ids the destination assigned, for the push receipts. */
  externalIds?: Record<string, string>;
}

/** The endpoint a customer's webhook may not point at.
 *
 *  Same reasoning as `seller.ts`: this is a URL somebody typed that our server
 *  then fetches. Without this, a webhook destination is a server-side request
 *  forgery hole with a settings form in front of it. */
export function safeEndpoint(raw: string): URL | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== "https") return null;
  let u: URL;
  try {
    u = new URL(scheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.startsWith("[") ||
    !host.includes(".")
  ) {
    return null;
  }
  return u;
}

async function asJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text.slice(0, 500) };
  }
}

/**
 * Does the portal have somewhere to put the evidence?
 *
 * Run before any company is written. HubSpot rejects a whole batch when it
 * contains an unknown property, so the failure would be visible — but visible
 * as "400 PROPERTY_DOESNT_EXIST" halfway through a customer's first push, which
 * is a worse place to learn it than a connect screen.
 */
export async function hubspotPreflight(
  token: string,
): Promise<{ ok: boolean; missing: string[]; error?: string }> {
  const res = await fetch("https://api.hubapi.com/crm/v3/properties/companies", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await asJson(res);
    return { ok: false, missing: [], error: `HubSpot said ${res.status}: ${body.message ?? ""}` };
  }
  const body = (await res.json()) as { results?: { name: string }[] };
  const missing = missingProperties((body.results ?? []).map((p) => p.name));
  return { ok: missing.length === 0, missing };
}

/** Create the properties the evidence needs. Needs `crm.schemas.companies.write`. */
export async function hubspotCreateProperties(
  token: string,
  only?: string[],
): Promise<{ created: string[]; failed: { name: string; error: string }[] }> {
  const created: string[] = [];
  const failed: { name: string; error: string }[] = [];
  const wanted = only?.length
    ? HUBSPOT_PROPERTIES.filter((p) => only.includes(p.name))
    : HUBSPOT_PROPERTIES;

  for (const p of wanted) {
    const res = await fetch("https://api.hubapi.com/crm/v3/properties/companies", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, groupName: HUBSPOT_GROUP }),
    });
    if (res.ok) created.push(p.name);
    else {
      const body = await asJson(res);
      failed.push({ name: p.name, error: String(body.message ?? res.status) });
    }
  }
  return { created, failed };
}

export async function deliver(args: {
  kind: DestinationKind;
  /** The decrypted credential. Webhooks use it to sign, not to authenticate. */
  secret: string;
  target?: string | null;
  rows: PushRow[];
  /** Everything a webhook body carries beyond the rows. */
  webhookBody?: unknown;
  now?: number;
}): Promise<Delivery> {
  const { kind, secret, target, rows } = args;
  if (!rows.length && kind !== "webhook") return { ok: true, sent: 0 };

  // The last line of defence before a merge variable becomes an email. `prepare`
  // has already refused these rows; this is here because "already refused
  // upstream" is exactly the assumption that stops being true during a
  // refactor, and the cost of it being wrong is a message sent to a stranger.
  if (DESTINATIONS[kind].sends) {
    assertNoRefusalText(rows.map((r) => ({ i: r.icebreaker, w: r.whyItMatched })));
  }

  switch (kind) {
    case "hubspot": {
      const res = await fetch(
        "https://api.hubapi.com/crm/v3/objects/companies/batch/upsert",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify(hubspotUpsertBody(rows)),
        },
      );
      const body = await asJson(res);
      if (!res.ok) {
        return { ok: false, sent: 0, error: `HubSpot said ${res.status}: ${body.message ?? ""}` };
      }
      const results = (body.results ?? []) as { id: string; properties?: Record<string, string> }[];
      const externalIds: Record<string, string> = {};
      for (const r of results) {
        const id = r.properties?.smallfish_business_id;
        if (id) externalIds[id] = r.id;
      }
      return { ok: true, sent: results.length || rows.length, externalIds };
    }

    case "instantly": {
      // One request per lead, and the count returned is the count that actually
      // landed — a partial failure reports partially, rather than claiming all
      // of them and leaving the customer to discover the gap in their campaign.
      let sent = 0;
      const externalIds: Record<string, string> = {};
      for (const [i, body] of instantlyBodies(rows, String(target ?? "")).entries()) {
        const res = await fetch("https://api.instantly.ai/api/v2/leads", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await asJson(res);
          return {
            ok: false,
            sent,
            externalIds,
            error: `Instantly said ${res.status} on row ${i + 1} of ${rows.length}: ${err.message ?? ""}`,
          };
        }
        const ok = await asJson(res);
        if (typeof ok.id === "string") externalIds[rows[i].businessId] = ok.id;
        sent += 1;
      }
      return { ok: true, sent, externalIds };
    }

    case "smartlead": {
      // Smartlead takes the key in the query string. That is their design, not
      // a choice — it means the key lands in any proxy or access log between
      // here and them, which is worth a customer knowing before they paste one.
      const url = `https://server.smartlead.ai/api/v1/campaigns/${encodeURIComponent(
        String(target ?? ""),
      )}/leads?api_key=${encodeURIComponent(secret)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smartleadBody(rows)),
      });
      const body = await asJson(res);
      if (!res.ok) {
        return { ok: false, sent: 0, error: `Smartlead said ${res.status}: ${body.message ?? ""}` };
      }
      const added = Number(body.upload_count ?? rows.length);
      return { ok: true, sent: Number.isFinite(added) ? added : rows.length };
    }

    case "webhook": {
      const url = safeEndpoint(String(target ?? ""));
      if (!url) {
        return {
          ok: false,
          sent: 0,
          error:
            "That endpoint is not a public https URL. Private addresses and " +
            "plain http are refused — the first because our server would be " +
            "fetching your network, the second because the rows would cross " +
            "the internet in the clear.",
        };
      }
      const payload = JSON.stringify(args.webhookBody ?? { rows });
      const at = Math.floor((args.now ?? Date.now()) / 1000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Smallfish-Signature": signWebhook(secret, payload, at),
          "User-Agent": "SmallfishBot/1.0 (+https://www.getsmallfish.com/bot)",
        },
        body: payload,
      });
      if (!res.ok) {
        return { ok: false, sent: 0, error: `Your endpoint answered ${res.status}.` };
      }
      return { ok: true, sent: rows.length };
    }
  }
}

// Same guard as `accounts.ts`. This module decrypts customer CRM tokens; a
// bundler pulling it into a client component would ship the code that does it
// alongside the page that calls it.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/deliver.ts is server-only — it decrypts customers' CRM credentials. " +
      "Call it from a route handler, never from a client component.",
  );
}
