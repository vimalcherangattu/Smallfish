/**
 * The written-down stopping rule for cold email (owner, 2026-11-10).
 *
 *     node stage0/tests/test_stoprule.mjs
 *
 * It holds the property that matters: the verdict cannot be reached early,
 * our own seed addresses never count, a bounce is not a person reached, and
 * one person wanting it is enough to say "keep going".
 */
import assert from "node:assert/strict";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};
const { load } = compileLib(["src/lib/stoprule.ts"], "sf-stoprule-");
const R = await load("stoprule");
const N = R.STOP_RULE.people;

const sent = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ kind: "email_sent", email: `p${i + from}@x.com` }));

test("the rule is 500 people from the day the copy changed", () => {
  assert.equal(N, 500);
  assert.equal(R.STOP_RULE.since, "2026-11-10");
});
test("short of the number, nobody wanting it is still testing, never stop", () => {
  const s = R.stopStatus(sent(N - 1), [], 0);
  assert.equal(s.verdict, "testing");
  assert.equal(s.reached, N - 1);
  assert.match(s.line, new RegExp(`${N - 1} of ${N}`));
});
test("at the number with nobody wanting it, the verdict is stop", () => {
  const s = R.stopStatus(sent(N), [], 0);
  assert.equal(s.verdict, "stop");
  assert.match(s.line, /STOP POINT REACHED/);
});
test("several emails to one person are one person", () => {
  assert.equal(R.stopStatus([...sent(10), ...sent(10)], [], 0).reached, 10);
});
test("a bounce is not a person reached", () => {
  const ev = [...sent(N), { kind: "email_bounced", email: "p0@x.com" }];
  assert.equal(R.stopStatus(ev, [], 0).verdict, "testing");
});
test("our own seed addresses never count, in any case", () => {
  const ev = [...sent(N - 1), { kind: "email_sent", email: "Seed@Gmail.com" },
    { kind: "reply_classified", email: "seed@gmail.com", detail: { intent: "interested" } }];
  const s = R.stopStatus(ev, R.seedsFrom("seed@gmail.com"), 0);
  assert.equal(s.reached, N - 1);
  assert.equal(s.wanted, 0);
});
test("one interested reply, a question or another trade is wanting it", () => {
  for (const intent of ["interested", "question", "other_list"]) {
    const s = R.stopStatus([...sent(N), { kind: "reply_classified", email: "p3@x.com", detail: { intent } }], [], 0);
    assert.equal(s.verdict, "working", intent);
  }
});
test("'no', out-of-office and wrong person are not wanting it", () => {
  for (const intent of ["unsubscribe", "out_of_office", "wrong_person", "other"]) {
    const s = R.stopStatus([...sent(N), { kind: "reply_classified", email: "p3@x.com", detail: { intent } }], [], 0);
    assert.equal(s.verdict, "stop", intent);
  }
});
test("a signup from outreach is wanting it", () => {
  assert.equal(R.stopStatus(sent(N), [], 1).verdict, "working");
});
test("seeds parse from a comma or space list, lower-cased, junk dropped", () => {
  assert.deepEqual(R.seedsFrom(" A@x.com, b@y.co  a@x.com nope "), ["a@x.com", "b@y.co"]);
  assert.deepEqual(R.seedsFrom(undefined), []);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall pass");
