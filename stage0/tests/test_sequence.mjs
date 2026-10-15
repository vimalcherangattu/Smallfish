/**
 * The cold sequence, its gates, and the rules for answering replies.
 *
 *     node stage0/tests/test_sequence.mjs
 *
 * Nothing here calls Instantly or a model. What it holds is what a person
 * would check before letting a machine write to strangers in their name:
 * who may be written to, what the email may say, and when a reply gets an
 * answer, a block, or silence.
 */

import assert from "node:assert/strict";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};

const { load } = compileLib(["src/lib/sequence.ts", "src/lib/replies.ts", "src/lib/pricing.ts"], "sf-seq-");
const S = await load("sequence");
const R = await load("replies");
const { PLANS } = await load("pricing");

const ok = {
  domain: "acme.com", name: "Acme Dental Marketing | Grow your practice", email: "jane@acme.com",
  niche: "dental", city: "Phoenix", state: "AZ", status: "found", list_token: "AbCdEfGhJk",
  list_query: "dentists in Phoenix, AZ that have no online booking", list_readable: 1200, list_listings: 1400,
};
const none = { suppressedDomains: new Set(), suppressedEmails: new Set() };

await test("a prepared prospect with an address may be written to", () => assert.equal(S.blocked(ok, none), null));
await test("no address, no niche, no list, no send", () => {
  assert.match(S.blocked({ ...ok, email: null }, none), /no address/);
  assert.match(S.blocked({ ...ok, niche: null }, none), /no niche/);
  assert.match(S.blocked({ ...ok, list_token: null }, none), /not prepared/);
});
await test("anyone already queued, replied or suppressed is never queued again", () => {
  for (const status of ["queued", "replied", "interested", "suppressed", "bounced"]) assert.ok(S.blocked({ ...ok, status }, none));
});
await test("info@ and other role addresses are never queued", () => {
  for (const e of ["info@acme.com", "hello@acme.com", "contact@acme.com", "Sales@acme.com"]) assert.match(S.blocked({ ...ok, email: e }, none), /generic/);
  assert.equal(S.blocked({ ...ok, email: "viktoria@acme.com" }, none), null);
});

await test("a suppressed address or domain blocks", () => {
  assert.match(S.blocked(ok, { ...none, suppressedEmails: new Set(["jane@acme.com"]) }), /address asked/);
  assert.match(S.blocked(ok, { ...none, suppressedDomains: new Set(["acme.com"]) }), /domain asked/);
});
await test("a city with almost none of the trade is not worth an email", () => assert.match(S.blocked({ ...ok, list_readable: 5 }, none), /too few/));

await test("company names are cut to the name, not the slogan", () => {
  assert.equal(S.companyName("Acme Dental Marketing | Grow your practice", "acme.com"), "Acme Dental Marketing");
  assert.equal(S.companyName("We are the best dental marketing agency in all of Arizona, period", "acme.com"), "Acme");
  assert.equal(S.companyName(null, "comradeweb.com"), "Comradeweb");
});

await test("every variable the copy uses is supplied per lead", () => {
  const vars = S.leadVariables(ok, "https://www.getsmallfish.com", { niche: "dentists", gap: "online booking" });
  const builtIn = new Set(["companyName", "sendingAccountFirstName"]);
  for (const st of S.STEPS) for (const m of `${st.subject} ${st.body}`.matchAll(/\{\{(\w+)\}\}/g)) {
    assert.ok(builtIn.has(m[1]) || m[1] in vars, `{{${m[1]}}} has no value`);
  }
  assert.equal(vars.listUrl, "https://www.getsmallfish.com/hi/AbCdEfGhJk");
  assert.match(vars.signUpUrl, /\/app\/find\?source=outreach%2FAbCdEfGhJk/);
});

await test("the copy has the address, a way to stop, no dash, and no call", () => {
  for (const st of S.STEPS) {
    assert.match(st.body, /Mabelle Ave/);
    assert.match(st.body, /Reply "no"/);
    assert.doesNotMatch(`${st.subject}${st.body}`, /—/);
    assert.doesNotMatch(st.body, /\b(demo|meeting|calendly|(book|schedule|hop on|jump on|quick) a call)\b/i, "never offers a call or demo with us");
  }
});

await test("the seller copy greets by first name and uses only supplied variables", () => {
  const vars = S.leadVariables(ok, "https://www.getsmallfish.com", { niche: "dentists", gap: "online booking" });
  const builtIn = new Set(["companyName", "sendingAccountFirstName", "firstName"]);
  for (const st of S.SELLER_STEPS) {
    for (const m of `${st.subject} ${st.body}`.matchAll(/\{\{(\w+)\}\}/g)) assert.ok(builtIn.has(m[1]) || m[1] in vars, `{{${m[1]}}}`);
    assert.match(st.body, /Mabelle Ave/);
    assert.doesNotMatch(`${st.subject}${st.body}`, /—/);
    assert.doesNotMatch(st.body, /\b(demo|meeting|calendly|(book|schedule|hop on|jump on|quick) a call)\b/i, "never offers a call or demo with us");
  }
  assert.equal(S.campaignFor("seller").steps, S.SELLER_STEPS);
  assert.equal(S.campaignFor("agency").steps, S.STEPS);
});

await test("new people a day: three emails each, rounded up", () => {
  assert.equal(S.newLeadsPerDay(0, 6), 0);
  assert.equal(S.newLeadsPerDay(5, 6), 10);
  assert.equal(S.newLeadsPerDay(25, 6), 50);
});

await test("nothing sends before go-live, then the ramp climbs and holds", () => {
  assert.equal(S.dailyPerInbox("2026-10-20"), 0);
  assert.equal(S.dailyPerInbox(S.GO_LIVE), S.RAMP[0]);
  assert.equal(S.dailyPerInbox("2026-11-10"), S.RAMP[1]);
  assert.equal(S.dailyPerInbox("2027-06-01"), S.RAMP.at(-1));
});

/* ------------------------------------------------------------ replies -- */

const ctx = { company: "Acme", niche: "dentists", city: "Phoenix", listUrl: "https://x/hi/a", signUpUrl: "https://x/sign-up", sender: "Dipti", site: "https://x" };
const model = (obj) => async () => JSON.stringify(obj);
const never = async () => { throw new Error("the model should not have been asked"); };

await test("'no' on its own, or any stop phrase, blocks without asking the model", async () => {
  for (const said of ["no", "No.", "Please remove me from your list", "not interested, thanks", "STOP emailing me"]) {
    const d = await R.decide(ctx, "", said, 0, never);
    assert.equal(d.intent, "unsubscribe", said);
    assert.equal(d.reply, null);
  }
});

await test("'no problem, how much is it?' is a question, not a stop", async () => {
  assert.equal(R.plainlyStop("No problem. How much does it cost?"), false);
});

await test("a question gets an answer from the sheet", async () => {
  const d = await R.decide(ctx, "", "How much is it?", 0, model({ intent: "question", reply: `The first ${PLANS[0].credits} are free. Starter is $29 a month.` }));
  assert.equal(d.intent, "question");
  assert.match(d.reply, /\$29/);
});

await test("a made-up price is held, not sent", async () => {
  const d = await R.decide(ctx, "", "Price?", 0, model({ intent: "question", reply: "It's $9 a month." }));
  assert.equal(d.reply, null);
  assert.match(d.held, /price/);
});

await test("a draft offering a call or demo is held", async () => {
  const d = await R.decide(ctx, "", "Tell me more", 0, model({ intent: "interested", reply: "Happy to hop on a call this week." }));
  assert.equal(d.reply, null);
});

await test("em dashes are swapped out of anything sent", async () => {
  const d = await R.decide(ctx, "", "Interesting", 0, model({ intent: "interested", reply: "Yes — it reads their sites." }));
  assert.doesNotMatch(d.reply, /—/);
});

await test("three automated answers per thread, then silence", async () => {
  const d = await R.decide(ctx, "", "One more question", 3, never);
  assert.equal(d.reply, null);
});

await test("another city or trade gets a ready search link", () => {
  const html = R.otherListReply(ctx, "roofers", "Denver");
  assert.match(html, /roofers/);
  assert.match(html, /Denver/);
  assert.match(html, /\/app\/find\?source=outreach%2Freply/);
});

await test("a model that answers nonsense sends nothing", async () => {
  const d = await R.decide(ctx, "", "hello", 0, async () => "I think so");
  assert.equal(d.reply, null);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall pass");
