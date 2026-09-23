/** The credit ledger (S1-08).
 *
 *  This is the file that decides what a customer is charged, so the tests are
 *  arithmetic and refusals rather than behaviour. The two things a billing bug
 *  costs are a balance nobody can explain and a promise quietly broken, and
 *  both are cheaper to catch here than in a support thread.
 *
 *  node stage0/tests/test_ledger.mjs
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/ledger.ts", "src/lib/pricing.ts"], "sfled-");
const L = await load("ledger");
const { READS_PER_CREDIT, PLANS } = await load("pricing");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`); }
};

const JAN = "2026-01-15T10:00:00.000Z";
const FEB = "2026-02-15T10:00:00.000Z";
const NEXT_JAN = "2027-01-15T10:00:00.000Z";
const LATER = "2027-02-16T10:00:00.000Z";

const fresh = (planId = "starter") => L.renew(L.emptyAccount(planId), JAN);

// --- the balance is integer arithmetic, because quarter credits exist
check("a fresh Starter has its plan's credits", L.balance(fresh()) === 120 * L.MILLI);

{
  const a = fresh();
  // Four quarter-credit unlocks must land exactly on one credit spent.
  for (let i = 0; i < 4; i++)
    L.chargeForNoWebsite(a, { businessId: `n${i}`, now: JAN });
  check("four quarter-credit unlocks spend exactly one credit",
    L.balance(a) === 119 * L.MILLI,
    `left ${L.balance(a)} milli`);
}

{
  // The float version of the same thing, to show why the unit is not a float.
  let f = 120;
  for (let i = 0; i < 4; i++) f -= 0.25;
  check("and the float version is only accidentally right here",
    f === 119, "the unit is integer so this can never be accidentally wrong");
}

check("credits render whole when whole and two-figure when not",
  L.credits(3 * L.MILLI) === "3" && L.credits(250) === "0.25");

// --- charging for a match, at the settled band
{
  const a = fresh();
  const r = L.chargeForMatch(a, {
    businessId: "b1", quotedBandCredits: 3, deliveredRate: 0.26, now: JAN });
  check("a scan that delivered a common rate bills the cheap band",
    r.charged && r.milli === 1 * L.MILLI, `${r.milli}`);
  check("and the ledger line says why it was cheaper than quoted",
    r.charged && /rather than the 3 quoted/.test(r.entry.why));
}

{
  const a = fresh();
  const r = L.chargeForMatch(a, {
    businessId: "b1", quotedBandCredits: 1, deliveredRate: 0.01, now: JAN });
  check("a scan that delivered a rarer rate still bills the quote",
    r.charged && r.milli === 1 * L.MILLI,
    "what was shown may only go down");
}

// --- unlocked once, free for twelve months
{
  const a = fresh();
  L.chargeForMatch(a, { businessId: "b1", quotedBandCredits: 2, deliveredRate: 0.07, now: JAN });
  const before = L.balance(a);
  const again = L.chargeForMatch(a, {
    businessId: "b1", quotedBandCredits: 2, deliveredRate: 0.07, now: FEB });
  check("re-unlocking the same business inside the window is free",
    !again.charged && L.balance(a) === before);
  check("and says why, rather than silently not moving the balance",
    !again.charged && /Already unlocked/.test(again.reason));
  check("eleven months on it is still free",
    L.alreadyUnlocked(a, "b1", "2026-12-15T10:00:00.000Z"));
  check("exactly twelve months on it is NOT",
    !L.alreadyUnlocked(a, "b1", NEXT_JAN),
    "the promise is 12 months, so the 12-month mark is the end of it");
}

// --- refunds
{
  const a = fresh();
  L.chargeForMatch(a, { businessId: "b1", quotedBandCredits: 3, deliveredRate: 0.02, now: JAN });
  const spent = 120 * L.MILLI - L.balance(a);
  check("a rare match costs three credits", spent === 3 * L.MILLI);

  const r = L.refundMatch(a, { businessId: "b1", now: FEB });
  check("a refund returns exactly what was charged",
    r.charged && L.balance(a) === 120 * L.MILLI, `${L.balance(a)}`);
  check("refunding twice is refused",
    !L.refundMatch(a, { businessId: "b1", now: FEB }).charged);
  check("and the business is no longer treated as unlocked",
    !L.alreadyUnlocked(a, "b1", FEB),
    "we did not charge for it, so we are not holding it");
  check("refunding something never charged is refused",
    !L.refundMatch(a, { businessId: "never", now: FEB }).charged);
}

{
  // The band could settle differently later; the refund must not recompute it.
  const a = fresh();
  L.chargeForNoWebsite(a, { businessId: "n1", now: JAN });
  L.refundMatch(a, { businessId: "n1", now: FEB });
  check("a quarter-credit unlock refunds a quarter credit, not a whole one",
    L.balance(a) === 120 * L.MILLI, `${L.balance(a)}`);
}

// --- refusals when the balance runs out
{
  const a = L.renew(L.emptyAccount("watch"), JAN);   // 40 credits
  for (let i = 0; i < 40; i++)
    L.chargeForMatch(a, { businessId: `b${i}`, quotedBandCredits: 1, deliveredRate: 0.2, now: JAN });
  check("the balance lands exactly on zero", L.balance(a) === 0);
  const r = L.chargeForMatch(a, {
    businessId: "one-too-many", quotedBandCredits: 1, deliveredRate: 0.2, now: JAN });
  check("and the next match is refused", !r.charged);
  check("with the numbers in it", /0 credits left/.test(r.reason));
  check("nothing is unlocked by a refused charge", !L.alreadyUnlocked(a, "one-too-many", JAN));
}

// --- discovery top-up
{
  const a = fresh();
  const r = L.chargeForDiscovery(a, { businesses: 30, now: JAN });
  check("30 bought-in businesses cost 3 credits",
    r.charged && r.milli === 3 * L.MILLI, `${r.milli}`);
  check("and a single one costs a tenth of a credit",
    L.DISCOVERY_PER_BUSINESS === L.MILLI / 10);
}

// --- renewal, rollover and its cap
{
  let a = fresh();                                  // 120
  L.chargeForMatch(a, { businessId: "b1", quotedBandCredits: 1, deliveredRate: 0.3, now: JAN });
  a = L.renew(a, FEB);
  check("unused credits carry into the next period",
    L.balance(a) === 119 * L.MILLI + 120 * L.MILLI, `${L.balance(a)}`);
}

{
  let a = fresh();
  a = L.renew(a, FEB);      // 240 held, nothing spent
  a = L.renew(a, "2026-03-15T10:00:00.000Z");
  check("rollover is capped at one month's allowance",
    L.balance(a) === 240 * L.MILLI,
    `${L.balance(a)} — a dormant account must not bank an unbounded balance`);
  check("and the expiry is a ledger line, not a silent deduction",
    a.entries.some((e) => e.kind === "expiry" && /expired/.test(e.why)));
}

// --- the read allowance is what actually bounds cost
{
  const a = fresh();
  check("a Starter's period allowance is 11 reads per credit",
    L.readsRemaining(a) === 120 * READS_PER_CREDIT);

  const impossible = L.spendReads(a, 5000);
  check("an impossible criterion cannot read past the allowance",
    impossible === 120 * READS_PER_CREDIT && L.readsRemaining(a) === 0,
    "credits deplete on matches, so this is the only bound that binds");
  check("and not one credit was spent doing it", L.balance(a) === 120 * L.MILLI);
}

{
  const a = fresh();
  L.spendReads(a, 100);
  const renewed = L.renew(a, FEB);
  check("the allowance resets with the period", renewed.readsThisPeriod === 0);
}

// --- every line is explainable
{
  const a = fresh();
  L.chargeForMatch(a, { businessId: "b1", quotedBandCredits: 2, deliveredRate: 0.07, now: JAN });
  L.chargeForNoWebsite(a, { businessId: "n1", now: JAN });
  L.chargeForDiscovery(a, { businesses: 10, now: JAN });
  L.refundMatch(a, { businessId: "b1", now: JAN });
  check("no ledger line is unexplained", a.entries.every((e) => e.why && e.why.length > 12));
  check("the balance equals the sum of its lines",
    L.balance(a) === a.entries.reduce((n, e) => n + e.milli, 0));
  check("and every plan can be renewed without going negative",
    PLANS.every((p) => L.balance(L.renew(L.emptyAccount(p.id), JAN)) >= 0));
}

check("a date beyond the window really is beyond it",
  !L.alreadyUnlocked({ unlocked: { x: JAN } }, "x", LATER));

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
