/**
 * How many we will read to find the number you asked for, and how long that
 * takes.
 *
 * ## Why this is a range and not a number
 *
 * Somebody with 120 credits wants 120 businesses. We cannot promise 120,
 * because we do not know which of a city's websites will answer the way they
 * asked until we have read them. What we *can* do is say how often it has gone
 * one way or the other in the markets we have actually measured, and let the
 * arithmetic follow from that.
 *
 * So every number this module produces is a low and a high, and both ends come
 * out of `public/data/index.json` — the same tallies `/benchmark` renders.
 * **Nothing here is a constant.** When a fourth market is measured the range
 * moves on its own, and `stage0/tests/test_sizing.mjs` fails if the derivation
 * stops holding.
 *
 * ## The fourth market is the reason to trust the other three
 *
 * Of the four measured markets, three settled a criterion and matched 13, 21
 * and 29 in every hundred read. The fourth — independent vet clinics in
 * Columbus — settled 117 sites and matched **none**. A range built only from
 * the three that worked would be a range built from the successes, which is the
 * shape of every lead-gen claim this product exists to be the opposite of.
 *
 * `zeroes` carries that count so the screen can say it out loud. A criterion
 * that nothing answers is a real outcome, it has happened in one market of
 * four, and nobody is charged when it happens.
 */

import { CONCURRENCY, JUDGE_SECONDS, PAGES_PER_SITE, PER_DOMAIN_DELAY } from "@/lib/jobs";
import type { MarketIndex } from "@/lib/types";

/** One measured criterion: how many of the sites we settled came back a match. */
export interface Measured {
  market: string;
  metro: string;
  criterion: string;
  matched: number;
  /** Sites we reached an answer on, either way. Couldn't-tell and blocked are
   *  **in** this denominator: they were read, they cost us a crawl, and they
   *  produced no match. Dropping them would inflate every rate here. */
  settled: number;
}

export interface Rates {
  /** The lowest and highest match rates among the criteria that matched
   *  anything, as fractions. */
  low: number;
  high: number;
  /** The measurements behind them, so a screen can name its own sources. */
  from: Measured[];
  /** Criteria that settled sites and matched none of them. */
  zeroes: Measured[];
}

/**
 * Every settled criterion in the index, as a match rate.
 *
 * A criterion with nothing settled is skipped rather than counted as zero:
 * `needs_model` means no model key was present, which is a fact about our
 * environment and not about the market. Counting it would put our own missing
 * credential into a number we show a customer as theirs.
 */
export function measurements(index: MarketIndex | null): Measured[] {
  if (!index) return [];
  const out: Measured[] = [];
  for (const m of index.markets) {
    for (const c of m.criteria) {
      const t = m.tallies?.[c.id];
      if (!t) continue;
      const settled =
        (t.match ?? 0) + (t.no_match ?? 0) + (t.couldnt_tell ?? 0) + (t.blocked ?? 0);
      if (settled <= 0) continue;
      out.push({
        market: m.id,
        metro: m.metro,
        criterion: c.text,
        matched: t.match ?? 0,
        settled,
      });
    }
  }
  return out;
}

/** The measured spread, or null when nothing has been measured yet. */
export function matchRates(index: MarketIndex | null): Rates | null {
  const all = measurements(index);
  const hit = all.filter((m) => m.matched > 0);
  const zeroes = all.filter((m) => m.matched === 0);
  if (!hit.length) return null;
  const rates = hit.map((m) => m.matched / m.settled);
  return {
    low: Math.min(...rates),
    high: Math.max(...rates),
    from: hit,
    zeroes,
  };
}

export interface Ask {
  /** Matches the customer asked for. */
  want: number;
  /** Businesses in the region whose website we could open. The ceiling on
   *  everything below — we cannot read what is not there. */
  withSite: number;
  rates: Rates;
}

export interface Sized {
  /** Websites we expect to open, low and high. Never above `withSite`. */
  reads: { low: number; high: number };
  /** Wall clock for those reads, in seconds. */
  seconds: { low: number; high: number };
  /** Matches the whole region could yield if we read all of it. */
  ceiling: { low: number; high: number };
  /**
   * True when even the best measured rate over every readable site in the
   * region comes in under the ask. The region is the limit, not the budget, and
   * the screen has to say so **before** anybody spends anything.
   */
  short: boolean;
  /** What the region can realistically produce, which is the ask or the
   *  ceiling, whichever is smaller. */
  realistic: number;
}

/**
 * Size an ask against a region and the measured rates.
 *
 * Both ends are clamped to `withSite` because reading more sites than exist is
 * not a longer wait, it is a wrong promise. When the region is short, the high
 * end is the whole region — we read all of it and stop, having found what was
 * there.
 */
export function sizeAsk({ want, withSite, rates }: Ask): Sized {
  const n = Math.max(0, Math.floor(want));
  const site = Math.max(0, Math.floor(withSite));

  const ceiling = {
    low: Math.floor(site * rates.low),
    high: Math.floor(site * rates.high),
  };

  // Reads needed: at the best rate we need fewest, at the worst we need most.
  const low = Math.min(site, Math.ceil(n / rates.high));
  const high = Math.min(site, Math.ceil(n / rates.low));

  return {
    reads: { low, high },
    seconds: { low: estimate(low), high: estimate(high) },
    ceiling,
    short: n > ceiling.high,
    realistic: Math.min(n, ceiling.high),
  };
}

/**
 * Seconds to read `sites`, inlined from `jobs.ts`'s own constants.
 *
 * `estimateSeconds` is the same arithmetic and is what the job screen uses; it
 * is re-derived here rather than imported so that this module's output is a
 * pure function of its inputs for the test, and the constants are shared so the
 * two cannot disagree.
 */
const estimate = (sites: number) =>
  sites <= 0
    ? 0
    : Math.ceil((sites * (PAGES_PER_SITE * PER_DOMAIN_DELAY + JUDGE_SECONDS)) / CONCURRENCY);

/** "13 to 29" — the measured rates as whole numbers out of a hundred. */
export const perHundred = (r: Rates) => ({
  low: Math.round(r.low * 100),
  high: Math.round(r.high * 100),
});

/**
 * The options offered beside the customer's balance.
 *
 * Anchored to what they can actually spend, and never above what the region can
 * give: offering "all 1,470" to somebody with 120 credits is offering a bill
 * they did not agree to, and offering 500 in a city that holds 190 is the
 * overclaim with the arithmetic hidden.
 */
export function choices(balance: number, ceilingHigh: number): number[] {
  const top = Math.max(1, Math.min(balance, ceilingHigh));
  const out = new Set<number>();
  for (const n of [25, 50, 100, 250, 500]) if (n < top) out.add(n);
  out.add(top);
  return [...out].sort((a, b) => a - b);
}
