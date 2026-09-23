/** Non-match privacy, on the screen as well as in the file (S1-04).
 *
 *  The export was fixed first and the screen was not, which left the rule
 *  enforced in the file and wide open on the surface someone would actually
 *  read a market's contact list off. These tests check that the two agree.
 *
 *  `Results.tsx` is JSX and is not compiled here, so what is tested is the
 *  decision the component makes — which rows are unlocked, and what a locked
 *  summary may contain — through the same functions the component calls.
 *
 *  Run:  node stage0/tests/test_results_privacy.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/csv.ts", "src/lib/outreach.ts", "src/lib/signals.ts", "src/lib/types.ts"],
  "sfpriv-",
);
const { overallVerdict, nonMatchSummary, toCsv } = await load("csv");
const { BILLABLE } = await load("types");

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}: ${e.message}`); }
};

const criteria = [{ id: "no_book", type: "absence", text: "has no online booking",
                    explain: "", needsModel: true }];
const mk = (id, verdict, reason = "r") => ({
  id, name: `Name ${id}`, cat: "c", lat: 0, lon: 0, addr: `${id} Secret St`,
  site: `${id}.example`, phone: `+1${id}`, primary: true,
  verdicts: { no_book: { verdict, reason } },
});

/** The split `Results.tsx` makes, so a change to it breaks a test here. */
const unlockedOf = (bs, cs = criteria) =>
  bs.filter((b) => BILLABLE[overallVerdict(b, cs)]);
const lockedOf = (bs, cs = criteria) =>
  bs.filter((b) => !BILLABLE[overallVerdict(b, cs)]);

const market = [
  mk("a", "match"), mk("b", "match"),
  mk("c", "no_match"), mk("d", "couldnt_tell", "site blocks automated reading"),
  mk("e", "couldnt_tell", "site blocks automated reading"),
  mk("f", "blocked"), mk("g", "unread"), mk("h", "needs_model"),
];

test("only matches are unlocked", () => {
  assert.deepEqual(unlockedOf(market).map((b) => b.id), ["a", "b"]);
});

test("everything else is locked, couldn't-tell and blocked included", () => {
  assert.deepEqual(lockedOf(market).map((b) => b.id).sort(),
    ["c", "d", "e", "f", "g", "h"]);
});

test("the locked summary carries counts and reasons, and no identity", () => {
  const locked = lockedOf(market);
  const text = JSON.stringify(nonMatchSummary(locked, criteria));
  for (const b of locked) {
    for (const leak of [b.name, b.addr, b.site, b.phone]) {
      assert.ok(!text.includes(leak), `${leak} leaked into the summary`);
    }
  }
});

test("the summary still adds up to every locked business", () => {
  const locked = lockedOf(market);
  const rows = nonMatchSummary(locked, criteria);
  assert.equal(rows.reduce((n, r) => n + r.count, 0), locked.length);
});

test("a repeated reason groups rather than repeating", () => {
  // Two businesses blocked for the same reason is one line saying 2, which is
  // both the privacy rule and the more useful shape.
  const rows = nonMatchSummary([mk("x", "couldnt_tell"), mk("y", "couldnt_tell")],
                               criteria);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 2);
});

test("the screen and the export unlock exactly the same rows", () => {
  const csv = toCsv(market, criteria);
  const inFile = market.filter((b) => csv.includes(b.addr)).map((b) => b.id);
  assert.deepEqual(inFile.sort(), unlockedOf(market).map((b) => b.id).sort(),
    "the two surfaces disagreeing is the bug this file exists for");
});

test("a refunded match leaves the export", () => {
  // `page.tsx` filters before calling toCsv; this is that contract.
  const reported = new Set(["a"]);
  const csv = toCsv(market.filter((b) => !reported.has(b.id)), criteria);
  assert.ok(!csv.includes("a Secret St"), "a refunded row must not ship");
  assert.ok(csv.includes("b Secret St"), "the others must still ship");
});

test("no non-match identity is exportable from the measured dental market", () => {
  const m = JSON.parse(readFileSync("public/data/dental-phoenix.json", "utf8"));
  const cs = m.criteria.slice(0, 1);
  const slice = m.businesses.slice(0, 1500);
  const locked = lockedOf(slice, cs);
  const csv = toCsv(slice, cs);

  // Substring matching is the wrong test and finding that out was worth the
  // detour. It flags a locked record whose phone is shared with a matched one
  // (two Overture rows for one practice), whose name is a substring of a
  // longer one ("Arizona Dental" inside "Arizona Dental Care"), or whose
  // address shares a city line. None of those is a leak. Two of them are
  // duplicate candidates, which is a billing problem and is tested as one in
  // `test_billing.mjs`.
  //
  // What a leak actually means: a row in the file belonging to a business the
  // user did not unlock. So compare rows.
  const rows = dataRows(csv);
  const allowed = new Set(
    unlockedOf(slice, cs).map((b) => `${b.name}|${b.addr}|${b.phone ?? ""}`),
  );
  const strangers = rows.filter((r) => !allowed.has(`${r[0]}|${r[2]}|${r[3]}`));
  assert.equal(strangers.length, 0,
    `${strangers.length} rows in the file belong to businesses nobody unlocked`);
  assert.equal(rows.length, allowed.size, "and every unlocked row is present");
  assert.ok(locked.length > 100, "and there really were non-matches to leak");
});

/** Minimal RFC 4180 reader, enough to check which rows reached the file. */
function dataRows(csv) {
  const out = [];
  let row = [], cell = "", quoted = false;
  const text = csv.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell); out.push(row); row = []; cell = ""; i++;
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.slice(1).filter((r) => r.length > 1);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
