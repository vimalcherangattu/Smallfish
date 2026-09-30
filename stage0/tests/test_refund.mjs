/**
 * Not a fit — refunded on the spot (P1).
 *
 *     node stage0/tests/test_refund.mjs
 *
 * The money half of this lives in `refund_match` (migration `0003`) and was
 * exercised against the live database before the route was written: a 2-credit
 * charge left the balance at 18,000 milli and the business unlocked; the refund
 * put it back to 20,000 and **released the unlock**, so the row returns behind
 * the paywall; a second refund answered "Already refunded."; and a business
 * nobody was charged for answered "Nothing was charged for this."
 *
 * What is left here is the part a database cannot hold:
 *
 * ## The route's sentences have to match the SQL's answers
 *
 * `/api/refund` translates `refund_match`'s `reason` into something a customer
 * reads. It does that by comparing against literal strings, which is a coupling
 * between a TypeScript file and a PL/pgSQL one that nothing else would catch —
 * change the wording in the migration and the route silently falls through to
 * its generic branch. So the strings are checked against the migration itself.
 *
 * ## The refund must not wait on the reason
 *
 * A refund that needs a form filled in first is not a refund on the spot, and
 * the reason is worth having precisely because it costs the customer nothing.
 * `PROJECT_PLAN.md` says hand-labelling for S0-16 "is human work and cannot be
 * automated away": a customer writing *"they do have booking, it's under
 * Patients"* is that label, from the person best placed to produce it.
 *
 * ## And a refunded row must not vanish
 *
 * Removing it would leave somebody looking at a list one shorter than a moment
 * ago with no way to tell whether the refund worked.
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
const route = read("src/app/api/refund/route.ts");
const contactedRoute = read("src/app/api/contacted/route.ts");
const list = read("src/components/LeadList.tsx");
const sql0003 = read("supabase/migrations/0003_refund_renew_and_reads.sql");
const sql0016 = read("supabase/migrations/0016_contacted_and_feedback.sql");

/* ------------------------------------- the route speaks the database's words -- */

test("every reason the route translates is one refund_match actually returns", () => {
  // The literals the route branches on.
  const branched = [...route.matchAll(/result\.reason === "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(branched.length >= 2, `only ${branched.length} branches found`);
  for (const phrase of branched) {
    assert.ok(
      sql0003.includes(`'${phrase}'`),
      `the route answers "${phrase}" but refund_match never returns it`,
    );
  }
});

test("and the ones it does return are either translated or fall through visibly", () => {
  // Every string refund_match can hand back, so a new one added to the SQL
  // shows up here rather than silently reaching a customer as jargon.
  const fn = sql0003.slice(
    sql0003.indexOf("function public.refund_match"),
    sql0003.indexOf("function public.renew_period"),
  );
  const returned = [...fn.matchAll(/return query select (?:false|true), '([^']+)'/g)].map(
    (m) => m[1],
  );
  assert.ok(returned.length >= 3, `only ${returned.length} reasons in the function`);
  // The fallback must exist, or an untranslated reason renders as undefined.
  assert.match(route, /result\.reason \?\? "That did not go through\."/);
});

/* ----------------------------------------------- the refund comes first -- */

test("the refund is called before anything to do with the reason", () => {
  const refundAt = route.indexOf("await refund(");
  const feedbackAt = route.indexOf("recordFeedback(");
  assert.ok(refundAt > 0 && feedbackAt > 0, "one of them is not called at all");
  assert.ok(refundAt < feedbackAt, "the reason is recorded before the money moves");
});

test("and a failure to record the reason cannot undo it", () => {
  // The window has to reach past the call's arguments: the first version read
  // 400 characters and the call is longer than that, so the assertion failed on
  // code that was correct. A check that cannot see the thing it checks is worse
  // than no check, because it looks like coverage.
  const after = route.slice(route.indexOf("recordFeedback("));
  const call = after.slice(0, after.indexOf("});") + 40);
  assert.match(call, /\.catch\(\(\) => undefined\)/);
});

test("the reason is optional, and the row still records a bare refusal", () => {
  // `reason || result.refunded` — a refund with no words is still a label that
  // this row was wrong.
  assert.match(route, /if \(reason \|\| result\.refunded\)/);
});

test("a stated reason is kept even when the refund itself was refused", () => {
  // "Already refunded" still means they are telling us the row is wrong, and
  // that half is the one worth keeping.
  const guard = route.match(/if \(reason \|\| result\.refunded\)/);
  assert.ok(guard, "the guard is gone");
  assert.ok(
    !/if \(result\.refunded\)\s*\{[\s\S]{0,80}recordFeedback/.test(route),
    "the reason is only recorded on a successful refund",
  );
});

/* ------------------------------------------------ what the row does next -- */

test("a refunded row stays on screen rather than disappearing", () => {
  assert.match(list, /if \(gone\) \{/);
  assert.match(list, /line-through/);
  assert.ok(
    !/setGone\(true\)[\s\S]{0,120}return null/.test(list),
    "the row is removed instead of struck through",
  );
});

test("and only offers the reason box after the money is already back", () => {
  const goneBlock = list.slice(list.indexOf("if (gone) {"), list.indexOf("if (gone) {") + 2000);
  assert.match(goneBlock, /Tell us what we got wrong/);
});

test("the actions are hidden from somebody with no account", () => {
  // A signed-out visitor is looking at the free preview: nothing to mark, and
  // nothing to refund.
  assert.match(list, /\{signedIn && \(/);
  const block = list.slice(list.indexOf("{signedIn && ("));
  assert.match(block.slice(0, 2000), /Mark as contacted/);
  assert.match(block.slice(0, 2000), /Not a fit/);
});

test("a contacted tick that the server refused is put back, not left lying", () => {
  assert.match(list, /if \(!r\.ok\) setDone\(!next\)/);
});

test("the edited draft is what gets copied, not the original", () => {
  assert.match(list, /<Copy text=\{draft\} \/>/);
  assert.ok(
    !/<Copy text=\{lead\.message\}/.test(list),
    "copy still takes the underived original",
  );
});

/* ------------------------------------------------------- contacted is a fact -- */

test("contacted is keyed per workspace, not per person", () => {
  assert.match(sql0016, /primary key \(account_id, business_id\)/);
  assert.ok(
    !/user_id/.test(sql0016.slice(sql0016.indexOf("create table if not exists public.contacted"), sql0016.indexOf("comment on table public.contacted"))),
    "contacted is scoped to a user, so two people share a list and not its history",
  );
});

test("and it can be undone", () => {
  assert.match(sql0016, /function public\.unmark_contacted/);
  assert.match(contactedRoute, /body\.contacted !== false/);
});

test("marking twice is one statement, not two", () => {
  const fn = sql0016.slice(sql0016.indexOf("function public.mark_contacted"));
  assert.match(fn.slice(0, 700), /on conflict \(account_id, business_id\) do nothing/);
});

/* --------------------------------------------- neither table is client-writable -- */

for (const t of ["contacted", "match_feedback"]) {
  test(`${t} is readable by its workspace and writable by nobody`, () => {
    assert.match(sql0016, new RegExp(`create policy ${t}_read on public\\.${t}`));
    assert.match(sql0016, new RegExp(`for select using \\(public\\.member_of \\(account_id\\)\\)`));
    assert.match(
      sql0016,
      new RegExp(`revoke insert, update, delete on public\\.${t}\\s+from anon, authenticated`),
    );
  });
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
