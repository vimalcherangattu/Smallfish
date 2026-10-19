/**
 * The pricing decision, checked against the measured runs (S0-25).
 *
 * Bands exist to collapse a measured spread, so the test that matters is
 * arithmetic: do the thresholds actually do it, and does every plan clear its
 * claimed margin at the worst measured band cost?
 *
 * Measured, three niches, one engine, 2,464 in-niche businesses:
 *
 *   dental  26.0% match  $0.0294/match  band 1  -> $0.0294 per credit
 *   med spa  6.2% match  $0.1374/match  band 2  -> $0.0687 per credit
 *   hvac     5.0% match  $0.1787/match  band 3  -> $0.0596 per credit
 *
 * 6.1x spread becomes 2.34x, worst credit $0.0687.
 *
 * The no-hope stop is pinned at 3% rather than the decision document's 1%,
 * because 1% sits below break-even and lets a losing search through. That
 * correction is tested here, not just commented.
 *
 *   node stage0/tests/test_pricing.mjs
 */
import { readFileSync, rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/pricing.ts"], "sfprice-");
const {
  COST_PER_READ, BANDS, bandFor, PLANS, pricePerCredit, READS_PER_CREDIT,
  NO_HOPE_RATE, MAX_CRITERIA, SAMPLE_SIZE, planScan, scanEconomics,
  ABORT_CHECKS, MAX_LOSS_PER_SCAN_USD, breakEvenRate, checkRunHealth,
  readAllowance, settleBand, wilsonUpper, worstCaseMonthly, quoteBand,
  MIN_GROSS_MARGIN, COST_PER_READ_ALL_IN, cheapestCredit, grossMargin,
  COST_PER_MATCH_REVIEWS,
} = await load("pricing");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`); }
};

// --- measured, from the three benchmark runs
const MEASURED = [
  { market: "dental-phoenix", rate: 0.260, costPerMatch: 0.0294 },
  { market: "med-spa-dallas", rate: 0.062, costPerMatch: 0.1374 },
  { market: "hvac-tampa", rate: 0.050, costPerMatch: 0.1787 },
];

// Those figures were measured at $0.0168 a read, before a paid provider and
// before reviews. The all-in cost adds the Apify listing to every read, and
// the details-plus-reviews pull **once per match** rather than once per read,
// because reviews are only fetched for a business that passed the website
// read. `stage0/src/economics/margin.py` is the model; these are its inputs.
const LISTING = 0.0015;
const REVIEWS_PER_MATCH = COST_PER_MATCH_REVIEWS;
const allIn = (m) =>
  m.costPerMatch * ((COST_PER_READ + LISTING) / COST_PER_READ) + REVIEWS_PER_MATCH;

// --- the bands do what they exist to do
const perCredit = MEASURED.map((m) => allIn(m) / bandFor(m.rate).credits);
const lo = Math.min(...perCredit), hi = Math.max(...perCredit);
check("banding collapses the measured spread below 2.5x", hi / lo < 2.5,
  `got ${(hi / lo).toFixed(2)}x`);
check("every measured niche lands at or under $0.05 per credit", hi <= 0.05,
  `worst ${hi.toFixed(4)}`);
check("the unbanded spread really was over 6x, or bands solve nothing",
  Math.max(...MEASURED.map((m) => m.costPerMatch)) /
  Math.min(...MEASURED.map((m) => m.costPerMatch)) > 6);

// **The bands now collapse the spread almost completely**: a measured 6.1x
// range in cost per match becomes under 1.05x per credit. That is the whole
// purpose of banding reached, and it is worth pinning because it is fragile
// in one specific way.
//
// The review pull is a **flat** charge per match, so it does not scale with
// rarity and banding cannot absorb it. At twenty reviews it pushed *dental* —
// the common niche, whose match costs four cents and has one credit to pay
// with — to 68.2% and made it the binding constraint, which is the opposite
// of what bands are for. Twelve is what brings it back level. If this spread
// ever widens again, `REVIEWS_PER_MATCH` is the first place to look.
check("banding collapses cost per credit to within 10% across niches",
  hi / lo < 1.1,
  `dental ${perCredit[0].toFixed(4)}, med spa ${perCredit[1].toFixed(4)}, hvac ${perCredit[2].toFixed(4)}`);
check("and the flat review cost is small enough not to invert them",
  COST_PER_MATCH_REVIEWS < allIn(MEASURED[0]) * 0.25,
  `reviews $${COST_PER_MATCH_REVIEWS.toFixed(4)} against a dental match at $${allIn(MEASURED[0]).toFixed(4)}`);

// --- each measured niche lands in the band the decision assigned it
// Re-banded 2026-10-15 from 1 / 2 / 3, solved in margin.py at the owner's 70%
// floor and a conservative 70% reveal rate. Dental does not move: it needed
// 0.9 credits and was already charged 1.
check("dental at 26.0% is band 1", bandFor(0.26).credits === 1);
check("med spa at 6.2% is band 4", bandFor(0.062).credits === 4);
check("hvac at 5.0% is band 5", bandFor(0.05).credits === 5);
check("bands are ordered cheapest-rate-last", BANDS.every((b, i, a) =>
  i === 0 || a[i - 1].minRate > b.minRate));

// --- margins, at the worst measured band cost, no breakage
// The owner's mandate, 2026-10-15: 70% floor, 80% target. Asserted against
// the floor for every paid plan rather than against a per-plan number somebody
// typed in, because a claimed figure drifts and a floor does not.
check(`every paid plan clears the ${(MIN_GROSS_MARGIN * 100).toFixed(0)}% floor at the worst credit`,
  PLANS.filter((p) => p.priceUsd > 0)
    .every((p) => grossMargin(p, hi) >= MIN_GROSS_MARGIN),
  PLANS.filter((p) => p.priceUsd > 0)
    .map((p) => `${p.name} ${(grossMargin(p, hi) * 100).toFixed(1)}%`).join(", "));

check("and the cheapest credit we sell is the one that binds",
  PLANS.filter((p) => p.priceUsd > 0)
    .every((p) => grossMargin(p, hi) >= grossMargin({ priceUsd: 1, credits: 1 / cheapestCredit() }, hi) - 1e-9),
  `cheapest credit $${cheapestCredit().toFixed(4)}`);
const free = PLANS.find((p) => p.id === "free");
check("honouring the free tier's credits costs at most $1.40",
  free.credits * hi <= 1.40, `${(free.credits * hi).toFixed(2)}`);
check("but the credits are not what the free tier costs",
  free.credits * READS_PER_CREDIT * COST_PER_READ > free.credits * hi,
  "reading is charged to us whether or not anything matches; see worstCaseMonthly");

// --- the correction: 1% would have let a losing search through
const starter = PLANS.find((p) => p.id === "starter");
const breakEven = COST_PER_READ / (3 * pricePerCredit(starter));
check("the no-hope stop sits above break-even on the tightest plan",
  NO_HOPE_RATE > breakEven,
  `stop ${NO_HOPE_RATE}, break-even ${breakEven.toFixed(4)}`);
check("a 1% stop would NOT have cleared break-even",
  0.01 < breakEven,
  "this is why the decision document's 1% was raised to 3%");

// **Retraction, 2026-10-15.** This asserted that the 1.5% case the old 1%
// stop allowed "does lose money", over 2,400 reads. Both halves stopped being
// true and neither failure is the test's fault:
//
//   · 2,400 reads is no longer reachable. At 3 reads a credit a Starter's
//     whole balance buys 360, so the scenario the assertion describes cannot
//     happen to a customer.
//   · At band 5 it does not lose money anyway. Re-banding priced the rare
//     case at what it costs, so 1.5% now clears, barely.
//
// So the stop's justification has moved, and saying so is the point of
// keeping this. It is no longer break-even that refuses a 1.5% search; it is
// that spending an entire balance to surface a handful of matches is a bad
// thing to sell somebody, however the arithmetic lands for us.
const reachable = scanEconomics({
  reads: readAllowance(starter),
  matchRate: 0.015,
  plan: starter,
});
check("a 1.5% search is now break-even rather than a real loss",
  Math.abs(reachable.net) < 0.05,
  `net ${reachable.net.toFixed(2)} over ${readAllowance(starter)} reads`);
check("where the old band would have lost real money over the same reads",
  // 5 matches at 3 credits against 360 reads, which is what this used to be.
  5 * 3 * pricePerCredit(starter) - readAllowance(starter) * COST_PER_READ < -2,
  "re-banding is what moved it, not the allowance");
check("but it is still refused, on the customer's behalf rather than ours",
  planScan({ sampleMatchRate: 0.015, remainingCredits: 120, criteriaCount: 2 }).start === false);
check("and a whole balance at that rate really does buy very little",
  (readAllowance(starter) * 0.015) < 10,
  `${(readAllowance(starter) * 0.015).toFixed(1)} matches for the entire plan`);

// --- but the stop reads a 25-business sample, so it settles far less than that
check("the smallest sample result that passes the stop is one match in 25",
  planScan({ sampleMatchRate: 1 / SAMPLE_SIZE, remainingCredits: 120, criteriaCount: 1 }).start === true
  && planScan({ sampleMatchRate: 0, remainingCredits: 120, criteriaCount: 1 }).start === false);
check("so raising the stop from 1% to 3% changed the verdict on NOTHING",
  (0.01 < 1 / SAMPLE_SIZE) === (NO_HOPE_RATE < 1 / SAMPLE_SIZE),
  "both lines sit between 0/25 and 1/25; the sample cannot tell them apart");
check("and one match in 25 admits a true rate well under break-even",
  wilsonUpper(1, SAMPLE_SIZE, 1.96) > 0.15 && breakEvenRate(starter, 3) > 0.02,
  "the interval straddles break-even, so the sample cannot settle solvency");

// --- solvency therefore rests on the live run, not the sample
const hopeless200 = checkRunHealth({ reads: 200, matches: 2, quotedBandCredits: 3, plan: starter });
check("a 1% run is stopped at the first check", hopeless200.keepGoing === false);
check("and the stop is worth more than it cost to learn",
  !hopeless200.keepGoing && hopeless200.spentUsd - hopeless200.billedUsd < 2.0,
  `lost ${(hopeless200.spentUsd - hopeless200.billedUsd).toFixed(2)}`);
check("the refusal tells the customer what they keep",
  !hopeless200.keepGoing && /nothing else was charged/.test(hopeless200.reason));

check("a healthy band-3 run at 6% is never stopped",
  ABORT_CHECKS.every((n) =>
    checkRunHealth({ reads: n, matches: Math.round(n * 0.06),
                     quotedBandCredits: 3, plan: starter }).keepGoing === true));
check("a run is only judged at the check points, never mid-flight",
  checkRunHealth({ reads: 201, matches: 0, quotedBandCredits: 3, plan: starter }).keepGoing === true);
check("zero matches at the first check is always a stop",
  PLANS.filter((p) => p.priceUsd > 0).every((p) =>
    checkRunHealth({ reads: ABORT_CHECKS[0], matches: 0,
                     quotedBandCredits: 3, plan: p }).keepGoing === false));
check("so one scan can lose at most $3.36, on any plan",
  Math.abs(MAX_LOSS_PER_SCAN_USD - 3.36) < 0.01,
  `${MAX_LOSS_PER_SCAN_USD.toFixed(2)}`);

// --- the quote is conservative, because the point estimate was measured unsafe
check("a lucky 4-in-25 on a band-2 market is NOT quoted band 1",
  quoteBand(4, 25).credits > 1,
  "this is the real Dallas med spa sample: 16% observed on a 6.2% market");
check("a clearly common market is still quoted band 1",
  quoteBand(13, 25).credits === 1, `got ${quoteBand(13, 25).credits}`);
check("the quote is never cheaper than what the observed rate alone would say",
  [0, 1, 2, 3, 4, 7, 9, 13, 20, 25].every(
    (k) => quoteBand(k, 25).credits >= bandFor(k / 25).credits));
check("and settlement can always undo an over-quote",
  settleBand(quoteBand(4, 25).credits, 0.26) === 1);

// --- the quote is a ceiling: sampling error may not cost the customer
check("a scan that delivers a common rate is billed the cheap band, not the quote",
  settleBand(3, 0.26) === 1, "quoted 3 from a thin sample, delivered 26%");
check("a scan that delivers a rarer rate is still billed the quote",
  settleBand(1, 0.01) === 1, "what was shown may only go down");

// --- every plan survives its own worst case: nothing ever matches
for (const p of PLANS.filter((x) => x.priceUsd > 0)) {
  const w = worstCaseMonthly(p);
  check(`${p.name} survives a month in which nothing matches`, w.netUsd >= 0,
    `net ${w.netUsd.toFixed(2)} on ${w.reads} reads`);
}
const freeWorst = worstCaseMonthly(free);
check("and the free tier's worst case is bounded and known",
  freeWorst.costUsd < 4.0, `${freeWorst.costUsd.toFixed(2)} per free user per period`);

// **The two levers have to agree, and this is where that is held.**
//
// Re-banding and `READS_PER_CREDIT` constrain each other: a band has to cover
// what a match costs, and `credits × reads-per-credit` has to stretch to the
// reading a match in that niche actually takes. Set separately you get a plan
// that is profitable and cannot deliver, where the solvency abort fires before
// the customer sees a single match.
//
// Reads per match is measured — spend-per-match over spend-per-read from the
// same run — not `1 / rate`, which counts businesses we never opened.
for (const m of MEASURED) {
  const readsPerMatch = m.costPerMatch / COST_PER_READ;
  const allowed = bandFor(m.rate).credits * READS_PER_CREDIT;
  check(`a ${m.market} match is reachable inside its band's reading`,
    allowed >= readsPerMatch,
    `band buys ${allowed} reads, a match takes ${readsPerMatch.toFixed(1)}`);
}

check("the allowance is set from the mandate, not from the abort rule",
  READS_PER_CREDIT ===
    Math.max(1, Math.floor(((1 - MIN_GROSS_MARGIN) * cheapestCredit()) / COST_PER_READ_ALL_IN)),
  `${READS_PER_CREDIT} reads a credit`);

check("one more read a credit would breach the floor on the cheapest plan",
  1 - ((READS_PER_CREDIT + 1) * COST_PER_READ_ALL_IN) / cheapestCredit() < MIN_GROSS_MARGIN,
  "this is why it floors rather than rounds");

// The old derivation, kept as a check rather than a comment: `1 / (3 ×
// NO_HOPE_RATE)` is 11, and 11 reads against the cheapest credit is the
// three percent margin that started this.
check("the old allowance really was the exposure it was replaced for",
  1 - (11 * COST_PER_READ_ALL_IN) / cheapestCredit() < 0.1,
  `11 reads leaves ${((1 - (11 * COST_PER_READ_ALL_IN) / cheapestCredit()) * 100).toFixed(1)}%`);

/* ------------------------------------- and the doc says what the code says -- */

/**
 * **`docs/PRICING.md` is authoritative for pricing, so it has to agree with
 * `pricing.ts` — and for three weeks it did not.**
 *
 * The re-pricing of 2026-10-15 moved `READS_PER_CREDIT` from 11 to 3 and left
 * the document stating 11, with concrete per-plan figures derived from it
 * ("Starter 1,320"). Nothing failed, because no test read the document and the
 * number reaches no customer-facing surface. It is exactly the shape of the
 * 2026-10-04 defect already in the decision log: two places disagreeing about
 * what money buys, on a product whose argument is that its numbers are
 * measured.
 *
 * So the agreement is mechanical now rather than a promise — the same move
 * `export_benchmark.py` makes for `/benchmark`, which carries no number of its
 * own. The §4 rows are checked, not the 2026-09-23 narrative below them: that
 * one records a decision genuinely taken with 11 and is meant to keep saying so.
 */
{
  const doc = readFileSync("docs/PRICING.md", "utf8");
  // The two live guardrail rows, by the text that introduces each number.
  check("the doc's scan budget is the code's",
    new RegExp(`max \\*\\*${READS_PER_CREDIT}\\*\\* candidate reads per remaining credit`).test(doc),
    `code says ${READS_PER_CREDIT}`);
  check("and so is its period read allowance",
    new RegExp(`${READS_PER_CREDIT} reads per credit:`).test(doc),
    `code says ${READS_PER_CREDIT}`);
  // Every per-plan figure on that row, derived rather than transcribed.
  for (const p of PLANS) {
    const want = p.credits * READS_PER_CREDIT;
    check(`and the doc's ${p.name} allowance is ${want.toLocaleString()}`,
      new RegExp(`${p.name}\\s+${want.toLocaleString()}\\b`, "i").test(doc),
      `${p.credits} credits x ${READS_PER_CREDIT}`);
  }
}

// --- every plan is solvent at its own no-hope boundary
for (const p of PLANS.filter((x) => x.priceUsd > 0)) {
  const e = scanEconomics({ reads: p.credits * READS_PER_CREDIT,
                            matchRate: NO_HOPE_RATE, plan: p });
  check(`${p.name} is solvent at the no-hope boundary`, e.net >= 0,
    `net ${e.net.toFixed(2)} at ${(NO_HOPE_RATE * 100).toFixed(0)}%`);
}

// --- the refusals say why, in the user's terms
const noCredits = planScan({ sampleMatchRate: 0.3, remainingCredits: 0, criteriaCount: 1 });
check("running out of credits is refused", noCredits.start === false);
const tooMany = planScan({ sampleMatchRate: 0.3, remainingCredits: 50,
                           criteriaCount: MAX_CRITERIA + 1 });
check(`more than ${MAX_CRITERIA} criteria is refused`, tooMany.start === false);
check("and the refusal explains that criteria multiply",
  /multiply/.test(tooMany.reason));
const hopeless = planScan({ sampleMatchRate: 0.005, remainingCredits: 120, criteriaCount: 2 });
check("a hopeless search is refused with its own numbers",
  hopeless.start === false && /0\.5%/.test(hopeless.reason));

// --- a healthy search proceeds, with a budget tied to balance
const ok = planScan({ sampleMatchRate: 0.26, remainingCredits: 120, criteriaCount: 1 });
check("a healthy search starts", ok.start === true);
check("and its budget is tied to remaining credits",
  ok.start && ok.budgetReads === 120 * READS_PER_CREDIT);
check("and it carries the band the customer was shown",
  ok.start && ok.band.credits === 1);

check("the free count samples 25, not 60", SAMPLE_SIZE === 25,
  "60 reads cost ~$1.00 per anonymous visitor");
check("sampling cost per anonymous count stays under $0.45",
  SAMPLE_SIZE * COST_PER_READ < 0.45,
  `${(SAMPLE_SIZE * COST_PER_READ).toFixed(2)}`);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
