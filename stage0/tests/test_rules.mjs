/**
 * The intake becomes rules, and the free ones run first.
 *
 *     node stage0/tests/test_rules.mjs
 *
 * ## Why the listing rules are most of this file
 *
 * They are new, and they are the margin. PRD v2's pipeline pre-filters for
 * free before paying to read, and nothing in this codebase could do it:
 * `signals.ts` is ten website signals and every one costs $0.018 to answer.
 * "4+ stars" applied first is the difference between reading 600 and reading
 * 2,000, which at a 70% floor is the cheapest lever there is.
 *
 * So the assertions are about the two ways a free filter goes wrong:
 *
 * - **Dropping a row on a field the provider did not send.** Overture carries
 *   no rating at all. A rule that reads a missing rating as a failure empties
 *   the entire pool the moment the paid provider is switched off, silently,
 *   and the screen says the market is empty.
 * - **Chain detection on one row.** A single listing cannot tell you it is a
 *   branch. Only the pool can, and getting that wrong either keeps every
 *   franchise or drops every pair of partners.
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

const { load } = compileLib(
  ["src/lib/rules.ts", "src/lib/signals.ts", "src/lib/fit.ts", "src/lib/providers.ts"],
  "sf-rules-",
);
const R = await load("rules");

let n = 0;
const biz = (name, extra = {}) => ({
  id: `b${++n}`,
  name,
  site: "https://example.com",
  phone: null,
  addr: null,
  town: null,
  lat: 0,
  lon: 0,
  source: "apify",
  ...extra,
});

/* ----------------------------------------------------- reading the intake -- */

test("a star rating becomes a listing rule", () => {
  const got = R.listingRulesFrom("4+ stars, independent");
  const rating = got.find((r) => r.id === "rating_min");
  assert.ok(rating, `got ${got.map((r) => r.id)}`);
  assert.equal(rating.source, "listing");
  assert.equal(rating.test(biz("A", { rating: 4.6 })), true);
  assert.equal(rating.test(biz("B", { rating: 3.2 })), false);
});

test("and a review count, and they coexist", () => {
  const got = R.listingRulesFrom("4+ stars and 100+ reviews");
  assert.deepEqual(got.map((r) => r.id).sort(), ["rating_min", "reviews_min"]);
  const reviews = got.find((r) => r.id === "reviews_min");
  assert.equal(reviews.test(biz("A", { reviews: 212 })), true);
  assert.equal(reviews.test(biz("B", { reviews: 7 })), false);
});

test("a missing field is null, never false", () => {
  // The whole-pool failure: Overture carries no rating, so `false` here would
  // empty every market the moment the paid provider was switched off.
  const [rating] = R.listingRulesFrom("4+ stars");
  assert.equal(rating.test(biz("No rating given")), null);
});

test("no website and has a website are different rules, not one negated", () => {
  assert.equal(R.listingRulesFrom("no website").find((r) => r.id === "no_site").test(biz("A", { site: null })), true);
  assert.equal(R.listingRulesFrom("has a website").find((r) => r.id === "has_site").test(biz("A")), true);
  // And asking for one does not silently add the other.
  assert.ok(!R.listingRulesFrom("no website").some((r) => r.id === "has_site"));
});

test("an intake naming nothing a listing carries produces no listing rules", () => {
  assert.deepEqual(R.listingRulesFrom("friendly people who answer the phone"), []);
});

/* ------------------------------------------------- chains, across the pool -- */

test("a chain is caught across the pool, not on one row", () => {
  const pool = [
    biz("Aspen Dental"),
    biz("Aspen Dental - South"),
    biz("Aspen Dental, Round Rock"),
    biz("Hyde Park Dental"),
    biz("Westlake Dental"),
  ];
  const rules = R.listingRulesFrom("independent, not a chain");
  const { kept, dropped } = R.applyListing(pool, rules);
  assert.equal(kept.length, 2, `kept ${kept.map((c) => c.name)}`);
  assert.equal(dropped.independent, 3);
});

test("two of a name is a second location, not a chain", () => {
  // The threshold is three on purpose: two is as often a partnership or a
  // second site as it is a franchise, and the rule says "not a chain".
  const pool = [biz("Smith Family Dental"), biz("Smith Family Dental - North"), biz("Other Dental")];
  const { kept } = R.applyListing(pool, R.listingRulesFrom("independent"));
  assert.equal(kept.length, 3);
});

test("a row a rule cannot settle is kept, not dropped", () => {
  // Same rule as the absence-proof one: an unanswerable check is not a no.
  // These have no rating, so the 4-star rule cannot speak and the read
  // decides later.
  const pool = [biz("A"), biz("B")];
  const { kept, dropped } = R.applyListing(pool, R.listingRulesFrom("4+ stars"));
  assert.equal(kept.length, 2);
  assert.deepEqual(dropped, {});
});

test("and the pre-filter says what it removed and why", () => {
  // "320 of 2,048" with no account of the other 1,728 is a number nobody can
  // check. The counts are per rule so the screen can name the reason.
  const pool = [
    biz("Good", { rating: 4.8 }),
    biz("Bad", { rating: 2.1 }),
    biz("Worse", { rating: 1.4 }),
  ];
  const { kept, dropped } = R.applyListing(pool, R.listingRulesFrom("4+ stars"));
  assert.equal(kept.length, 1);
  assert.equal(dropped.rating_min, 2);
});

/* --------------------------------------------------------- whole intakes -- */

test("an intake produces rules from both sources", () => {
  const got = R.rulesFrom({
    sells: "online booking software",
    wants: "4+ stars, no online booking",
  });
  const sources = new Set(got.rules.map((r) => r.source));
  assert.ok(sources.has("listing"), `sources ${[...sources]}`);
  assert.ok(sources.has("website"), `sources ${[...sources]}`);
});

test("the free rules come first, because the order is the cost", () => {
  const mixed = [
    { id: "a", text: "a", source: "reviews", must: true },
    { id: "b", text: "b", source: "website", must: true },
    { id: "c", text: "c", source: "listing", must: true },
  ];
  assert.deepEqual(R.cheapestFirst(mixed).map((r) => r.source),
    ["listing", "website", "reviews"]);
});

test("cheapestFirst does not mutate what it was given", () => {
  const given = [
    { id: "a", text: "a", source: "reviews", must: true },
    { id: "c", text: "c", source: "listing", must: true },
  ];
  R.cheapestFirst(given);
  assert.equal(given[0].source, "reviews", "the caller's array was reordered");
});

/* ------------------------------------------------------------- refusals -- */

test("employee count is refused, with the same reason the search gives", () => {
  const got = R.rulesFrom({ sells: "payroll", wants: "10 to 50 employees" });
  const no = got.refused.find((r) => /employee/.test(r.asked));
  assert.ok(no, `refused ${JSON.stringify(got.refused)}`);
  assert.match(no.why, /rarely published/);
  assert.ok(!got.rules.some((r) => /employee/i.test(r.text)), "it became a rule anyway");
});

test("and revenue, funding and a named decision maker", () => {
  for (const [wants, word] of [
    ["businesses doing $1m revenue", /revenue/],
    ["recently raised funding", /funding/],
    ["give me the owner's name", /decision maker/],
  ]) {
    const got = R.rulesFrom({ sells: "x", wants });
    assert.ok(got.refused.some((r) => word.test(r.asked)), `"${wants}" was not refused`);
  }
});

test("a refusal says what it would take, where there is an answer", () => {
  const got = R.rulesFrom({ sells: "payroll", wants: "headcount 20-100" });
  const no = got.refused.find((r) => /employee/.test(r.asked));
  assert.match(no.wouldTake, /payroll or filings/);
});

test("an intake we can fully serve refuses nothing", () => {
  const got = R.rulesFrom({ sells: "booking software", wants: "4+ stars, no online booking" });
  assert.deepEqual(got.refused, []);
});

test("an empty intake is a valid skip, not an error", () => {
  // The PRD makes the intake skippable, so this is the basic lane arriving
  // here: no rules, nothing refused, and `fit.ts` treats no rules as "take
  // what we read, provided it is reachable".
  const got = R.rulesFrom({ sells: "", wants: "" });
  assert.deepEqual(got.rules, []);
  assert.deepEqual(got.refused, []);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
