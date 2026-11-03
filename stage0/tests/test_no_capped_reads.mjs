/**
 * The outreach code never asks Supabase for more than one page in one request.
 *
 * Supabase's REST API returns at most 1,000 rows however large `limit` is. On
 * 2026-11-03 a duplicate check written as `?limit=20000` saw 1,000 of 3,700
 * agencies, so the credits job re-promoted 89 of them 1,246 times and reset
 * queued prospects to `found`. A read that must be complete goes through
 * `restAll`. This fails on any `rest(...)` path with a limit above 1,000.
 *
 *     node stage0/tests/test_no_capped_reads.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src/lib", "src/app/api/outreach", "src/app/ops", "scripts"];
// Product owns accounts.ts and has its own `rest`; named in the GTM handoff.
const skip = new Set(["src/lib/accounts.ts"]);
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f) && !skip.has(p)) files.push(p);
  }
};
roots.forEach(walk);

const bad = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\brest(?:<[^>]*>)?\(\s*[`"]([^`"]*limit=(\d+)[^`"]*)[`"]/g)) {
    if (Number(m[2]) > 1000) bad.push(`${f}: ${m[1].slice(0, 90)}`);
  }
}
if (bad.length) {
  console.log("  FAIL  reads that ask for more than one page (use restAll):");
  for (const b of bad) console.log(`        ${b}`);
  process.exit(1);
}
console.log(`  pass  no capped reads in ${files.length} files\n\nall pass`);
