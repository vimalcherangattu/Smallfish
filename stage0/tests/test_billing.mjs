/** What counts as one business for billing (S1-04).
 *
 *  Found by accident: a privacy test flagged `eastvalleyimplant.com` in an
 *  export beside a locked record, which turned out to be two Overture rows for
 *  one practice rather than a leak. Widening the check found the same shape via
 *  shared phone numbers, and names that are substrings of other names.
 *
 *  A product billing per matched business has to know what one business is, and
 *  the candidate source does not — it carries a row per listing. Charging per
 *  row is charging for our supplier's duplicates.
 *
 *  Run:  node stage0/tests/test_billing.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/billing.ts", "src/lib/csv.ts", "src/lib/entitlement.ts",
   "src/lib/outreach.ts", "src/lib/signals.ts", "src/lib/types.ts"],
  "sfbill-",
);
const { billingKey, groupForBilling, duplicatesIn, hostOf } = await load("billing");
const { toCsv, overallVerdict } = await load("csv");
const { BILLABLE } = await load("types");

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}: ${e.message}`); }
};

const criteria = [{ id: "no_book", type: "absence", text: "has no online booking",
                    explain: "", needsModel: true }];
const mk = (id, site, extra = {}) => ({
  id, name: `Name ${id}`, cat: "c", lat: 33.45, lon: -112.07, addr: `${id} St`,
  site, phone: null, primary: true,
  verdicts: { no_book: { verdict: "match", reason: "r" } },
  ...extra,
});

test("a host is normalised past scheme, www and path", () => {
  const want = "eastvalleyimplant.com";
  for (const u of ["https://eastvalleyimplant.com/", "http://www.EastValleyImplant.com",
                   "eastvalleyimplant.com", "https://eastvalleyimplant.com/team?x=1#a"]) {
    assert.equal(hostOf(u), want, u);
  }
});

test("a non-URL is not a host", () => {
  for (const u of [null, "", "  ", "not a url"]) assert.equal(hostOf(u), null);
});

test("two listings for one practice, at one address, are one business", () => {
  // The real pair that started this: same domain, same building.
  const a = mk("center", "https://eastvalleyimplant.com/", { lat: 33.58557, lon: -111.88850 });
  const b = mk("capps", "eastvalleyimplant.com", { lat: 33.58557, lon: -111.88826 });
  assert.equal(billingKey(a), billingKey(b));
  assert.equal(groupForBilling([a, b]).length, 1);
  assert.equal(duplicatesIn([a, b]), 1, "one credit would have been charged twice");
});

test("branches of a chain on one domain are NOT one business", () => {
  // The retraction. 23 Phoenix records share aspendental.com; collapsing them
  // would hide 22 real leads and under-bill the ones it kept.
  const branches = [
    mk("a", "aspendental.com", { lat: 33.45, lon: -112.07 }),
    mk("b", "aspendental.com", { lat: 33.58, lon: -112.10 }),
    mk("c", "aspendental.com", { lat: 33.30, lon: -111.84 }),
  ];
  assert.equal(groupForBilling(branches).length, 3);
  assert.equal(duplicatesIn(branches), 0);
});

test("unrelated businesses sharing a link-in-bio page stay separate", () => {
  // 59 Dallas med spas share linktr.ee. They are not one business.
  const spas = [
    mk("x", "linktr.ee/one", { lat: 32.78, lon: -96.80 }),
    mk("y", "linktr.ee/two", { lat: 32.95, lon: -96.73 }),
  ];
  assert.equal(groupForBilling(spas).length, 2);
});

test("two listings of ONE branch of a chain still merge", () => {
  // The rule has to do both. Same domain, same place, inside a big group.
  const rows = [
    mk("far", "aspendental.com", { lat: 33.58, lon: -112.10 }),
    mk("here1", "aspendental.com", { lat: 33.45, lon: -112.07 }),
    mk("here2", "aspendental.com", { lat: 33.45001, lon: -112.07001 }),
  ];
  assert.equal(groupForBilling(rows).length, 2);
});

test("the distance line is a building, not a neighbourhood", () => {
  const near = [mk("a", "x.com", { lat: 33.45, lon: -112.07 }),
                mk("b", "x.com", { lat: 33.4508, lon: -112.07 })];   // ~90m
  const far = [mk("a", "x.com", { lat: 33.45, lon: -112.07 }),
               mk("b", "x.com", { lat: 33.46, lon: -112.07 })];      // ~1.1km
  assert.equal(groupForBilling(near).length, 1);
  assert.equal(groupForBilling(far).length, 2);
});

test("a business with no website is its own business", () => {
  // Nothing else here merges reliably: names differ by punctuation and
  // addresses by suite line, so merging on them would collapse real leads.
  const a = mk("a", null), b = mk("b", null);
  assert.notEqual(billingKey(a), billingKey(b));
  assert.equal(groupForBilling([a, b]).length, 2);
});

test("different websites stay different businesses", () => {
  assert.equal(groupForBilling([mk("a", "a.com"), mk("b", "b.com")]).length, 2);
});

test("the lead is a record that was actually read, before the fullest one", () => {
  // The expensive direction to be wrong in. The real pair that started this is
  // one record matched and one never read; if completeness won, a paid-for
  // match would disappear behind an unread duplicate.
  const unread = mk("unread", "x.com", {
    phone: "+1555", addr: "A very long and complete address, Suite 400",
    verdicts: { no_book: { verdict: "unread", reason: "not read yet" } },
  });
  const read = mk("read", "x.com", { addr: "1 St" });  // matched, sparse
  const [g] = groupForBilling([unread, read]);
  assert.equal(g.lead.id, "read");
  assert.equal(g.lead.verdicts.no_book.verdict, "match");
});

test("among read records, the lead is the fullest, not the first seen", () => {
  const thin = mk("thin", "x.com");
  const full = mk("full", "x.com", { phone: "+1555", addr: "12 Long Street, Ste 4" });
  assert.equal(groupForBilling([thin, full])[0].lead.id, "full");
  assert.equal(groupForBilling([full, thin])[0].lead.id, "full",
    "order must not decide which row the user gets");
});

test("the export ships one row per business and says how many listings", () => {
  const rows = toCsv([mk("a", "x.com"), mk("b", "x.com"), mk("c", "y.com")], criteria)
    .trimEnd().split("\r\n");
  assert.equal(rows.length - 1, 2, "three listings, two businesses");
  const head = rows[0].split(",");
  const i = head.indexOf("locations");
  assert.ok(i > 0, "the file must say when a row stands for several listings");
  const counts = rows.slice(1).map((r) => r.split(",")[i]).sort();
  assert.deepEqual(counts, ["1", "2"]);
});

test("deduplication never merges across the unlocked boundary", () => {
  // A locked record must not be able to ride into the file on a match's row,
  // and must not suppress one either.
  const matched = mk("m", "shared.com");
  const locked = mk("l", "shared.com", {
    verdicts: { no_book: { verdict: "couldnt_tell", reason: "r" } } });
  const csv = toCsv([locked, matched], criteria);
  assert.ok(csv.includes("Name m"), "the match must ship");
  assert.ok(!csv.includes("Name l"), "the locked record must not");
});

// --- the measured markets
test("no measured market collapses into implausibly few businesses", () => {
  // The guard the first version of this rule needed and did not have: if a
  // domain could swallow a whole chain, one market's business count would
  // drop far below its record count. 12% is duplicates; 50% would be a bug.
  for (const id of ["dental-phoenix", "med-spa-dallas", "hvac-tampa"]) {
    const m = JSON.parse(readFileSync(`public/data/${id}.json`, "utf8"));
    const withSite = m.businesses.filter((b) => b.site);
    const kept = groupForBilling(withSite).length;
    assert.ok(kept / withSite.length > 0.8,
      `${id} kept only ${kept} of ${withSite.length} — a chain is being collapsed`);
  }
});

test("duplicates are real and measured, not hypothetical", () => {
  const seen = [];
  for (const id of ["dental-phoenix", "med-spa-dallas", "hvac-tampa"]) {
    const m = JSON.parse(readFileSync(`public/data/${id}.json`, "utf8"));
    const withSite = m.businesses.filter((b) => b.site);
    const dupes = duplicatesIn(withSite);
    seen.push(`${id}: ${dupes} of ${withSite.length}`);
    assert.ok(dupes > 0, `${id} should carry real duplicates, found ${dupes}`);
  }
  console.log(`        ${seen.join("  ·  ")}`);
});

test("and billing them once changes what a real market's invoice would be", () => {
  const m = JSON.parse(readFileSync("public/data/dental-phoenix.json", "utf8"));
  const cs = m.criteria.slice(0, 1);
  const matched = m.businesses.filter((b) => BILLABLE[overallVerdict(b, cs)]);
  const billed = groupForBilling(matched).length;
  assert.ok(billed <= matched.length);
  console.log(`        dental: ${matched.length} matched listings -> ${billed} billed` +
    ` (${matched.length - billed} duplicate${matched.length - billed === 1 ? "" : "s"})`);
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
