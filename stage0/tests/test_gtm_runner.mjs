/**
 * The heavy outreach sweeps run on GitHub Actions, never on a Vercel schedule.
 *
 *     node stage0/tests/test_gtm_runner.mjs
 *
 * On 2026-10-24 counts, credits and prospects ran inside Vercel functions on a
 * pg_cron timer and used the team's whole Hobby CPU allowance, which pauses all
 * twelve projects when it runs out. The owner's rule: no DuckDB scan and no
 * multi-site crawl runs inside a Vercel function on a schedule. This holds the
 * shape that keeps it true; it reads files, runs nothing.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};

const read = (p) => readFileSync(p, "utf8");
const HEAVY = ["counts", "credits", "prospects"];
const workflow = read(".github/workflows/gtm-sweeps.yml");
const runner = read("scripts/gtm-runner.ts");

await test("every heavy job has a schedule in the workflow and a runner entry", () => {
  for (const j of HEAVY) {
    assert.match(workflow, new RegExp(`#\\s*${j}`), `${j} has no schedule line`);
    assert.match(runner, new RegExp(`\\b${j}:`), `${j} is not a runner job`);
  }
});

await test("the workflow's schedules and its job picker agree", () => {
  const crons = [...workflow.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(crons.length, 3);
  for (const c of crons.slice(0, 2)) assert.ok(workflow.includes(`github.event.schedule == '${c}'`), c);
});

await test("the routes and the runner share one implementation", () => {
  for (const j of HEAVY) {
    const route = read(`src/app/api/outreach/${j}/route.ts`);
    assert.match(route, /from "@\/lib\/gtmjobs"/, `${j} route does not call gtmjobs`);
    assert.doesNotMatch(route, /findCandidates|readSite|readAgency|homePage/, `${j} route does its own scanning or reading`);
  }
});

await test("Vercel's own crons never call a heavy route", () => {
  const crons = JSON.parse(read("vercel.json")).crons ?? [];
  for (const c of crons) for (const j of HEAVY) assert.notEqual(c.path, `/api/outreach/${j}`, c.path);
});

await test("the latest migration touching the scheduler leaves the heavy jobs paused", () => {
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  const last = files.filter((f) => /cron\.(schedule|alter_job)/.test(read(`supabase/migrations/${f}`))).at(-1);
  const sql = read(`supabase/migrations/${last}`);
  const paused = sql.match(/alter_job\(jobid, active := false\)[\s\S]*?in \(([^)]*)\)/);
  assert.ok(paused, `${last} pauses nothing`);
  for (const j of HEAVY) assert.match(paused[1], new RegExp(`'gtm-${j}'`), `${last} leaves gtm-${j} active`);
});

await test("the runner prints counts, not rows: nothing in it logs a business", () => {
  const logs = [...runner.matchAll(/console\.(log|error)\(([^;]*)\)/g)].map((m) => m[2]);
  for (const l of logs) assert.doesNotMatch(l, /\b(email|domain|site|rows|row)\b/, l);
  // What the runner spreads into its log is what the jobs return: counts.
  const jobs = read("src/lib/gtmjobs.ts");
  for (const r of jobs.matchAll(/return \{ ok: true,([^}]*)\}/g)) assert.doesNotMatch(r[1], /\b(rows|email|domain|site)\b/, r[1]);
});

await test("a blank city from the workflow means today's city, not a city called nothing", () => {
  assert.match(read("src/lib/gtmjobs.ts"), /opts\.city\?\.trim\(\) \|\| cityForDay/);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall pass");
