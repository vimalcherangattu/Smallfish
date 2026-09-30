/**
 * A list somebody exported from something else (P1).
 *
 *     node stage0/tests/test_upload.mjs
 *
 * Upload is the cheapest route to "any market" — the customer brings the
 * businesses, so it needs no candidate extraction at all. What it needs instead
 * is to survive the file they actually have, which came out of a CRM, a
 * scraper, or Excel on a Windows machine.
 *
 * ## The one unforgivable failure
 *
 * **A row that is dropped without being counted.** Somebody uploads 500
 * businesses, gets 340 back, and has no idea whether the other 160 did not fit
 * or were never read. That is the failure that makes people stop trusting an
 * import, and it is the thing most of these assertions are about: every row that
 * does not become a site is either in `skipped` with a reason or in
 * `duplicates`, and the three numbers add up to the file.
 *
 * ## And the one that is quietly expensive
 *
 * A criterion the engine cannot settle. `signals.ts` carries unprovable signals
 * precisely so the product refuses them out loud; `criterionForCheck` is the
 * gate, and a job that got past it would read a thousand sites to answer a
 * question nothing can answer.
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/csvimport.ts", "src/lib/signals.ts", "src/lib/types.ts"],
  "sfup-",
);
const U = await load("csvimport");
const S = await load("signals");

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

/* ------------------------------------------------------------- the parser -- */

test("a quoted comma does not become two columns", () => {
  const rows = U.parseCsv('name,website\n"Smith, Jones & Co",smithjones.com\n');
  assert.deepEqual(rows[1], ["Smith, Jones & Co", "smithjones.com"]);
});

test("a doubled quote is one quote, not the end of the field", () => {
  const rows = U.parseCsv('name,website\n"The ""Best"" Spa",bestspa.com\n');
  assert.equal(rows[1][0], 'The "Best" Spa');
});

test("a newline inside a quoted field stays inside it", () => {
  const rows = U.parseCsv('name,website\n"Two\nLines",two.com\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "Two\nLines");
});

test("a BOM does not make the first header unmatchable", () => {
  // Excel writes this on every CSV it exports, and it turns `website` into
  // `﻿website`, which matches nothing and finds no column.
  const p = U.parseUpload("﻿website,name\nacme.com,Acme\n");
  assert.equal(p.matched.site, "website");
  assert.equal(p.rows.length, 1);
});

test("CRLF line endings are not a trailing \\r on every value", () => {
  const p = U.parseUpload("website,name\r\nacme.com,Acme\r\n");
  assert.equal(p.rows[0].site, "https://acme.com");
  assert.equal(p.rows[0].name, "Acme");
});

/* -------------------------------------------------------- finding the site -- */

test("nine spellings of the website column all resolve", () => {
  for (const h of ["website", "Website", "URL", "url", "Domain", "site", "Homepage", "Web", "Company URL"]) {
    const p = U.parseUpload(`name,${h}\nAcme,acme.com\n`);
    assert.equal(p.rows.length, 1, `${h} found no rows`);
    assert.equal(p.matched.site, h);
  }
});

test("a title row above the headers does not break it", () => {
  // "Export generated 2026-09-30" above the real headers is what a CRM does.
  const p = U.parseUpload(
    "My saved view\nGenerated 2026-09-30\n\nname,website,phone\nAcme,acme.com,602-555-0100\n",
  );
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].name, "Acme");
  assert.equal(p.rows[0].phone, "602-555-0100");
});

test("an unrecognised header falls back to the column that holds websites", () => {
  const p = U.parseUpload(
    "Firma,Ihre Seite,Telefon\nAcme,acme.com,0100\nBeta,beta.co.uk,0200\nGamma,gamma.io,0300\n",
  );
  assert.equal(p.rows.length, 3);
  assert.equal(p.matched.site, "Ihre Seite");
});

test("but a stray URL in a notes column does not win", () => {
  // One row in five mentioning a link is not a website column, and guessing it
  // would read five businesses' notes fields instead of their sites.
  const body = ["A,we saw them at acme.com", "B,called", "C,called", "D,called", "E,called"];
  const p = U.parseUpload(`name,notes\n${body.join("\n")}\n`);
  assert.equal(p.rows.length, 0, "picked a notes column as the website column");
});

/* ------------------------------------------------------ normalising a site -- */

test("bare domains, www, deep links and tracking all land on one address", () => {
  for (const raw of [
    "acme.com",
    "www.acme.com",
    "http://acme.com",
    "https://www.acme.com/contact-us",
    "https://acme.com/?utm_source=list",
    "  ACME.com  ",
  ]) {
    assert.equal(U.normaliseSite(raw), "https://acme.com", `from ${JSON.stringify(raw)}`);
  }
});

test("and things that are not websites are refused rather than guessed at", () => {
  for (const raw of ["", "n/a", "none", "call them", "acme", "602-555-0100", "@acmedental"]) {
    assert.equal(U.normaliseSite(raw), null, `accepted ${JSON.stringify(raw)}`);
  }
});

/* ----------------------------------------------- nothing disappears quietly -- */

test("every row of the file is accounted for: read, skipped or duplicate", () => {
  const csv = [
    "name,website",
    "Acme,acme.com",
    "No Site,",
    "Bad,n/a",
    "Acme Again,www.acme.com",
    "Beta,beta.com",
    "Beta Deep,https://beta.com/about",
  ].join("\n");
  const p = U.parseUpload(csv);
  assert.equal(p.rows.length, 2, "read");
  assert.equal(p.skipped.length, 2, "skipped");
  assert.equal(p.duplicates, 2, "duplicates");
  assert.equal(p.rows.length + p.skipped.length + p.duplicates, 6, "the file had 6 rows");
});

test("a skipped row says which line and why, so it can be fixed", () => {
  const p = U.parseUpload("name,website\nAcme,acme.com\nBad,call them\n");
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0].line, 3, "the line number is 1-based and past the header");
  assert.match(p.skipped[0].why, /call them/);
});

test("the row cap stops at the cap rather than silently truncating the count", () => {
  const rows = Array.from({ length: 50 }, (_, i) => `B${i},b${i}.com`).join("\n");
  const p = U.parseUpload(`name,website\n${rows}\n`, 10);
  assert.equal(p.rows.length, 10);
});

/* ------------------------------------------------- the catalogue is the gate -- */

test("every provable signal is offered, in both directions", () => {
  const provable = S.SIGNALS.filter((s) => s.provable);
  assert.equal(U.runnableChecks().length, provable.length * 2);
  assert.ok(provable.length >= 3, `only ${provable.length} provable signals`);
});

test("and every unprovable one is listed too, with what it would take", () => {
  const unprovable = S.SIGNALS.filter((s) => !s.provable);
  assert.ok(unprovable.length > 0, "the catalogue's whole refusal mechanism is gone");
  for (const s of unprovable) {
    const shown = U.CHECK_OPTIONS.filter((o) => o.signalId === s.id);
    assert.equal(shown.length, 2, `${s.id} is not offered at all`);
    assert.ok(shown.every((o) => !o.provable), `${s.id} is marked runnable`);
    assert.ok(s.wouldTake, `${s.id} does not say what settling it would take`);
  }
});

test("an unprovable check cannot become a criterion, however it is asked for", () => {
  for (const s of S.SIGNALS.filter((x) => !x.provable)) {
    assert.equal(U.criterionForCheck(`${s.id}:absence`), null, s.id);
    assert.equal(U.criterionForCheck(`${s.id}:presence`), null, s.id);
  }
});

test("nor can a made-up one", () => {
  for (const id of ["", "nonsense", "booking", "booking:maybe", "booking:absence:extra", "../../etc"]) {
    assert.equal(U.criterionForCheck(id), null, JSON.stringify(id));
  }
});

test("a provable check rebuilds into a criterion the engine can run", () => {
  const c = U.criterionForCheck("booking:absence");
  assert.equal(c.type, "absence");
  assert.equal(c.id, "booking:absence");
  assert.ok(c.text && c.explain, "no text or explanation");
  // Absence always needs a model: a missing script is not proof of a missing
  // feature, which is this codebase's absence rule.
  assert.equal(c.needsModel, true);
});

test("and its text is recognised by the signal catalogue it came from", () => {
  // The round trip matters: `outreach.ts` finds a signal by matching criterion
  // text, so a criterion this builds must be one it can find again — otherwise
  // an upload produces matches with no drafted opener.
  for (const o of U.runnableChecks()) {
    const c = U.criterionForCheck(o.id);
    const found = S.signalForCriterion(c.text);
    assert.ok(found, `"${c.text}" is not recognised by signalForCriterion`);
    assert.equal(found.id, o.signalId, `"${c.text}" resolved to ${found.id}`);
  }
});

/* ------------------------------------------- no number is written down twice -- */

test("the upload screen counts the refusals rather than stating a number", () => {
  const ui = readFileSync(
    path.join(process.cwd(), "src/components/UploadList.tsx"),
    "utf8",
  );
  // The first version said "Three things people ask for that we cannot settle",
  // and the catalogue holds four — `reviews` was added after the sentence was
  // written. PROJECT_PLAN.md's decision log had drifted exactly the same way.
  assert.ok(
    /\{refusedOnce\.length\} things people ask for/.test(ui),
    "the count is not derived from the list it describes",
  );
  assert.ok(
    !/\b(One|Two|Three|Four|Five|Six|Seven) things people ask for/.test(ui),
    "a spelled-out count is back",
  );
});

test("and the plan's decision log agrees with the catalogue it describes", () => {
  const plan = readFileSync(path.join(process.cwd(), "PROJECT_PLAN.md"), "utf8");
  const unprovable = S.SIGNALS.filter((s) => !s.provable);
  const claim = plan.match(/(\w+) of the seven catalogued signals cannot be settled/);
  if (claim) {
    const words = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7 };
    const stated = words[claim[1]] ?? Number(claim[1]);
    assert.equal(
      stated,
      unprovable.length,
      `the log says ${claim[1]} unprovable signals; the catalogue has ` +
        `${unprovable.length} (${unprovable.map((s) => s.id).join(", ")})`,
    );
  }
  assert.equal(S.SIGNALS.length, 7, "the log says seven catalogued signals");
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
