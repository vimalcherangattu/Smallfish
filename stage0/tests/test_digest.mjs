/**
 * The owner's morning email (GTM): says what happened, names what needs a
 * person, never uses an em dash.
 *
 *     node stage0/tests/test_digest.mjs
 */
import assert from "node:assert/strict";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};
const { load } = compileLib(["src/lib/digest.ts", "src/lib/mail.ts"], "sf-digest-");
const D = await load("digest");

const base = {
  day: "Oct 17", found: 3, queued: 2, sent: 0, opened: 0, replied: 0, autoReplied: 0, unsubscribed: 0, bounced: 0,
  visits: 0, listsBuilt: 0, checks: 4, embedChecks: 1, mcpCalls: 2, pagesCounted: 96, pagesTotal: 200,
  signups: {}, paying: 0, queueReady: { agency: 27, seller: 0, widget: 82 }, held: [], goLive: "2026-11-02", sending: false,
};

test("a quiet day says so in the subject", () => {
  assert.match(D.buildDigest(base).subject, /quiet day, all running/);
});
test("replies, signups and held items lead the subject", () => {
  const m = D.buildDigest({ ...base, replied: 2, signups: { outreach: 1 }, held: [{ kind: "reply held", who: "a@b.com", why: "price" }] });
  assert.match(m.subject, /2 replies, 1 signup, 1 to look at/);
  assert.match(m.text, /NEEDS A LOOK/);
  assert.match(m.text, /outreach 1/);
});
test("before go-live it says when sending starts", () => {
  assert.match(D.buildDigest(base).text, /Sending starts 2026-11-02/);
});
test("past go-live with paused inboxes, the subject says NOT SENDING", () => {
  const m = D.buildDigest({ ...base, pastGoLive: true, sending: false, inboxes: { active: 0, total: 6 } });
  assert.match(m.subject, /NOT SENDING/);
  assert.doesNotMatch(m.subject, /all running/);
  assert.match(m.text, /6 of 6 inboxes are paused/);
});
test("past go-live and sending, no alarm", () => {
  const m = D.buildDigest({ ...base, pastGoLive: true, sending: true, inboxes: { active: 6, total: 6 } });
  assert.doesNotMatch(m.subject, /NOT SENDING/);
  assert.match(m.text, /Sending is on/);
});
test("no em dashes and a link to the dashboard", () => {
  const m = D.buildDigest({ ...base, held: [{ kind: "x", who: "y", why: "z" }] });
  assert.doesNotMatch(m.subject + m.text, /—/);
  assert.match(m.text, /\/ops\/outreach/);
});
test("channels collapse to their first segment", () => {
  assert.equal(D.channelOf("outreach/AbC"), "outreach");
  assert.equal(D.channelOf("check/acme.com"), "check");
  assert.equal(D.channelOf(null), "direct");
});

test("the stopping rule is reported every day, and says when seeds are missing", () => {
  const testing = { reached: 120, wanted: 0, signups: 0, verdict: "testing", line: "120 of 500 people reached since 2026-11-10." };
  const t = D.buildDigest({ ...base, stop: testing, seeds: 0 }).text;
  assert.match(t, /IS COLD EMAIL WORKING\?/);
  assert.match(t, /120 of 500/);
  assert.match(t, /No seed addresses set/);
  assert.match(D.buildDigest({ ...base, stop: testing, seeds: 2 }).text, /2 seed addresses/);
  const stop = { ...testing, reached: 500, verdict: "stop", line: "STOP POINT REACHED" };
  assert.match(D.buildDigest({ ...base, stop }).subject, /^Small Fish, [^:]+: STOP POINT REACHED/);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall pass");
