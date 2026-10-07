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
/**
 * The first screen: everything above the ticker that follows the hero.
 *
 * This check used to scan the whole page, while its own message said "not in
 * the first screen". The 2026-09-28 design made the difference matter. Its dot
 * field shows every business we formed a view on, and we added a third colour
 * the design did not have — the ones we could not settle — because a product
 * that only ever shows fit and not-fit is claiming it always knows.
 *
 * Scoping this to the hero is not a weakened check, because of the one below
 * it: the count may appear, but never without what it costs you. That pairing
 * is the actual guarantee, and it is the same rule `/how-we-check` is held to.
 * Loosening a check to let a change through is how a suite stops meaning
 * anything; narrowing one to what it always claimed to test, and adding the
 * condition that makes the change safe, is not the same move.
 */
/**
 * Everything before the page's first `<h2>` — the hero, structurally.
 *
 * The first version split on the marquee's words. That tied the check to a
 * phrase in the copy, so rewording the marquee silently widened the check to
 * the whole page and it failed on a block four screens down. A boundary made
 * of copy is not a boundary; the hero is "up to the first section heading",
 * and that is what this reads.
 */
const heroHtml = readFileSync(path.join(OUT, "index.html"), "utf8").split(/<h2\b/i)[0];
const firstScreen = heroHtml
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");

check(
  "the hero does not open with what we could not read",
  !new RegExp(`\\b${couldntRead}\\b`).test(firstScreen),
  "the first screen leads with the count somebody came for",
);
/**
 * The consequence has to sit **beside** the number, not merely somewhere on
 * the page. The first version of this check accepted any of "never billed",
 * "cost you nothing" or "are free" anywhere in the document — and the page
 * already says "Businesses that don't fit are free" four blocks further down,
 * about a different set of businesses entirely. So deleting "never billed"
 * from the dot-field key left the suite green. Verified by doing exactly that;
 * it reported zero failures, which is how this ended up windowed.
 */
{
  const near = new RegExp(`\\b${couldntRead}\\b[^.]{0,80}`, "i");
  const window_ = (home ?? "").match(near)?.[0] ?? "";
  check(
    "and where that count does appear, it carries what it costs, in the same breath",
    !new RegExp(`\\b${couldntRead}\\b`).test(home ?? "") ||
      /never billed|cost(s)? you nothing|free/i.test(window_),
    `an unread site that is quietly counted is the one number that must never ` +
      `travel alone — found: "${window_.slice(0, 90)}"`,
  );
}

// --- honesty, restated for the 2026-10-04 handoff -----------------------------
//
// These four checks used to pin exact sentences: that /how-we-check stated the
// measured unreadable-sites rate ("four in ten"), and that it said precision
// was "one niche of three".
//
// The designer's handoff removed both, deliberately. HANDOFF §3.1: *"No
// benchmark numbers. Any sentence of the form 'we read N websites' or 'N
// checked, N were a fit' is forbidden on marketing pages. Those figures came
// from internal pricing work and are not public claims."* The measured figures
// now live only on `/benchmark`, which is still generated from the plan's own
// Live numbers table and is still the one authoritative place for them.
//
// **Deleting these checks would have been the easy read and the wrong one.**
// What they were protecting is not a form of words — it is two properties:
//
//   1. If a page says some sites cannot be read, it says in the same breath
//      that those cost nothing. Unreadable sites being free is the promise;
//      mentioning the difficulty without the promise is just a disclaimer.
//   2. A precision figure never appears without saying what it was measured
//      on. The old page needed that caveat because it quoted precision. The
//      handoff quotes none, so the check is now conditional: it fires only if
//      a figure comes back.
//
// Both are now tested as properties, so they keep holding whatever the copy
// does next.
const unreadable = /cannot be read|can't be read|couldn[’']t tell|does not say either way|doesn[’']t say either way/i;
if (unreadable.test(accuracy ?? "")) {
  check(
    "where the accuracy page says a site cannot be read, it says that costs nothing",
    /never billed|cost(s)? (you )?nothing|cost nothing|free|not charged|only ever charged for the first/i.test(
      accuracy ?? "",
    ),
  );
}

check(
  "precision is not claimed across three markets when it was measured on one",
  !/across three markets/i.test(everywhere),
);

// Conditional on purpose: the handoff quotes no precision figure at all, and a
// check that demanded the caveat would fail on a page that makes no claim.
const precision = /\b\d{2,3}(\.\d+)?%\s*(precision|accurate|correct)|precision[^.]{0,40}\b\d{2,3}(\.\d+)?%/i;
if (precision.test(accuracy ?? "")) {
  check(
    "and a precision figure always says what it was measured on",
    /one niche|dental|Phoenix|one market/i.test(accuracy ?? ""),
  );
}

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
// 2026-10-07: the sign-up button reads "Find my customers" (was "Sign up free").
const signUp = /find my customers/i.test(home ?? "");
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

// --- the 2026-10-04 handoff: structure, and the claims that must not return
//
// This block replaces the 2026-10-01 one, which pinned the hand-built page's
// eight sections by their headlines. That page is gone: the home page and
// /how-we-check are now the designer's handoff markup, served as authored.
//
// It is asserted on **section ids, not sentences**. The previous version
// matched copy, and two of its checks failed on a page that was correct —
// smart versus straight apostrophes in "what it's like". An id is what the
// designer actually named the thing, and it survives a copy edit.
if (home && accuracy) {
  const raw = readFileSync(path.join(OUT, "index.html"), "utf8");
  // 2026-10-07: cut to five sections ("subtract, subtract, subtract"). The three
  // steps stay second (the owner: that is where people understand it); the bill
  // and the example row went, and the film shows the result instead.
  const ORDER = ["how", "watch", "price", "signup"];
  const at = ORDER.map((id) => [id, raw.indexOf(`id="${id}"`)]);

  for (const [id, i] of at) check(`the home page has the #${id} section`, i >= 0);
  if (at.every(([, i]) => i >= 0)) {
    for (let i = 1; i < at.length; i += 1) {
      check(`#${at[i][0]} comes after #${at[i - 1][0]}`, at[i][1] > at[i - 1][1]);
    }
  }

  // HANDOFF §3.2 and §13: "There is no Send button anywhere on the site and
  // there never will be." The repo made the same promise independently, and
  // the pricing ticks, the row card and the footer all repeat it.
  check(
    "no page offers to send anything on the visitor's behalf",
    !/\bsend (it |them |the email)?for you\b|\bwe(’|')ll send\b|\bwe will send\b/i.test(everywhere),
  );
  check("and the home page still says who sends", /you send it|we never send/i.test(home));

  // The claim this repo has twice decided it cannot make. We read 200 of the
  // 2,778 Phoenix dental sites with a website, so "every website" is false.
  // The handoff arrived carrying it in two sentences; both were rewritten.
  check(
    "no page claims we read every website",
    !/every (one of their |single )?websites?\b|we (open|read|check) every\b/i.test(everywhere),
    everywhere.match(/[^.]*every[^.]*websites?[^.]*/i)?.[0]?.slice(0, 90) ?? "",
  );

  // One quiet link to the method, from the home page body.
  check("the home page links to /how-we-check", /how we check each business/i.test(home));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
