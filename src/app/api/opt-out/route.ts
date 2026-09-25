import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { REMOVAL_DAYS, findListings } from "@/lib/suppression";
import { canWrite, currentEnv } from "@/lib/db";
import type { Market } from "@/lib/types";

/**
 * Receive a removal request (S1-09).
 *
 * ## Why this does not remove anything
 *
 * The opt-out page says, in its own words, that "an opt-out anyone could file
 * for anyone else would be a tool for erasing a competitor". A web form where
 * you type a domain and the business disappears **is that tool**. Typing
 * `info@theircompany.com` proves nothing: the listed domain and phone are
 * public — they are on the business's own website, which is where we got them.
 *
 * Matching the claim against the listing is therefore a filter, not a proof. It
 * stops a request naming a business whose details the sender does not even
 * know, and that is all it does.
 *
 * So a request lands **pending**: a row with `remove_by` set and `effective_at`
 * null, which the public read policy does not serve. It becomes effective when
 * confirmed through the contact **already on the listing** — not the one typed
 * into the form — because that is the only channel the real owner is known to
 * control.
 *
 * **There is no mailer yet, so that confirmation step is manual today.** That
 * is a gap and it is named in `docs/LAUNCH-CHECKLIST.md` rather than papered
 * over by making the form take effect on its own. The alternative — immediate
 * suppression from an unverified form — would remove businesses faster and be
 * the exact thing the page promises it is not.
 *
 * ## Why a domain, not a business id
 *
 * An owner does not know our internal id, and a domain is what they have. It
 * also handles the case the billing rules already had to: one domain covering
 * several branches. Every listing matching the claim gets a pending row, so a
 * chain that asks to be removed is removed everywhere rather than at the one
 * location whose id someone happened to find.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Listing = { id: string; name: string; site: string | null; phone: string | null; addr: string };

let cache: Listing[] | null = null;

/** Every listing we serve, from the measured market files. Cached per instance:
 *  four markets is a few megabytes and an opt-out form should not re-parse them
 *  on every keystroke of a retry. */
async function listings(): Promise<Listing[]> {
  if (cache) return cache;
  const dir = path.join(process.cwd(), "public", "data");
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith(".json") && !f.startsWith("contacts-") && f !== "index.json" &&
      f !== "suppressed.json" && f !== "benchmark.json",
  );
  const out: Listing[] = [];
  for (const f of files) {
    try {
      const market = JSON.parse(await readFile(path.join(dir, f), "utf8")) as Market;
      for (const b of market.businesses ?? []) {
        out.push({ id: b.id, name: b.name, site: b.site, phone: b.phone, addr: b.addr });
      }
    } catch {
      // A market file that will not parse is our problem, not the requester's.
      // Skipping it can only under-match, which fails toward "we found nothing"
      // rather than toward removing the wrong business.
    }
  }
  cache = out;
  return out;
}

async function recordPending(rows: Listing[], method: "domain" | "phone") {
  const env = currentEnv();
  const removeBy = new Date(Date.now() + REMOVAL_DAYS * 86_400_000).toISOString();
  const res = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/suppressions`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json",
        // A second request for the same business is not an error — it is
        // someone chasing. Keep the first `requested_at`, which is the one the
        // seven days run from.
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(
        rows.map((r) => ({ business_id: r.id, method, remove_by: removeBy })),
      ),
    },
  );
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return removeBy;
}

export async function POST(request: Request) {
  let claim = "";
  try {
    claim = String(((await request.json()) as { claim?: unknown }).claim ?? "").trim();
  } catch {
    return Response.json({ ok: false, reason: "Send JSON with a `claim`." }, { status: 400 });
  }

  if (claim.length < 4) {
    return Response.json(
      {
        ok: false,
        reason:
          "Give the website or phone number as it appears on your listing — that is what we match against.",
      },
      { status: 400 },
    );
  }

  const hits = findListings(await listings(), claim);
  if (!hits.length) {
    return Response.json({
      ok: false,
      matched: 0,
      reason:
        "Nothing we hold matches that website or phone number. That may mean you " +
        "are not in Small Fish at all, which is the most likely answer — we cover " +
        "four metro areas. If you believe you are, reply with the business name " +
        "and we will look by hand.",
    });
  }

  const method: "domain" | "phone" = claim.includes("@") || claim.includes(".")
    ? "domain"
    : "phone";

  if (!canWrite()) {
    return Response.json(
      {
        ok: false,
        matched: hits.length,
        reason:
          `We can see ${hits.length === 1 ? "the listing" : `${hits.length} listings`} ` +
          "you mean, but the database this would be recorded in is not configured " +
          "on this deployment, so nothing has been filed. Email us and it will be " +
          "handled by hand — that route works today and is not a fob-off.",
        listings: hits.map((h) => ({ name: h.name, addr: h.addr })),
      },
      { status: 503 },
    );
  }

  try {
    const removeBy = await recordPending(hits, method);
    return Response.json({
      ok: true,
      matched: hits.length,
      removeBy,
      // Said plainly, because the failure mode of a form like this is a person
      // believing they are removed when they are not.
      reason:
        `Filed for ${hits.length === 1 ? "this listing" : `all ${hits.length} of these listings`}. ` +
        "**You are not removed yet.** We confirm through the contact already on " +
        "the listing, not the one typed here, because otherwise anyone could file " +
        "this for anyone. Once confirmed you are gone from every future search and " +
        `export, and that will happen within ${REMOVAL_DAYS} days.`,
      listings: hits.map((h) => ({ name: h.name, addr: h.addr })),
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        matched: hits.length,
        reason:
          "We could not file that just now, and rather than tell you it worked: " +
          String(err instanceof Error ? err.message : err),
      },
      { status: 500 },
    );
  }
}
