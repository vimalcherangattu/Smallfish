/**
 * The marketing pages say only what the repository can support.
 *
 *     npm run build && node stage0/tests/test_home_copy.mjs
 *
 * It reads the prerendered HTML in `.next/server/app`, not the source. That
 * distinction is the whole point: a check against `page.tsx` would pass on a
 * number that lives in a comment and fail on one that never reaches a visitor.
 * What matters is what is on the screen.
 *
 * ## Why it covers four pages rather than one
 *
 * On 2026-09-26 the home page was cut to seven blocks and most of its content
 * moved: the benchmark and the refusals to `/how-we-check`, the essayistic
 * lines to `/why-it-exists`, the market picker to `/markets`. Eleven checks in
 * this file went red at once, and every one of them was still worth making —
 * just on a different page.
 *
 * Deleting them would have been the easy read of a red suite and the wrong one.
 * A guarantee does not stop mattering because the paragraph carrying it moved.
 *
 * It skips loudly, with exit 2, when there is no build — a copy test that
 * silently passes because nothing was compiled is worse than no test.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), ".next", "server", "app");

if (!existsSync(path.join(OUT, "index.html"))) {
  console.error(
    "No prerendered pages. Run `npm run build` first — this test checks the\n" +
      "rendered HTML, not the source, and there is nothing to check without it.",
  );
  process.exit(2);
}

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

/** Visible words only. Class names, data attributes and inlined JSON payloads
 *  are not copy, and a check that reads them fails on things nobody can see. */
function visible(file) {
  const p = path.join(OUT, file);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, (m) =>
      ({ "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”", "&amp;": "&", "&nbsp;": " " })[
        m.toLowerCase()
      ] ?? " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

const home = visible("index.html");
const accuracy = visible("how-we-check.html");
const markets = visible("markets.html");
const why = visible("why-it-exists.html");
const everywhere = [home, accuracy, markets, why].filter(Boolean).join("\n");

for (const [name, text] of [
  ["home", home],
  ["how-we-check", accuracy],
  ["markets", markets],
  ["why-it-exists", why],
]) {
  check(`${name} rendered`, !!text && text.length > 400, `${text?.length ?? 0} chars`);
}

// --- numbers nobody measured, anywhere on the site ---------------------------
//
// `544 of 544 quotes verified` has now arrived in three separate design
// documents and was live on the site for days. It appears nowhere in
// PROJECT_PLAN.md, the coverage report or benchmark.json — it was invented, on
// the pages whose argument is that we do not do that.
for (const [figure, why_] of [
  ["544", "quotes verified — the measured figure is 11 of 11 model verdicts"],
  ["612", "med spa sites read — 200 were read, 145 settled"],
  ["Maplewick", "a clinic that appears in three design documents and no data file"],
]) {
  check(`no page claims "${figure}"`, !everywhere.includes(figure), why_);
}
check(
  "and no page reports the med spa read as 212 matches",
  !/212\s+(med|matched|businesses)/i.test(everywhere),
  "26 matched of 145 settled is the measured number",
);

// --- the numbers the site does claim, against the measured tallies -----------
const idx = JSON.parse(
  readFileSync(path.join(process.cwd(), "public", "data", "index.json"), "utf8"),
);
const dental = idx.markets.find((m) => m.id === "dental-phoenix");
const t = dental.tallies.no_online_booking;
const couldntRead = t.couldnt_tell + t.blocked;

check(
  `the home page leads with the ${t.match} that matched`,
  new RegExp(`\\b${t.match}\\b`).test(home),
  "the count a visitor came for",
);
check(
  "and does not open with what we could not read",
  !new RegExp(`\\b${couldntRead}\\b`).test(home ?? ""),
  "that belongs on the accuracy page, not in the first screen",
);

// --- honesty, moved but not lost ---------------------------------------------
//
// The rule was "the unreadable-sites rate appears once, always with its billing
// consequence". The rate moved to /how-we-check with the rest of the method.
// It still has to carry the consequence, wherever it lives.
check(
  "the accuracy page states the unreadable-sites rate",
  /four in ten/i.test(accuracy ?? ""),
);
check(
  "and prices it at nothing in the same breath",
  /never billed/i.test(accuracy ?? "") || /cost you nothing/i.test(accuracy ?? ""),
);
check(
  "precision is not claimed across three markets when it was measured on one",
  !/across three markets/i.test(everywhere),
);
check(
  "and the accuracy page says it is one niche of three",
  /one niche of three/i.test(accuracy ?? ""),
);

// --- vocabulary, on the pages a stranger reads first -------------------------
//
// "Accounts", "criterion", "verdict" and "refusal" are our words. The home page
// is where one costs the most. `/why-it-exists` is exempt: it carries the older
// essayistic copy on purpose, for a reader who is already interested.
const homeHeadings = [
  ...(readFileSync(path.join(OUT, "index.html"), "utf8").matchAll(
    /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi,
  ) ?? []),
].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

for (const word of ["criterion", "verdict", "refusal", "account"]) {
  const bad = homeHeadings.filter((h) => new RegExp(`\\b${word}s?\\b`, "i").test(h));
  check(`no home headline says "${word}"`, bad.length === 0, bad.join(" | "));
}

// --- the one action ----------------------------------------------------------
//
// The 2026-09-26 copy is built around a single call to action, and sets its own
// condition for which one: sign-up only if a stranger can describe a market and
// get a real list back, otherwise the waitlist. Either is fine; having neither,
// or both, is not.
const signUp = /sign up free/i.test(home ?? "");
const waitlist = /join the waitlist/i.test(home ?? "");
check(
  "the home page has exactly one kind of call to action",
  signUp !== waitlist,
  `sign-up: ${signUp}, waitlist: ${waitlist}`,
);
check(
  "and it says what happens next, under the button",
  /no card/i.test(home ?? "") || /a few at a time/i.test(home ?? ""),
);

// --- things that are built, and things that are not --------------------------
check(
  "no page promises change alerts",
  !/tell you when a business/i.test(everywhere) && !/new ones as they appear/i.test(everywhere),
  "alerts.ts carries measured: false on every budget it returns",
);
check(
  "nor a Google Sheets export",
  !/google sheets/i.test(everywhere),
  "S1-06b's Sheets half needs a Google verification review and was not built",
);

// --- every business named on the site is one that exists ---------------------
//
// The strongest check here, and the reason this file exists. Design documents
// keep arriving with plausible clinics and plausible quotes in the example
// cards — three of the four in the 2026-09-26 design were invented. On any
// other marketing site that is a mockup; here the card's whole job is to show
// that a row carries the sentence that proves it.
{
  const files = ["dental-phoenix", "med-spa-dallas", "hvac-tampa"].map((id) =>
    readFileSync(path.join(process.cwd(), "public", "data", `${id}.json`), "utf8"),
  );

  // Business names are set in the display face: 30px on the markets cards, 26px
  // in the home page's single example row.
  const named = [];
  for (const [file, sizes] of [
    ["index.html", [26]],
    ["markets.html", [30, 24]],
  ]) {
    if (!existsSync(path.join(OUT, file))) continue;
    const html = readFileSync(path.join(OUT, file), "utf8");
    for (const size of sizes) {
      for (const m of html.matchAll(
        new RegExp(`class="dsp"[^>]*font-size:${size}px[^>]*>([^<]{3,80})<`, "g"),
      )) {
        named.push([file, m[1].trim()]);
      }
    }
  }

  check(
    "the example rows name at least two businesses",
    named.length >= 2,
    "if this finds nothing the selector has drifted and the check below is vacuous",
  );

  for (const [file, name] of named) {
    const plain = name.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
    // "small fish" is the wordmark, not a business.
    if (/^small fish$/i.test(plain)) continue;
    check(
      `"${plain}" on ${file} is a business we actually read`,
      files.some((f) => f.includes(JSON.stringify(plain).slice(1, -1))),
      "this name is not in any measured market file — it was invented",
    );
  }
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
