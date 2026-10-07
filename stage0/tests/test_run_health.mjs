/**
 * The solvency abort is wired to something.
 *
 *     node stage0/tests/test_run_health.mjs
 *
 * ## The defect this exists for
 *
 * `pricing.ts` says, in as many words, that *"no affordable sample can settle
 * solvency, so the sample's job is only to quote a band and refuse the obviously
 * hopeless. **Solvency is enforced on the live run instead, by `checkRunHealth`
 * below**."* That function is written, reasoned about across forty lines, and
 * covered by `test_pricing.mjs`.
 *
 * **Nothing called it.** Its only caller was its own test. `MAX_LOSS_PER_SCAN_USD`
 * — "a scan that is hopeless from the first read costs at most $3.36 before it
 * is stopped" — described a mechanism that did not run, and `test_pricing.mjs`
 * passed because it tested the arithmetic rather than the wiring. That is the
 * same shape as the CRM push charging nothing: a rule with a correct
 * implementation and no caller.
 *
 * ## What its absence actually cost, which is not what it looks like
 *
 * Not our solvency. `READS_PER_CREDIT` **is** enforced — at job creation in
 * `/api/jobs` and per period in `ledger.ts` — and it keeps every paid plan
 * solvent with zero matches: Starter reads at most 1,320 sites, $22.18, against
 * $29. So the missing abort lost no money.
 *
 * It let a hopeless search spend a customer's **whole period of reading** on a
 * question that was never going to work, instead of stopping at 200 sites and
 * saying so. One measured market in four matched nothing at all — vet clinics
 * in Columbus, 117 settled, 0 matched — so this is a thing that happens.
 *
 * ## Two traps that would have made the fix wrong
 *
 * Both are asserted below, because both are silent:
 *
 *   - **The free plan aborts everything.** `breakEvenRate` is `Infinity` when a
 *     credit costs nothing, so a free run is "below break-even" at any rate at
 *     all, including one matching a quarter of what it reads. Every trial would
 *     have stopped at 200 of its 220 reads, told the customer their search was
 *     not working, and been wrong.
 *   - **Exact equality never fires on a batched caller.** The gate was
 *     `ABORT_CHECKS.includes(reads)`. The worker reads twelve sites a batch, so
 *     its count steps 192 → 204 and lands on 200 only by luck. Wiring it in
 *     without `since` would have produced an abort that could not be reached,
 *     which is worse than none because it looks like one.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

const { load } = compileLib(["src/lib/pricing.ts"], "sf-health-");
const P = await load("pricing");

const starter = P.PLANS.find((p) => p.id === "starter");
const free = P.PLANS.find((p) => p.id === "free");

/** The call the worker makes: band off the live rate, as `bandForMarket` does. */
const health = (reads, matches, since, plan = starter) =>
  P.checkRunHealth({
    reads,
    matches,
    quotedBandCredits: P.bandFor(matches / reads).credits,
    plan,
    since,
  });

/* ------------------------------------------------- crossing a checkpoint -- */

test("a checkpoint crossed by a batch counts", () => {
  // The whole reason the worker can use this at all.
  assert.equal(P.crossesAbortCheck(188, 204), true);
  assert.equal(P.crossesAbortCheck(192, 200), true);
});

test("and a batch that crosses nothing does not", () => {
  assert.equal(P.crossesAbortCheck(204, 216), false);
  assert.equal(P.crossesAbortCheck(0, 12), false);
});

test("exact equality still works, so the one-at-a-time caller is unchanged", () => {
  assert.equal(P.crossesAbortCheck(199, 200), true);
  // `since` omitted must reproduce the old gate exactly.
  assert.equal(P.checkRunHealth({ reads: 201, matches: 0, quotedBandCredits: 3, plan: starter }).keepGoing, true);
  assert.equal(P.checkRunHealth({ reads: 200, matches: 0, quotedBandCredits: 3, plan: starter }).keepGoing, false);
});

test("every checkpoint is reachable by a twelve-site batch", () => {
  // If a checkpoint could be stepped over, the abort would quietly not exist
  // past it. Walk the real batch size across every checkpoint.
  for (const c of P.ABORT_CHECKS) {
    let crossed = false;
    for (let r = 0; r <= c + 24; r += 12) {
      if (P.crossesAbortCheck(r, r + 12)) crossed = true;
    }
    assert.ok(crossed, `checkpoint ${c} is never crossed by a batch of 12`);
  }
});

/* ------------------------------------------------- what it does and does not stop -- */

test("a search that matches nothing is stopped at the first checkpoint", () => {
  const h = health(200, 0, 188);
  assert.equal(h.keepGoing, false);
  // The ceiling `MAX_LOSS_PER_SCAN_USD` claims.
  assert.ok(h.spentUsd <= P.MAX_LOSS_PER_SCAN_USD + 1e-9, `spent ${h.spentUsd}`);
  assert.match(h.reason, /you keep the 0 found/);
});

test("the three measured markets that match something are never stopped", () => {
  // dental 26.0%, med spa 6.2%, HVAC 5.0% — the rates in `pricing.ts`'s own
  // band comments. A rule that killed any of these would be unshippable.
  for (const [name, rate] of [["dental", 0.26], ["med spa", 0.062], ["HVAC", 0.05]]) {
    for (const c of P.ABORT_CHECKS) {
      const h = health(c, Math.round(c * rate), c - 12);
      assert.ok(h.keepGoing, `${name} at ${rate} stopped at ${c} reads`);
    }
  }
});

test("and the one that matched nothing is", () => {
  // vet Columbus: 117 settled, 0 matched. Measured, not invented.
  assert.equal(health(200, 0, 188).keepGoing, false);
});

test("it cannot fire above the no-hope floor it is paired with", () => {
  // `NO_HOPE_RATE` is 3%: a search is allowed to start at 3%, so stopping one
  // running at 3% would be the product contradicting itself one screen later.
  for (const c of P.ABORT_CHECKS) {
    for (const plan of P.PLANS.filter((p) => p.priceUsd > 0)) {
      const h = health(c, Math.ceil(c * P.NO_HOPE_RATE), c - 12, plan);
      assert.ok(h.keepGoing, `${plan.id} stopped at the no-hope floor, ${c} reads`);
    }
  }
});

/* --------------------------------------------------------- the free plan -- */

test("the free plan would abort every run, which is why the worker skips it", () => {
  // Not a bug to fix in `checkRunHealth`: free reading genuinely earns nothing,
  // so "below break-even" is true at any rate. It makes the function the wrong
  // tool for a plan with no price, and this is the assertion that says so.
  assert.equal(P.breakEvenRate(free, 3), Infinity);
  assert.equal(health(200, 52, 188, free).keepGoing, false, "a 26% free run is 'hopeless'");
  assert.equal(P.pricePerCredit(free), 0);
});

/* ------------------------------------------------------- the wiring itself -- */

const worker = read("src/lib/worker.ts");

test("the worker calls it", () => {
  // The assertion that was missing. `checkRunHealth` had exactly one caller in
  // the repository and it was a test file.
  assert.match(worker, /checkRunHealth\(\{/);
  assert.match(worker, /stillWorthReading\(/);
});

test("and guards the free and comped cases before it does", () => {
  assert.match(worker, /if \(isComped\(account\)\) return null;/);
  assert.match(worker, /if \(pricePerCredit\(plan\) <= 0\) return null;/);
});

test("it checks after the batch is written, not before", () => {
  // A check before `recordSites` would judge the run without the matches we
  // had just paid to find.
  assert.ok(
    worker.indexOf("await recordSites(job.id, results)") <
      worker.indexOf("const hopeless = await stillWorthReading("),
    "the solvency check must come after the write",
  );
});

test("it passes cumulative totals, not this slice's", () => {
  // `read` and `matched` are per-slice counters. A check on those would compare
  // twelve reads against twelve matches on every batch and never fire.
  assert.match(worker, /reads: job\.sites_read \+ read/);
  assert.match(worker, /matches: job\.matched \+ matched/);
});

test("it ends the job rather than pausing it", () => {
  // `releaseJob(id, note)` leaves the state 'reading' when sites remain, and the
  // read screen offers "press continue" on a note — which would be offering to
  // spend more on the search we just said was not working. The third argument
  // is the one that ends it.
  assert.match(worker, /await releaseJob\(job\.id, null, hopeless\)/);
});

test("the judged denominator agrees with what the invoice uses", () => {
  // `bandForMarket` divides matches by rows that reached a verdict, never by
  // rows read. If these disagreed the abort would price a run differently from
  // the charge for it.
  assert.match(worker, /judged: job\.sites_judged \+ \(results\.length - unclearIn\(results\)\)/);
  const unlock = read("src/lib/unlock.ts");
  assert.match(unlock, /v !== "unread" && v !== "needs_model"/);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
