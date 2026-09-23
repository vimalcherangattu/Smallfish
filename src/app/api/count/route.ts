import { NextResponse } from "next/server";
import { freeCount } from "@/lib/count";
import { PLANS } from "@/lib/pricing";
import type { Market } from "@/lib/types";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Free match count over HTTP (S1-10).
 *
 *  The internal API exists so GTM automation and the programmatic pages use the
 *  same code path as the product, rather than a second implementation that can
 *  drift from it. A count shown on a public page and a count shown in the app
 *  must be the same number, produced the same way, or the benchmark page is
 *  quoting something the product does not do.
 *
 *  It returns the sample as well as the range, because a count without the
 *  sample behind it is exactly the point estimate `count.ts` refuses to print.
 */
// Not `force-static`: a statically rendered route handler is evaluated at build
// time with a placeholder URL, so every query looked like an unknown market.
// Programmatic pages still serve a *stored* count rather than calling this per
// visitor (decision of 2026-09-23) — this route is for the product and for
// automation, where the query really does vary.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const marketId = url.searchParams.get("market") ?? "";
  const criterionId = url.searchParams.get("criterion") ?? "";
  if (!/^[a-z0-9-]+$/.test(marketId)) {
    return NextResponse.json({ error: "Unknown market." }, { status: 400 });
  }

  let market: Market;
  try {
    const file = path.join(process.cwd(), "public", "data", `${marketId}.json`);
    market = JSON.parse(await readFile(file, "utf8")) as Market;
  } catch {
    return NextResponse.json({ error: `No market "${marketId}".` }, { status: 404 });
  }

  const criteria = market.criteria.filter(
    (c) => !criterionId || c.id === criterionId,
  );
  if (!criteria.length) {
    return NextResponse.json(
      { error: `No criterion "${criterionId}" in ${marketId}.` },
      { status: 404 },
    );
  }

  const count = freeCount({
    businesses: market.businesses,
    criteria: criteria.slice(0, 1),
    seed: `${marketId}:${criteria[0].id}`,
    remainingCredits: PLANS.find((p) => p.id === "free")!.credits,
  });

  return NextResponse.json({
    market: marketId,
    criterion: criteria[0].id,
    // A range, never a midpoint — see `src/lib/count.ts`.
    matches: { low: count.projected.lo, high: count.projected.hi },
    sample: {
      read: count.sampled,
      matched: count.matched,
      couldNotSettle: count.unsettled,
      frameLimited: count.frameLimited,
    },
    band: { credits: count.band.credits, label: count.band.label },
    proofs: count.proofs,
  });
}
