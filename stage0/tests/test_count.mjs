/** The free match count (S1-02).
 *
 *  This is the number the whole product is judged on before anyone pays, so
 *  the tests are mostly about what it is NOT allowed to claim. A sample of 25
 *  can quote a band and refuse a hopeless search. It cannot name a match count,
 *  and the founding document's "about 140 matches" is exactly the kind of
 *  invented precision the rest of this codebase refuses.
 *
 *  Run:  node stage0/tests/test_count.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/count.ts", "src/lib/pricing.ts", "src/lib/types.ts"],
  "sfcount-",
);
const { freeCount, rangeWidth, verdictOf } = await load("count");
const { SAMPLE_SIZE, bandFor } = await load("pricing");

const criteria = [
  { id: "no_online_booking", type: "absence", text: "has no online booking",
    explain: "Looks for a booking widget.", needsModel: true },
];

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}: ${e.message}`); }
};

const mk = (i, verdict, extra = {}) => ({
  id: `b${i}`, name: `Biz ${i}`, cat: "general_dentistry", lat: 0, lon: 0,
  addr: "x", site: `b${i}.example`, phone: "", primary: true,
  verdicts: { no_online_booking: { verdict, reason: "r", ...extra } },
});

const pool = (matches, others, kind = "no_match") => [
  ...Array.from({ length: matches }, (_, i) => mk(i, "match", { proof: `evidence ${i}` })),
  ...Array.from({ length: others }, (_, i) => mk(1000 + i, kind)),
];

const run = (businesses, over = {}) =>
  freeCount({ businesses, criteria, seed: "s", remainingCredits: 120, ...over });

test("the same search twice gives the same count", () => {
  const b = pool(40, 160);
  const a = freeCount({ businesses: b, criteria, seed: "dental:no_booking", remainingCredits: 120 });
  const c = freeCount({ businesses: b, criteria, seed: "dental:no_booking", remainingCredits: 120 });
  assert.deepEqual(a.projected, c.projected);
  assert.equal(a.matched, c.matched);
});

test("a different search samples differently", () => {
  const b = pool(40, 160);
  const seeds = new Set(
    ["a", "b", "c", "d", "e"].map((s) =>
      freeCount({ businesses: b, criteria, seed: s, remainingCredits: 120 }).matched),
  );
  assert.ok(seeds.size > 1, "a fixed sample would make every market look alike");
});

test("it samples 25, never the whole market", () => {
  const c = run(pool(500, 2500));
  assert.ok(c.sampled <= SAMPLE_SIZE, `sampled ${c.sampled}`);
  assert.equal(c.eligible, 3000, "but it knows how big the market is");
});

test("businesses with no website are never sampled", () => {
  const noSite = pool(0, 30).map((b) => ({ ...b, site: null }));
  const c = run([...pool(10, 0), ...noSite]);
  assert.equal(c.eligible, 10, "a no-website business is a paid unlock, not a sample");
});

test("the sample is drawn from what can be read, not from the whole market", () => {
  // The bug a screenshot caught: sampling 25 from a market where only a
  // fraction has been read returned 3 readable sites and reported them as the
  // sample. A free count that reads 25 sites must sample 25 readable ones.
  const c = run([...pool(40, 60), ...Array.from({ length: 2000 }, (_, i) =>
    mk(9000 + i, "unread"))]);
  assert.equal(c.sampled, SAMPLE_SIZE, `sampled only ${c.sampled}`);
  assert.equal(c.frame, 100, "the frame is what has a verdict");
  assert.equal(c.eligible, 2100, "the projection still scales to the whole market");
  assert.ok(c.frameLimited, "and says so, because the frame was not chosen at random");
});

test("nothing is frame-limited once the whole market has been read", () => {
  assert.equal(run(pool(40, 60)).frameLimited, false);
});

test("the count is a RANGE, and a wide one at 25", () => {
  const c = run(pool(400, 2100));   // a true rate of ~16%
  assert.ok(c.projected.hi > c.projected.lo, "a point estimate would be invented precision");
  assert.ok(rangeWidth(c) > 1.5,
    `at n=25 the range should be visibly wide, got ${rangeWidth(c).toFixed(2)}x`);
  assert.ok(c.projected.lo <= 400 && c.projected.hi >= 400,
    `the true count ${400} must sit inside [${c.projected.lo}, ${c.projected.hi}]`);
});

test("the range brackets the truth across many different markets", () => {
  // The one property that matters: an interval that misses is worse than no
  // interval at all, because it is a confident wrong answer.
  let inside = 0, total = 0;
  for (let trueMatches = 60; trueMatches <= 900; trueMatches += 60) {
    for (const seed of ["p", "q", "r", "s", "t", "u", "v", "w"]) {
      const c = freeCount({ businesses: pool(trueMatches, 3000 - trueMatches),
                            criteria, seed, remainingCredits: 120 });
      total++;
      if (c.projected.lo <= trueMatches && trueMatches <= c.projected.hi) inside++;
    }
  }
  const rate = inside / total;
  assert.ok(rate >= 0.9, `only ${(rate * 100).toFixed(0)}% of ranges contained the truth`);
});

test("an unreadable site counts against the rate, not out of it", () => {
  // 5 matches, 20 unreadable. Delivered 5/25 = 20%; decided 5/5 = 100%.
  const c = run([...pool(5, 0), ...pool(0, 95, "blocked")], { sampleSize: 25 });
  assert.ok(c.deliveredRate < c.decidedRate,
    "counting unreadable sites out of the denominator would quote a band the scan cannot honour");
  assert.equal(bandFor(c.deliveredRate).credits, c.band.credits);
});

test("the band comes from the delivered rate, because that is what sets cost per match", () => {
  const common = run(pool(900, 2100));      // ~30%
  const rare = run(pool(60, 2940));         // ~2%
  assert.equal(common.band.credits, 1);
  assert.ok(rare.band.credits >= 2, "a rare search must not be quoted at the common rate");
});

test("a hopeless search is refused before the scan, with its own numbers", () => {
  const c = run(pool(0, 3000));
  assert.equal(c.scan.start, false);
  assert.ok(/0\.0%|scan/.test(c.scan.reason));
});

test("three proven samples are shown free, with their evidence", () => {
  const c = run(pool(400, 2100));
  assert.ok(c.proofs.length > 0 && c.proofs.length <= 3);
  for (const p of c.proofs) {
    assert.ok(p.name, "a free proof needs the business it is about");
    assert.ok(p.line.includes("evidence"), "and the evidence it rests on");
  }
});

test("an absence match's reason counts as its evidence", () => {
  // The measured data carries no `proof` on an absence match — the reason
  // holds the absence proof ("3 relevant pages read; no sign of it"). A screen
  // that required `proof` showed no free samples at all on the one market
  // where the product is proven.
  const absence = Array.from({ length: 20 }, (_, i) => ({
    ...mk(i, "match"),
    verdicts: { no_online_booking: {
      verdict: "match", reason: "3 relevant page(s) read; no sign of it" } },
  }));
  const c = run([...absence, ...pool(0, 20)]);
  assert.equal(c.proofs.length, 3, "three are shown free");
  assert.ok(c.proofs.every((p) => p.line.includes("no sign of it")));
});

test("a proof is only ever shown for a real match", () => {
  const c = run(pool(0, 3000, "couldnt_tell"));
  assert.equal(c.matched, 0);
  assert.equal(c.proofs.length, 0, "an unproven row must never appear as a free sample");
});

test("verdictOf needs every criterion to match", () => {
  const two = [...criteria, { id: "botox", type: "presence", text: "offers Botox",
                              explain: "", needsModel: true }];
  const b = { ...mk(1, "match"), verdicts: {
    no_online_booking: { verdict: "match", reason: "" },
    botox: { verdict: "couldnt_tell", reason: "" } } };
  assert.notEqual(verdictOf(b, two), "match");
});

// --- against the real measured market, not a fixture
test("it holds up on the measured dental market", () => {
  const market = JSON.parse(readFileSync("public/data/dental-phoenix.json", "utf8"));
  const judged = market.businesses.filter(
    (b) => b.site && (b.verdicts?.no_online_booking?.verdict ?? "unread") !== "unread",
  );
  const c = freeCount({ businesses: judged, criteria: market.criteria.slice(0, 1),
                        seed: "dental-phoenix:no_online_booking", remainingCredits: 120 });
  assert.ok(c.sampled > 0, "the measured market should yield a readable sample");
  assert.ok(c.projected.hi >= c.projected.lo);

  // The sample's range must contain the rate we actually measured over the
  // whole judged set. If it does not, the sampler is biased.
  const truth =
    judged.filter((b) => b.verdicts.no_online_booking.verdict === "match").length /
    judged.length;
  assert.ok(c.range.lo <= truth && truth <= c.range.hi,
    `measured ${(truth * 100).toFixed(1)}% outside sample range ` +
    `[${(c.range.lo * 100).toFixed(1)}%, ${(c.range.hi * 100).toFixed(1)}%]`);
  console.log(`        measured ${(truth * 100).toFixed(1)}%, sample said ` +
    `${(c.range.lo * 100).toFixed(1)}–${(c.range.hi * 100).toFixed(1)}% ` +
    `(${c.matched}/${c.sampled}), band ${c.band.credits}`);
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
