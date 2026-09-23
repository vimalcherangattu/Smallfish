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
import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/pricing.ts"], "sfprice-");
const {
  COST_PER_READ, BANDS, bandFor, PLANS, pricePerCredit, READS_PER_CREDIT,
  NO_HOPE_RATE, MAX_CRITERIA, SAMPLE_SIZE, planScan, scanEconomics,
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

// --- the bands do what they exist to do
const perCredit = MEASURED.map((m) => m.costPerMatch / bandFor(m.rate).credits);
const lo = Math.min(...perCredit), hi = Math.max(...perCredit);
check("banding collapses the measured spread below 2.5x", hi / lo < 2.5,
  `got ${(hi / lo).toFixed(2)}x`);
check("every measured niche lands at or under $0.07 per credit", hi <= 0.07,
  `worst ${hi.toFixed(4)}`);
check("the unbanded spread really was over 6x, or bands solve nothing",
  Math.max(...MEASURED.map((m) => m.costPerMatch)) /
  Math.min(...MEASURED.map((m) => m.costPerMatch)) > 6);

// --- each measured niche lands in the band the decision assigned it
check("dental at 26.0% is band 1", bandFor(0.26).credits === 1);
check("med spa at 6.2% is band 2", bandFor(0.062).credits === 2);
check("hvac at 5.0% is band 3", bandFor(0.05).credits === 3);
check("bands are ordered cheapest-rate-last", BANDS.every((b, i, a) =>
  i === 0 || a[i - 1].minRate > b.minRate));

// --- margins, at the worst measured band cost, no breakage
const claimed = { starter: 72, growth: 65, agency: 65, watch: 87, pack: 63 };
for (const p of PLANS.filter((p) => p.priceUsd > 0)) {
  const margin = 100 * (1 - hi / pricePerCredit(p));
  const want = claimed[p.id];
  if (want !== undefined) {
    check(`${p.name} clears its claimed ${want}% margin`,
      Math.abs(margin - want) <= 2,
      `computed ${margin.toFixed(1)}%`);
  }
}
const free = PLANS.find((p) => p.id === "free");
check("the free tier costs at most $1.40 per user to honour",
  free.credits * hi <= 1.40, `${(free.credits * hi).toFixed(2)}`);

// --- the correction: 1% would have let a losing search through
const starter = PLANS.find((p) => p.id === "starter");
const breakEven = COST_PER_READ / (3 * pricePerCredit(starter));
check("the no-hope stop sits above break-even on the tightest plan",
  NO_HOPE_RATE > breakEven,
  `stop ${NO_HOPE_RATE}, break-even ${breakEven.toFixed(4)}`);
check("a 1% stop would NOT have cleared break-even",
  0.01 < breakEven,
  "this is why the decision document's 1% was raised to 3%");

const losing = scanEconomics({ reads: 2400, matchRate: 0.015, plan: starter });
check("the 1.5% case the old stop allowed does lose money", losing.net < 0,
  `net ${losing.net.toFixed(2)}`);
check("and the current stop refuses it",
  planScan({ sampleMatchRate: 0.015, remainingCredits: 120, criteriaCount: 2 }).start === false);

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
