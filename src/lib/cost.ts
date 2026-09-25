/** What a region costs to scan, shown before anything is spent (S1-21).
 *
 *  Region size is the main driver of scan cost, and nothing in a search box stops
 *  someone asking for a whole state. Measured with `region_demo.py`: a Texas-wide
 *  med spa search is 14,789 candidates — roughly $148 of cold reads on a plan that
 *  sells for $79 a month. So the estimate belongs in the picker, not behind it.
 *
 *  The per-business figures are the product document's planning estimates. They are
 *  labelled as estimates everywhere they surface, and stay that way until the cost
 *  meter (`engine/llm.py`) produces measured ones.
 */

export const COST = {
  /**
   * What one cold read actually cost, measured.
   *
   * `PROJECT_PLAN.md`'s Live numbers, 2026-09-23: **$0.0168 ± 0.0002 per
   * business read**, flat across all three markets. `coldPerBusiness` below is
   * the *planning* figure the cost model was built on and is deliberately left
   * alone — several decision-log entries reason about it and would stop making
   * sense if it moved. Anything shown to a customer uses this one: a screen
   * that prices a scan off an estimate when a measurement exists is the same
   * error as a verdict without a quote.
   */
  measuredPerRead: 0.0168,
  /** Fetch, extract a profile, judge — a business never read before. */
  coldPerBusiness: 0.01,
  /** Judge against a cached profile. */
  warmPerBusiness: 0.002,
  /** Plan prices, for comparison against what a scan costs us. */
  pricePerMatch: { starter: 0.097, growth: 0.079, agency: 0.066 },
  /** Above this many candidates, warn before unlocking. */
  warnAboveCandidates: 5000,
  /** The product document's rule: stop after this many reads per requested match. */
  scanBudgetPerMatch: 20,
} as const;

export interface CostEstimate {
  candidates: number;
  unread: number;
  alreadyRead: number;
  coldCost: number;
  /** What the same scan costs once the knowledge base has the market. */
  warmCost: number;
  /** Share of the region already in the knowledge base. */
  warmShare: number;
  overBudget: boolean;
}

export function estimateCost(candidates: number, alreadyRead: number): CostEstimate {
  const unread = Math.max(candidates - alreadyRead, 0);
  return {
    candidates,
    unread,
    alreadyRead,
    coldCost: unread * COST.coldPerBusiness + alreadyRead * COST.warmPerBusiness,
    warmCost: candidates * COST.warmPerBusiness,
    warmShare: candidates ? alreadyRead / candidates : 0,
    overBudget: candidates > COST.warnAboveCandidates,
  };
}

export function money(usd: number): string {
  if (usd >= 100) return `$${Math.round(usd)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

export function compact(n: number): string {
  return n.toLocaleString("en-US");
}
