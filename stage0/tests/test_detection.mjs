/**
 * Detection never claims a feature from the words around it.
 *
 *     node stage0/tests/test_detection.mjs
 *
 * The TypeScript reader's first outing found a real defect on the first real
 * site. `detect()` treated the phrase "book now" / "schedule online" anywhere
 * in the HTML as a booking system. simplydentistry.com says *"book your
 * appointment by calling"* — a phone instruction — so the reader reported
 * `booking: true`, the criterion "has no online booking" came back `no_match`,
 * and a business that is in the measured dataset as a **match** was silently
 * deleted from the list.
 *
 * That is the expensive direction. CLAUDE.md: "Detection errs toward firing. A
 * false positive costs a missed match; a false negative costs a false match.
 * Only the second is expensive." — which is about the *detector for a
 * presence*, and cuts the other way for an absence criterion, where a false
 * detection removes somebody's lead.
 *
 * So: only a vendor's script counts. Prose does not.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const src = readFileSync(path.join(process.cwd(), "src", "lib", "read.ts"), "utf8");

// The rule, asserted on the source: booking is vendors only.
check(
  "booking detection is vendor scripts only",
  /booking:\s*vendors\.length > 0,/.test(src),
  "any text pattern here reads a phone instruction as a booking system",
);
for (const bad of ["book\\s*(now|online", "schedule\\s*(now|online"]) {
  check(
    `no prose pattern for booking (${bad.slice(0, 14)}…)`,
    !src.includes(bad),
    "this is the regex that deleted a real match",
  );
}

// The quote check and the absence guard must both still be there: they are the
// two things standing between a model's confidence and a customer's list.
check(
  "a proof that is not in the fetched text downgrades the verdict",
  /flat\(read\.text\)\.includes\(flat\(proof\)\)/.test(src),
);
// **This used to pin `read.result.pages < 2`, and that rule was wrong.**
//
// It refused an absence verdict on any one-page site, and a small business is
// usually a one-page site. Combined with the quote requirement — which an
// absence can never satisfy, because no page says "we have no live chat" — it
// made an absence criterion unable to match at all. A real run read 12 gyms in
// Dallas for "no online booking" and matched none of them.
//
// The replacement is the rule `engine/absence.py` has had since S0-13 and the
// live judge never implemented: we looked in enough places when we reached the
// criterion-relevant routes the home page offered. A site offering none is
// completely covered by its home page, which is what `homepage_is_whole_site`
// means there. Finding routes and reaching none of them is still refused, and
// that is the case the old rule was really aiming at.
check(
  "an absence verdict needs to have looked where the thing would be",
  /coverageProvesAbsence\(read\.coverage\)/.test(src) &&
    /!\(c\.targeted > 0 && c\.reached === 0\)/.test(src),
);
check(
  "and a quote is demanded only of a verdict that says something is there",
  /const assertsPresent = assertsPresence\(criterion\.type, verdict\)/.test(src),
  "an absence cannot be proved by quoting a page",
);
check(
  "our own failures are not recorded as the site refusing us",
  /our_timeout/.test(src) && /40\[13\]\|429/.test(src),
);
check(
  "robots.txt is consulted before anything is fetched",
  src.indexOf("robotsAllows") < src.indexOf("const get = async"),
);

// The measured dataset is the arbiter: the site that exposed this bug is a
// match in it, and must stay one.
{
  const m = JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "data", "dental-phoenix.json"), "utf8"),
  );
  const b = m.businesses.find((x) => x.name === "Simply Dentistry");
  check(
    "Simply Dentistry is still a match in the measured data",
    b?.verdicts?.no_online_booking?.verdict === "match",
    "the site that caught the false positive",
  );
  check(
    "and the Python probe agrees it has no booking",
    b?.read?.booking === false && (b?.read?.vendors ?? []).length === 0,
    "if this ever disagrees with the TS reader, one of them is wrong",
  );
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
