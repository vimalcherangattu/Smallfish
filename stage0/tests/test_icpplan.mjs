/**
 * An ICP, taken apart into a plan somebody can argue with.
 *
 *     node stage0/tests/test_icpplan.mjs
 *
 * `icpplan.ts` is the spine of the flow the owner specified on 2026-10-08:
 * describe what you sell, get the plan we would actually run, move the checks
 * around, then start the read. These assertions are about the three things
 * that make it worth having rather than about its shape.
 *
 * **Priority decides the size of the answer.** Must-have narrows, nice-to-have
 * reports and never excludes. If both narrowed, the two buckets would be
 * decoration and dragging a check between them would do nothing.
 *
 * **Certainty is a mechanism, not a number.** No percentages are invented here.
 * A presence a detector can see in the page source is `observed`; everything
 * else, and every absence without exception, is `read` — because "absence needs
 * positive proof" means the pages that would show it have to be read, and when
 * they cannot be the answer is "couldn't tell" and never "no". The assertion
 * that an absence is never `observed` is the engineering rule, in a test.
 *
 * **There is one list of what we refuse.** The declines come from
 * `parseSearch`, so a word the search box rejects is rejected here too, with
 * the same reason. Two lists would drift, and the drift shows up as the
 * product refusing "50 employees" on one screen and accepting it on another.
 */

import assert from "node:assert/strict";

import { compileLib } from "./_tsmodules.mjs";

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

const { load } = compileLib(
  [
    "src/lib/icpplan.ts",
    "src/lib/search.ts",
    "src/lib/signals.ts",
    "src/lib/types.ts",
    "src/lib/region.ts",
    "src/lib/query.ts",
  ],
  "sf-icpplan-",
);
const P = await load("icpplan");
const { MAX_CRITERIA } = await load("search");

/* ------------------------------------------------------- it takes an offer -- */

test("an offer that implies a provable gap becomes a must-have", () => {
  const plan = P.planFromOffer("We sell online booking software to dental practices.");
  assert.ok(plan.items.length > 0, "nothing was proposed");
  assert.ok(plan.items.every((i) => i.priority === "must"));
  assert.ok(plan.items.some((i) => i.signalId === "booking"));
  assert.equal(plan.nothingObservable, false);
});

test("and it is an absence, because that is what the offer is needed for", () => {
  // Somebody selling booking wants the practices without it.
  const plan = P.planFromOffer("We sell online booking software to dental practices.");
  const booking = plan.items.find((i) => i.signalId === "booking");
  assert.equal(booking.type, "absence");
  assert.equal(booking.fromOffer, true);
});

test("an offer naming nothing observable says so rather than guessing", () => {
  // The owner's own example: "I sell helpline to gyms in pheonix". A helpline
  // leaves no trace on a website, and inventing a criterion from it would be
  // the one thing this product exists not to do.
  const plan = P.planFromOffer("I sell a helpline to gyms");
  assert.equal(plan.nothingObservable, true);
  assert.equal(plan.items.length, 0);
  // It is still not a dead end: there are checks to choose from.
  assert.ok(plan.available.length > 0);
});

/* --------------------------------------------------------- priority bites -- */

test("must-haves narrow the read and nice-to-haves do not", () => {
  // The whole reason there are two buckets.
  let plan = P.planFromOffer("We sell online booking software.");
  const id = plan.items[0].signalId;
  assert.equal(P.criteriaForRead(plan).length, 1);

  plan = P.setPriority(plan, id, "nice");
  assert.equal(P.criteriaForRead(plan).length, 0, "a nice-to-have must not exclude anybody");
  assert.equal(P.reportedOnly(plan).length, 1, "but it is still reported");

  plan = P.setPriority(plan, id, "must");
  assert.equal(P.criteriaForRead(plan).length, 1);
});

test("the read is capped, and shares the cap with the search box", () => {
  // Every criterion is a read of the pages that settle it, so an uncapped plan
  // is an uncapped bill.
  //
  // **The cap cannot bind today and that is the finding, not the bug.** There
  // are four provable signals in the whole catalogue and `MAX_CRITERIA` is 5,
  // so promoting literally everything still fits. Asserted as a relationship
  // rather than by forcing an overflow, because the first version of this test
  // tried to overflow it, failed, and was pointing at the catalogue the whole
  // time.
  let plan = P.planFromOffer("I sell a helpline to gyms");
  for (const a of [...plan.available]) plan = P.addItem(plan, a.signalId, "must");
  const musts = P.criteriaForRead(plan);
  assert.ok(musts.length <= MAX_CRITERIA, "the cap does not hold");
  assert.equal(musts.length, Math.min(plan.items.length, MAX_CRITERIA));
});

test("the catalogue is as small as it is, out loud", () => {
  // The real ceiling on what any ICP can ask for, pinned so that it moving is
  // a decision somebody makes rather than a drift. It has moved twice in one
  // day and caught both: three that morning, four once `builder` exposed the
  // platform detection that was already running, six once the live read
  // started extracting contacts and "has a phone number" became a search.
  const everything = P.planFromOffer("I sell a helpline to gyms");
  assert.equal(
    everything.available.length,
    6,
    "the provable catalogue changed size, which changes what an ICP can ask for",
  );
});

test("an offer about websites asks for the builder, not for its absence", () => {
  // The defect `offerNeeds` exists for. "We rebuild outdated websites" used to
  // propose "is not on a website builder", which is the opposite of the ask.
  const plan = P.planFromOffer("We rebuild outdated websites for local businesses.");
  const b = plan.items.find((i) => i.signalId === "builder");
  assert.ok(b, "a web design offer proposed nothing about websites");
  assert.equal(b.type, "presence");
  assert.equal(b.text, "is on a website builder");
  // And it is the one check that needs no model.
  assert.equal(b.certainty, "observed");
});

/* ------------------------------------------------------ certainty is honest -- */

test("an absence is never reported as observed", () => {
  // The engineering rule, as an assertion. Not finding a thing is only proof
  // once the pages that would carry it have been read.
  for (const s of ["booking", "quote_form", "chat"]) {
    let plan = P.planFromOffer("booking quote chat");
    const item =
      plan.items.find((i) => i.signalId === s) ?? plan.available.find((i) => i.signalId === s);
    if (!item) continue;
    assert.equal(item.type, "absence");
    assert.equal(item.certainty, "read", `${s} absence claims to be observed`);
  }
});

test("a presence a detector can see is observed, and flipping it moves certainty", () => {
  let plan = P.planFromOffer("We sell online booking software.");
  const id = "booking";
  assert.equal(plan.items.find((i) => i.signalId === id).certainty, "read");
  plan = P.setType(plan, id, "presence");
  const flipped = plan.items.find((i) => i.signalId === id);
  assert.equal(flipped.type, "presence");
  assert.equal(flipped.certainty, "observed", "a script in the page source is seen, not inferred");
  // And the criterion text follows the type, or the plan would describe the
  // opposite of what it runs.
  assert.notEqual(flipped.text, P.planFromOffer("We sell online booking software.").items[0].text);
});

test("certainty is never a number", () => {
  const plan = P.planFromOffer("We sell online booking software.");
  for (const i of [...plan.items, ...plan.available]) {
    assert.ok(["observed", "read"].includes(i.certainty), `invented certainty: ${i.certainty}`);
  }
});

/* -------------------------------------------------------- one refusal list -- */

test("what no website states is declined here exactly as the search box declines it", () => {
  const plan = P.planFromOffer("dental practices with 50+ employees and $2M revenue");
  const sources = plan.declined.map((d) => d.why).join(" ");
  assert.ok(plan.declined.length >= 2, `expected head count and revenue to be refused, got ${plan.declined.length}`);
  assert.match(sources, /staff counts/i);
  assert.match(sources, /revenue/i);
});

test("and a refusal carries the observable thing that gets at the same question", () => {
  const plan = P.planFromOffer("practices with 50+ employees");
  const withProxy = plan.declined.find((d) => d.proxy);
  assert.ok(withProxy, "no proxy offered");
  assert.equal(typeof withProxy.proxy.text, "string");
  // And it says plainly when the proxy is not settleable either, rather than
  // moving the disappointment one screen later.
  assert.equal(typeof withProxy.proxy.provableToday, "boolean");
});

/* ------------------------------------------------- the plain-list lane -- */

test("a plan with no must-haves is a legitimate plan, not an error", () => {
  // The owner's basic lane: an industry in a region, downloaded, no reading.
  const plan = P.planFromOffer("I sell a helpline to gyms");
  assert.equal(P.criteriaForRead(plan).length, 0);
  assert.match(P.describePlan(plan), /without reading them/);
});

test("the summary says what will actually run", () => {
  let plan = P.planFromOffer("We sell online booking software.");
  assert.match(P.describePlan(plan), /a match when it/i);
  // Demote it and the summary stops promising to exclude anybody.
  plan = P.setPriority(plan, plan.items[0].signalId, "nice");
  assert.match(P.describePlan(plan), /nothing is excluded/i);
});

/* ------------------------------------------------------------- moving parts -- */

test("dropping a check puts it back on the shelf", () => {
  let plan = P.planFromOffer("We sell online booking software.");
  const id = plan.items[0].signalId;
  plan = P.dropItem(plan, id);
  assert.equal(plan.items.find((i) => i.signalId === id), undefined);
  assert.ok(plan.available.some((i) => i.signalId === id), "it vanished instead of returning");
});

test("adding one twice does not duplicate it", () => {
  let plan = P.planFromOffer("I sell a helpline to gyms");
  const id = plan.available[0].signalId;
  plan = P.addItem(plan, id, "must");
  plan = P.addItem(plan, id, "must");
  assert.equal(plan.items.filter((i) => i.signalId === id).length, 1);
});

test("editing never mutates the plan it was given", () => {
  // It is edited in the browser and saved, so a mutation here is a saved ICP
  // that disagrees with the screen that saved it.
  const plan = P.planFromOffer("We sell online booking software.");
  const before = JSON.stringify(plan);
  P.setPriority(plan, plan.items[0].signalId, "nice");
  P.dropItem(plan, plan.items[0].signalId);
  P.setType(plan, plan.items[0].signalId, "presence");
  assert.equal(JSON.stringify(plan), before);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
