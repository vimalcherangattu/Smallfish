/**
 * Saved searches, alerts, and the supply a subscription actually runs on (S1-07).
 *
 * ## The cost shape, and why the gate is the whole feature
 *
 * A watched business costs a crawl every week whether or not anything changed.
 * What costs real money is the **re-judge**, and the measurement that decides
 * this feature is how often a re-judge is warranted. Sixty dental sites re-read
 * the same day, nothing real changed:
 *
 *   raw HTML        31.7% "changed"
 *   visible text     6.7%
 *   normalised text  5.0%
 *   judged signals   0.0%
 *
 * So alerting on bytes would re-judge a third of the book every week to learn
 * that nothing moved, and the bill scales with retention — it compounds in the
 * direction nobody notices until it arrives. Alerts gate on the **signals
 * hash**: re-crawl, compare, and pay for judgment only where something the
 * rubric could care about moved.
 *
 * ## The budget number is not measured yet
 *
 * `WEEKLY_CHANGE_RATE` below is the seven-day signals-change rate, and it is a
 * **placeholder**. The same-day floor is 0.0%, which is a lower bound and
 * useless as a planning number — a week is not a day. S0-23 fills it in from
 * the 2026-09-30 run. Every budget here is derived from it rather than typed,
 * so one measured number replaces all of them, and `alertCostPerWeek` is marked
 * provisional so a caller cannot mistake it for a measurement.
 *
 * ## What a digest may say for free
 *
 * Counts are free; names cost a credit. That is the same rule as the free match
 * count, for the same reason — the customer can see there is something worth
 * paying for before paying. A digest that named the new matches would be the
 * product given away weekly, and one that showed nothing would be an email
 * nobody opens.
 */

import { COST_PER_READ, PLANS, READS_PER_CREDIT, type Plan } from "@/lib/pricing";

/**
 * Seven-day signals-change rate. **Not measured.**
 *
 * The same-day floor is 0.0%, which bounds this below and says nothing about a
 * week. 5% is a deliberately pessimistic stand-in: it is the *normalised text*
 * same-day rate, and signals move less than text does, so a real weekly figure
 * that comes in above this would be genuinely surprising. Budgets derived from
 * it are therefore conservative — they under-promise watched capacity rather
 * than over-promise it, which is the safe direction to be wrong in.
 */
export const WEEKLY_CHANGE_RATE = 0.05;

/** True once S0-23 has replaced the figure above with a measurement. */
export const CHANGE_RATE_MEASURED = false;

/** What one watched business costs for a week: a crawl always, a re-judge
 *  sometimes. The re-judge is priced as a full read because that is what it
 *  is — the pages are fetched and put to the model again. */
export const weeklyCostPerWatched = (changeRate = WEEKLY_CHANGE_RATE) =>
  COST_PER_READ + changeRate * COST_PER_READ;

/**
 * How many businesses a plan can afford to watch.
 *
 * Derived from the plan's own read allowance rather than invented: watching is
 * spending the same budget as scanning, and a plan that could watch more
 * businesses than it can read is a plan whose alerts starve its searches.
 *
 * A quarter of the allowance, because the allowance is a month and a watch runs
 * four times in one — so a full-allowance watch list would leave nothing for
 * the scanning the customer actually bought.
 */
export function watchBudget(plan: Plan, changeRate = WEEKLY_CHANGE_RATE): number {
  const monthlyReads = plan.credits * READS_PER_CREDIT;
  const weeklyPerWatched = weeklyCostPerWatched(changeRate) / COST_PER_READ;
  return Math.floor(monthlyReads / 4 / weeklyPerWatched);
}

export type Budget = {
  planId: string;
  planName: string;
  watched: number;
  weeklyCostUsd: number;
  monthlyCostUsd: number;
  /** False until S0-23 lands. Callers must surface this, not bury it. */
  measured: boolean;
};

export function budgets(changeRate = WEEKLY_CHANGE_RATE): Budget[] {
  return PLANS.filter((p) => p.credits > 0).map((plan) => {
    const watched = watchBudget(plan, changeRate);
    const weekly = watched * weeklyCostPerWatched(changeRate);
    return {
      planId: plan.id,
      planName: plan.name,
      watched,
      weeklyCostUsd: weekly,
      monthlyCostUsd: weekly * 4,
      measured: CHANGE_RATE_MEASURED,
    };
  });
}

// ------------------------------------------------------------------ digest --

export type WatchedVerdict = {
  businessId: string;
  /** The signals hash at the last run. Unchanged hash, no re-judge, no alert. */
  signalsHash: string;
  matched: boolean;
  /** Was this business unreadable last time and readable now? */
  blocked: boolean;
};

export type Digest = {
  /** Matched now, and not present at the last run at all. */
  newMatches: number;
  /** Present before, signals moved, and it matches now when it did not. */
  changedToMatch: number;
  /** Matched now, and was only blocked from being judged before. */
  newlyUnblocked: number;
  /** Signals moved and it stopped matching. Worth saying: a customer chasing a
   *  stale list is worse served than one told it went stale. */
  changedToNoMatch: number;
  /** Re-judged this run, which is what the run cost. */
  reJudged: number;
  /** Crawled and skipped because nothing the rubric cares about moved. */
  unchanged: number;
  /** Business ids are **never** in a digest. Counts are free; names cost a
   *  credit and are unlocked in the product, not emailed. */
  readonly namesWithheld: true;
};

/**
 * What changed between two runs of a saved search.
 *
 * Takes both sides as verdicts rather than re-reading anything, so this is pure
 * and testable with no crawler, no model and no database.
 */
export function digest(before: WatchedVerdict[], after: WatchedVerdict[]): Digest {
  const prior = new Map(before.map((v) => [v.businessId, v]));
  let newMatches = 0;
  let changedToMatch = 0;
  let newlyUnblocked = 0;
  let changedToNoMatch = 0;
  let reJudged = 0;
  let unchanged = 0;

  for (const now of after) {
    const was = prior.get(now.businessId);

    if (!was) {
      if (now.matched) newMatches += 1;
      reJudged += 1;
      continue;
    }

    if (was.signalsHash === now.signalsHash) {
      // The gate. Crawled, hash identical, nothing re-judged and nothing spent
      // beyond the crawl.
      unchanged += 1;
      continue;
    }

    reJudged += 1;
    if (!was.matched && now.matched) {
      if (was.blocked) newlyUnblocked += 1;
      else changedToMatch += 1;
    } else if (was.matched && !now.matched) {
      changedToNoMatch += 1;
    }
  }

  return {
    newMatches,
    changedToMatch,
    newlyUnblocked,
    changedToNoMatch,
    reJudged,
    unchanged,
    namesWithheld: true,
  };
}

/** Is there anything worth an email? An empty digest should not be sent — a
 *  weekly "nothing happened" is how a customer learns to filter you. */
export const worthSending = (d: Digest) =>
  d.newMatches + d.changedToMatch + d.newlyUnblocked + d.changedToNoMatch > 0;

/** What the run actually cost, for the customer-facing honesty this product
 *  applies everywhere else. */
export const runCostUsd = (d: Digest) =>
  (d.reJudged + d.unchanged) * COST_PER_READ + d.reJudged * COST_PER_READ;

// -------------------------------------------------------------- depletion --

export type Depletion = {
  unlocked: number;
  proven: number;
  /** 0–1. Null when the market has too few proven matches to say anything. */
  share: number | null;
  message: string;
  /** True when this market is nearly used up and the honest move is to suggest
   *  another one rather than another month. */
  exhausted: boolean;
};

/**
 * How much of a market this workspace has already taken.
 *
 * This exists because of the metric the plan calls the earliest honest signal
 * of whether a subscription is the right shape at all: a metro niche holds
 * roughly 300–500 matches and Starter's allowance is 120, so the first market
 * is three or four months of supply and renewal then depends on the customer
 * having somewhere else to look.
 *
 * Showing it is uncomfortable — it tells a paying customer when they are
 * running out. It is also the only version that does not lead to a renewal
 * they regret, and a customer who is told "this market is nearly done, here are
 * three more" churns less than one who quietly finds an empty result page.
 */
export function depletion(unlocked: number, proven: number): Depletion {
  if (proven < 20) {
    return {
      unlocked,
      proven,
      share: null,
      message:
        "Too few proven matches here to say how much is left. That is a " +
        "statement about how much of this market we have read, not about how " +
        "much of it exists.",
      exhausted: false,
    };
  }
  const share = Math.min(1, unlocked / proven);
  const exhausted = share >= 0.8;
  return {
    unlocked,
    proven,
    share,
    exhausted,
    message: exhausted
      ? `${unlocked} of about ${proven} unlocked here. This market is nearly ` +
        "used up — another one will serve you better than another month of this."
      : `${unlocked} of about ${proven} unlocked here.`,
  };
}

// ------------------------------------------------------------------ pause --

/**
 * Pause rather than cancel.
 *
 * The pricing decision asks for this and it is worth stating why it is not a
 * dark pattern: a customer whose market is depleted does not want to keep
 * paying, and the honest options are "cancel" or "stop billing and keep what
 * you have". Offering only the first loses people who would have come back;
 * offering the second *instead of* cancelling would be the dark pattern. Both
 * are offered, cancel first, and a pause has an end date rather than running
 * until somebody notices.
 */
export const MAX_PAUSE_MONTHS = 3;

export function pauseUntil(from: string, months: number): { until: string; note: string } {
  const capped = Math.max(1, Math.min(months, MAX_PAUSE_MONTHS));
  const d = new Date(from);
  d.setMonth(d.getMonth() + capped);
  return {
    until: d.toISOString(),
    note:
      `Billing stops until ${d.toISOString().slice(0, 10)}. Credits you have ` +
      "already paid for stay, saved searches stay, and alerts stop — watching " +
      "costs us money every week, so it is not something we can leave running " +
      "for free. Cancel instead at any time; nothing here is a substitute for " +
      "that.",
  };
}
