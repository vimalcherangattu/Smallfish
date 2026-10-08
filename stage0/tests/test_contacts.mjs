/**
 * Contacts read off a business's own site, and the ways that goes wrong.
 *
 *     node stage0/tests/test_contacts.mjs
 *
 * ## Why this file is mostly about refusing
 *
 * `src/lib/contacts.ts` is a port of
 * `stage0/src/coverage/extract_contacts.py`, which has produced the shipped
 * `contacts-*.json` files since S1-05. The live read did none of it — it
 * fetched the pages, judged the criterion and threw the text away — so every
 * cold-city job came back with the phone Overture listed and no email, ever.
 * That is the half the owner's model rests on: we always read, and when there
 * is no criterion to match, what makes a row worth paying for is that we got
 * usable contact details off it.
 *
 * Every rule below is a bug somebody already found on real pages, which is why
 * the port is transcribed rather than reinvented, and why the assertions are
 * about the numbers and addresses it **declines** to report. Printing a
 * stranger's phone number beside somebody's name is the failure all of this
 * exists to prevent.
 *
 * The parity test at the bottom is the one that keeps this honest: the two
 * word lists are compared against the Python source itself, so the port cannot
 * quietly drift away from the thing it was ported from.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const { load } = compileLib(["src/lib/contacts.ts"], "sf-contacts-");
const C = await load("contacts");

const page = (url, text, links) => ({ url, text, links });

/* ------------------------------------------------------------- phones -- */

test("a number matching the listing is taken, and says so", () => {
  const got = C.phonesIn("Open today. 602-468-1135", "+16024681135");
  assert.equal(got.length, 1);
  assert.equal(got[0].value, "(602) 468-1135");
  assert.match(got[0].how, /matches the phone on the business listing/);
});

test("a bare number with no cue beside it is not a phone number", () => {
  // Prices, addresses, licence numbers and dates all look like this.
  assert.deepEqual(C.phonesIn("Established 1998. 480 221 0000 sq ft", null), []);
});

test("a cue-confirmed number in the listing's area code is taken", () => {
  const got = C.phonesIn("Call us on (602) 221-0199 today", "+16024681135");
  assert.equal(got.length, 1);
  assert.equal(got[0].value, "(602) 221-0199");
  assert.match(got[0].how, /printed next to a word like call or phone/);
});

test("the reserved list is area codes, not exchanges", () => {
  // Written down because the first version of this file got it backwards and
  // asserted that (602) 555-0100 would be refused. 555 is the reserved
  // *exchange*; the rule reads the area code, which is 602, so the number is
  // taken. The rule was right and the test was wrong.
  assert.equal(C.phonesIn("Call (602) 555-0100", "+16024681135").length, 1);
  assert.equal(C.phonesIn("Call (555) 221-0199", null).length, 0);
});

test("the ihs.gov case: a cue-confirmed number in a different area code is refused", () => {
  // The measured finding this rule exists for. "Crain David A Dds" is a
  // Phoenix practice whose Overture record points at a federal health portal,
  // and the number printed beside "call" there is a Maryland one. Reporting it
  // would put a stranger's phone number beside somebody's business name.
  const maryland = C.phonesIn("Please call 301-443-1083 for assistance", "+16024681135");
  assert.deepEqual(maryland, [], "a Maryland number was attributed to a Phoenix practice");
});

test("and with no listed phone to compare against, a cue is enough", () => {
  // A CSV upload has no listing phone. The area-code rule cannot run, so the
  // cue carries it alone rather than the number being dropped.
  const got = C.phonesIn("Call 301-443-1083", null);
  assert.equal(got.length, 1);
});

test("impossible area codes are not numbers", () => {
  for (const bad of ["000", "111", "555", "123"]) {
    assert.deepEqual(C.phonesIn(`Call ${bad}-221-0199`, null), [], `${bad} was accepted`);
  }
  assert.deepEqual(C.phonesIn("Call 012-221-0199", null), []);
});

/* ------------------------------------------------------------- emails -- */

test("an address printed on the page is taken", () => {
  assert.deepEqual(C.emailsIn("Write to Care@24StreetDental.com today"), [
    "Care@24StreetDental.com",
  ]);
});

test("trailing punctuation is not part of the address", () => {
  assert.deepEqual(C.emailsIn("Email hello@practice.com."), ["hello@practice.com"]);
});

test("the platform's own addresses are not the business's", () => {
  // Every Wix and Squarespace page carries these, and none of them reaches a
  // human at the business.
  for (const noise of [
    "someone@wix.com",
    "x@sentry.io",
    "noreply@practice.com",
    "no-reply@practice.com",
    "logo@2x.png",
  ]) {
    assert.deepEqual(C.emailsIn(`Contact ${noise}`), [], `${noise} was reported`);
  }
});

test("a mailto link is taken, and outranks the same address in the text", () => {
  const c = C.contactsFrom({
    pages: [page("https://drferguson.com/", "Ferguson Dental. mail us at hi@drferguson.com", ["mailto:hi@drferguson.com"])],
    business: { name: "Alan Ferguson DDS", addr: "1 Main St, Phoenix, AZ", site: "https://drferguson.com" },
  });
  assert.equal(c.emails.length, 1, "the same address was reported twice");
  assert.equal(c.emails[0].how, "linked as mailto:");
});

/* -------------------------------------------------------- attribution -- */

test("a surname in the domain attributes the page", () => {
  // "ferguson" is exactly the signal that rescues drfergusonaz.com.
  const got = C.attributionOf(
    { name: "Alan Ferguson DDS", addr: "1 Main St, Phoenix, AZ", site: "https://drfergusonaz.com" },
    [page("https://drfergusonaz.com/", "Welcome")],
  );
  assert.equal(got, "named");
});

test("a first name is not distinctive enough to attribute", () => {
  // The exact hole ihs.gov went through: the only name word on a federal
  // health portal was "david".
  assert.deepEqual(C.distinctive("Crain David A Dds").includes("david"), false);
  const got = C.attributionOf(
    { name: "Crain David A Dds", addr: "1 Main St, Phoenix, AZ", site: "https://ihs.gov" },
    [page("https://ihs.gov/phoenix/", "Indian Health Service, Phoenix Area Office. david")],
  );
  // The town is there, so it is town-only — a caveat, not a pass.
  assert.equal(got, "town-only");
});

test("trade words are not distinctive either", () => {
  for (const w of ["dental", "dentistry", "clinic", "family", "smiles", "heating"]) {
    assert.equal(C.distinctive(`${w} center`).includes(w), false, `${w} counted as distinctive`);
  }
});

test("a page naming neither the business nor its town withholds, rather than returning nothing", () => {
  // "we could not tell this page is yours" and "this business publishes
  // nothing" are different answers.
  const c = C.contactsFrom({
    pages: [page("https://promoplace.com/", "Promotional products. Call 602-221-0199")],
    business: { name: "AZ Dental", addr: "1 Main St, Phoenix, AZ", site: "https://promoplace.com" },
  });
  assert.equal(c.attribution, null);
  assert.ok(c.withheld, "nothing was withheld");
  assert.deepEqual(c.phones, [], "a number was reported off an unattributed page");
  assert.match(c.withheld, /cannot tell the page belongs to them/);
});

/* ------------------------------------------------------------ reachable -- */

test("reachable means we actually found a way to reach them", () => {
  const none = { emails: [], phones: [], contactPage: null, socials: [], withheld: null, attribution: "named" };
  assert.equal(C.reachable(none), false);
  assert.equal(C.reachable({ ...none, contactPage: "https://x.com/contact" }), true);
  assert.equal(C.reachable({ ...none, emails: [{ value: "a@b.com", page: "", how: "" }] }), true);
  assert.equal(C.reachable({ ...none, phones: [{ value: "(602) 221-0199", page: "", how: "" }] }), true);
});

/* -------------------------------------------------------------- parity -- */

test("the word lists match the Python this was ported from, exactly", () => {
  // The port is only trustworthy while it stays a port. These two sets are the
  // whole attribution test, and a word drifting out of one of them is how
  // `ihs.gov` got through the first time.
  const py = readFileSync(
    path.join(process.cwd(), "stage0/src/coverage/extract_contacts.py"),
    "utf8",
  );
  const wordsOf = (name) => {
    const m = py.match(new RegExp(`^${name} = set\\(\\s*"""([\\s\\S]*?)"""\\.split\\(\\)`, "m"));
    assert.ok(m, `${name} not found in the Python`);
    return [...new Set(m[1].split(/\s+/).filter(Boolean))].sort();
  };
  assert.deepEqual([...C.GENERIC].sort(), wordsOf("GENERIC"));
  assert.deepEqual([...C.GIVEN_NAMES].sort(), wordsOf("GIVEN_NAMES"));
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
