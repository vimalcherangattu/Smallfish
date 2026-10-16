/**
 * Sending-domain auth (GTM): a missing or doubled SPF or DMARC record is
 * named; a sound domain says nothing.
 *
 *     node stage0/tests/test_mailauth.mjs
 */
import assert from "node:assert/strict";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};
const { load } = compileLib(["src/lib/mailauth.ts"], "sf-mailauth-");
const M = await load("mailauth");
const SPF = "v=spf1 include:_spf.google.com ~all";
const DMARC = "v=DMARC1; p=none; rua=mailto:dmarc@example.com";

test("a sound domain has no problems", () => {
  assert.deepEqual(M.authProblems({ root: ["google-site-verification=x", SPF], dmarc: [DMARC] }), []);
});
test("no SPF", () => {
  assert.match(M.authProblems({ root: ["google-site-verification=x"], dmarc: [DMARC] })[0], /no SPF/);
});
test("two SPF records count as none", () => {
  assert.match(M.authProblems({ root: [SPF, "v=spf1 include:spf.protection.outlook.com -all"], dmarc: [DMARC] })[0], /2 SPF records/);
});
test("an SPF record that allows nobody", () => {
  assert.match(M.authProblems({ root: ["v=spf1 -all"], dmarc: [DMARC] })[0], /allows no sender/);
});
test("no DMARC", () => {
  assert.match(M.authProblems({ root: [SPF], dmarc: [] })[0], /no DMARC/);
});
test("domains are taken once from the inbox addresses", () => {
  assert.deepEqual(M.domainsOf(["a@Try-Fish.com", "b@try-fish.com", "c@fishmail.co"]), ["fishmail.co", "try-fish.com"]);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall pass");
