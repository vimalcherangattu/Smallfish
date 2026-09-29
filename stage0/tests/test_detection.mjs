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
check(
  "an absence verdict needs more than the home page",
  /criterion\.type === "absence" && verdict === "match" && read\.result\.pages < 2/.test(src),
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
