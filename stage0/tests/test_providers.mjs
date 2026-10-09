/**
 * Where candidates come from, and the line that makes it defensible.
 *
 *     node stage0/tests/test_providers.mjs
 *
 * ## The rule that changed, and the one that replaced it
 *
 * CLAUDE.md said "Never scrape Google Maps", flatly. The owner reversed it on
 * 2026-10-09, and the measured argument was in our own coverage report:
 * Overture's overlap with Google's places is 31.1% for HVAC in Tampa and only
 * veterinary clears 70%, which is gate item 1 failing on open-data coverage.
 *
 * The replacement is narrower and is what these assertions are about:
 *
 * > **Use it to aim, never resell it.** A provider decides which websites we
 * > open. What we sell is our own reading of the business's own public site.
 *
 * ## Why the interface is the test
 *
 * A field that exists is a field something eventually persists. So the
 * strongest guard available is that `Candidate` has **nowhere to put** a
 * review body, a photo or a provider payload — not a rule in a comment saying
 * please do not store one. Most of this file is checking that the shape stays
 * narrow, because the shape is the policy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { code } from "./_source.mjs";

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

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");
const src = read("src/lib/providers.ts");
const live = code(src);

/* ------------------------------------------- the shape is the policy -- */

test("a candidate has nowhere to put a review body", () => {
  // The richest thing a scraper returns and the one with somebody else's
  // licence on it. Rating and count are numbers and travel; the prose does
  // not, and the way to keep it out is to have no field for it.
  const iface = live.slice(live.indexOf("export interface Candidate"), live.indexOf("export interface SupplyQuery"));
  for (const banned of ["reviewText", "reviewsText", "snippet", "description", "photos", "raw", "payload"]) {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(iface), `Candidate carries ${banned}`);
  }
  // And the numbers that are allowed are there, so this is a line and not a ban.
  assert.match(iface, /rating\?: number \| null;/);
  assert.match(iface, /reviews\?: number \| null;/);
});

test("and we do not pay to collect what we will not keep", () => {
  // Asking for zero reviews and zero images is the policy and also cheaper.
  assert.match(live, /maxReviews: 0/);
  assert.match(live, /maxImages: 0/);
  assert.match(live, /scrapeReviewsPersonalData: false/);
});

test("every candidate says which provider produced it", () => {
  assert.match(live, /source: string;/);
  assert.match(live, /source: "overture"/);
  assert.match(live, /source: "apify"/);
});

/* --------------------------------------------------- ids stay stable -- */

test("Overture ids pass through unprefixed", () => {
  // Every unlock, suppression and everGivenIds row in the database is keyed by
  // these. Renaming them would silently un-suppress businesses that had asked
  // to be left alone, which is the worst available bug in this product.
  const ov = live.slice(live.indexOf("export const overture"), live.indexOf("const APIFY_BASE"));
  assert.match(ov, /id: r\.id,/);
  // The prefix as a *string literal*, which is the only way one gets applied.
  // Matching bare `overture:` hit the type annotation on the declaration
  // itself — the test was wrong and the code was right.
  assert.ok(!/["'`]overture:/.test(ov), "Overture ids got a prefix");
});

test("and another provider's ids are namespaced", () => {
  // So two providers cannot collide on one id, and so a provider's rows can be
  // found if it is ever switched off.
  assert.match(live, /const id = `apify:\$\{placeId\}`/);
});

/* ------------------------------------------------- choosing a provider -- */

test("the free one is the default, and a key alone does not switch it", () => {
  // A paid provider that switched itself on because a key happened to exist is
  // a bill nobody chose.
  assert.match(live, /if \(want\) \{/);
  assert.match(live, /return overture;/);
  const chooser = live.slice(live.indexOf("export function providerFor"));
  assert.ok(
    chooser.indexOf("return overture;") > chooser.indexOf("found?.ready()"),
    "overture is not the fallthrough",
  );
});

test("a provider with no key is unavailable rather than broken", () => {
  assert.match(live, /ready: \(\) => Boolean\(process\.env\.APIFY_TOKEN && process\.env\.APIFY_ACTOR\)/);
});

test("the actor is never guessed", () => {
  // Google Maps actors differ in what they take and return. A wrong id baked
  // in would either fail in production or, worse, run and bill for the wrong
  // thing.
  assert.ok(
    !/APIFY_ACTOR\s*\|\|\s*["']/.test(live) && !/APIFY_ACTOR\s*\?\?\s*["']/.test(live),
    "there is a default actor id",
  );
  assert.match(src, /there is no safe default/);
});

test("a provider having a bad afternoon does not fail the search", () => {
  // These actors break when Google changes; that is a known cost of the
  // approach rather than a surprise. Falling back to the open data and saying
  // so beats a search that dies.
  assert.match(live, /catch \(err\) \{\s*const fell = await overture\.find\(q\)/);
  assert.match(live, /so this is the/);
});

/* ------------------------------------------- the decision is recorded -- */

test("the reversal is in the decision log, not only in the code", () => {
  // CLAUDE.md carried "Never scrape Google Maps" as a flat rule. A written
  // rule reversed silently is worse than either choice; this repo's convention
  // is that a reversal is recorded with its reasoning.
  const plan = read("PROJECT_PLAN.md");
  assert.match(plan, /2026-10-09/);
  assert.match(plan, /Never scrape Google Maps/);
  assert.match(plan, /aim/i);
});

test("and CLAUDE.md no longer states the rule it no longer follows", () => {
  const claude = read("CLAUDE.md");
  assert.ok(
    !/\*\*Never scrape Google Maps\.\*\* It breaks Google's terms/.test(claude),
    "CLAUDE.md still carries the old flat rule",
  );
  // Replaced, not deleted: the narrower rule has to be somewhere.
  assert.match(claude, /never resell/i);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
