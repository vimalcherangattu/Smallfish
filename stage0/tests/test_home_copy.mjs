/**
 * The home page's acceptance checks, run against the page it actually renders.
 *
 *     npm run build && node stage0/tests/test_home_copy.mjs
 *
 * The 2026-09-25 rewrite came with a list of checks — no analyst vocabulary
 * above the fold, the unreadable-sites figure stated once and always with its
 * billing consequence, every count leading with matches. Those are the sort of
 * thing that holds for a week and then erodes one well-meaning edit at a time,
 * so they are a test.
 *
 * It reads `.next/server/app/index.html`, the prerendered page, rather than
 * `page.tsx`. That distinction is the whole point: a check against the source
 * would pass on a number that lives in a comment and fail on one that never
 * reaches a visitor. What matters is what is on the screen.
 *
 * It skips loudly, with exit 2, when there is no build — a copy test that
 * silently passes because nothing was compiled is worse than no test.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const page = path.join(process.cwd(), ".next", "server", "app", "index.html");
if (!existsSync(page)) {
  console.error(
    "No prerendered home page. Run `npm run build` first — this test checks the\n" +
      "rendered page, not the source, and there is nothing to check without one.",
  );
  process.exit(2);
}

const html = readFileSync(page, "utf8");
// Visible words only. Class names, data attributes and inlined JSON payloads
// are not copy, and a check that reads them fails on things nobody can see.
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;|&#\d+;/gi, (m) =>
    ({ "&rsquo;": "’", "&ldquo;": "“", "&rdquo;": "”", "&amp;": "&", "&nbsp;": " " })[
      m.toLowerCase()
    ] ?? " ",
  )
  .replace(/\s+/g, " ")
  .trim();

const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) =>
  m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const count = (needle) => text.toLowerCase().split(needle.toLowerCase()).length - 1;

// --- numbers nobody measured -------------------------------------------------
//
// `544 of 544 quotes verified` was on this page for days. It appears nowhere in
// PROJECT_PLAN.md, the coverage report or benchmark.json — it was invented, on
// the page whose argument is that we do not do that. The other two are from the
// rewrite brief and were never measured either.
for (const [figure, why] of [
  ["544", "quotes verified — the measured figure is 11 of 11 model verdicts"],
  ["612", "med spa sites read — 200 were read, 145 settled"],
  ["of 612", "same"],
]) {
  check(`the page does not claim "${figure}"`, !text.includes(figure), why);
}
check(
  "and the med spa read is not reported as 212 matches",
  !/212\s+(med|matched|businesses)/i.test(text),
  "26 matched of 145 settled is the measured number",
);

// --- the numbers it does claim, against the measured tallies ------------------
const idx = JSON.parse(
  readFileSync(path.join(process.cwd(), "public", "data", "index.json"), "utf8"),
);
// Read from the source of truth: a credit count typed into a test is a second
// opinion about a number the pricing module already owns.
const free = (
  readFileSync(path.join(process.cwd(), "src", "lib", "pricing.ts"), "utf8").match(
    /id:\s*"free"[^}]*credits:\s*(\d+)/,
  ) ?? []
)[1];
const dental = idx.markets.find((m) => m.id === "dental-phoenix");
const t = dental.tallies.no_online_booking;
const settled = t.match + t.no_match + t.couldnt_tell + t.blocked;

check(
  `the dental read is stated as ${settled} sites, which is what was read`,
  text.includes(String(settled)),
  `tallies say ${t.match} match, ${t.no_match} no, ${t.couldnt_tell} couldn't tell, ${t.blocked} blocked`,
);
check(
  `and ${t.match} matches, which is what matched`,
  new RegExp(`\\b${t.match}\\b`).test(text),
);
check(
  `and ${t.couldnt_tell + t.blocked} it could not read`,
  new RegExp(`\\b${t.couldnt_tell + t.blocked}\\b`).test(text),
  "couldn't-tell plus blocked, because both are 'we could not say'",
);

// --- vocabulary --------------------------------------------------------------
//
// The buyer says leads, clients, niche, campaign. "Accounts", "criterion",
// "verdict" and "refusal" are ours, and a headline is where a word costs the
// most.
for (const word of ["criterion", "verdict", "refusal", "refused to guess"]) {
  const offending = headings.filter((h) => h.toLowerCase().includes(word));
  check(
    `no headline says "${word}"`,
    offending.length === 0,
    offending.join(" | "),
  );
}
// **"Accounts" in a headline is exempted, and the exemption is recorded
// rather than the check deleted.** The 2026-09-25 brief moved "the accounts
// the big nets can't read" to the footer: it is a claim about us rather than a
// promise about them, and "accounts" is analyst language for a buyer who says
// clients. The 2026-09-26 design puts it back in the hero. The newer
// instruction wins, but the earlier argument was never answered — only
// outvoted — so it stays written down here, where whoever revisits the hero
// will find it.
check(
  'the only headlines saying "account" are the hero and the markets heading',
  headings.filter((h) => /\baccounts?\b/i.test(h)).length <= 2,
  headings.filter((h) => /\baccounts?\b/i.test(h)).join(" | "),
);

// --- honesty, once, with the consequence -------------------------------------
//
// The unreadable-sites figure used to appear four times, each time as a virtue.
// Once, attached to "you're not billed", is the whole of it.
// The rule was "the rate appears exactly once, always with its billing
// consequence". This design drops the rate and states the concrete count for a
// real market instead — 73 of 166 — which is the same honesty with more
// evidence behind it, so the check is now about the property that mattered:
// wherever what we could not read is counted, what it costs is stated beside
// it. A count of unreadable sites with no "never billed" next to it reads as a
// confession rather than a policy.
const fourInTen = count("four in ten") + count("40%") + count("about 40");
check(
  "the unreadable-sites rate, if stated at all, is stated once",
  fourInTen <= 1,
  `found ${fourInTen} times`,
);
check(
  "what we could not read is always priced at nothing, right beside it",
  /never billed/i.test(text),
  "a count of unread sites with no 'never billed' beside it reads as a confession, not a policy",
);
check(
  `and the ${t.couldnt_tell + t.blocked} we could not read is on the page`,
  new RegExp(`\\b${t.couldnt_tell + t.blocked}\\b`).test(text),
);

// --- win first ---------------------------------------------------------------
//
// A visitor who reads "73 we couldn't judge" before "42 you can call" has been
// told what we failed at before they know what they get.
const matchPos = text.indexOf(`${t.match} practices`);
const couldntPos = text.indexOf(`${t.couldnt_tell + t.blocked} we`);
check(
  "the real-result section leads with matches, not with what we could not read",
  matchPos > -1 && couldntPos > -1 && matchPos < couldntPos,
  `matches at ${matchPos}, couldn't-read at ${couldntPos}`,
);

// --- one niche, said out loud ------------------------------------------------
check(
  "precision is not claimed across three markets when it was measured on one",
  !/across three markets/i.test(text),
  "41 calls were dental in Phoenix alone",
);
check(
  "and the page says which niche it was measured on",
  /dental in phoenix/i.test(text),
);

// --- price legibility --------------------------------------------------------
for (const plan of ["Starter", "Growth", "Agency"]) {
  check(
    `${plan} says what it buys in plain words, not only in credits`,
    new RegExp(`${plan}[\\s\\S]{0,200}?(month|cities|markets|city)`, "i").test(text),
  );
}

// --- things that are built, and things that are not --------------------------
//
// The brief's "what you get" section promised saved-search alerts and a Google
// Sheets export. `alerts.ts` rests on a change rate nobody has measured, and
// S1-06b's Sheets half was never built. A page that promises them is writing a
// cheque the product does not cover.
check(
  "the page does not promise change alerts",
  !/tell you when a business/i.test(text) && !/new ones as they appear/i.test(text),
  "alerts.ts carries measured: false on every budget it returns",
);
check(
  "nor a Google Sheets export",
  !/google sheets/i.test(text),
  "S1-06b's Sheets half needs a Google verification review and was not built",
);

// --- the way in ----------------------------------------------------------------
//
// The 2026-09-25 hero was a three-field search box, and these checked that it
// asked for a niche and a city. This design's hero is a headline and a call to
// action, with the search box living in the product. So the property to hold is
// no longer "the hero can be typed into" but "the hero says what it costs to
// start" — which is the thing that actually has to be true before somebody
// clicks it.
check(
  "the hero says what you get for nothing",
  /start free/i.test(text) && new RegExp(`${free} credits`, "i").test(text),
  "the free allowance has to be on the button, not two screens later",
);
check(
  "and that no card is needed",
  /no card/i.test(text),
);

// --- the businesses on the page are businesses that exist ---------------------
//
// The strongest check on this page, and the reason it exists. The composed
// design filled the proof section with four clinics and four quotes; three of
// the clinics are not real and the quotes were written to sound like a contact
// page. On any other marketing site that is a mockup. Here the card's entire
// job is to show that a row carries the sentence that proves it — so a card
// proving it with an invented sentence is the failure the page argues against,
// staged as the argument.
//
// Every business name rendered in a match card must appear in the measured
// market file it claims to come from.
{
  const markets = ["dental-phoenix", "med-spa-dallas", "hvac-tampa"].map((id) => ({
    id,
    json: readFileSync(path.join(process.cwd(), "public", "data", `${id}.json`), "utf8"),
  }));

  // The card sets the name in the display face at 30px — the one place on the
  // page that combination is used.
  const named = [...html.matchAll(/class="dsp"[^>]*font-size:30px[^>]*>([^<]{3,80})</g)].map(
    (m) => m[1].trim(),
  );

  check(
    "the proof section names at least one business",
    named.length > 0,
    "if this finds nothing the selector has drifted and the check below is vacuous",
  );

  for (const name of named) {
    // Names travel through JSX with HTML entities; compare on the letters.
    const plain = name.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
    check(
      `"${plain}" is a business we actually read`,
      markets.some((m) => m.json.includes(JSON.stringify(plain).slice(1, -1))),
      "this name is not in any measured market file — it was invented",
    );
  }
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
