/**
 * A search keeps looking, and widens when it has looked everywhere.
 *
 *     node stage0/tests/test_keep_looking.mjs
 *
 * ## The failure
 *
 * Two gyms in Dallas with no live chat. `sizing.ts` put twelve sites on the
 * job — its estimate of how many reads find two matches, from the four
 * measured markets — all twelve were read, none matched, and the job called
 * itself finished. There were **1,542 readable gyms** in the region. The
 * customer asked for two, got nothing, and the screen reported it as a fact
 * about Dallas.
 *
 * Nothing was broken. A job is finished when its list is empty and the list is
 * sized from an estimate, so **an estimate being wrong is exactly when a search
 * most needs to carry on** — which was the one thing it could not do.
 *
 * ## What is asserted
 *
 * The three bounds, and that they stay apart. "We ran out of your reading" and
 * "there are no more businesses near Dallas" are different answers, and only
 * one of them is fixed by buying credits. A product that said the second when
 * it meant the first would be telling somebody their market is empty when it
 * is their balance that is.
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

const { load } = compileLib(
  ["src/lib/pricing.ts", "src/lib/types.ts"],
  "sf-keep-",
);
const P = await load("pricing");

const worker = code(readFileSync(path.join(process.cwd(), "src/lib/worker.ts"), "utf8"));

/* ------------------------------------------------------------ the budget -- */

test("keep looking means within what the balance pays for", () => {
  // READS_PER_CREDIT is what keeps every plan solvent when nothing matches. A
  // search that widened for ever would be a bill that widened for ever.
  assert.equal(P.READS_PER_CREDIT, 11);
  assert.match(worker, /readsLeft\(credits, job\.sites_read\)/);
  assert.match(worker, /credits \* READS_PER_CREDIT - alreadyRead/);
});

test("a spent budget stops the search and says it was the budget", () => {
  // Not "there are no more businesses". The customer can fix this one.
  const i = worker.indexOf("if (budget <= 0)");
  assert.ok(i > 0, "no budget guard");
  const branch = worker.slice(i, i + 420);
  assert.match(branch, /your credits cover/);
  assert.match(branch, /More credits, and we keep going/);
});

/* ------------------------------------------------------------ the target -- */

test("a job that has what it was asked for stops reading", () => {
  // Money saved rather than spent: a job with its two need not read the other
  // ten. Before this there was no `want` on a job at all, so it could not.
  assert.match(worker, /if \(\(job\.want \?\? 0\) > 0 && job\.matched \+ matched >= \(job\.want \?\? 0\)\) break;/);
});

test("and a job queued before this behaves exactly as it did", () => {
  // `want` is absent until migration 0023 is applied and a new job is made.
  // Absent must mean "as before", not "stop immediately" or "search for ever".
  assert.match(worker, /const want = job\.want \?\? 0;/);
  const i = worker.indexOf("const want = job.want ?? 0;");
  assert.match(worker.slice(i, i + 200), /if \(want <= 0\) return \{ added: 0, why: null \};/);
});

/* ----------------------------------------------------------- the horizon -- */

test("the horizon widens in steps and then stops", () => {
  assert.match(worker, /const RADIUS_STEPS = \[25, 50, 100\] as const;/);
  // It widens only when the current radius is exhausted, and never past the
  // last step. An unbounded widen is a search that eventually reads the
  // country for somebody who asked about one city.
  assert.match(worker, /RADIUS_STEPS\.find\(\(r\) => r > miles\) \?\? null/);
});

test("an exhausted horizon says so, with the distance", () => {
  const i = worker.indexOf("const wider = widerThan(radius);");
  assert.ok(i > 0, "no widen step");
  const branch = worker.slice(i, i + 420);
  assert.match(branch, /every \$\{split\.what/);
  assert.match(branch, /MAX_RADIUS_MILES/);
});

test("widening is reported, because the answer came from further away", () => {
  // Somebody who asked about Dallas and got a business 40 miles out should be
  // told, not left to notice.
  assert.match(worker, /so we widened to \$\{radius\}/);
});

/* -------------------------------------------- it does not re-read anything -- */

test("a top-up excludes what is already on the job", () => {
  // Re-queueing the same site would spend a crawl and a model call to re-learn
  // an answer we have, and would make the progress bar grow without progress.
  assert.match(worker, /const already = await jobBusinessIds\(job\.id\)/);
  assert.match(worker, /exclude: already/);
});

test("and the radius travels with the new sites", () => {
  // Otherwise the next top-up would start from 25 again and re-exhaust the
  // same ring for ever.
  assert.match(worker, /extendJob\(\s*job\.id,[\s\S]{0,200}?radius,\s*\)/);
});

/* ------------------------------------------------------- the SQL it needs -- */

test("extend_job reopens the job as well as adding rows", () => {
  // `add_job_sites` only inserts. A job released as `done` would keep the new
  // rows and never claim them, which is a top-up that silently does nothing.
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0023_keep_looking.sql"),
    "utf8",
  );
  assert.match(sql, /state\s*=\s*case when v_added > 0 then 'reading' else state end/);
  assert.match(sql, /finished_at\s*=\s*case when v_added > 0 then null else finished_at end/);
  // And it must not duplicate a row: job_sites is keyed (job_id, business_id).
  assert.match(sql, /on conflict \(job_id, business_id\) do nothing/);
});

test("the new columns are nullable, so an unapplied migration is not an outage", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0023_keep_looking.sql"),
    "utf8",
  );
  for (const col of ["want", "categories", "radius_miles"]) {
    assert.match(sql, new RegExp(`add column if not exists ${col}`));
  }
  assert.ok(!/add column if not exists \w+ [^;]*not null/i.test(sql), "a new column is NOT NULL");
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
