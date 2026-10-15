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

import { code } from "./_source.mjs";

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

/**
 * **These assertions used to be made against `src/components/LeadList.tsx`,
 * and that is how a live defect hid behind a green suite for weeks.**
 *
 * `LeadList` is the pre-App-v2 results list. It is rendered by nothing — it
 * has no import anywhere in `src/` — and `PROJECT_PLAN.md` has listed it as
 * dead since 2026-10-04. Every test below passed against it the whole time,
 * because it is a correct screen. It is simply not the screen anybody sees.
 *
 * The screen anybody sees is `components/app/Results.tsx` rendering
 * `components/app/BizRow.tsx`, and when App v2 was written it reproduced
 * `LeadList`'s two buttons without `LeadList`'s two fetches:
 *
 *     onContacted={() => setContacted(add(contacted, r.lead.id))}
 *     onNotAFit={() => setDropped(add(dropped, r.lead.id))}
 *
 * A button reading **"Not a fit, refunds the credit"** that moved no money,
 * next to a cost bar promising *"anything you mark 'not a fit' comes straight
 * back"*. `/api/refund` was reachable, correct and covered by every assertion
 * above this line. Nothing connected them.
 *
 * So: re-pointed, deliberately, at the files the customer loads. A test naming
 * a dead file is not weaker coverage than no test — it is worse, because it
 * reports the property as held.
 */
/**
 * **Comments stripped, and the first run of this file is why.**
 *
 * The comment above quotes the two broken handlers verbatim, so that the next
 * reader can see the shape of the defect. `no row action is wired to local
 * state alone` then matched that quotation and failed against code that was
 * already fixed. `_source.mjs` exists for exactly this — a repository that
 * explains its mistakes in prose cannot grep its own source for them.
 */
const row = code(read("src/components/app/BizRow.tsx"));
const results = code(read("src/components/app/Results.tsx"));

test("the live screen's refund button actually calls the refund route", () => {
  // The assertion whose absence is the whole reason this comment exists. A
  // handler that only touches React state is the defect, by definition.
  assert.match(results, /post\("\/api\/refund"/);
  const call = results.slice(results.indexOf('post("/api/refund"'));
  assert.match(call.slice(0, 300), /business: lead\.id/);
});

test("and its contacted button calls the contacted route", () => {
  assert.match(results, /post\("\/api\/contacted"/);
  const call = results.slice(results.indexOf('post("/api/contacted"'));
  assert.match(call.slice(0, 300), /contacted: next/);
});

test("no row action is wired to local state alone", () => {
  // The exact shape of the bug, named so it cannot come back quietly: a
  // handler for either button that sets a React set and stops.
  for (const prop of ["onContacted", "onNotAFit"]) {
    const at = results.indexOf(`${prop}={`);
    assert.ok(at > 0, `${prop} is not passed at all`);
    const handler = results.slice(at, at + 200);
    assert.ok(
      !/=>\s*set[A-Z]\w*\(/.test(handler),
      `${prop} still assigns straight to component state: ${handler.slice(0, 90)}`,
    );
  }
});

test("a refunded row stays on screen rather than disappearing", () => {
  // `BizRow` renders the struck-through form; `Results` must not also filter
  // the row out, which would strike through something nobody can see.
  assert.match(row, /if \(refunded\) \{/);
  assert.match(row, /line-through/);
  assert.ok(
    !/refunded\[r\.lead\.id\]/.test(results.slice(results.indexOf("const shown ="), results.indexOf("const fits ="))),
    "the refunded row is filtered out of the list instead of struck through",
  );
});

test("but the headline count drops, because the credit really came back", () => {
  assert.match(results, /const fits = p\.rows\.filter\(\(r\) => !refunded\[r\.lead\.id\]\)/);
});

test("a refund is never claimed before the server has confirmed it", () => {
  // The one action in the product that must not be optimistic. A struck-out
  // row is a statement that money moved.
  const fn = results.slice(results.indexOf("async function notAFit"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.ok(
    body.indexOf("setRefunded") > body.indexOf("await post"),
    "the row is marked refunded before the route has answered",
  );
  assert.match(body, /if \(r\.ok\) setRefunded/);
});

test("the actions are hidden from somebody with no account", () => {
  // A signed-out visitor is looking at the free preview: nothing to mark, and
  // nothing to refund. Both routes answer 401 without one.
  assert.match(results, /onContacted=\{p\.signedIn \?/);
  assert.match(results, /onNotAFit=\{p\.signedIn \?/);
  // And the row disables a button it was given no handler for, so the gate
  // above cannot leave a live-looking button behind.
  assert.match(row, /disabled=\{!onContacted\}/);
  assert.match(row, /disabled=\{!onNotAFit\}/);
});

test("a contacted tick that the server refused is put back, not left lying", () => {
  const fn = results.slice(results.indexOf("async function markContacted"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /if \(!r\.ok\) \{/);
  // The revert has to undo the direction it just applied, either way.
  assert.match(body, /if \(next\) s\.delete\(lead\.id\);/);
  assert.match(body, /else s\.add\(lead\.id\);/);
});

test("and a mark already held by the server shows as marked on arrival", () => {
  // `walletFor` fetched these the whole time and `/app` dropped them, because
  // there was no prop to put them in. A tick that vanishes on reload is the
  // same lie as one the server never took.
  assert.match(results, /contactedIds\?: readonly string\[\]/);
  assert.match(results, /new Set\(p\.contactedIds \?\? \[\]\)/);
  for (const page of ["src/app/app/page.tsx", "src/app/app/reads/[id]/page.tsx"]) {
    assert.match(read(page), /contactedIds=\{contacted\}/, `${page} does not pass the marks`);
  }
});

test("an action that did not go through says so, in the server's words", () => {
  // "Already refunded" and "nothing was charged for this one" are both true
  // answers a person needs to read. A button that silently does nothing is
  // indistinguishable from the bug this file now guards.
  assert.match(results, /r\.reason \?\? "That did not go through\."/);
  assert.match(row, /\{note && \(/);
});

test("an unreachable server is an answer, not an exception", () => {
  // Every handler branches on `ok`, so the network failure has to arrive in
  // the same shape as a refusal or it escapes as an unhandled rejection and
  // the button appears to do nothing at all.
  const helper = results.slice(results.indexOf("async function post("));
  assert.match(helper, /catch \{/);
  assert.match(helper, /ok: false, reason: "Could not reach the server\. Nothing changed\."/);
});

/* ---------------------------------------------- what the live screen lacks -- */

test("the reason box is a recorded omission, not a silent one", () => {
  // `LeadList` asked "Tell us what we got wrong" **after** refunding, and
  // `/api/refund` still takes that optional `reason` in a second request.
  // App v2 does not ask. That is deliberate for now: the button's promise is
  // that the money comes back, and it now does; collecting why is our
  // measurement, not the customer's errand.
  //
  // It is worth having — a labelled wrong match is exactly what gate item 2
  // needs and `recordFeedback` is already wired — so this asserts the route
  // keeps the door open rather than pretending the screen uses it.
  assert.match(route, /body\.reason/);
  assert.ok(
    !/Tell us what we got wrong/.test(results + row),
    "the reason box exists on the live screen now, so give this test its real assertion",
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
