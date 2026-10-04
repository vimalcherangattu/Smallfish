/**
 * The opening email — the thing the product actually hands over.
 *
 *     node stage0/tests/test_email.mjs
 *
 * Reported on 2026-10-04 as "useless". Three defects, and the first is the one
 * that mattered:
 *
 *   1. **It never said who was writing or what they sold.** `composeMessage`
 *      took only (business, criterion), so the draft ended "Happy to show you
 *      what it would look like" without naming the thing. The recipient could
 *      not reply to it even if they wanted to. `sells` has been captured at
 *      sign-up since P0.3 and simply never reached the draft.
 *   2. **No subject line**, on an email product.
 *   3. **It said the same phrase four times** when the seller's offer was the
 *      same thing as the gap, which is the common case.
 *
 * What is NOT asserted here, because it is not true: that the drafts are
 * deeply personal. Measured the same day — `proof` is populated on all 51
 * `no_match` rows of dental Phoenix and on **none of the 42 matches**. That is
 * the absence-proof rule showing through: you can quote the booking widget you
 * found, you cannot quote the absence of one. Two emails about the same gap in
 * the same trade will read similarly, and pretending otherwise would mean
 * inventing detail about a real business.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(
  [
    "src/lib/leads.ts",
    "src/lib/query.ts",
    "src/lib/outreach.ts",
    "src/lib/billing.ts",
    "src/lib/suppression.ts",
    "src/lib/signals.ts",
    "src/lib/types.ts",
    "src/lib/unlock.ts",
    "src/lib/entitlement.ts",
  ],
  "sf-email-",
);
const L = await load("leads");

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  pass  ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  ${name}: ${err.message}`);
  }
};

const market = JSON.parse(readFileSync("public/data/dental-phoenix.json", "utf8"));
const criterion = market.criteria.find((c) => c.id === "no_online_booking");
const matches = market.businesses.filter(
  (b) => b.verdicts?.no_online_booking?.verdict === "match",
);
const one = matches[0];

console.log(`\n=== ${matches.length} matched businesses to draft for`);

test("there are matches to draft for, or everything below is vacuous", () => {
  assert.ok(matches.length >= 10, `only ${matches.length}`);
});

/* ------------------------------------------------- it can be answered -- */

test("with no offer, the draft never claims what the sender does", () => {
  const e = L.composeEmail(one, criterion, {});
  assert.ok(e, "no draft");
  // The failure this guards: inventing a trade for somebody who never told us.
  assert.ok(
    !/\bI (set up|help|work with|sell|do|offer)\b/i.test(e.body),
    `invented a trade: ${e.body}`,
  );
});

test("with an offer, the draft says what the sender does", () => {
  const e = L.composeEmail(one, criterion, { sells: "online booking" });
  assert.match(e.body, /\bI (set up|help|work with)\b/i);
  assert.ok(e.body.includes("online booking"), "never names the offer");
});

test("and the ask names something, so there is a question to answer", () => {
  const e = L.composeEmail(one, criterion, { sells: "online booking" });
  assert.match(e.body, /worth a short reply\?$/);
});

/* --------------------------------------------------------- a subject -- */

test("every draft carries a subject naming the site", () => {
  let checked = 0;
  for (const b of matches) {
    const e = L.composeEmail(b, criterion, { sells: "online booking" });
    if (!e) continue; // see the thin-site test below
    checked += 1;
    assert.ok(e.subject && e.subject.length > 5, `thin subject for ${b.name}`);
    const domain = (b.site ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (domain) assert.ok(e.subject.includes(domain), `subject omits ${domain}`);
  }
  assert.ok(checked >= 10, `only ${checked} drafts to check`);
});

/* ------------------------------------- a match is not always an email -- */

test("some matched businesses get no draft, and that is visible not silent", () => {
  // Measured 2026-10-04 across all three markets: 3 of 42 (dental Phoenix),
  // 4 of 26 (med spa Dallas) and 6 of 58 (HVAC Tampa) matched businesses have
  // `outcome: "thin"` — the site was reachable but carried too little text to
  // write from. They are matches, so they are billable, and they arrive with
  // **no opening email**.
  //
  // This test does not assert that is correct. It asserts it is *bounded and
  // known*, so that a change which quietly starts writing drafts from nothing,
  // or one which pushes the share up, fails here rather than in somebody's
  // outbox. Roughly one paid row in ten; if that moves, look at it.
  const without = matches.filter((b) => !L.composeEmail(b, criterion, { sells: "x" }));
  const share = without.length / matches.length;
  assert.ok(share < 0.25, `${(share * 100).toFixed(0)}% of matches have no draft`);
  for (const b of without) {
    assert.equal(
      b.read?.outcome,
      "thin",
      `${b.name} has no draft for a reason other than a thin site`,
    );
  }
});

/* ------------------------------------------- it does not repeat itself -- */

test("the offer phrase is not repeated a fourth time when it is also the gap", () => {
  const e = L.composeEmail(one, criterion, { sells: "online booking" });
  const n = (e.body.match(/online booking/gi) ?? []).length;
  // Intro names it, the observation names it. A third and fourth is what made
  // the draft read like a machine wrote it.
  assert.ok(n <= 2, `"online booking" appears ${n} times:\n${e.body}`);
});

/* ------------------------------------------------------ reproducible -- */

test("the same business always gets the same draft", () => {
  const a = L.composeEmail(one, criterion, { sells: "online booking" });
  const b = L.composeEmail(one, criterion, { sells: "online booking" });
  assert.deepEqual(a, b);
});

test("but a list is not forty-two copies of one sentence", () => {
  const intros = new Set();
  const asks = new Set();
  for (const b of matches) {
    const e = L.composeEmail(b, criterion, { sells: "online booking" });
    if (!e) continue;
    const lines = e.body.split("\n\n");
    intros.add(lines[1]);
    asks.add(lines[lines.length - 1]);
  }
  assert.ok(intros.size >= 2, `every intro identical (${intros.size})`);
  assert.ok(asks.size >= 2, `every ask identical (${asks.size})`);
});

/* ------------------------------------------------------ the helpers --- */

test("a typed offer survives being dropped into a sentence", () => {
  for (const [typed, want] of [
    ["online booking", "online booking"],
    ["I set up online booking", "online booking"],
    ["we sell booking systems", "booking systems"],
    ["I help with websites.", "websites"],
  ]) {
    assert.equal(L.offerOf(typed), want, `offerOf(${JSON.stringify(typed)})`);
  }
  assert.equal(L.offerOf(""), null);
  assert.equal(L.offerOf(null), null);
});

test("the town comes off a real address, and refuses an odd one", () => {
  assert.equal(L.townOf("7502 E Camelback Rd, Scottsdale, AZ"), "Scottsdale");
  assert.equal(L.townOf("nonsense"), null);
  assert.equal(L.townOf("12 Main St, 85016, AZ"), null);
});

/* ----------------------------------------------------- still refuses -- */

test("a business whose site was never read gets no draft at all", () => {
  const unread = market.businesses.find(
    (b) => b.verdicts?.no_online_booking?.verdict === "unread",
  );
  assert.ok(unread, "no unread business in this market to check");
  assert.equal(L.composeEmail(unread, criterion, { sells: "online booking" }), null);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
