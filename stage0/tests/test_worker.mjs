/**
 * The worker's arithmetic and its refusals (P0.1).
 *
 *     node stage0/tests/test_worker.mjs
 *
 * The queue's correctness lives in SQL — `claim_job`, `take_sites`,
 * `record_sites`, `release_job`, `sweep_stranded_sites` — and was exercised
 * against the live database before any of this was written: a second worker
 * refused the lease, a second take skipped the rows in flight, recording the
 * same slice twice moved no counter, and thirty-minute-old `taken` rows came
 * back. Postgres is the thing being trusted there and Postgres is where it was
 * checked.
 *
 * What is left in TypeScript is the part that decides **how much work a tick
 * attempts and when it gives up**, and that is what this holds:
 *
 * - The slice budget sits under the platform's limit by enough to write the
 *   last batch and release the lease. A tick killed mid-write leaves a lease
 *   that has to expire before anything else can touch the job, which is the one
 *   failure that stalls a queue rather than merely slowing it.
 * - A batch that settles nothing stops the job. With no model key, `judge`
 *   answers `needs_model` for every absence criterion — which is most of them —
 *   so a worker without one would read four hundred sites, annoy four hundred
 *   web servers and learn nothing.
 * - The estimate a customer is shown is the same arithmetic the worker runs on,
 *   so the progress page cannot promise a different wait from the one the queue
 *   will take.
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/jobs.ts"], "sfwork-");
const J = await load("jobs");

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

/* ------------------------------------------------- the budget fits the box -- */

// Read out of the source rather than restated here: two copies of a timeout are
// two timeouts, and the one that matters is the one the code uses.
const worker = readFileSync(path.join(process.cwd(), "src/lib/worker.ts"), "utf8");
const route = readFileSync(path.join(process.cwd(), "src/app/api/worker/route.ts"), "utf8");
// Underscores stripped: these are TypeScript numeric separators (`45_000`), and
// `Number("45_000")` is NaN. The first version of this parser did not, every
// budget assertion read NaN, and two of the three still "passed" — a check that
// compares NaN is a check that cannot fail.
const num = (src, re) => Number(String((src.match(re) ?? [])[1]).replace(/_/g, ""));

const sliceMs = num(worker, /SLICE_MS\s*=\s*([\d_]+)/);
const maxDuration = num(route, /maxDuration\s*=\s*(\d+)/);
const leaseSeconds = num(worker, /LEASE_SECONDS\s*=\s*(\d+)/);
const strandedSeconds = num(worker, /STRANDED_SECONDS\s*=\s*(\d+)/);

test("the slice budget is read, not assumed", () => {
  assert.ok(Number.isFinite(sliceMs) && sliceMs > 0, `SLICE_MS parsed as ${sliceMs}`);
  assert.ok(Number.isFinite(maxDuration) && maxDuration > 0, `maxDuration ${maxDuration}`);
});

test("a tick stops with time left to write its last batch and release the lease", () => {
  const headroomMs = maxDuration * 1000 - sliceMs;
  assert.ok(
    headroomMs >= 10_000,
    `only ${headroomMs}ms between the slice budget and the platform's limit`,
  );
});

test("the lease outlives a slice, so a slow tick does not lose its job mid-read", () => {
  assert.ok(
    leaseSeconds * 1000 > sliceMs,
    `lease ${leaseSeconds}s against a ${sliceMs}ms slice`,
  );
});

test("but expires long before the stranded sweep, so nothing is held forever", () => {
  assert.ok(
    strandedSeconds > leaseSeconds,
    `sweep at ${strandedSeconds}s against a ${leaseSeconds}s lease`,
  );
});

/* ------------------------------------------------------- the refusals -- */

test("a worker with no shared secret refuses rather than running open", () => {
  // The route spends money on every tick. `!secret` must return false, never
  // true — a deployment that forgot the variable would otherwise have an
  // endpoint anybody can hold down.
  assert.match(route, /if \(!secret\) return false;/);
  assert.ok(
    !/if \(!secret\) return true/.test(route),
    "an unset secret must not mean 'allow'",
  );
});

test("and compares it in constant time", () => {
  assert.ok(/diff \|= /.test(route), "no constant-time compare in the route");
  assert.ok(
    !/=== `Bearer \$\{secret\}`/.test(route),
    "a secret compared with === leaks its prefix by timing",
  );
});

test("one needs_model stops the job, rather than a whole batch of them", () => {
  // Measured, not assumed: of six real dental Phoenix domains probed, two carry
  // a Zocdoc script, which technology detection settles for free with no key.
  // A guard that waited for a batch to settle *nothing* would therefore never
  // fire on a batch containing one of them, and would crawl the market to
  // produce eleven-twelfths nothing.
  assert.match(worker, /const noEngine = results\.some\(\(r\) => r\.verdict === "needs_model"\)/);
  assert.ok(
    !/results\.some\(\(r\) => r\.verdict !== "needs_model"\)/.test(worker),
    "back to the weaker 'did anything settle' guard",
  );

  // And it releases rather than failing: the sites stay pending, so the job
  // resumes by itself once a key is there.
  const stanza = worker.slice(worker.indexOf("if (noEngine)"), worker.indexOf("if (noEngine)") + 700);
  assert.ok(/releaseJob\(/.test(stanza), "does not release the job");
  assert.ok(
    !/p_failure|"failed"/.test(stanza),
    "marks the job failed, so it would never resume",
  );
});

test("a site that throws is our failure, never a fact about the business", () => {
  const stanza = worker.slice(worker.indexOf("} catch {"), worker.indexOf("} catch {") + 400);
  assert.match(stanza, /couldnt_tell/);
  assert.ok(!/no_match/.test(stanza), "an error must never produce a no_match");
});

test("results are written inside the loop, not accumulated to the end", () => {
  const loop = worker.slice(worker.indexOf("while (roomFor"), worker.indexOf("const state = await releaseJob(job.id);"));
  assert.match(loop, /await recordSites\(/);
});

/* ----------------------------------------------- the wait the customer sees -- */

test("the estimate a customer sees is the arithmetic the worker runs on", () => {
  // Twelve in flight, 3.4 pages a site at 1.5s, plus 1.2s to judge.
  const perSite = J.PAGES_PER_SITE * J.PER_DOMAIN_DELAY + J.JUDGE_SECONDS;
  assert.equal(J.estimateSeconds(120), Math.ceil((120 * perSite) / J.CONCURRENCY));
  assert.equal(J.estimateSeconds(0), 0);
});

test("and the real markets' remainders come out as real waits", () => {
  const data = (f) =>
    JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", f), "utf8"));
  for (const f of ["dental-phoenix.json", "med-spa-dallas.json", "hvac-tampa.json"]) {
    const m = data(f);
    const unread = m.businesses.filter((b) => b.site && !(b.read && b.read.outcome)).length;
    assert.ok(unread > 0, `${f} has nothing left to read, so the offer would be a lie`);
    const seconds = J.estimateSeconds(unread);
    // Long enough to be worth leaving, short enough that nobody is being told
    // to come back next week.
    assert.ok(J.worthLeaving(unread), `${f}: ${unread} sites is not worth a progress page`);
    assert.ok(seconds < 6 * 3600, `${f}: ${J.humanDuration(seconds)} is not a wait anybody accepts`);
    console.log(`        ${f}: ${unread} unread, ${J.humanDuration(seconds)}`);
  }
});

test("the wait is never rounded up to look like more work", () => {
  // 3,600 sites is a little under half an hour of crawling at the real
  // settings. If this ever reads "about 2 hours", somebody has padded it.
  const s = J.estimateSeconds(3600);
  assert.ok(s > 1500 && s < 2500, `${s}s for 3,600 sites`);
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
