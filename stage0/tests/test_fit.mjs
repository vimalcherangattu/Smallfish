/**
 * The blind row, and what a credit may be spent on.
 *
 *     node stage0/tests/test_fit.mjs
 *
 * ## What this is guarding
 *
 * Three of the owner's decisions of 2026-10-15 meet in `fit.ts`, and each one
 * is the kind that fails silently and expensively:
 *
 * 1. **A credit buys a reveal the customer chose**, not a verdict we reached.
 *    The failure mode is billing for a row nobody asked to see.
 * 2. **An unreadable business is not shown and never billed.** The failure mode
 *    is asserting "no" about a business whose site we never opened — which 42%
 *    of production reads would have done.
 * 3. **A blind row names nobody.** The failure mode is a leak, and the leak
 *    that matters is not the name field: it is a verbatim quote, which is a
 *    search string that finds the business in one query.
 *
 * So most of this file is about refusals, and the properties are asserted
 * rather than the examples — `test_leads.mjs` learned that the hard way when
 * every one of 62 test files passed a city that belonged to its market and none
 * of them caught `marketFor` answering for the wrong one.
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

const { load } = compileLib(["src/lib/fit.ts"], "sf-fit-");
const F = await load("fit");

/* ------------------------------------------------------------- fixtures -- */

const must = (id, source = "website") => ({ id, text: `rule ${id}`, source, must: true });
const nice = (id, source = "website") => ({ id, text: `rule ${id}`, source, must: false });
const ok = (id) => ({ ruleId: id, passed: true });
const no = (id) => ({ ruleId: id, passed: false });
const dunno = (id) => ({ ruleId: id, passed: null });

const reach = { phone: "(512) 555-0142", email: "hello@example.com" };
const phoneOnly = { phone: "(512) 555-0142", email: null };
const unreachable = { phone: null, email: null };

const judged = (outcomes, pagesRead = 3, extra = {}) => ({
  businessId: "b1",
  outcomes,
  why: "Their booking page asks people to ring during office hours.",
  evidence: "Call us on (512) 555-0142 to book",
  pagesRead,
  ...extra,
});

/* ----------------------------------------------- unreadable is not "no" -- */

test("a site we could not open is unreadable, never no", () => {
  // The whole of the absence-proof rule, in the one place it now has to hold.
  // 20 of 48 production reads looked exactly like this.
  assert.equal(F.fitFrom([must("a")], [dunno("a")], 0), "unreadable");
  assert.equal(F.fitFrom([must("a")], [], 0), "unreadable");
});

test("and a site we opened but learned nothing from is also unreadable", () => {
  // "Maybe" here would be a guess wearing a label, and it would be billable.
  assert.equal(F.fitFrom([must("a"), nice("b")], [dunno("a"), dunno("b")], 4), "unreadable");
});

test("the two unreadable cases are distinguishable to a customer", () => {
  // Our failure to fetch and their site's silence are different sentences, and
  // only one of them is about them.
  const noPages = F.withheld("unreadable", reach, 0);
  const noAnswer = F.withheld("unreadable", reach, 4);
  assert.notEqual(noPages, noAnswer);
  assert.match(noPages, /could not open/);
  assert.match(noAnswer, /did not settle/);
});

test("a listing-only rule does not need their website at all", () => {
  // "4+ stars" is settled off the listing. Zero pages is not an obstacle, and
  // treating it as one would throw away every rule the pre-filter can answer.
  assert.equal(F.fitFrom([must("a", "listing")], [ok("a")], 0), "strong");
});

test("unreadable is never shown and never billable", () => {
  assert.equal(F.shown("unreadable"), false);
  assert.equal(F.billable("unreadable", reach), false);
  for (const f of ["strong", "maybe", "no"]) assert.equal(F.shown(f), true);
});

/* --------------------------------------------------------- the only "no" -- */

test("only a disproved must-have is a no", () => {
  assert.equal(F.fitFrom([must("a")], [no("a")], 3), "no");
});

test("a failed nice-to-have is not a no, it is a maybe", () => {
  // A nice-to-have is reported and never excludes — the owner's call of
  // 2026-10-08, which PRD v2 did not revisit. Getting this wrong would drop
  // real matches for failing something the user said they did not require.
  assert.equal(F.fitFrom([nice("a"), nice("b")], [ok("a"), no("b")], 3), "maybe");
  assert.equal(F.fitFrom([must("a"), nice("b")], [ok("a"), no("b")], 3), "strong");
});

test("an unsettled must-have is a maybe, which is the uncertainty being priced", () => {
  assert.equal(F.fitFrom([must("a"), must("b")], [ok("a"), dunno("b")], 3), "maybe");
  assert.equal(F.fitFrom([must("a"), must("b")], [ok("a"), ok("b")], 3), "strong");
});

test("no rules at all is the basic lane, and a read is enough", () => {
  // "We always read" — a trade in an area, taken as it comes. Reachability is
  // what makes it worth paying for, and `billable` is where that is enforced.
  assert.equal(F.fitFrom([], [], 2), "strong");
  assert.equal(F.fitFrom([], [], 0), "unreadable");
});

/* ------------------------------------------------- the outcomes win -- */

test("a model label the outcomes disprove is overruled", () => {
  // The expensive failure: the model says strong, the required rule failed, and
  // somebody pays a credit for our mistake.
  assert.equal(F.reconcile("strong", [must("a")], [no("a")], 3), "no");
  assert.equal(F.reconcile("strong", [must("a")], [dunno("a")], 0), "unreadable");
});

test("but a more cautious model label is kept", () => {
  // It read the page and the booleans did not. Caution is information.
  assert.equal(F.reconcile("maybe", [must("a")], [ok("a")], 3), "maybe");
  assert.equal(F.reconcile("no", [must("a")], [ok("a")], 3), "no");
});

test("and a missing model label is simply the outcomes", () => {
  assert.equal(F.reconcile(null, [must("a")], [ok("a")], 3), "strong");
});

test("reconcile never invents confidence out of an unreadable row", () => {
  for (const proposed of ["strong", "maybe", "no", null]) {
    assert.equal(F.reconcile(proposed, [must("a")], [], 0), "unreadable");
  }
});

/* ---------------------------------------------------------- the strength -- */

test("strength counts what we settled, not what was asked", () => {
  // A denominator that includes what we could not check reads as a failure we
  // cannot support.
  const s = F.strength([must("a"), must("b"), nice("c")], [ok("a"), ok("b"), dunno("c")]);
  assert.equal(s.met, 2);
  assert.equal(s.of, 2);
  assert.equal(s.asked, 3);
  assert.equal(s.unchecked, 1);
});

test("and says so when something could not be checked", () => {
  const label = F.strengthLabel([must("a"), nice("b")], [ok("a"), dunno("b")]);
  assert.match(label, /meets 1 of your 1/);
  assert.match(label, /1 we could not check/);
});

test("the strength is never rendered as a percentage", () => {
  // The owner asked for "by what percentage"; PRD v2 says fit is "a label,
  // never a number", and they also said stick to the PRD. A count of their own
  // rules is the honest form, and the integers are exposed so a component can
  // choose. What must not happen is this file inventing a confidence figure.
  const label = F.strengthLabel([must("a"), must("b")], [ok("a"), ok("b")]);
  assert.ok(!label.includes("%"), "strength label carries a percentage");
  assert.ok(!/\b\d+(\.\d+)?\s*(percent|confident)\b/i.test(label));
  assert.match(label, /meets 2 of your 2/);
});

test("nothing settled says nothing rather than zero of zero", () => {
  assert.match(F.strengthLabel([must("a")], [dunno("a")]), /nothing we could check/);
});

/* --------------------------------------------- what a credit may buy -- */

test("a maybe is billable, because the customer decides", () => {
  // The owner: "Give the user the option to actually decide if they want to
  // take it or leave it, even if it's a maybe."
  assert.equal(F.billable("maybe", reach), true);
  assert.equal(F.billable("strong", reach), true);
});

test("a no is never billable", () => {
  assert.equal(F.billable("no", reach), false);
});

test("a business with no phone and no email is shown and cannot be charged for", () => {
  // PRD v2's own measure: a fit you cannot reach is useless. The judgement may
  // still be worth seeing, so it is not hidden — it is just not for sale.
  assert.equal(F.billable("strong", unreachable), false);
  assert.equal(F.shown("strong"), true);
  assert.match(F.withheld("strong", unreachable, 3), /nobody to call/);
});

test("a phone is enough on its own", () => {
  assert.equal(F.billable("strong", phoneOnly), true);
  assert.equal(F.withheld("strong", phoneOnly, 3), null);
});

/* ------------------------------------------------------- the blind row -- */

test("a blind row carries no name, domain, contact or quote", () => {
  const row = F.blindRow(
    judged([ok("a")]),
    { cat: "Hair salon", town: "East Austin" },
    [must("a")],
    reach,
  );
  const flat = JSON.stringify(row);
  // The quote is the one most likely to be forgotten, and it is the leak that
  // matters: a verbatim sentence finds the business in one search.
  assert.ok(!flat.includes("Call us on"), "the verbatim evidence leaked");
  assert.ok(!flat.includes("hello@example.com"), "the email leaked");
  assert.ok(!flat.includes("555-0142"), "the phone leaked");
  for (const k of ["name", "site", "domain", "phone", "email", "evidence", "addr"]) {
    assert.ok(!(k in row), `the blind row carries ${k}`);
  }
});

test("but it keeps what is true of the market and names nobody", () => {
  const row = F.blindRow(
    judged([ok("a")]),
    { cat: "Hair salon", town: "East Austin" },
    [must("a")],
    phoneOnly,
  );
  assert.equal(row.cat, "Hair salon");
  assert.equal(row.town, "East Austin");
  assert.equal(row.hasPhone, true);
  assert.equal(row.hasEmail, false);
  assert.equal(row.pagesRead, 3);
  assert.equal(row.fit, "strong");
  assert.equal(row.billable, true);
  assert.match(row.strength, /meets 1 of your 1/);
  // The generalised sentence is the one that may travel.
  assert.match(row.why, /ring during office hours/);
});

test("the blind row is built by construction, so a new field cannot leak", () => {
  // A `delete row.name` version of this leaks the first time somebody adds
  // `ownerName` to the source. Passing an object stuffed with identifying
  // fields proves the projection is a whitelist and not a blacklist.
  const row = F.blindRow(
    judged([ok("a")], 3, {
      name: "Lucky Shears Salon",
      site: "luckyshears.com",
      ownerName: "Maria Lopez",
      mapsUrl: "https://maps.google.com/?cid=1",
    }),
    { cat: "Hair salon", town: "East Austin" },
    [must("a")],
    reach,
  );
  const flat = JSON.stringify(row);
  for (const leak of ["Lucky Shears", "luckyshears.com", "Maria Lopez", "maps.google.com"]) {
    assert.ok(!flat.includes(leak), `${leak} reached the blind row`);
  }
});

test("an unreadable business produces a row that says why and is not for sale", () => {
  const row = F.blindRow(
    judged([dunno("a")], 0),
    { cat: "Gym", town: "Dallas" },
    [must("a")],
    reach,
  );
  assert.equal(row.fit, "unreadable");
  assert.equal(row.billable, false);
  assert.match(row.withheld, /could not open/);
});

/* ---------------------------------------------------------- the opener -- */

test("no email means no email draft", () => {
  // The owner: "when email ID not available, what's the point of generating
  // email? ... Generate icebreaker should be the point for ones with only phone"
  assert.equal(F.openerFor(reach), "email");
  assert.equal(F.openerFor(phoneOnly), "call");
  assert.equal(F.openerFor(unreachable), "none");
});

test("and the label never offers an email to somebody with only a phone", () => {
  assert.ok(!/email/i.test(F.openerLabel(F.openerFor(phoneOnly))));
  assert.match(F.openerLabel("call"), /call opener/i);
  assert.match(F.openerLabel("none"), /no phone or email/i);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
