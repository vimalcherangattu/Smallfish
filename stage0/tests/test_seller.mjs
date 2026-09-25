/**
 * Reading the seller's own site invents nothing, and fetches nothing private
 * (S1-22).
 *
 * Two risks, both severe and neither obvious from the happy path.
 *
 * **Invention.** A model that has read a plumber's website can produce a
 * fluent, plausible, entirely fabricated description of who they serve, and
 * the customer cannot tell. So every extracted field carries a verbatim quote
 * and a field whose quote is not in the fetched text is dropped — the same
 * rule `engine/judge.py` applies to a verdict, for the same reason.
 *
 * **Server-side request forgery.** This is a text box that makes the server
 * fetch a URL. Without a guard it will happily fetch `http://localhost`,
 * `http://169.254.169.254` (cloud metadata, where credentials live) or a
 * private address, and return the contents to whoever typed it.
 *
 *     node stage0/tests/test_seller.mjs
 */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const ROOT = process.cwd();
const { dir, load } = compileLib(["src/lib/seller.ts"], "sfsell-");
const S = await load("seller");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

// --- what the server may be made to fetch -----------------------------------
for (const bad of [
  "http://localhost/admin",
  "http://localhost:8080",
  "https://foo.localhost",
  "http://127.0.0.1",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.5",
  "http://192.168.1.1",
  "http://printer.local",
  "http://db.internal",
  "file:///etc/passwd",
  "ftp://example.com",
  "javascript:alert(1)",
  "not a url at all",
]) {
  check(`refuses ${bad}`, S.safeUrl(bad) === null);
}

for (const good of [
  "https://aspendental.com",
  "aspendental.com",
  "http://example.co.uk/about",
  "https://sub.domain.example.com/services",
]) {
  check(`accepts ${good}`, S.safeUrl(good) !== null);
}
check(
  "a bare domain is upgraded to https, not left to chance",
  S.safeUrl("example.com").protocol === "https:",
);

// --- the rules that stop invention, read from the source ---------------------
const src = readFileSync(path.join(ROOT, "src/lib/seller.ts"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

check(
  "a field without a verifiable quote is dropped, not returned",
  /dropped\.push\(/.test(code) && /return null;/.test(code),
);
check(
  "the quote is checked against the text actually fetched",
  /haystack\.includes\(flat\(got\.quote/.test(code),
  "checking it against the model's own output would verify nothing",
);
// Exercise the normaliser rather than grepping for how the characters are
// spelled in the source. The first version of this check looked for a \u2018
// escape and failed against a file that used the literal character — testing
// the author's typing, not the behaviour.
check(
  "a curly apostrophe does not break a true quote",
  S.flat("we don\u2019t guess") === S.flat("we don't guess"),
);
check(
  "nor do curly double quotes or ragged whitespace",
  S.flat('he said \u201cyes\u201d') === S.flat('he said "yes"') &&
    S.flat("a   b\n c") === "a b c",
);
check(
  "the prompt tells the model a missing field is an acceptable answer",
  /do not infer/.test(src) && /A missing field is a useful answer/.test(src),
);
check(
  "and asks for a verbatim quote per field",
  /VERBATIM quote/.test(src),
);

// --- politeness --------------------------------------------------------------
check(
  "robots.txt is honoured even for the owner's own site",
  /robotsAllows/.test(code) && /getsmallfish\.com\/bot/.test(src),
);
check(
  "an unreadable robots.txt fails open",
  /catch \{\s*return true;/.test(code),
  "treating a server hiccup as a disallow refuses an owner their own site",
);
check(
  "the user agent identifies us and says why we are fetching",
  /at its owner's request/.test(src) || /owner's request/.test(src),
);

// --- honest refusals ----------------------------------------------------------
check(
  "a site with no readable text refuses rather than guessing",
  /almost no readable text/.test(src),
);
check(
  "a missing model key points at the typed path that still works",
  /the rest of the flow\s*\+?\s*"?\s*works on a typed description|works on a typed description/.test(
    src.replace(/"\s*\+\s*\n?\s*"/g, ""),
  ),
  "the ICP flow was built to work without this, and should say so",
);
check(
  "the cost of the read is reported",
  /costUsd/.test(code),
  "this product tells customers what things cost",
);

// --- it changes the input and nothing downstream ------------------------------
const profile = {
  url: "https://x.com",
  pagesRead: ["https://x.com"],
  sells: { value: "24/7 call answering", quote: "q", source: "s" },
  serves: { value: "dental clinics", quote: "q", source: "s" },
  problem: { value: "missed after-hours calls", quote: "q", source: "s" },
  geography: null,
  dropped: [],
  costUsd: 0,
};
const desc = S.profileToDescription(profile);
check(
  "a profile becomes the description the existing flow already consumes",
  desc.includes("24/7 call answering") && desc.includes("dental clinics"),
  desc,
);
check("and a null field is simply absent", !desc.includes("null") && !desc.includes("undefined"));

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
