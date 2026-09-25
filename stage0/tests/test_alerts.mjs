/**
 * Alerts gate on the signals hash, and a digest never names anybody (S1-07).
 *
 * The feature is the gate. Sixty dental sites re-read the same day gave raw
 * HTML 31.7% "changed" against judged signals 0.0% — so alerting on bytes would
 * re-judge a third of the book every week to learn that nothing moved, and the
 * bill scales with how long customers stay. These checks fail if the gate ever
 * stops being the thing that decides whether money is spent.
 *
 *     node stage0/tests/test_alerts.mjs
 */

import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/alerts.ts", "src/lib/pricing.ts"],
  "sfalert-",
);
const A = await load("alerts");
const { COST_PER_READ, PLANS } = await load("pricing");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const w = (id, hash, matched, blocked = false) => ({
  businessId: id,
  signalsHash: hash,
  matched,
  blocked,
});

// --- the gate ---------------------------------------------------------------
{
  const before = [w("a", "h1", false), w("b", "h1", true), w("c", "h1", false)];
  const after = [w("a", "h1", false), w("b", "h1", true), w("c", "h1", false)];
  const d = A.digest(before, after);
  check(
    "an unchanged hash re-judges nothing",
    d.reJudged === 0 && d.unchanged === 3,
    `reJudged ${d.reJudged}, unchanged ${d.unchanged}`,
  );
  check("and produces nothing worth sending", !A.worthSending(d));
  check(
    "so a quiet week costs one crawl each and no judgment",
    A.runCostUsd(d) === 3 * COST_PER_READ,
    `${A.runCostUsd(d)} vs ${3 * COST_PER_READ}`,
  );
}

// --- what a change is, and what it is not ------------------------------------
{
  const before = [
    w("stays", "h1", true),
    w("gains", "h1", false),
    w("loses", "h1", true),
    w("blocked", "h1", false, true),
  ];
  const after = [
    w("stays", "h1", true), // untouched
    w("gains", "h2", true), // signals moved, now matches
    w("loses", "h2", false), // signals moved, stopped matching
    w("blocked", "h2", true), // was unreadable, now readable and matching
    w("brand-new", "h9", true), // not seen before at all
  ];
  const d = A.digest(before, after);

  check("a business that was never seen counts as new", d.newMatches === 1);
  check("a gain is a change, not a new match", d.changedToMatch === 1 && d.newMatches === 1);
  check("a business that stopped matching is reported too", d.changedToNoMatch === 1,
    "a customer chasing a stale list is worse served than one told it went stale");
  check("newly unblocked is its own category", d.newlyUnblocked === 1,
    "it is not a change in the business, it is a change in what we could read");
  check("the untouched one is not re-judged", d.unchanged === 1);
  check("and everything whose hash moved was", d.reJudged === 4);
  check("this is worth sending", A.worthSending(d));
}

// --- a digest never names anybody --------------------------------------------
{
  const d = A.digest([], [w("aspen-dental-phoenix-17", "h", true)]);
  const json = JSON.stringify(d);
  check(
    "no business id survives into a digest",
    !json.includes("aspen") && d.namesWithheld === true,
    json,
  );
  check(
    "it carries counts only",
    Object.values(d).every((v) => typeof v === "number" || v === true),
  );
}

// --- budgets ------------------------------------------------------------------
{
  const b = A.budgets();
  check("every paid plan gets a watch budget", b.every((x) => x.watched > 0));
  check(
    "a bigger plan watches more",
    b.find((x) => x.planId === "growth").watched >
      b.find((x) => x.planId === "starter").watched,
  );
  check(
    "and every budget is flagged unmeasured until S0-23 lands",
    b.every((x) => x.measured === false) && A.CHANGE_RATE_MEASURED === false,
    "a provisional number presented as a measurement is how a placeholder " +
      "becomes a fact nobody checks",
  );
  check(
    "a higher change rate buys fewer watched businesses",
    A.watchBudget(PLANS.find((p) => p.id === "starter"), 0.5) <
      A.watchBudget(PLANS.find((p) => p.id === "starter"), 0.05),
    "the budget has to move with the measurement, or it is not derived from it",
  );
  check(
    "watching never costs more than the plan's own read allowance",
    b.every((x) => {
      const plan = PLANS.find((p) => p.id === x.planId);
      const monthlyReads = x.monthlyCostUsd / COST_PER_READ;
      return monthlyReads <= plan.credits * 11;
    }),
    "alerts that outspend the allowance starve the scanning the customer bought",
  );
}

// --- depletion -----------------------------------------------------------------
{
  const thin = A.depletion(3, 8);
  check("a thin market refuses to estimate depletion", thin.share === null && !thin.exhausted);
  check("and says that is about our reading, not their market",
    /how much of this market we have read/.test(thin.message));

  const mid = A.depletion(100, 400);
  check("a healthy market reports a share", Math.abs(mid.share - 0.25) < 1e-9 && !mid.exhausted);

  const done = A.depletion(340, 400);
  check("a nearly-used market says so", done.exhausted === true);
  check("and suggests another market rather than another month",
    /another one will serve you better than another month/.test(done.message),
    "this is the uncomfortable one: it tells a paying customer when to stop");

  check("depletion cannot exceed 1", A.depletion(900, 400).share === 1);
}

// --- pause ---------------------------------------------------------------------
{
  const p = A.pauseUntil("2026-09-25T00:00:00Z", 2);
  check("a pause has an end date", p.until.startsWith("2026-11-25"));
  check("and is capped", A.pauseUntil("2026-09-25T00:00:00Z", 99).until.startsWith("2026-12-25"));
  check("a zero or negative pause is still at least a month",
    A.pauseUntil("2026-09-25T00:00:00Z", 0).until.startsWith("2026-10-25"));
  check("it says alerts stop, because watching costs money weekly",
    /alerts stop/.test(p.note));
  check("and points at cancelling rather than replacing it",
    /Cancel instead at any time/.test(p.note),
    "offering pause *instead of* cancel is the dark pattern; offering both is not");
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
