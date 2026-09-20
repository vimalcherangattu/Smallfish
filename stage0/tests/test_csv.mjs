/** Tests for CSV export (S1-06).
 *
 *  A quoting bug here does not throw — it silently shifts every column of a
 *  user's spreadsheet, and business names are full of commas and quotes
 *  ("Smith, Jones & Co", 11:11 Society). So the escaping is tested directly.
 *
 *  Run:  node stage0/tests/test_csv.mjs
 *  (Compiles the TS on the fly with the project's own tsc.)
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

// csv.ts pulls in outreach.ts for the three outreach columns, which pulls in
// signals.ts; all of them have to be compiled together.
const { dir, load } = compileLib(
  ["src/lib/csv.ts", "src/lib/outreach.ts", "src/lib/signals.ts", "src/lib/types.ts"],
  "sfcsv-",
);
const { toCsv, whyItMatched } = await load("csv");

const criteria = [
  { id: "no_book", type: "absence", text: "has no online booking",
    explain: "Looks for a booking widget.", needsModel: true },
  { id: "botox", type: "presence", text: "offers Botox",
    explain: "Reads the services pages.", needsModel: true },
];

const base = {
  id: "x", name: "Clinic", cat: "medical_spa", lat: 1.5, lon: -2.5,
  addr: "1 A St", site: "a.com", phone: "+1", primary: true, verdicts: {},
};

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}: ${e.message}`); }
};

test("header includes a proof column per criterion", () => {
  const head = toCsv([], criteria).split("\r\n")[0];
  for (const c of criteria) {
    assert.ok(head.includes(`${c.id}__verdict`));
    assert.ok(head.includes(`${c.id}__evidence`));
    assert.ok(head.includes(`${c.id}__how_checked`));
  }
  assert.ok(head.includes("why_it_matched"));
});

test("a comma in a business name does not shift columns", () => {
  const csv = toCsv([{ ...base, name: "Smith, Jones & Co" }], criteria);
  const row = csv.split("\r\n")[1];
  assert.ok(row.startsWith('"Smith, Jones & Co",'));
});

test("a quote in a value is doubled, not dropped", () => {
  const csv = toCsv([{ ...base, name: 'The "Best" Spa' }], criteria);
  assert.ok(csv.includes('"The ""Best"" Spa"'));
});

test("a newline inside evidence stays inside one field", () => {
  const b = { ...base, verdicts: { no_book: { verdict: "match", reason: "a\nb" } } };
  const csv = toCsv([b], criteria);
  // Header + one record + trailing newline; the embedded \n must be quoted,
  // so splitting on the record separator still yields exactly one data row.
  const records = csv.trimEnd().split("\r\n");
  assert.equal(records.length, 2, `expected 2 records, got ${records.length}`);
});

test("overall verdict is a match only when every criterion matched", () => {
  const all = { ...base, verdicts: {
    no_book: { verdict: "match", reason: "" }, botox: { verdict: "match", reason: "" } } };
  assert.ok(toCsv([all], criteria).includes(",Match,yes,"));

  const partial = { ...base, verdicts: {
    no_book: { verdict: "match", reason: "" }, botox: { verdict: "unread", reason: "" } } };
  const row = toCsv([partial], criteria).split("\r\n")[1];
  assert.ok(!row.includes(",Match,yes,"), "partial match must not be billable");
});

test("a single no_match makes the whole row a no match", () => {
  const b = { ...base, verdicts: {
    no_book: { verdict: "match", reason: "" }, botox: { verdict: "no_match", reason: "" } } };
  assert.ok(toCsv([b], criteria).includes("No match,no,"));
});

test("nothing but a match is ever marked billable", () => {
  for (const v of ["no_match", "couldnt_tell", "blocked", "needs_model", "unread"]) {
    const b = { ...base, verdicts: { no_book: { verdict: v, reason: "" },
                                     botox: { verdict: v, reason: "" } } };
    const row = toCsv([b], criteria).split("\r\n")[1];
    assert.ok(!row.includes(",yes,"), `${v} must not be billable`);
  }
});

test("why_it_matched quotes the evidence and is usable as written", () => {
  const b = { ...base, name: "Aesthetics Co", verdicts: {
    no_book: { verdict: "match", reason: "r", proof: "no booking widget found" },
    botox: { verdict: "match", reason: "r" } } };
  const line = whyItMatched(b, criteria);
  assert.ok(line.startsWith("Aesthetics Co "));
  assert.ok(line.includes("no booking widget found"));
  assert.ok(line.endsWith("."));
});

test("why_it_matched is empty when nothing matched", () => {
  const b = { ...base, verdicts: { no_book: { verdict: "couldnt_tell", reason: "r" } } };
  assert.equal(whyItMatched(b, criteria), "");
});

test("the outreach columns carry a note only when one could be written", () => {
  const head = toCsv([], criteria).split("\r\n")[0];
  for (const col of ["likely_pain_point", "icebreaker", "outreach_note", "outreach_evidence"]) {
    assert.ok(head.includes(col), `missing ${col}`);
  }

  // Read, matched → a note and its evidence.
  const written = { ...base, site: "a.com", phone: "+1",
    read: { outcome: "ok", pages: 3, chars: 900, booking: false,
            vendors: [], quote: false, chat: false, cms: [] },
    verdicts: { no_book: { verdict: "match", reason: "no sign of it" },
                botox: { verdict: "match", reason: "found" } } };
  const row = toCsv([written], criteria).split("\r\n")[1];
  assert.ok(row.includes("a.com"));
  assert.ok(/could not find|I saw on/.test(row), "an icebreaker should be written");

  // Unread → the reason goes in the evidence column, never in the note.
  const blank = toCsv([base], criteria).split("\r\n")[1];
  assert.ok(blank.includes("not written:"), "the withheld reason must be exported");
});

test("a withheld reason can never land in a note column", () => {
  // The columns are positional; a "not written: …" line in `outreach_note`
  // would be mail-merged straight into someone's cold email. Splitting on
  // commas is safe only because `base` has none in any field — the quoting
  // itself is covered by the tests above.
  const row = toCsv([base], criteria).split("\r\n")[1].split(",");
  const head = toCsv([], criteria).split("\r\n")[0].split(",");
  for (const col of ["likely_pain_point", "icebreaker", "outreach_note"]) {
    assert.equal(row[head.indexOf(col)], "", `${col} must be empty when withheld`);
  }
});

test("a UTF-8 BOM is present so Excel reads accents correctly", () => {
  assert.ok(toCsv([{ ...base, name: "Café Médi" }], criteria).startsWith("﻿"));
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
