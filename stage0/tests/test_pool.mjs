/**
 * The pool count and its five samples.
 *
 *     node stage0/tests/test_pool.mjs
 *
 * ## The two failures this is about
 *
 * **An invented number.** PRD v2 says it twice: the pool count must be real,
 * and a made-up figure that later shrinks to 300 destroys trust in everything
 * after it. The defence is structural rather than a careful habit — there is no
 * code path here that produces a number from anything but a count that came
 * back, and `poolClaim` carries both the market total and the smaller
 * readable one, because quoting the first alone is the "we checked 2,800"
 * overclaim this repository has already retracted.
 *
 * **Five rows of one chain.** `rows.slice(0, 5)` on a category scan frequently
 * returns five branches of the same franchise, and five lines reading "Aspen
 * Dental" tells somebody their market is a chain — a false impression created
 * by row order, on the first screen a stranger sees. That is what `sampleRows`
 * is for, and most of this file.
 */

import assert from "node:assert/strict";

import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  pass  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
};

const { load } = compileLib(["src/lib/pool.ts"], "sf-pool-");
const P = await load("pool");

/* ------------------------------------------------------------- fixtures -- */

/**
 * **The fixture that lied.** This used to build `addr` as
 * `100 Main St, ${town}, TX 78701` and let `sampleRows` read the town out of
 * it — because that is the shape I assumed Overture addresses had. It is not:
 * `addr` is `addresses[1].freeform`, the **street line**, so the real strings
 * look like the one below and the first live run of the pool screen rendered
 * five neighbourhoods called "Suite 100" and "TX 78665".
 *
 * The test passed throughout, because the fixture encoded the same assumption
 * as the code. So `addr` here is now a real-shaped freeform street line, and
 * the town travels in `town`, from `addresses[1].locality`. If the town is ever
 * read back out of `addr` again, these fixtures fail it.
 */
let n = 0;
const biz = (name, town, extra = {}) => ({
  id: `b${++n}`,
  name,
  site: extra.site === undefined ? "https://example.com" : extra.site,
  phone: extra.phone ?? "(512) 555-0100",
  addr: "11200 Lakeline Blvd, Suite 100",
  town: town ?? null,
  lat: 30.26,
  lon: -97.74,
  source: "overture",
  ...extra,
});

/* ----------------------------------------------------- the chain problem -- */

test("five branches of one chain collapse to one sample", () => {
  // The failure in its purest form: row order makes a franchise look like a
  // market.
  const rows = [
    biz("Aspen Dental", "Austin"),
    biz("Aspen Dental - South", "Austin"),
    biz("Aspen Dental (Round Rock)", "Round Rock"),
    biz("Aspen Dental, Cedar Park", "Cedar Park"),
    biz("Aspen Dental LLC", "Austin"),
    biz("Hyde Park Dental", "Austin"),
    biz("Barton Springs Family Dentistry", "Austin"),
  ];
  const got = P.sampleRows(rows, 5);
  const aspen = got.filter((s) => /aspen/i.test(s.name));
  assert.equal(aspen.length, 1, `kept ${aspen.length} Aspen rows`);
  assert.ok(got.length >= 2, "collapsed everything");
});

test("and a suffix is what makes a chain look like a market", () => {
  // Each of these is the same business with a different location tail. The
  // normalisation cuts at the first dash, comma or bracket.
  for (const tail of [" - South", ", Cedar Park", " (Round Rock)", " LLC", " | North"]) {
    const got = P.sampleRows([biz("Aspen Dental"), biz(`Aspen Dental${tail}`)], 5);
    assert.equal(got.length, 1, `"${tail}" was treated as a different business`);
  }
});

test("genuinely different businesses are never merged", () => {
  // A false merge costs one sample slot; a false split costs the impression
  // the screen exists to give. But merging two real practices would be worse
  // than either, so the dedupe must not be greedy.
  const rows = [
    biz("Hyde Park Dental", "Austin"),
    biz("Hyde Park Orthodontics", "Austin"),
    biz("Westlake Dental", "Westlake"),
  ];
  assert.equal(P.sampleRows(rows, 5).length, 3);
});

/* ------------------------------------------------------- spread and order -- */

test("samples spread across towns before doubling up on one", () => {
  // A dense suburb should not take all five slots.
  const rows = [
    biz("A Dental", "Austin"),
    biz("B Dental", "Austin"),
    biz("C Dental", "Austin"),
    biz("D Dental", "Round Rock"),
    biz("E Dental", "Cedar Park"),
  ];
  const towns = P.sampleRows(rows, 3).map((s) => s.town);
  assert.equal(new Set(towns).size, 3, `towns were ${JSON.stringify(towns)}`);
});

test("a business with a website is sampled before one without", () => {
  // Leading with sites we cannot open sets the wrong expectation on the first
  // screen a stranger sees.
  const rows = [
    biz("No Site Dental", "Austin", { site: null }),
    biz("Has Site Dental", "Round Rock"),
  ];
  const got = P.sampleRows(rows, 2);
  assert.equal(got[0].name, "Has Site Dental");
  assert.equal(got[0].hasSite, true);
  assert.equal(got[1].hasSite, false);
});

test("never more than asked, and never a row twice", () => {
  const rows = Array.from({ length: 40 }, (_, i) => biz(`Practice ${i}`, `Town ${i % 7}`));
  const got = P.sampleRows(rows, 5);
  assert.equal(got.length, 5);
  assert.equal(new Set(got.map((s) => s.name)).size, 5);
});

test("the five come from across the list, not off its alphabetical top", () => {
  // The defect this is for, in live data: `supply.ts` returns rows ORDER BY
  // name, digits sort before letters, and the top five Austin dentists were
  // "04 Dental", "1460 Dental Studio", "183 Family Dentistry" and "360 SDM
  // Dental Lab" — a market that reads like a directory glitch.
  const rows = Array.from({ length: 400 }, (_, i) =>
    biz(`${String(i).padStart(4, "0")} Dental`, `Town ${i}`),
  );
  const got = P.sampleRows(rows, 5);
  const indices = got.map((s) => Number(s.name.slice(0, 4)));
  // Not the first five.
  assert.notDeepEqual(indices, [0, 1, 2, 3, 4], "the samples are the list's head");
  // And genuinely spread: the five span more than a tenth of the list.
  assert.ok(
    Math.max(...indices) - Math.min(...indices) > 40,
    `the five sat within ${Math.max(...indices) - Math.min(...indices)} of each other`,
  );
});

test("and the spread is the same on every call, so the screen does not flicker", () => {
  // Deterministic rather than shuffled: a sample that changes on reload reads
  // as instability on the screen whose job is to make the market feel solid.
  const rows = Array.from({ length: 300 }, (_, i) => biz(`P ${i}`, `Town ${i}`));
  const a = P.sampleRows(rows, 5).map((s) => s.name);
  const b = P.sampleRows(rows, 5).map((s) => s.name);
  assert.deepEqual(a, b);
});

test("striding never loses a row, so the dedupe cannot run short", () => {
  // 12 businesses, 10 of them one chain. If the stride dropped rows the sample
  // would come back short of the two real ones.
  const rows = [
    ...Array.from({ length: 10 }, (_, i) => biz(`Chain Dental - ${i}`, "Austin")),
    biz("Hyde Park Dental", "Austin"),
    biz("Westlake Dental", "Westlake"),
  ];
  const got = P.sampleRows(rows, 5).map((s) => s.name);
  assert.ok(got.some((nm) => /Hyde Park/.test(nm)), `missing Hyde Park: ${got}`);
  assert.ok(got.some((nm) => /Westlake/.test(nm)), `missing Westlake: ${got}`);
});

test("an empty pool samples to nothing rather than throwing", () => {
  assert.deepEqual(P.sampleRows([], 5), []);
  assert.deepEqual(P.sampleRows(undefined ?? [], 5), []);
});

/* --------------------------------------------------------------- the town -- */

test("the town comes from the provider's field, never the address", () => {
  // The retraction, pinned. `addr` on every fixture here is a real-shaped
  // Overture `freeform` street line, so anything that goes back to parsing it
  // produces "Suite 100" and fails this.
  assert.equal(P.sampleRows([biz("A", "Cedar Park")], 1)[0].town, "Cedar Park");
  const got = P.sampleRows([biz("B", null)], 1)[0];
  assert.equal(got.town, null, "a town was invented from the street line");
  assert.ok(!/suite|ste|lakeline/i.test(String(got.town)), "the street line leaked as a town");
});

test("a blank or one-character town is treated as absent", () => {
  // Providers send "" and " " for a field they do not have, and a one-letter
  // town is not a place.
  for (const town of ["", "   ", "A"]) {
    assert.equal(P.sampleRows([biz("X", town)], 1)[0].town, null);
  }
});

/* ------------------------------------------------------------- the claim -- */

test("the claim carries both numbers, market and readable", () => {
  const said = P.poolClaim(2048, 1838, "dentists", "Austin");
  assert.match(said, /2,048 dentists in Austin/);
  assert.match(said, /1,838 have a website/);
});

test("and the readable number is never dropped, which is the overclaim", () => {
  // "2,048 dentists in Austin" alone reads as though 2,048 were read. 200 were.
  for (const [n, w] of [
    [2048, 1838],
    [11, 4],
    [1, 1],
  ]) {
    const said = P.poolClaim(n, w, "dentists", "Austin");
    assert.ok(
      said.includes(w.toLocaleString("en-US")),
      `the readable count ${w} is missing from "${said}"`,
    );
  }
});

test("nothing found says nothing found, not zero of zero", () => {
  assert.match(P.poolClaim(0, 0, "dentists", "Austin"), /no dentists in Austin/);
});

test("a market with websites nowhere says so plainly", () => {
  // This product cannot serve it, and saying so now is cheaper than saying it
  // after a read.
  const said = P.poolClaim(300, 0, "food trucks", "Austin");
  assert.match(said, /none of them has a website/);
});

/* ---------------------------------------------------------- the thinness -- */

test("thinness names the case that this product cannot serve", () => {
  assert.match(P.thinness(300, 0), /cannot help/);
  assert.match(P.thinness(0, 0), /Nothing here/);
  assert.match(P.thinness(40, 11), /small pool/);
  assert.equal(P.thinness(2048, 1838), null, "a healthy pool was called thin");
});

test("thinness measures websites, not listings", () => {
  // A thousand listings with no websites is not a market this product can
  // serve, and the listing count would have called it healthy.
  assert.notEqual(P.thinness(1000, 3), null);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
