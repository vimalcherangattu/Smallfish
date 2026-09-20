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
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "sfcsv-"));

// Compile csv.ts and its type-only dependency to plain ESM. A temp tsconfig is
// used rather than CLI flags because the source imports through the project's
// "@/*" path alias, which tsc only reads from a config file.
const tsconfig = join(dir, "tsconfig.json");
writeFileSync(
  tsconfig,
  JSON.stringify({
    compilerOptions: {
      outDir: dir,
      // Without an explicit rootDir, tsc infers it from the common parent of
      // the inputs, so the emitted path moves when the input list changes.
      rootDir: process.cwd(),
      module: "esnext",
      target: "es2022",
      moduleResolution: "bundler",
      skipLibCheck: true,
      noEmit: false,
      baseUrl: process.cwd(),
      paths: { "@/*": ["./src/*"] },
    },
    files: ["src/lib/csv.ts", "src/lib/types.ts"].map((f) =>
      join(process.cwd(), f),
    ),
  }),
);
execFileSync("npx", ["tsc", "-p", tsconfig], { stdio: "pipe" });

// The compiled import specifiers use the "@/lib/..." alias; rewrite to relative.
const csvPath = join(dir, "src", "lib", "csv.js");
const src = (await import("node:fs")).readFileSync(csvPath, "utf8")
  .replace(/from ["']@\/lib\/types["']/g, 'from "./types.js"');
writeFileSync(csvPath, src);

const { toCsv, whyItMatched } = await import(pathToFileURL(csvPath).href);

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

test("a UTF-8 BOM is present so Excel reads accents correctly", () => {
  assert.ok(toCsv([{ ...base, name: "Café Médi" }], criteria).startsWith("﻿"));
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
