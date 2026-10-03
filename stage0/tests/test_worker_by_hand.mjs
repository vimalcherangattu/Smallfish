/**
 * The second door into the worker: a person advancing their own read.
 *
 *     node stage0/tests/test_worker_by_hand.mjs
 *
 * The queue moves on a Vercel Cron entry that needs `CRON_SECRET`, and which
 * since 2026-10-03 ticks **once a day** rather than once a minute: Hobby caps
 * crons at daily, and the faster expression did not throttle but failed the
 * build, freezing production for three days. So a queued read of any real size
 * does not finish on the scheduler at all now — the product's "any trade, any
 * US city" promise sits behind somebody else's billing page.
 *
 * That makes this door the load-bearing one rather than a convenience: a
 * member of the workspace that owns a job may advance that job by hand.
 *
 * **Adding a second way past an authorisation check is the kind of change that
 * is cheap to get wrong and expensive to get wrong.** This route spends crawl
 * and model budget on every call. So what is asserted here is not that the
 * feature works — that is `/app/reads/[id]` and the lease — but that the new
 * door is narrower than the old one in every direction:
 *
 *   1. It needs a **job id**. Without one, the path does not exist and the
 *      secret is still the only way in. "Whichever is oldest" is the
 *      scheduler's question and the oldest job may belong to somebody else.
 *   2. The job is fetched **scoped to the caller's own account**, so an id from
 *      a stranger's URL finds nothing.
 *   3. A missing job and a job belonging to somebody else give the **same
 *      answer**, so an id cannot be probed for existence.
 *   4. It takes the **same lease**, so a press racing a cron tick cannot read
 *      the same sites twice — which costs money and annoys a web server that
 *      did nothing wrong.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

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
const route = read("src/app/api/worker/route.ts");
const worker = read("src/lib/worker.ts");
const sql = read("supabase/migrations/0018_claim_this_job.sql");

/* -------------------------------------------- the secret still guards the queue -- */

test("without a job id, the shared secret is still the only way in", () => {
  // The general tick must sit behind `authorised`. If the early return for a
  // job id ever stopped being conditional, this route would be open.
  assert.match(route, /if \(jobId\) \{/);
  assert.match(route, /if \(!authorised\(req\)\) \{/);
  const general = route.slice(route.indexOf("if (!authorised(req)) {"));
  assert.ok(
    general.indexOf("const report = await tick({") > 0,
    "the unscoped tick is not behind the secret",
  );
});

test("and an unset secret still refuses rather than defaulting to open", () => {
  assert.match(route, /if \(!secret\) return false;/);
  assert.ok(!/if \(!secret\) return true/.test(route));
});

/* ------------------------------------------------ the new door is scoped -- */

test("the job is looked up scoped to the caller's own account", () => {
  assert.match(route, /await jobFor\(account\.id, jobId\)/);
  assert.ok(
    !/await jobFor\(\s*jobId/.test(route),
    "the job is fetched without an account to scope it",
  );
});

test("a job that is not yours is indistinguishable from one that does not exist", () => {
  const block = route.slice(route.indexOf("const job = account"));
  const refusal = block.slice(0, 400);
  assert.match(refusal, /No such read\./);
  assert.ok(
    !/not yours|forbidden|belongs to/i.test(refusal),
    "the refusal says which of the two it was, so ids can be probed",
  );
});

test("a malformed id is refused before it reaches the database", () => {
  assert.match(route, /\^\[0-9a-f-\]\{36\}\$/i);
});

test("and the hand path runs only the named job, never the oldest", () => {
  const mine = route.slice(route.indexOf("async function mine("), route.indexOf("async function run("));
  assert.match(mine, /jobId: job\.id/);
  assert.ok(!/claimJob\(/.test(mine), "the scoped path can claim whatever is oldest");
});

/* ------------------------------------------------------- it is the same lease -- */

test("claim_this_job takes the row lock and skips a locked one", () => {
  assert.match(sql, /for update of j skip locked/);
});

test("and honours a live lease exactly as the scheduler's claim does", () => {
  assert.match(sql, /\(j\.leased_until is null or j\.leased_until < now\(\)\)/);
  assert.match(sql, /leased_until = now\(\) \+ make_interval/);
});

test("it will not pick up a job with no work left", () => {
  assert.match(sql, /where s\.job_id = j\.id and s\.state <> 'done'/);
});

test("nor one that has finished or failed", () => {
  assert.match(sql, /j\.state in \('queued', 'reading', 'judging'\)/);
});

test("and it is service-role only, like every other money-spending function", () => {
  assert.match(
    sql,
    /revoke all on function public\.claim_this_job \(uuid, text, integer\) from public, anon, authenticated/,
  );
  assert.ok(
    !/grant execute on function public\.claim_this_job[^\n]*to (anon|authenticated)/.test(sql),
  );
});

/* ------------------------------------------------- a press that claims nothing -- */

test("a press that loses the lease says so rather than reporting zero", () => {
  // "0 read" with no explanation is indistinguishable from a broken worker, and
  // losing the lease is the ordinary case when a cron tick is already working.
  assert.match(route, /Something else is already reading this one/);
});

test("the worker only targets a named job when it is given one", () => {
  assert.match(worker, /args\.jobId\s*\n?\s*\? await claimThisJob\(/);
  assert.match(worker, /: await claimJob\(/);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
