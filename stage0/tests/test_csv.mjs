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
const { toCsv, whyItMatched, overallVerdict, nonMatchSummary, summaryToCsv } =
  await load("csv");

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

/** A business that matched every criterion — the only kind the file carries. */
const matched = (extra = {}, proof = {}) => ({
  ...base,
  ...extra,
  verdicts: {
    no_book: { verdict: "match", reason: "r", ...(proof.no_book ?? {}) },
    botox: { verdict: "match", reason: "r", ...(proof.botox ?? {}) },
  },
});

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
  const csv = toCsv([matched({ name: "Smith, Jones & Co" })], criteria);
  const row = csv.split("\r\n")[1];
  assert.ok(row.startsWith('"Smith, Jones & Co",'));
});

test("a quote in a value is doubled, not dropped", () => {
  const csv = toCsv([matched({ name: 'The "Best" Spa' })], criteria);
  assert.ok(csv.includes('"The ""Best"" Spa"'));
});

test("a newline inside evidence stays inside one field", () => {
  const csv = toCsv([matched({}, { no_book: { reason: "a\nb" } })], criteria);
  // Header + one record + trailing newline; the embedded \n must be quoted,
  // so splitting on the record separator still yields exactly one data row.
  const records = csv.trimEnd().split("\r\n");
  assert.equal(records.length, 2, `expected 2 records, got ${records.length}`);
});

test("overall verdict is a match only when every criterion matched", () => {
  assert.equal(overallVerdict(matched(), criteria), "match");
  const partial = { ...base, verdicts: {
    no_book: { verdict: "match", reason: "" }, botox: { verdict: "unread", reason: "" } } };
  assert.notEqual(overallVerdict(partial, criteria), "match");
});

test("a single no_match makes the whole business a no match", () => {
  const b = { ...base, verdicts: {
    no_book: { verdict: "match", reason: "" }, botox: { verdict: "no_match", reason: "" } } };
  assert.equal(overallVerdict(b, criteria), "no_match");
});

test("only matched rows reach the file, and every one of them is billable", () => {
  for (const v of ["no_match", "couldnt_tell", "blocked", "needs_model", "unread"]) {
    const b = { ...base, verdicts: { no_book: { verdict: v, reason: "" },
                                     botox: { verdict: v, reason: "" } } };
    const rows = toCsv([b], criteria).trimEnd().split("\r\n").slice(1);
    assert.equal(rows.length, 0, `${v} must not be exported at all`);
  }
  const rows = toCsv([matched()], criteria).trimEnd().split("\r\n").slice(1);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes(",Match,yes,"));
});

test("a non-match's name, phone and website never reach the file", () => {
  // The whole attack the pricing has no other answer to: a criterion nothing
  // satisfies must not hand over the market's contact list for free.
  const skipped = {
    ...base, id: "y", name: "Unpaid Clinic", phone: "+1555", site: "unpaid.example",
    addr: "9 Secret Rd",
    verdicts: { no_book: { verdict: "match", reason: "" },
                botox: { verdict: "no_match", reason: "" } },
  };
  const csv = toCsv([skipped, matched()], criteria);
  for (const leak of ["Unpaid Clinic", "+1555", "unpaid.example", "9 Secret Rd"]) {
    assert.ok(!csv.includes(leak), `${leak} leaked into the export`);
  }
  assert.ok(csv.includes("Clinic"), "the paid row should still be there");
});

test("the reasons survive as counts, which is the half worth keeping", () => {
  const mk = (id, v) => ({ ...base, id,
    verdicts: { no_book: { verdict: v, reason: "" }, botox: { verdict: v, reason: "" } } });
  const rows = nonMatchSummary(
    [mk("a", "blocked"), mk("b", "blocked"), mk("c", "couldnt_tell"), matched()],
    criteria);
  assert.equal(rows.reduce((n, r) => n + r.count, 0), 3, "the match must not be counted");
  assert.equal(rows[0].count, 2, "sorted by count, commonest first");
  const csv = summaryToCsv(rows);
  assert.ok(csv.startsWith("﻿outcome,count"));
  assert.ok(!/Clinic|a\.com|\+1/.test(csv), "a summary carries no identities either");
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
  const written = matched({
    read: { outcome: "ok", pages: 3, chars: 900, booking: false,
            vendors: [], quote: false, chat: false, cms: [] },
  }, { no_book: { reason: "no sign of it" }, botox: { reason: "found" } });
  const row = toCsv([written], criteria).split("\r\n")[1];
  assert.ok(row.includes("a.com"));
  assert.ok(/could not find|I saw on/.test(row), "an icebreaker should be written");

  // Matched but never read → the reason goes in the evidence column, never in
  // the note. A row can be billable and still have nothing honest to say.
  const blank = toCsv([matched()], criteria).split("\r\n")[1];
  assert.ok(blank.includes("not written:"), "the withheld reason must be exported");
});

test("a withheld reason can never land in a note column", () => {
  // The columns are positional; a "not written: …" line in `outreach_note`
  // would be mail-merged straight into someone's cold email. Splitting on
  // commas is safe only because the fixture has none in any field — the
  // quoting itself is covered by the tests above.
  const row = toCsv([matched()], criteria).split("\r\n")[1].split(",");
  const head = toCsv([], criteria).split("\r\n")[0].split(",");
  for (const col of ["likely_pain_point", "icebreaker", "outreach_note"]) {
    assert.equal(row[head.indexOf(col)], "", `${col} must be empty when withheld`);
  }
});

test("a UTF-8 BOM is present so Excel reads accents correctly", () => {
  assert.ok(toCsv([matched({ name: "Café Médi" })], criteria).startsWith("﻿"));
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
