/**
 * Does the configured provider actually return what `Candidate` promises?
 *
 * ## Why this exists rather than flipping the default and finding out
 *
 * Google Maps actors differ in what they take and what they call things. A
 * wrong field mapping does not fail loudly — it **runs, bills, and returns rows
 * with no website**, which the rest of the product reads as "this market has
 * almost nobody worth reading". That is the expensive failure, because the bill
 * arrives and the conclusion is wrong, and nothing on a screen says so.
 *
 * So `SUPPLY_PROVIDER` stays unset until one small query has been looked at
 * field by field. This route is that query: **five rows, once, nothing stored.**
 * At Compass's $1.50 per 1,000 places it costs well under a cent.
 *
 * ## What it refuses to do
 *
 * - **It stores nothing.** No job, no `job_sites`, no ledger row. It is a
 *   diagnostic, and a diagnostic that writes is a migration nobody reviewed.
 * - **It needs an account.** Signed out, it says so and spends nothing. The
 *   call costs real money, so it is not left open to the internet.
 * - **It caps at five rows** whatever is asked, so a loop on it cannot become a
 *   bill. `ROWS` is the ceiling, not a default.
 * - **It never prints a key.** It reports *whether* each variable is set, which
 *   is the only part that helps, and `providers.ts` already phrases the
 *   unavailable case without the value.
 *
 * ## Reading the answer
 *
 * `mapped` is the point. Every field of `Candidate` with the share of the five
 * rows that carried it, so a mapping that silently dropped `site` or `phone`
 * shows up as `0/5` beside a `name` of `5/5` — which is the shape of the defect
 * this is looking for. `sample` is three rows with the fields as they arrived.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser } from "@/lib/accounts";
import { findCandidates, readable } from "@/lib/providers";
import { resolveRegion, type Places } from "@/lib/region";
import { matchTrade, type Taxonomy } from "@/lib/trades";

export const dynamic = "force-dynamic";
/** One actor run plus a region resolve. The platform default is tighter than
 *  an actor's cold start, and a diagnostic that times out teaches nothing. */
export const maxDuration = 60;

async function json<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", name), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

/** The hard ceiling. Five is enough to see a mapping and too few to be a bill. */
const ROWS = 5;

/** A small, dense market, so five rows come back fast and the query is cheap. */
const TRADE = "dentists";
const WHERE = "Austin, TX";

const set = (name: string) => Boolean(process.env[name]?.trim());

export async function GET() {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { ok: false, reason: "Sign in first. This call costs money, so it is not open." },
      { status: 401 },
    );
  }
  const acct = await accountForUser(userId);
  if (!acct) {
    return Response.json({ ok: false, reason: "No workspace for this user." }, { status: 403 });
  }

  const env = {
    APIFY_TOKEN: set("APIFY_TOKEN"),
    APIFY_ACTOR: set("APIFY_ACTOR"),
    // The actor as configured, which is not a secret and is the single most
    // likely thing to be wrong. Both separators work; see `actorPath`.
    actor: process.env.APIFY_ACTOR?.trim() || null,
    SUPPLY_PROVIDER: process.env.SUPPLY_PROVIDER?.trim() || null,
  };

  if (!env.APIFY_TOKEN || !env.APIFY_ACTOR) {
    return Response.json(
      {
        ok: false,
        env,
        reason:
          "Both APIFY_TOKEN and APIFY_ACTOR are needed. There is no safe default actor: " +
          "actors differ in what they take and return.",
      },
      { status: 400 },
    );
  }

  const [places, taxo] = await Promise.all([
    json<Places>("places-us.json"),
    json<Taxonomy>("trades.json"),
  ]);
  const region = places ? resolveRegion(places, WHERE) : null;
  const trade = taxo ? matchTrade(taxo, TRADE) : null;
  if (!region || !trade?.best) {
    return Response.json(
      { ok: false, env, reason: "Could not resolve the fixed probe market." },
      { status: 500 },
    );
  }

  const started = Date.now();
  const supply = await findCandidates(
    { categories: trade.best.categories, trade: TRADE, region, rows: true, limit: ROWS },
    // Named explicitly rather than read from the environment, so this answers
    // "does Apify work" even while the default is still Overture.
    "apify",
  );

  const rows = (supply.rows ?? []).slice(0, ROWS);
  const share = (n: number) => `${n}/${rows.length}`;
  const count = (f: (r: (typeof rows)[number]) => unknown) =>
    share(rows.filter((r) => Boolean(f(r))).length);

  return Response.json({
    ok: true,
    env,
    // Which provider actually answered. `providers.ts` falls back to Overture
    // when a provider has a bad afternoon, and a fallback read as a success is
    // how somebody concludes the actor works when it does not.
    answeredBy: supply.source,
    fellBack: supply.source !== "apify",
    degraded: supply.degraded ?? null,
    ms: Date.now() - started,
    found: rows.length,
    withSite: readable(rows).length,
    mapped: {
      id: count((r) => r.id),
      name: count((r) => r.name),
      site: count((r) => r.site),
      phone: count((r) => r.phone),
      addr: count((r) => r.addr),
      // A location of 0,0 is the null island and is a mapping failure, not a
      // business in the Gulf of Guinea.
      latlon: count((r) => r.lat !== 0 && r.lon !== 0),
      rating: count((r) => typeof r.rating === "number"),
      reviews: count((r) => typeof r.reviews === "number"),
    },
    // Ids are namespaced per provider and that is load-bearing for every
    // unlock and suppression row, so it is shown rather than assumed.
    idsLookRight: rows.every((r) => r.id.startsWith("apify:")),
    sample: rows.slice(0, 3).map((r) => ({
      id: r.id,
      name: r.name,
      site: r.site,
      phone: r.phone,
      addr: r.addr,
      lat: r.lat,
      lon: r.lon,
      rating: r.rating ?? null,
      reviews: r.reviews ?? null,
      source: r.source,
    })),
  });
}
