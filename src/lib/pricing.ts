/**
 * The pricing decision of 2026-09-23, as code (S0-25).
 *
 * Small Fish bills per **matched business**, banded by how rare the match is,
 * with the band shown on the confirm screen before anything is spent. Non-
 * matches and couldn't-tell stay free — as counts and reasons, never as
 * exportable rows.
 *
 * Why bands rather than a flat rate, or a per-read meter:
 *
 * Cost per business read is stable at $0.0166–$0.0170 across three measured
 * niches. Cost per business *matched* swings 6.1× ($0.0294 → $0.1787), because
 * a business matches only when every criterion matches and those rates
 * multiply. A flat per-match price has to be set against the worst niche, so
 * every customer in a good niche overpays 6× and the pricing page has to hide
 * it. A per-read meter fixes the economics and breaks the promise: the
 * customer starts paying for research that returns nothing, which is the "you
 * pay for junk" complaint every scraper already causes.
 *
 * Banding collapses the measured 6.1× spread to **2.34×** and puts every niche
 * at or under **$0.0687 per credit**, without touching the promise.
 *
 * Every number here is measured, not assumed — see `stage0/src/economics/
 * unit_model.py` and the three `benchmark-*.json` runs it reads.
 */

/** Measured cost to read and judge one business, USD. Stable to ±2% across niches. */
export const COST_PER_READ = 0.0168;

/**
 * Sample match rate → credits charged per match.
 *
 * Thresholds come from the measured rates: dental at 26.0% sits well inside
 * band 1, while med spa at 6.2% and HVAC at 5.0% sit either side of the band
 * 2/3 line. The band is decided from the free count's 25-business sample, so
 * it is known before the full scan starts.
 */
export const BANDS = [
  { minRate: 0.15, credits: 1, label: "Common" },
  { minRate: 0.06, credits: 2, label: "Uncommon" },
  { minRate: 0.0, credits: 3, label: "Rare" },
] as const;

export function bandFor(sampleMatchRate: number) {
  return BANDS.find((b) => sampleMatchRate >= b.minRate) ?? BANDS[BANDS.length - 1];
}

export type Plan = {
  id: string;
  name: string;
  priceUsd: number;
  credits: number;
  /** Reads permitted per day. A second limit on top of the per-run scan budget. */
  dailyReadCap: number;
};

export const PLANS: Plan[] = [
  { id: "free", name: "Free", priceUsd: 0, credits: 20, dailyReadCap: 300 },
  { id: "starter", name: "Starter", priceUsd: 29, credits: 120, dailyReadCap: 2500 },
  { id: "growth", name: "Growth", priceUsd: 79, credits: 400, dailyReadCap: 8000 },
  { id: "agency", name: "Agency", priceUsd: 199, credits: 1000, dailyReadCap: 20000 },
  { id: "watch", name: "Watch", priceUsd: 19, credits: 40, dailyReadCap: 500 },
  { id: "pack", name: "Pack", priceUsd: 19, credits: 100, dailyReadCap: 2500 },
];

export const pricePerCredit = (p: Plan) => (p.credits ? p.priceUsd / p.credits : 0);

/**
 * Reads a run may spend per credit of remaining balance.
 *
 * This is the guardrail against the one attack that actually costs money:
 * charging only for matches means a user can write a criterion nothing
 * satisfies and make us read a whole market for free.
 */
export const READS_PER_CREDIT = 20;

/**
 * The lowest sample match rate at which a full scan is allowed to start.
 *
 * **Raised from 1% to 3%, and that is a correction to the decision document
 * rather than a transcription of it.** At 1% the stop sits below break-even:
 * a credit covers the reading behind it only above 2.3% on Starter, 2.8% on
 * Growth and Agency, 2.9% on a Pack. So a band-3 search matching between 1.0%
 * and 2.3% passes the stop and loses money inside the rules as written.
 *
 * Worked, on Starter: a criterion matching 1.5% over a 2,400-read budget costs
 * $40.32 of reading and bills 36 matches × 3 credits × $0.2417 = $26.10. Net
 * −$14.22. The daily cap does not save it either — Starter's 2,500/day sits
 * above its own 2,400-read budget, so it never binds.
 *
 * 3% clears break-even on every plan. The alternative fix is a band 4 at 5
 * credits below 3%, which earns revenue on hard searches instead of refusing
 * them; that is a product call, and this is the conservative half of it.
 */
export const NO_HOPE_RATE = 0.03;

/** Reads after which a run aborts if the live match rate is still hopeless. */
export const EARLY_ABORT_AFTER_READS = 200;

/** Businesses sampled for the free count, before any full scan. */
export const SAMPLE_SIZE = 25;

/** Criteria per search. They multiply, so a third is warned about and a fourth refused. */
export const MAX_CRITERIA = 3;

export type ScanVerdict =
  | { start: true; budgetReads: number; band: (typeof BANDS)[number] }
  | { start: false; reason: string };

/**
 * Decide whether a full scan may start, and how much reading it may do.
 *
 * Returns the refusal reason in the user's terms rather than a boolean: when a
 * budget stops a run the product says how many were read, how many matched and
 * what to change. That is the same guardrail that keeps non-matches free, so
 * it can be explained honestly to someone who is paying.
 */
export function planScan(args: {
  sampleMatchRate: number;
  remainingCredits: number;
  criteriaCount: number;
}): ScanVerdict {
  const { sampleMatchRate, remainingCredits, criteriaCount } = args;

  if (criteriaCount > MAX_CRITERIA) {
    return {
      start: false,
      reason: `Criteria multiply rather than add: ${criteriaCount} of them leaves almost nothing matching all. Drop to ${MAX_CRITERIA} or fewer.`,
    };
  }
  if (remainingCredits <= 0) {
    return { start: false, reason: "No credits left on this plan." };
  }
  if (sampleMatchRate < NO_HOPE_RATE) {
    const pct = (sampleMatchRate * 100).toFixed(1);
    return {
      start: false,
      reason: `Only ${pct}% of the sample matched, so a full scan would read a whole market to find almost nothing. Loosen a criterion or widen the area.`,
    };
  }
  return {
    start: true,
    budgetReads: remainingCredits * READS_PER_CREDIT,
    band: bandFor(sampleMatchRate),
  };
}

/** What a scan costs us, and what it bills, at a given match rate. */
export function scanEconomics(args: {
  reads: number;
  matchRate: number;
  plan: Plan;
}) {
  const { reads, matchRate, plan } = args;
  const band = bandFor(matchRate);
  const matches = Math.floor(reads * matchRate);
  const creditsCharged = matches * band.credits;
  const revenue = creditsCharged * pricePerCredit(plan);
  const cost = reads * COST_PER_READ;
  return { band, matches, creditsCharged, revenue, cost, net: revenue - cost };
}
