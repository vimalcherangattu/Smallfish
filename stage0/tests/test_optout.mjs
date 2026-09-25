/**
 * The removal request finds every branch, and does not remove anything (S1-09).
 *
 * Two properties, and the second is the one worth a test.
 *
 * A removal has to reach every listing the owner has, not the one whose id
 * someone found — 23 Phoenix listings share `aspendental.com`, and the
 * duplicate-billing work already established that they are 23 real practices
 * rather than one. So matching is on the contact, and it returns all of them.
 *
 * And the form must not make a suppression effective. The opt-out page's own
 * argument is that an opt-out anyone could file for anyone else is a tool for
 * erasing a competitor, and a website and phone number are public — they are
 * on the business's own site, which is where we got them. So typing one proves
 * nothing, the request lands pending, and the checks below fail if that ever
 * stops being true.
 *
 *     node stage0/tests/test_optout.mjs
 */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const ROOT = process.cwd();
const { dir, load } = compileLib(["src/lib/suppression.ts"], "sfopt-");
const { findListings, verifies, requestRemoval, REMOVAL_DAYS } = await load("suppression");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

// --- matching ---------------------------------------------------------------
const listings = [
  { id: "a1", site: "https://www.aspendental.com/offices/az/phoenix", phone: "6026394410" },
  { id: "a2", site: "http://aspendental.com/offices/az/mesa", phone: "4805551212" },
  { id: "a3", site: "https://aspendental.com", phone: null },
  { id: "solo", site: "https://drsmithdental.com", phone: "(602) 555-9090" },
  { id: "none", site: null, phone: "602-555-7777" },
];

check(
  "a domain finds every branch that shares it",
  findListings(listings, "aspendental.com").map((l) => l.id).join() === "a1,a2,a3",
  "a removal reaching one branch of a chain leaves the rest listed",
);
check(
  "with or without www, scheme or path",
  findListings(listings, "https://WWW.AspenDental.com/anything").length === 3,
);
check(
  "an email address is read as its domain",
  findListings(listings, "office@aspendental.com").length === 3,
);
check(
  "a phone matches on the last ten digits, however it is written",
  findListings(listings, "(602) 555-9090").map((l) => l.id).join() === "solo" &&
    findListings(listings, "+1 602 555 9090").map((l) => l.id).join() === "solo",
);
check(
  "a listing with no website is still reachable by its phone",
  findListings(listings, "6025557777").map((l) => l.id).join() === "none",
);
check(
  "a domain that hits does not fall through to a digit match",
  findListings(listings, "aspendental.com").every((l) => l.site),
  "the numerals inside a domain are not a phone number",
);
check("an unknown contact matches nothing", findListings(listings, "example.org").length === 0);
check("and so does an empty one", findListings(listings, "   ").length === 0);

// --- the form does not remove anything --------------------------------------
const page = readFileSync(path.join(ROOT, "src/app/opt-out/page.tsx"), "utf8");

// Source with comments stripped. Three checks in this repo have now fired on
// the comment that explains why the thing they look for is absent — a grep for
// `effective_at` over this file hits the docstring saying it is deliberately
// never written. A check about what code *does* has to read code.
// It also joins string concatenations and collapses whitespace, so a check
// matches the sentence a user reads rather than how the line happened to wrap.
const codeOf = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/"\s*\+\s*"/g, "")
    .replace(/\s+/g, " ");
const route = codeOf(readFileSync(path.join(ROOT, "src/app/api/opt-out/route.ts"), "utf8"));
const pageProse = codeOf(page);

check(
  "the route never sets effective_at",
  !/effective_at/.test(route),
  "the public read policy serves rows with effective_at set, so writing it here " +
    "would let anyone remove anyone by typing a public phone number",
);
check(
  "it files a deadline instead",
  /remove_by/.test(route),
  "the seven-day promise has to be a timestamp, or it is not checkable",
);
check(
  "the response says the sender is not removed yet",
  /not removed yet/i.test(route),
  "a form that says 'request received' leaves people believing they are out",
);
check(
  "and says confirmation goes to the listed contact, not the typed one",
  /contact already on the listing/i.test(route) &&
    /already on your listing/i.test(pageProse),
);
check(
  "the page still refuses to claim exported rows can be recalled",
  /cannot recall|cannot reach it/i.test(page),
  "the one thing on that page that costs us something to say",
);
check(
  "a request with no database says so rather than silently succeeding",
  // Matched inside one literal: the sentence is split across a concatenation
  // in the source, and a regex spanning that join tests the line wrapping
  // rather than the behaviour.
  /is not configured/.test(route) && /canWrite\(\)/.test(route),
);

// --- the rules that were already there still hold ---------------------------
check(
  "a claim is still checked against the listing",
  verifies({ method: "domain", value: "x@aspendental.com" }, { site: "https://aspendental.com" }) &&
    !verifies({ method: "domain", value: "x@rival.com" }, { site: "https://aspendental.com" }),
);
const verdict = requestRemoval(
  { businessId: "a1", claim: { method: "phone", value: "6026394410" }, at: "2026-09-25T00:00:00Z" },
  { site: null, phone: "602-639-4410" },
);
check(
  "an accepted request carries a deadline REMOVAL_DAYS out",
  verdict.accepted === true &&
    verdict.removeBy.slice(0, 10) ===
      new Date(Date.parse("2026-09-25T00:00:00Z") + REMOVAL_DAYS * 86400000)
        .toISOString()
        .slice(0, 10),
);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
