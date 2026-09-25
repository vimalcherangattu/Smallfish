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

/**
 * The band to **quote**, from a sample — not `bandFor` on the observed rate.
 *
 * Quoting the point estimate was measured and it is not safe. A 25-business
 * sample of a market whose true rate is 4% quotes a band too cheap **26.4% of
 * the time**, and on a Pack every one of those loses money; at 6.2% — the
 * measured med spa rate — it is 6.6%. The failure is not theoretical: a live
 * sample of the measured Dallas med spa market drew 4 matches in 25, read
 * 16%, and quoted band 1 on a market that is band 2.
 *
 * The abort does catch it, and that is precisely the problem. The abort's
 * threshold is break-even *for the quoted band*, so an over-generous quote
 * makes it fire sooner: the customer is quoted a cheap price, starts, and has
 * their scan stopped at 200 reads by our own optimism. Better not to promise
 * it.
 *
 * So the quote comes from the **80% one-sided lower bound** on the sample
 * rate — the same confidence the abort uses, read from the other side. It
 * takes "too cheap" at 6.2% from 6.6% to **0.4%**, and over-quotes a genuinely
 * common market by two bands only 2.5% of the time. Those it does over-quote
 * are made whole by `settleBand`, which bills the delivered band when that is
 * cheaper. The quote can only go down, so being conservative here costs the
 * customer nothing and costs us a worse-looking number on the confirm screen —
 * which is falsifier (b) in `docs/PRICING.md` §6, and a thing to watch.
 */
export function quoteBand(matched: number, sampled: number) {
  return bandFor(wilson(matched, sampled, ABORT_CONFIDENCE_Z).lo);
}

export type Plan = {
  id: string;
  name: string;
  priceUsd: number;
  credits: number;
};

export const PLANS: Plan[] = [
  { id: "free", name: "Free", priceUsd: 0, credits: 20 },
  { id: "starter", name: "Starter", priceUsd: 29, credits: 120 },
  { id: "growth", name: "Growth", priceUsd: 79, credits: 400 },
  { id: "agency", name: "Agency", priceUsd: 199, credits: 1000 },
  { id: "watch", name: "Watch", priceUsd: 19, credits: 40 },
  { id: "pack", name: "Pack", priceUsd: 19, credits: 100 },
];

/**
 * A one-dollar plan that exists only to prove the payment chain works.
 *
 * Deliberately **not** in `PLANS`. Everything that iterates plans — the pricing
 * page, the comparison table, the worst-case solvency arithmetic — would
 * otherwise pick it up and show customers a dollar plan, or reason about a
 * margin that is not a real product.
 *
 * It grants **one credit**, so the ledger line it produces is true. Pointing a
 * real plan's price id at a $1 product would have been quicker and would have
 * written "Starter: 120 credits for the period" into an append-only ledger for
 * a dollar — a line that cannot be deleted and does not describe what happened.
 *
 * It is reachable only while `STRIPE_PRICE_TEST` is set, and disappears with
 * that variable. `stage0/tests/test_stripe.py` fails if it ever appears in
 * `PLANS`.
 *
 * **`priceUsd` here is a gate, not a price.** The real amount and its currency
 * live in the Stripe price that `STRIPE_PRICE_TEST` names, and nothing in this
 * repository knows what they are. The field is 1 only because `startCheckout`
 * refuses any plan whose `priceUsd` is 0 — that is the free-plan rule and it
 * must keep working. The first version of the account page read this field and
 * told the customer "a real $1 charge", which was wrong the moment the price
 * turned out to be ₹2. A price written in two places is a price that diverges,
 * so the screen no longer states an amount at all: Stripe shows it at checkout,
 * where it is true.
 */
export const VERIFICATION_PLAN: Plan = {
  id: "verify",
  name: "Payment verification",
  priceUsd: 1,
  credits: 1,
};

export const pricePerCredit = (p: Plan) => (p.credits ? p.priceUsd / p.credits : 0);

/**
 * Reads a plan permits per billing period.
 *
 * This replaces the daily read cap the decision document carried, which never
 * bound anything that mattered: Starter's 2,500 reads a day is $42 of reading
 * against $29 a month of revenue, and Agency's 20,000 is $336 a day against
 * $199 a month. A cap set above the plan's whole monthly revenue is not a cap.
 *
 * A period allowance is. Because it is `READS_PER_CREDIT × credits`, it can
 * only be exhausted by reading the customer is entitled to, and its worst case
 * — every read wasted, nothing ever matching, no revenue but the subscription
 * — stays under the subscription on every paid plan. See `worstCaseMonthly`.
 */
export const readAllowance = (p: Plan) => p.credits * READS_PER_CREDIT;

/**
 * The lowest true match rate at which a match in this band pays for the reading
 * behind it, on this plan. Below it, every additional read loses money.
 */
export const breakEvenRate = (plan: Plan, credits: number) => {
  const per = pricePerCredit(plan);
  return per > 0 ? COST_PER_READ / (credits * per) : Infinity;
};

/**
 * The lowest sample match rate at which a full scan is allowed to start.
 *
 * **Raised from the decision document's 1% to 3%, and then found to be doing
 * far less work than that correction claimed.** Both halves matter:
 *
 * The raise was right on its own terms — at 1% the stop sits below break-even,
 * since a credit covers the reading behind it only above 2.3% on Starter, 2.8%
 * on Growth and Agency, 2.9% on a Pack.
 *
 * But the stop reads a **25-business sample**, so the only rates it can observe
 * are multiples of 4%. The smallest result that passes is one match in 25, and
 * one match in 25 has a 95% interval of **[0.7%, 19.5%]**. Moving the line from
 * 1% to 3% therefore changes the verdict on nothing: 0 matches was refused
 * before and is refused now, 1 match passed before and passes now. A search
 * whose true rate is 0.7% still gets through, and on Starter that is −$28 over
 * a full budget.
 *
 * A bigger sample does not rescue it. One match in 60 gives [0.3%, 8.9%] — the
 * interval still straddles break-even, for $1.01 of reading instead of $0.42.
 * **No affordable sample can settle solvency**, so the sample's job is only to
 * quote a band and refuse the obviously hopeless. Solvency is enforced on the
 * live run instead, by `checkRunHealth` below.
 */
export const NO_HOPE_RATE = 0.03;

/**
 * Reads a run may spend per credit of remaining balance, and per period.
 *
 * This is the guardrail against the one attack that actually costs money:
 * charging only for matches means a criterion nothing satisfies never depletes
 * a balance, so without a read allowance the balance is not a bound at all and
 * the plan's cost is unlimited.
 *
 * It is derived, not chosen. The most reading a **legitimate** run can need is
 * the reading that spends a whole balance in the worst band at the lowest rate
 * we allow: one credit buys `1 / (3 × 3%)` = 11.1 reads. Flooring to 11 is
 * deliberate and costs a customer sitting exactly on the floor about 1% of
 * their balance; rounding up to 12 instead would put a Pack's worst case at
 * $20.16 of reading against $19 of revenue, so the floor is what keeps the
 * cheapest plan solvent.
 *
 * That collision is the finding: at the no-hope floor, "let the customer spend
 * every credit" and "never lose money on a Pack" are the same constraint from
 * opposite sides, and Pack is the plan where they meet.
 */
export const READS_PER_CREDIT = Math.floor(1 / (3 * NO_HOPE_RATE)); // 11

/** Businesses sampled for the free count, before any full scan. */
export const SAMPLE_SIZE = 25;

/**
 * Read counts at which a running scan re-checks whether it is still solvent.
 *
 * The first one is the loss ceiling: a scan that is hopeless from the first
 * read costs at most `200 × $0.0168` = **$3.36** before it is stopped, on any
 * plan, whatever the criterion. Everything after it catches a rate that only
 * looks survivable early.
 */
export const ABORT_CHECKS = [200, 400, 800, 1600] as const;

/** The most a single scan can lose, on any plan, with any criterion. */
export const MAX_LOSS_PER_SCAN_USD = ABORT_CHECKS[0] * COST_PER_READ;

/**
 * Confidence used for the abort's one-sided bound, and for the band quote — 80%.
 *
 * The abort fires when the upper bound on the live match rate falls below
 * break-even, i.e. when the run is probably losing money. The confidence level
 * trades one error against the other, and both were measured on Starter band 3:
 *
 *              catches a 1% run    kills a 3% run    kills a 4% run
 *   50%        −$1.91                      54.8%              13.6%
 *   80%        −$1.91                      12.4%               1.6%
 *   90%        −$3.82                       4.6%               0.4%
 *   97.5%      −$7.64                       0.5%               0.0%
 *
 * 80% catches the hopeless run as early as a coin flip does while killing a
 * quarter as many healthy ones. The runs it still kills are sitting on the
 * no-hope floor, where a scan earns about nothing anyway; by 6% it never fires.
 */
export const ABORT_CONFIDENCE_Z = 0.84;

/**
 * Wilson score interval — small counts, so no normal approximation.
 *
 * Used for two different jobs and they should not drift apart: the abort's
 * one-sided bound below, and the free count's honest range in `count.ts`.
 * Everywhere this project reports a rate, it reports this interval with it.
 */
export function wilson(matches: number, reads: number, z = 1.96) {
  if (reads <= 0) return { lo: 0, hi: 1 };
  const r = matches / reads;
  const centre = (r + (z * z) / (2 * reads)) / (1 + (z * z) / reads);
  const half =
    (z * Math.sqrt((r * (1 - r)) / reads + (z * z) / (4 * reads * reads))) /
    (1 + (z * z) / reads);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** One-sided upper bound, for the abort. */
export const wilsonUpper = (matches: number, reads: number, z = ABORT_CONFIDENCE_Z) =>
  wilson(matches, reads, z).hi;

/**
 * Wilson with Newcombe's continuity correction — for intervals we *show people*.
 *
 * Plain Wilson averages 95.2% coverage at n=25, which sounds fine and is not.
 * Its coverage oscillates with the true rate and bottoms out at **86% near
 * p=0.006** — the low rates where rare searches live, and the worst place in
 * the product to be quietly overconfident. The corrected form is a little
 * wider (0/25 reads [0, 16.6%] instead of [0, 13.3%]) and never dips below
 * nominal: 97.4% mean, **95.1% worst**.
 *
 * Both are kept deliberately. A number shown to a customer must not under-cover,
 * so the free count uses this one. The abort's threshold is a decision rule
 * whose confidence level was tuned against measured loss and false-abort rates,
 * so it stays on the plain form it was tuned with rather than being silently
 * shifted by a change of estimator.
 */
export function wilsonCC(matches: number, reads: number, z = 1.96) {
  if (reads <= 0) return { lo: 0, hi: 1 };
  const n = reads;
  const p = matches / n;
  const q = 1 - p;
  const d = 2 * (n + z * z);
  const lo =
    matches === 0
      ? 0
      : (2 * n * p + z * z - 1 - z * Math.sqrt(z * z - 2 - 1 / n + 4 * p * (n * q + 1))) / d;
  const hi =
    matches === n
      ? 1
      : (2 * n * p + z * z + 1 + z * Math.sqrt(z * z + 2 - 1 / n + 4 * p * (n * q - 1))) / d;
  return { lo: Math.max(0, lo), hi: Math.min(1, hi) };
}

export type RunHealth =
  | { keepGoing: true }
  | { keepGoing: false; reason: string; spentUsd: number; billedUsd: number };

/**
 * Should a running scan continue?
 *
 * This is where solvency is actually enforced. The sample could not settle it
 * (see `NO_HOPE_RATE`), and the band was quoted from that sample, so a scan can
 * legitimately start and still be losing money — the live rate is the only
 * honest evidence, and it arrives while we are spending.
 *
 * Checked only at `ABORT_CHECKS`, so the answer does not swing on one match.
 */
export function checkRunHealth(args: {
  reads: number;
  matches: number;
  quotedBandCredits: number;
  plan: Plan;
}): RunHealth {
  const { reads, matches, quotedBandCredits, plan } = args;
  if (!ABORT_CHECKS.includes(reads as (typeof ABORT_CHECKS)[number])) {
    return { keepGoing: true };
  }
  const floor = breakEvenRate(plan, quotedBandCredits);
  if (wilsonUpper(matches, reads) >= floor) return { keepGoing: true };

  const spentUsd = reads * COST_PER_READ;
  const billedUsd = matches * quotedBandCredits * pricePerCredit(plan);
  return {
    keepGoing: false,
    spentUsd,
    billedUsd,
    reason:
      `${matches} matched out of ${reads} read. At that rate the search would ` +
      `spend the rest of your balance without finding much. Stopping here — ` +
      `you keep the ${matches} found and nothing else was charged.`,
  };
}

/**
 * What a completed scan actually bills, given the band quoted from the sample.
 *
 * The quote is a **ceiling, not a price**. A 25-business sample that showed one
 * match reads 4% and quotes band 3, but its true rate could be 19%: that
 * customer would pay three credits a match for something common, purely because
 * of who landed in their sample. So a scan that delivers a cheaper band is
 * billed at the cheaper band, and one that delivers a dearer band is still
 * billed at the quote.
 *
 * The asymmetry is deliberate and it is the whole reason the confirm screen can
 * show a number before anything is spent: what was shown can only go down.
 */
export function settleBand(quotedCredits: number, deliveredRate: number) {
  return Math.min(quotedCredits, bandFor(deliveredRate).credits);
}

/**
 * The worst a plan can do us in one period: every read wasted, every scan
 * stopped at the first check, no revenue beyond the subscription.
 */
export function worstCaseMonthly(plan: Plan) {
  const reads = readAllowance(plan);
  const costUsd = reads * COST_PER_READ;
  return { reads, costUsd, netUsd: plan.priceUsd - costUsd };
}

/** Criteria per search. They multiply, so a third is warned about and a fourth refused. */
export const MAX_CRITERIA = 3;

export type ScanVerdict =
  | { start: true; budgetReads: number; band: (typeof BANDS)[number] }
  | { start: false; reason: string };

/**
 * Decide whether a full scan may start, and how much reading it may do.
 *
 * The band it returns is a **quote**, not a price — it comes from a 25-business
 * sample that cannot settle the true rate, and `settleBand` may bill less once
 * the scan has run. Nor does starting mean the scan is solvent: that is
 * `checkRunHealth`'s job, from 200 reads in.
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
