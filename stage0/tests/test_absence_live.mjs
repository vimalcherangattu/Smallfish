/**
 * The live judge can actually settle an absence.
 *
 *     node stage0/tests/test_absence_live.mjs
 *
 * ## The defect
 *
 * A real run, shown by the owner: "Gyms in Dallas that has no live chat",
 * **0 fit of 1 judged**. Almost no small gym has live chat, so that criterion
 * should match nearly everything it reads. It matched nothing, and so did "no
 * online booking" before it, 0 of 4.
 *
 * Two guards in `judge` combined to make an absence criterion **unable to
 * match at all**:
 *
 *   1. **Every verdict had to carry a verbatim quote from the page.** For an
 *      absence, a match asserts the thing is *missing*, and no website
 *      publishes a sentence saying so. The model could only refuse to answer,
 *      or invent a quote that then failed the containment check. Either way:
 *      couldn't tell.
 *   2. **`pages < 2` refused an absence on a one-page site.** A small business
 *      is usually a one-page site.
 *
 * ## It was stricter than the engine Stage 0 measured
 *
 * `stage0/src/engine/absence.py` has had the right rule since S0-13 and the
 * live path never implemented it. It asks for no quote to prove an absence,
 * and `homepage_is_whole_site` says in as many words that a complete one-page
 * site passes: "there is no second page to read and no other page the
 * criterion could be hiding on". So this is not a new policy, it is the live
 * judge being brought in line with the measured one — which also means
 * `test_absence.py` still describes what runs.
 *
 * CLAUDE.md states the rule the fix implements: *"A 'no X' verdict requires
 * that the X-relevant pages were read and no signal was found. Missing
 * evidence is 'couldn't tell', never 'no'."* Coverage, not a quote.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { code } from "./_source.mjs";
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
  ["src/lib/read.ts", "src/lib/seller.ts", "src/lib/signals.ts", "src/lib/types.ts", "src/lib/contacts.ts"],
  "sf-absence-",
);
const R = await load("read");

/* ------------------------------------------------------------- polarity -- */

test("for a 'has no X' criterion, a match asserts X is missing", () => {
  // The distinction the whole fix turns on. Getting this backwards would ask
  // for a quote proving a negative, which is where it started.
  assert.equal(R.assertsPresence("absence", "match"), false);
  assert.equal(R.assertsPresence("absence", "no_match"), true);
});

test("and for a 'has X' criterion it is the other way round", () => {
  assert.equal(R.assertsPresence("presence", "match"), true);
  assert.equal(R.assertsPresence("presence", "no_match"), false);
});

/* ------------------------------------------------------------- coverage -- */

test("a one-page site can prove an absence", () => {
  // The guard that was failing every small business. Nothing was linked that
  // would show the thing, so the home page is the whole site.
  assert.equal(R.coverageProvesAbsence({ targeted: 0, reached: 0 }), true);
});

test("but finding the pages that would show it and reaching none does not", () => {
  // This is the real "we did not look in the right place".
  assert.equal(R.coverageProvesAbsence({ targeted: 3, reached: 0 }), false);
});

test("reaching some of them is enough", () => {
  assert.equal(R.coverageProvesAbsence({ targeted: 3, reached: 1 }), true);
});

/* ---------------------------------------------------------------- proof -- */

test("the absence proof is the pages we opened, not a sentence off them", () => {
  const p = R.absenceProof("live chat", ["https://gym.com/", "https://gym.com/contact"]);
  assert.match(p, /No live chat on 2 pages/);
  assert.match(p, /https:\/\/gym\.com\/contact/);
  assert.match(p, /No live chat script on any of them/);
});

test("and it reads correctly for a one-page site", () => {
  const p = R.absenceProof("live chat", ["https://gym.com/"]);
  assert.match(p, /the one page this site has/);
});

/* ------------------------------------------------- the judge uses them -- */

const judge = code(readFileSync(path.join(process.cwd(), "src/lib/read.ts"), "utf8"));

test("a quote is demanded only when the verdict says something is there", () => {
  assert.match(judge, /const assertsPresent = assertsPresence\(criterion\.type, verdict\)/);
  assert.match(judge, /if \(assertsPresent\) \{/);
  // And the containment check lives inside that branch, not above it.
  const branch = judge.indexOf("if (assertsPresent) {");
  const check = judge.indexOf("flat(read.text).includes(flat(proof))");
  // Both must exist, or `indexOf` returns -1 and the comparison below is
  // vacuously true — which is exactly what a mutation of the branch produced.
  assert.ok(branch >= 0, "the presence branch is gone");
  assert.ok(check >= 0, "the quote containment check is gone");
  assert.ok(check > branch, "the quote check still runs for every verdict");
});

test("the old pages < 2 rule is gone", () => {
  assert.ok(
    !/read\.result\.pages < 2/.test(judge),
    "the one-page guard that refused every small business is still there",
  );
  assert.match(judge, /coverageProvesAbsence\(read\.coverage\)/);
});

test("the prompt stops asking for a quote that cannot exist", () => {
  assert.match(judge, /Do not\s*` \+\s*`invent a sentence saying it is missing; no website says that/);
  assert.match(judge, /leave "proof" empty/);
});

test("the detector still overrides the model when it finds the thing", () => {
  // A vendor script on the page beats a model saying the thing is absent. This
  // is the direction that protects against a false match, which is the one
  // failure the product document says destroys trust.
  const after = judge.slice(judge.indexOf("coverageProvesAbsence(read.coverage)"));
  assert.match(after, /signal\?\.detected\?\.\(r\)/);
});

/* ------------------------------------- it agrees with the measured engine -- */

test("the one-page rule matches engine/absence.py rather than inventing one", () => {
  const py = readFileSync(
    path.join(process.cwd(), "stage0/src/engine/absence.py"),
    "utf8",
  );
  // The Python names it `homepage_is_whole_site` and says why. If that rule is
  // ever removed there, this file is describing something that no longer
  // exists and the live judge has quietly diverged from the measured one.
  assert.match(py, /homepage_is_whole_site/);
  assert.match(py, /when the site has nowhere else to\s*#\s*look, one page is the whole of it/);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
