/**
 * A typed search splits into what / where / criterion, for any vertical (S2-10).
 *
 *     node stage0/tests/test_query.mjs
 *
 * This module exists because of one screen. Typing "carpenters in Texas" into
 * the product returned:
 *
 *     What    not recognised
 *
 * Nothing about carpenters is unsupported — `check_plan.py` is built so that a
 * criterion in a vertical nobody anticipated still produces a working plan.
 * The parser said that because it had a hard-coded list of four niches and no
 * rule for the word, and a stranger reads it as "this product does not do
 * carpenters".
 *
 * So the rule under test is: **this module knows nothing about which niches
 * exist.** It splits on sentence shape and hands back whatever was written.
 * Whether we have read that market is a separate question, asked later.
 */

import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/query.ts"], "sfq-");
const Q = await load("query");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const eq = (got, want) =>
  got.what === want.what && got.where === want.where && got.criterion === want.criterion;

const cases = [
  [
    "carpenters in Austin that don't show pricing",
    { what: "carpenters", where: "Austin", criterion: "don't show pricing" },
  ],
  [
    "med spas in Dallas that have no online booking",
    { what: "med spas", where: "Dallas", criterion: "have no online booking" },
  ],
  [
    "roofers in Tampa with no quote form",
    { what: "roofers", where: "Tampa", criterion: "with no quote form" },
  ],
  [
    "dentists in Phoenix, AZ",
    { what: "dentists", where: "Phoenix, AZ", criterion: "" },
  ],
  ["plumbers in Texas", { what: "plumbers", where: "Texas", criterion: "" }],
  ["carpenters", { what: "carpenters", where: "", criterion: "" }],
  [
    "I sell to law firms in Chicago who have no chat widget",
    { what: "law firms", where: "Chicago", criterion: "have no chat widget" },
  ],
  [
    "find me gyms in Denver without a booking page",
    { what: "gyms", where: "Denver", criterion: "without a booking page" },
  ],
];

for (const [raw, want] of cases) {
  const got = Q.splitQuery(raw);
  check(`"${raw}"`, eq(got, want), JSON.stringify(got));
}

// --- the vertical-agnostic promise, stated as a check -------------------------
for (const niche of [
  "carpenters",
  "wedding photographers",
  "kitchen fitters",
  "bail bondsmen",
  "alpaca farms",
  "septic tank services",
]) {
  const got = Q.splitQuery(`${niche} in Austin`);
  check(
    `"${niche}" is a business type, not an error`,
    got.what === niche && got.where === "Austin",
    JSON.stringify(got),
  );
}

// --- the traps ----------------------------------------------------------------
{
  // A business type can contain "in". Splitting on the first one turns
  // "Blinds in Motion installers in Austin" into a search for blinds in
  // "Motion installers in Austin".
  const got = Q.splitQuery("blinds in motion installers in Austin");
  check(
    "the last 'in' is the place, not the first",
    got.where === "Austin" && got.what === "blinds in motion installers",
    JSON.stringify(got),
  );
}
{
  // "with no online booking" must keep its negation. Dropping two words there
  // inverts the search and returns exactly the businesses the customer does
  // not want.
  const got = Q.splitQuery("med spas in Dallas with no online booking");
  check(
    "a negated criterion keeps its negation",
    /no online booking/.test(got.criterion),
    JSON.stringify(got),
  );
}
{
  const got = Q.splitQuery("carpenters in Austin that don't show pricing with photos");
  check(
    "the earliest criterion lead wins, so the clause is not cut twice",
    got.criterion === "don't show pricing with photos",
    JSON.stringify(got),
  );
}
check(
  "an unparseable string keeps what was typed rather than clearing it",
  Q.splitQuery("asdf qwer zxcv").what === "asdf qwer zxcv",
);
check("an empty query is empty, not an error", eq(Q.splitQuery(""), { what: "", where: "", criterion: "" }));
check("and so is whitespace", eq(Q.splitQuery("   "), { what: "", where: "", criterion: "" }));

// --- the one that must never regress ------------------------------------------
//
// This is a property rather than a transcription. The first version of this
// file asserted `criterion === "show pricing"` for a query that said "don't
// show pricing" — it wrote down what the code did, so the suite was green on
// the bug it existed to catch. A dropped negation returns exactly the
// businesses the customer does not want, with nothing on screen to show it.
for (const [raw, word] of [
  ["carpenters in Austin that don't show pricing", "don't"],
  ["carpenters in Austin that do not show pricing", "not"],
  ["dentists in Phoenix that doesn't take bookings", "doesn't"],
  ["med spas in Dallas that have no online booking", "no"],
  ["roofers in Tampa with no quote form", "no"],
  ["gyms in Denver without a booking page", "without"],
  ["vets in Columbus who don't list prices", "don't"],
]) {
  const got = Q.splitQuery(raw);
  check(
    `the negation survives in "${raw}"`,
    got.criterion.includes(word),
    `criterion came back as "${got.criterion}" — dropping the negation inverts the search`,
  );
}

check(
  "the split reads back as a sentence",
  Q.describeSplit({ what: "carpenters", where: "Austin", criterion: "show pricing" }) ===
    "carpenters in Austin that show pricing",
  Q.describeSplit({ what: "carpenters", where: "Austin", criterion: "show pricing" }),
);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
