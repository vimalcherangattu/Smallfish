/**
 * A business we have read can ask to be removed.
 *
 *     node stage0/tests/test_optout_reach.mjs
 *
 * ## The defect this exists for
 *
 * `/api/opt-out` searched `public/data/*.json` and nothing else. That was right
 * when four measured markets were the whole product. `supply.ts` made the
 * product read **any trade in any US city**, and those businesses live in
 * `job_sites` — so the form could not find most of what we hold, and said so in
 * a sentence claiming *"we cover four metro areas"*, which had stopped being
 * true.
 *
 * The shape of it: a dentist in Austin whose site we read, judged and sold to a
 * customer types their own domain into our opt-out form and is told they are
 * probably not in Small Fish at all.
 *
 * **Enforcement was never the broken half.** `suppressedIds` reads the database
 * as well as the committed file, and a job market is filtered through the same
 * `matchedIn`, so a suppression row would have been honoured all along. What
 * was impossible was *filing* one, which is worse than it sounds: the page
 * promises something the product could not do, on the one surface where a
 * stranger is asking us to stop.
 *
 * ## What is asserted
 *
 * `findListings` stays the authority on what a claim covers — the job rows are
 * only narrowed in SQL first — so the behaviour worth pinning is that it
 * answers correctly over the **union** of the two sources. The precedence rules
 * it documents have to survive a mixed list, because they are what stop a
 * removal from reaching the wrong business or only half of the right one.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { code } from "./_source.mjs";
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

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

const { load } = compileLib(["src/lib/suppression.ts", "src/lib/types.ts"], "sf-optout-");
const { findListings } = await load("suppression");

/** A row as a market file carries it. */
const fileRow = (id, site, phone) => ({ id, name: `File ${id}`, site, phone, addr: "Phoenix, AZ" });
/** A row as `job_sites` carries it: no address, because there is no column. */
const jobRow = (id, site, phone) => ({ id, name: `Job ${id}`, site, phone, addr: "" });

/* ------------------------------------------------- the union answers -- */

test("a business we only read on a job can be found by its domain", () => {
  // The whole defect, in one assertion. Before the fix this list was the file
  // rows alone and the answer was nothing.
  const all = [fileRow("f1", "https://aspendental.com", "+16234629574"), jobRow("j1", "https://austindental.com", "+15125551234")];
  const hits = findListings(all, "austindental.com");
  assert.deepEqual(hits.map((h) => h.id), ["j1"]);
});

test("and by the phone on its listing", () => {
  // Phones are stored E.164, which is also why the SQL prefilter can be exact.
  const all = [fileRow("f1", "https://a.com", "+16234629574"), jobRow("j1", "https://b.com", "+15125551234")];
  assert.deepEqual(findListings(all, "(512) 555-1234").map((h) => h.id), ["j1"]);
});

test("an email at the listed domain works, as the form invites", () => {
  const all = [jobRow("j1", "https://austindental.com", null)];
  assert.deepEqual(findListings(all, "info@austindental.com").map((h) => h.id), ["j1"]);
});

test("a chain spanning both sources comes back whole", () => {
  // The case the billing rules already had to handle: 23 Phoenix listings share
  // `aspendental.com`. If a removal reached only the rows in the market file,
  // the branches we picked up on a cold-city read would stay listed.
  const all = [
    fileRow("f1", "https://aspendental.com", "+16234629574"),
    fileRow("f2", "https://aspendental.com", "+16234629575"),
    jobRow("j1", "https://aspendental.com", "+15125551234"),
    jobRow("j2", "https://www.aspendental.com", "+15125551235"),
    jobRow("x1", "https://somebodyelse.com", "+15125559999"),
  ];
  assert.deepEqual(findListings(all, "aspendental.com").map((h) => h.id).sort(), ["f1", "f2", "j1", "j2"]);
});

test("a domain claim never falls through to a digit match across the union", () => {
  // `findListings` documents this: a claim that is clearly a domain must not
  // match on whichever of its characters happen to be numeric. Worth pinning
  // over a mixed list, because that is the list the route now builds.
  const all = [
    jobRow("j1", "https://123dentist.com", null),
    fileRow("f1", null, "+11231231231"),
  ];
  assert.deepEqual(findListings(all, "123dentist.com").map((h) => h.id), ["j1"]);
});

test("a claim matching nothing still matches nothing", () => {
  const all = [fileRow("f1", "https://a.com", "+16234629574"), jobRow("j1", "https://b.com", "+15125551234")];
  assert.deepEqual(findListings(all, "unrelated.example"), []);
});

/* ----------------------------------------------------- the wiring -- */

// Comments stripped. Both of this file's source assertions failed against the
// raw text on first run, and both were right to: the commit's own comment
// quotes the sentence it deleted, and the route's doc comment names
// `effective_at` to explain that nothing sets it. See `_source.mjs`.
const route = code(read("src/app/api/opt-out/route.ts"));

test("the route searches the jobs as well as the files", () => {
  assert.match(route, /readListingsMatching\(claim\)/);
  // Over the union, and through `findListings` rather than a second matcher.
  assert.match(route, /const hits = findListings\(all, claim\)/);
});

test("and does not count the same business twice", () => {
  // A business can be in a market file and in `job_sites`, and a response
  // reading "filed for all 2 of these listings" about one business would be
  // the product miscounting itself to somebody it has just alarmed.
  assert.match(route, /!seen\.has\(j\.id\)/);
});

test("the sentence claiming four metro areas is gone", () => {
  // It was the reason given for not finding somebody, so it was not merely
  // stale — it was a false explanation on a compliance surface.
  assert.ok(!/four metro areas/.test(route), "the route still claims four metro areas");
  assert.match(route, /a customer has actually searched for/);
});

test("a job row carries no invented address", () => {
  // `job_sites` has no address column, and the response echoes `addr` back.
  // Guessing a town from a domain is the thing this product refuses to do.
  assert.match(route, /addr: ""/);
});

test("filing still does not remove anything on its own", () => {
  // The property the whole page rests on, and the one most easily lost while
  // widening what it can find: a request lands pending and is confirmed through
  // the contact already on the listing.
  assert.match(route, /remove_by: removeBy/);
  assert.ok(!/effective_at/.test(route), "the route must not make a request effective");
  assert.match(route, /\*\*You are not removed yet\.\*\*/);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
