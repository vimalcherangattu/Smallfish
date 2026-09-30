/**
 * The four messages, measured without sending one (P0.5).
 *
 *     node stage0/tests/test_mail.mjs
 *
 * Email is the only thing this product produces that cannot be corrected after
 * it ships. A wrong number on a screen is fixed by a deploy; a wrong number in
 * eight hundred inboxes is not. So every message is a pure function of its
 * arguments, and this measures the things that are expensive in an inbox:
 *
 * - **No unsubscribe link is the one unforgivable defect.** A product whose
 *   whole argument is that it emails businesses honestly cannot send its own
 *   customers mail they have no way to stop. Every message, including the one
 *   the person explicitly asked for by leaving their address — "you asked for
 *   this" is the argument every unwanted sender makes.
 * - **No template holes.** `undefined`, `NaN`, `[object Object]`, a doubled
 *   article, a stranded comma. These are what a missing argument looks like
 *   when nobody rendered the message.
 * - **No engine vocabulary.** "Verdict", "criterion", "couldn't tell",
 *   "unlocked", "market" are how the measurement rig talks. `test_leads.mjs`
 *   holds this rule for the screen; the rule does not stop at the screen.
 * - **The digest does not send when nothing happened.** A weekly email that
 *   says "no change this week" teaches people to filter the sender, and then
 *   the week something does change they do not see it.
 * - **Nothing claims to have sent anything.** There is no provider on this
 *   deployment, and `sendMail` has to say so rather than resolving quietly.
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/mail.ts"], "sfmail-");
const M = await load("mail");

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
const atest = async (name, fn) => {
  try {
    await fn();
    console.log(`  pass  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
};

const SITE = "https://getsmallfish.com";
const TO = "person@example.com";

/** Every message this product can send, built with ordinary arguments. */
const all = () => [
  ["welcome", M.welcomeEmail({ email: TO, siteUrl: SITE, credits: 20, query: "dental practices in Phoenix that has no online booking" })],
  ["welcome (no door)", M.welcomeEmail({ email: TO, siteUrl: SITE, credits: 20, query: null })],
  ["nudge", M.nudgeEmail({ email: TO, siteUrl: SITE, credits: 20, waiting: 39, query: "med spas in Dallas that have no online booking" })],
  ["nudge (never searched)", M.nudgeEmail({ email: TO, siteUrl: SITE, credits: 20, waiting: null, query: null })],
  ["digest", M.digestEmail({ email: TO, siteUrl: SITE, lines: [{ query: "HVAC companies in Tampa that have no quote form", added: 7 }, { query: "dental practices in Phoenix that has no online booking", added: 2 }] })],
];

/* ------------------------------------------------------ the unforgivable -- */

for (const [name, msg] of all()) {
  test(`${name}: carries a way to stop them`, () => {
    assert.ok(msg.text.includes("/opt-out"), "no opt-out link in the body");
    assert.ok(
      msg.text.includes(encodeURIComponent(TO)),
      "the opt-out link does not carry the address, so it cannot act on anything",
    );
  });
}

/* ------------------------------------------------------- template holes -- */

const HOLES = [
  ["undefined", /\bundefined\b/],
  ["null", /\bnull\b/],
  ["NaN", /\bNaN\b/],
  ["[object Object]", /\[object Object\]/],
  ["a doubled article", /\b(an?) \1\b|\bno an? \b/i],
  ["a stranded comma or full stop", /\s[,.]|,,|\.\./],
  ["an empty link", /https?:\/\/\s|\/app\?q=\s*$/m],
];

for (const [name, msg] of all()) {
  for (const [hole, re] of HOLES) {
    test(`${name}: no ${hole}`, () => {
      const found = `${msg.subject}\n${msg.text}`.match(re);
      assert.ok(!found, `found ${JSON.stringify(found?.[0])}`);
    });
  }
  test(`${name}: the subject is a sentence, not a template`, () => {
    assert.ok(msg.subject.length > 8 && msg.subject.length < 90, `${msg.subject.length} chars`);
    assert.ok(!/[{}<>]|\$\{/.test(msg.subject), msg.subject);
  });
}

/* ------------------------------------------------------- our vocabulary -- */

for (const [name, msg] of all()) {
  for (const word of ["verdict", "criterion", "couldn't tell", "unlocked", "no_match", "band "]) {
    test(`${name}: never says "${word.trim()}"`, () =>
      assert.ok(
        !`${msg.subject} ${msg.text}`.toLowerCase().includes(word),
        `"${word.trim()}" is how the engine talks`,
      ));
  }
}

/* -------------------------------------------------------- what they say -- */

test("the welcome leads with the list the door promised, not with features", () => {
  const m = M.welcomeEmail({
    email: TO,
    siteUrl: SITE,
    credits: 20,
    query: "dental practices in Phoenix that has no online booking",
  });
  const first = m.text.split("\n\n")[0];
  assert.ok(first.includes("dental practices in Phoenix"), first);
  assert.ok(m.text.includes("/app?q=dental"), "no link to the list they came from");
  assert.ok(m.text.includes("20 credits"), "does not say what they can spend");
});

test("and states the two things that are always free", () => {
  const t = M.welcomeEmail({ email: TO, siteUrl: SITE, credits: 20, query: null }).text;
  assert.ok(/did not fit/.test(t), "never mentions that non-matches are free");
  assert.ok(/could not read/.test(t), "never mentions that couldn't-read is free");
  assert.ok(/refund/.test(t), "never mentions the refund, which is the trust move");
});

test("the nudge names what is waiting rather than asking how it is going", () => {
  const t = M.nudgeEmail({
    email: TO,
    siteUrl: SITE,
    credits: 20,
    waiting: 39,
    query: "med spas in Dallas that have no online booking",
  });
  assert.ok(t.subject.startsWith("39 "), t.subject);
  assert.ok(!/how are you getting on|just checking|circling back/i.test(t.text), t.text);
});

test("a digest is only worth sending when something changed", () => {
  assert.equal(M.hasNews([{ query: "x", added: 0 }, { query: "y", added: 0 }]), false);
  assert.equal(M.hasNews([{ query: "x", added: 0 }, { query: "y", added: 1 }]), true);
  assert.equal(M.hasNews([]), false);
});

test("the digest counts every line it shows, and shows no empty one", () => {
  const m = M.digestEmail({
    email: TO,
    siteUrl: SITE,
    lines: [
      { query: "HVAC companies in Tampa that have no quote form", added: 7 },
      { query: "nothing new here", added: 0 },
      { query: "dental practices in Phoenix that has no online booking", added: 2 },
    ],
  });
  assert.ok(m.subject.startsWith("9 new"), m.subject);
  assert.ok(!m.text.includes("nothing new here"), "a line with no news is still in the body");
  // Biggest first: the reason to open the email should be the first thing in it.
  assert.ok(m.text.indexOf("7 new") < m.text.indexOf("2 new"), "not ordered by size");
});

test("one business is singular, in the subject a person actually reads", () => {
  const m = M.digestEmail({ email: TO, siteUrl: SITE, lines: [{ query: "q", added: 1 }] });
  assert.equal(m.subject, "1 new business this week");
});

/* -------------------------------------------------------------- the week -- */

test("the ISO week is the ISO week, including the years it straddles", () => {
  // 2027-01-01 is a Friday, which ISO puts in the last week of 2026 — the case
  // every hand-rolled week number gets wrong, and the one that would make a
  // digest send twice in a row or not at all over new year.
  assert.equal(M.isoWeek(new Date("2027-01-01T12:00:00Z")), "2026-W53");
  assert.equal(M.isoWeek(new Date("2026-01-01T12:00:00Z")), "2026-W01");
  assert.equal(M.isoWeek(new Date("2026-09-30T12:00:00Z")), "2026-W40");
  // Monday and Sunday of one week share a key, or the digest fires twice.
  assert.equal(
    M.isoWeek(new Date("2026-09-28T00:00:00Z")),
    M.isoWeek(new Date("2026-10-04T23:59:00Z")),
  );
});

/* ------------------------------------------------------------ the sender -- */

await atest("with no provider, nothing claims to have sent anything", async () => {
  delete process.env.RESEND_API_KEY;
  const r = await M.sendMail(TO, { subject: "s", text: "t" });
  assert.equal(r.sent, false);
  assert.ok(/RESEND_API_KEY/.test(r.why ?? ""), r.why);
  assert.equal(M.mailConfigured(), false);
});

await atest("and an address that is not one is refused before the network", async () => {
  const r = await M.sendMail("not-an-address", { subject: "s", text: "t" });
  assert.equal(r.sent, false);
  assert.ok(!/RESEND/.test(r.why ?? ""), "checked the key before the address");
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
