/**
 * Two fields in, a real pool count out (PRD v2, milestone 2).
 *
 * ## Why this is a new route and not a change to `/api/supply`
 *
 * `/api/supply` answers a different, larger question: it takes a *sentence*,
 * pulls a criterion out of it, and returns counts, sizing, what a scan would
 * cost, the balance and the checks the engine can settle. All of that is still
 * the live flow and still works.
 *
 * PRD v2's step 2 is smaller and comes earlier: **a kind of business, a place,
 * and nothing else.** No criterion, no sizing, no account. Bolting a second
 * mode onto `/api/supply` would have put a signed-out stranger's first screen
 * through the code path that reads balances and offers checks, which is how a
 * free top-of-funnel grows a dependency on a logged-in account.
 *
 * ## Two stages, because one of them has to be instant and the other cannot be
 *
 * The PRD wants a count in under five seconds. A city-sized Overture scan takes
 * about nine, and no amount of arranging changes that. What it *also* wants is
 * that the number is never invented — and those two together decide the shape:
 *
 * - **`resolve`** reads two JSON files and answers immediately: the trade we
 *   matched, the other readings we could have taken, and the place. This is the
 *   sub-second half, and it answers the question a stranger actually has after
 *   typing "plumers in dallas", which is *did you understand me*.
 * - **`count`** runs the scan and answers with the true total.
 *
 * Between them the screen says "counting", not a number. See `pool.ts` for why
 * a rising count would be theatre we cannot honestly perform.
 *
 * ## It never starts anything and never spends a credit
 *
 * Same split as `/api/supply`: this route reads. `/api/jobs` is the one that
 * queues work and spends money. A count has to be free and repeatable, because
 * the whole point is that somebody can look before they buy.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { poolClaim, sampleRows, thinness } from "@/lib/pool";
import { COUNTING, findCandidates } from "@/lib/providers";
import { resolveRegion, type Places } from "@/lib/region";
import { matchTrade, suggestTrade, type Taxonomy } from "@/lib/trades";

export const dynamic = "force-dynamic";
/** Denver dentists measured 9.4s: four categories, 2,048 listings, one scan. */
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

/** Both fields, trimmed and bounded. Long enough for "heating and air
 *  conditioning contractors", short enough that nobody pastes an essay. */
const field = (v: unknown) => String(v ?? "").trim().slice(0, 120);

export async function POST(req: Request) {
  let body: { trade?: unknown; where?: unknown; stage?: unknown; categories?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Expected JSON." }, { status: 400 });
  }

  const typedTrade = field(body.trade);
  const typedWhere = field(body.where);
  const stage = body.stage === "count" ? "count" : "resolve";

  // Each field is refused on its own, because "tell us what to look for" when
  // the trade is filled and the place is empty sends somebody back to re-read
  // the field they already got right.
  if (!typedTrade) {
    return Response.json(
      { ok: false, field: "trade", reason: "What kind of business?" },
      { status: 400 },
    );
  }
  if (!typedWhere) {
    return Response.json(
      { ok: false, field: "where", reason: "Where? A US city, county or state." },
      { status: 400 },
    );
  }

  const [places, taxo] = await Promise.all([
    json<Places>("places-us.json"),
    json<Taxonomy>("trades.json"),
  ]);

  const region = places ? resolveRegion(places, typedWhere) : null;
  if (!region) {
    return Response.json(
      {
        ok: false,
        field: "where",
        reason: `We could not place "${typedWhere}". A US city, county or state works.`,
      },
      { status: 400 },
    );
  }

  const trade = taxo ? matchTrade(taxo, typedTrade) : null;
  if (!trade?.best) {
    // A typo is the commonest reason to land here, and refusing it outright is
    // the one failure a stranger reads as "this product does not work" rather
    // than "I mistyped". Suggested, never silently resolved — the same choice
    // `resolveRegion` made for cities.
    const meant = taxo ? suggestTrade(taxo, typedTrade) : null;
    return Response.json(
      {
        ok: false,
        field: "trade",
        // Not "we do not cover that". We cover every city; what is missing is
        // a kind of business in the listings, which is a different sentence and
        // a different thing to do about it.
        reason: `We don't have "${typedTrade}" as a kind of business in the listings.`,
        suggest: meant?.word ?? null,
        hint: meant
          ? null
          : "Try the trade on its own: plumbers, dentists, roofers, gyms.",
      },
      { status: 404 },
    );
  }

  // A caller may pick one of the near misses the resolve stage offered. Only
  // ids from the groups we just computed are honoured, so this cannot be used
  // to scan an arbitrary slice of the release.
  const offered = new Set([
    ...trade.best.categories,
    ...trade.near.flatMap((g) => g.categories),
  ]);
  const asked = Array.isArray(body.categories)
    ? (body.categories as unknown[]).map(String).filter((c) => offered.has(c))
    : [];
  const categories = asked.length ? asked : trade.best.categories;

  const understood = {
    trade: trade.best.typed,
    how: trade.best.how,
    categories,
    // Offered, never merged — a different reading of the same words is the
    // customer's call, and `trades.ts` sets the agreement thresholds from
    // measured collisions.
    // Labelled by the **anchor category**, not by what was typed. `Group.typed`
    // echoes the user's own words, so every near miss came back reading
    // "dentists" and the screen asked "did you mean dentists?" of somebody who
    // had just typed dentists. The anchor is the thing that differs.
    near: trade.near.slice(0, 3).map((g) => ({
      trade: g.anchor.replace(/_/g, " "),
      anchor: g.anchor,
      categories: g.categories,
      listings: g.n,
    })),
    where: region.label,
    scope: region.scope,
    // `resolveRegion` says this itself when the area is bigger than one read
    // can cover. Passed through verbatim rather than reworded.
    note: region.note,
    sampled: region.sampled,
  };

  if (stage === "resolve") {
    // No number here, deliberately. This is the instant half.
    return Response.json({ ok: true, stage: "resolve", understood });
  }

  const started = Date.now();
  // Counting is free and unlimited, so it is always the open data. See
  // `COUNTING` in providers.ts: on a paid provider this one anonymous button
  // would cost about $5 per press in a metro.
  const supply = await findCandidates(
    { categories, trade: typedTrade, region, rows: true },
    COUNTING,
  );

  const rows = supply.rows ?? [];
  return Response.json({
    ok: true,
    stage: "count",
    understood,
    // The two numbers that matter, and both of them. `listings` is the market,
    // `withSite` is what we can actually read, and the second is the one every
    // downstream claim is about.
    listings: supply.listings,
    withSite: supply.withSite,
    claim: poolClaim(supply.listings, supply.withSite, trade.best.typed, region.label),
    thin: thinness(supply.listings, supply.withSite),
    samples: sampleRows(rows, 5),
    source: supply.source,
    degraded: supply.degraded ?? null,
    ms: Date.now() - started,
  });
}
