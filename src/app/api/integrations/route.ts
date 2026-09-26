import { auth } from "@clerk/nextjs/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  accountForUser,
  createDestination,
  destinationsFor,
  destinationWithCipher,
  NotConfigured,
  pushedThenSuppressed,
  recordPush,
} from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { suppressedIds } from "@/lib/db";
import {
  deliver,
  encryptionConfigured,
  hubspotCreateProperties,
  hubspotPreflight,
  openSecret,
  safeEndpoint,
  sealSecret,
  secretHint,
} from "@/lib/deliver";
import {
  DESTINATIONS,
  isDestinationKind,
  prepare,
  pushSummary,
  toPushRows,
  webhookBody,
} from "@/lib/integrations";
import type { Market } from "@/lib/types";

/**
 * Connect a destination, list the ones already connected, and push rows to
 * one (S2-02).
 *
 * The workspace comes from the session, never from the body — the same rule
 * `checkout/route.ts` states, for the same reason, and with a sharper edge
 * here: a destination id in a request body that was not scoped to the caller's
 * account would let anyone push rows into somebody else's CRM using somebody
 * else's token. `destinationWithCipher` puts `account_id` in the query rather
 * than checking it afterwards, because this route holds the service role and
 * the service role is past every policy that would otherwise catch it.
 *
 * Three verbs on one route, because they share all of that:
 *
 *   GET    — destinations, and anything pushed that has since opted out
 *   POST   — connect a destination (the credential is sealed before storage)
 *   PUT    — push a market's matches to a destination
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function workspace() {
  if (!CLERK_ENABLED) {
    return {
      error: Response.json(
        { ok: false, reason: "Accounts are not switched on on this deployment." },
        { status: 503 },
      ),
    };
  }
  const { userId } = await auth();
  if (!userId) {
    return {
      error: Response.json(
        { ok: false, reason: "Sign in first.", signIn: "/sign-in" },
        { status: 401 },
      ),
    };
  }
  const account = await accountForUser(userId);
  if (!account) {
    return {
      error: Response.json(
        {
          ok: false,
          reason:
            "You have no workspace yet. Open your account page once and it will " +
            "make one, then try again.",
        },
        { status: 409 },
      ),
    };
  }
  return { accountId: account.id };
}

/**
 * Reading the destination list is not an action that can fail.
 *
 * This used to reuse `workspace()`, so a signed-out visitor opening the app got
 * a 401 — or a 503 on a deployment without accounts — and a red line in their
 * console on every single page load, for the entirely ordinary fact of not
 * being signed in. **A GET whose honest answer is "none" answers 200 with
 * none.** Non-2xx is kept for the writes below, where the request really
 * cannot proceed.
 *
 * `signedIn` travels with the empty list so the page can tell "you have no
 * destinations" from "you cannot have any yet", which are different sentences
 * and want different buttons.
 */
export async function GET() {
  const empty = (signedIn: boolean, note: string) =>
    Response.json({
      ok: true,
      signedIn,
      note,
      destinations: [],
      optedOutAfterPush: [],
      catalogue: DESTINATIONS,
    });

  if (!CLERK_ENABLED) {
    return empty(false, "Accounts are not switched on on this deployment.");
  }

  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return empty(false, "Sign in to connect a destination.");
  }
  if (!userId) return empty(false, "Sign in to connect a destination.");

  let accountId: string;
  try {
    const account = await accountForUser(userId);
    if (!account) {
      return empty(
        true,
        "Open your account page once to create a workspace, then you can connect one.",
      );
    }
    accountId = account.id;
  } catch (err) {
    if (err instanceof NotConfigured) {
      return empty(false, "The database is not configured on this deployment.");
    }
    throw err;
  }

  const w = { accountId };

  try {
    const [destinations, opted] = await Promise.all([
      destinationsFor(w.accountId!),
      pushedThenSuppressed(w.accountId!),
    ]);
    return Response.json({
      ok: true,
      destinations,
      // The half of S1-09 a CRM makes possible. An owner who opts out cannot
      // have their row pulled back out of a customer's spreadsheet, but a row
      // pushed to HubSpot has an id, so the customer can be told exactly which
      // record to delete instead of being told it is too late.
      optedOutAfterPush: opted,
      catalogue: DESTINATIONS,
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}

export async function POST(request: Request) {
  const w = await workspace();
  if (w.error) return w.error;

  if (!encryptionConfigured()) {
    return Response.json(
      {
        ok: false,
        reason:
          "This deployment has no INTEGRATION_SECRET_KEY, so a credential " +
          "cannot be stored safely. Rather than keep your token in the clear, " +
          "this refuses — see docs/SETUP.md.",
      },
      { status: 503 },
    );
  }

  let body: { kind?: unknown; name?: unknown; target?: unknown; secret?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const kind = String(body.kind ?? "");
  const secret = String(body.secret ?? "");
  const target = body.target == null ? null : String(body.target);

  if (!isDestinationKind(kind)) {
    return Response.json({ ok: false, reason: `No destination "${kind}".` }, { status: 400 });
  }
  if (!secret) {
    return Response.json(
      {
        ok: false,
        reason:
          kind === "webhook"
            ? "Choose a signing secret. We sign every delivery with it so your endpoint can tell ours from anyone else's."
            : "Paste the API key or private app token.",
      },
      { status: 400 },
    );
  }

  const spec = DESTINATIONS[kind];
  if (spec.target === "campaign" && !target) {
    return Response.json(
      { ok: false, reason: `${spec.label} needs the campaign id the rows should land in.` },
      { status: 400 },
    );
  }
  if (spec.target === "endpoint" && !safeEndpoint(target ?? "")) {
    return Response.json(
      {
        ok: false,
        reason:
          "That endpoint is not a public https URL. Private addresses and plain " +
          "http are refused — the first because our server would be fetching " +
          "your network, the second because the rows would cross the internet " +
          "in the clear.",
      },
      { status: 400 },
    );
  }

  // HubSpot is checked before anything is stored. A connection that looks
  // saved and then fails on the first push is worse than a refusal now, and
  // the failure it would produce — companies written with no evidence on them
  // — is the one this product cannot ship.
  if (kind === "hubspot") {
    const pre = await hubspotPreflight(secret);
    if (pre.error) {
      return Response.json({ ok: false, reason: pre.error }, { status: 400 });
    }
    if (!pre.ok) {
      const made = await hubspotCreateProperties(secret, pre.missing);
      if (made.failed.length) {
        return Response.json(
          {
            ok: false,
            reason:
              "Your HubSpot portal is missing the properties that hold the " +
              "evidence, and this token cannot create them. Add the " +
              "`crm.schemas.companies.write` scope to the private app, or " +
              "create them by hand.",
            missing: made.failed,
          },
          { status: 400 },
        );
      }
    }
  }

  try {
    const row = await createDestination({
      accountId: w.accountId!,
      kind,
      name: String(body.name ?? spec.label),
      target,
      cipher: sealSecret(secret),
      secretHint: secretHint(secret),
    });
    return Response.json({ ok: true, destination: row });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}

export async function PUT(request: Request) {
  const w = await workspace();
  if (w.error) return w.error;

  let body: { destinationId?: unknown; market?: unknown; criterion?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const marketId = String(body.market ?? "");
  if (!/^[a-z0-9-]+$/.test(marketId)) {
    return Response.json({ ok: false, reason: "Unknown market." }, { status: 400 });
  }

  let market: Market;
  try {
    const file = path.join(process.cwd(), "public", "data", `${marketId}.json`);
    market = JSON.parse(await readFile(file, "utf8")) as Market;
  } catch {
    return Response.json({ ok: false, reason: `No market "${marketId}".` }, { status: 404 });
  }

  const found = await destinationWithCipher(w.accountId!, String(body.destinationId ?? ""));
  if (!found) {
    return Response.json(
      { ok: false, reason: "No such destination in this workspace." },
      { status: 404 },
    );
  }
  const { destination, cipher } = found;
  const kind = destination.kind;
  if (!isDestinationKind(kind)) {
    return Response.json({ ok: false, reason: "That destination is of an unknown kind." }, { status: 500 });
  }
  const spec = DESTINATIONS[kind];

  const criterionId = String(body.criterion ?? "");
  const criteria = market.criteria.filter((c) => !criterionId || c.id === criterionId);
  if (!criteria.length) {
    return Response.json({ ok: false, reason: "No such criterion." }, { status: 404 });
  }

  // The suppression list is the app's, read the same way every other surface
  // reads it. A destination that skipped it would be the one place the
  // seven-day promise quietly did not apply.
  // One reader for both surfaces, and it reads the database as well as the
  // committed file — see `suppressedIds`. Hand-rolling this here read only the
  // file, so anyone who opted out since the last deploy would still have gone
  // out in an export.
  const { ids: suppressed } = await suppressedIds(
    (f) => readFile(f, "utf8"),
    path.join(process.cwd(), "public", "data"),
  );

  const published: Record<string, string> = {};
  for (const b of market.businesses) {
    // Only an address the business publishes on its own site, which is the only
    // kind S1-05 ever records. Nothing is patterned from the domain.
    const contact = (b as unknown as { contact?: { email?: string } }).contact;
    if (contact?.email) published[b.id] = contact.email;
  }

  const { rows, refused: gateRefused } = toPushRows(market.businesses, criteria, {
    ent: { suppressed },
    emails: published,
  });
  const { ready, refused: destRefused } = prepare(kind, rows);
  const refused = [...gateRefused, ...destRefused];

  if (!ready.length) {
    return Response.json({
      ok: true,
      sent: 0,
      summary: pushSummary({ destination: spec, sent: 0, refused }),
      refused: refused.length,
    });
  }

  let secret: string;
  try {
    secret = openSecret(cipher);
  } catch {
    return Response.json(
      {
        ok: false,
        reason:
          "This deployment cannot open the stored credential — INTEGRATION_SECRET_KEY " +
          "is missing or has changed. Reconnect the destination.",
      },
      { status: 503 },
    );
  }

  const result = await deliver({
    kind,
    secret,
    target: destination.target,
    rows: ready,
    webhookBody:
      kind === "webhook"
        ? webhookBody({
            marketId,
            criteria,
            rows: ready,
            refused,
            sentAt: new Date().toISOString(),
          })
        : undefined,
  });

  // Receipts for what actually landed, and only that. Writing a receipt for a
  // row the destination rejected would make the next push skip it, which is
  // how a row silently never arrives.
  if (result.sent > 0) {
    await Promise.all(
      ready.slice(0, result.sent).map((r) =>
        recordPush({
          accountId: w.accountId!,
          destinationId: destination.id,
          businessId: r.businessId,
          externalId: result.externalIds?.[r.businessId] ?? null,
        }),
      ),
    );
  }

  return Response.json({
    ok: result.ok,
    sent: result.sent,
    error: result.error,
    refused: refused.length,
    summary: pushSummary({ destination: spec, sent: result.sent, refused }),
  });
}
