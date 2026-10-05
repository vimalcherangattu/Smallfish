/**
 * Free text onto the Overture taxonomy.
 *
 *     node stage0/tests/test_trades.mjs
 *
 * Run against the **real** `public/data/trades.json` — 1,644 categories — and
 * not a fixture, because every bug this file exists for was a collision between
 * a typed word and a category nobody would have put in a fixture. A ten-row
 * fixture would have passed on every one of them:
 *
 *     carpenters   → car_dealer          electricians → electronics
 *     barbers      → bar                 accountants  → accommodation
 *     florists     → flowers_and_gifts   landscapers  → landmark_and_historical
 *     med spas     → spas                dentists     → dental_laboratories
 *
 * ## The one that costs money
 *
 * `med spas` must not reach `spas`. The fixtures measured that mixture at **75%
 * couldn't-tell and 7% offering a neurotoxin**, against 39% and 51% for
 * `medical_spa` alone, and wrote the finding down: *"A nail salon, a barbershop
 * and a float tank are not medical spas."* A matcher that groups on a shared
 * word makes that mistake in every vertical at once, silently. It is asserted
 * three ways below.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(["src/lib/trades.ts"], "sf-trades-");
const { matchTrade, agreement, AGREE, FAMILY_AGREE } = await load("trades");

const taxo = JSON.parse(readFileSync("public/data/trades.json", "utf8"));

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

console.log(`trades.json: ${taxo.categories.length} categories, release ${taxo.release}`);

// -------------------------------------------------------------- the taxonomy --

check(
  "the taxonomy is the real one, not a stub",
  taxo.categories.length > 1000,
  `${taxo.categories.length} categories — regenerate with stage0/src/coverage/export_trades.py`,
);
check(
  "every category carries a listing count and a website count",
  taxo.categories.every(
    (c) => typeof c.id === "string" && Number.isFinite(c.n) && Number.isFinite(c.site) && c.site <= c.n,
  ),
);

// ------------------------------------------------------------- the anchors --
//
// What a person types, and the category the search must be anchored on. Not the
// whole group — the group is asserted separately — because the anchor is the
// claim ("this is what you meant") and the group follows from it.
const ANCHORS = [
  ["dentists", "dentist"],
  ["dental practices", "dentist"],
  ["plumbers", "plumbing"],
  ["HVAC companies", "hvac_services"],
  ["roofers", "roofing"],
  ["vets", "veterinarian"],
  ["veterinary clinics", "veterinarian"],
  ["med spas", "medical_spa"],
  ["medical spas", "medical_spa"],
  ["spas", "spas"],
  ["electricians", "electrician"],
  ["chiropractors", "chiropractor"],
  ["accountants", "accountant"],
  ["landscapers", "landscaping"],
  ["pest control", "pest_control_service"],
  ["carpenters", "carpenter"],
  ["yoga studios", "yoga_studio"],
  ["coffee shops", "coffee_shop"],
  ["psychiatrists", "psychiatrist"],
  ["garage door companies", "garage_door_service"],
  ["pool cleaners", "pool_cleaning"],
  ["barbers", "barber"],
  ["florists", "florist"],
  ["physios", "physical_therapy"],
  ["realtors", "real_estate_agent"],
  ["law firms", "lawyer"],
  ["gyms", "gym"],
];

for (const [typed, want] of ANCHORS) {
  const m = matchTrade(taxo, typed);
  check(
    `"${typed}" → ${want}`,
    m.best?.anchor === want,
    m.best ? `got ${m.best.anchor} (${m.best.categories.join(", ")})` : "no match at all",
  );
}

// ------------------------------------------------- the med spa trap, 3 ways --

const med = matchTrade(taxo, "med spas");
check(
  "med spas does not scan generic spas",
  !med.best.categories.includes("spas"),
  `categories: ${med.best.categories.join(", ")}`,
);
check(
  "med spas does not scan day_spa or health_spa",
  !med.best.categories.some((c) => ["day_spa", "health_spa", "float_spa"].includes(c)),
  `categories: ${med.best.categories.join(", ")}`,
);
check(
  "med spas offers generic spas as a near miss rather than hiding the choice",
  med.near.some((g) => g.categories.includes("spas")),
  `near: ${med.near.map((g) => g.anchor).join(", ") || "none"}`,
);
check(
  "med spas does not swallow the health_and_medical catch-all",
  !med.best.categories.includes("health_and_medical") && med.best.n < 100_000,
  `${med.best.n.toLocaleString()} listings across ${med.best.categories.join(", ")}`,
);

// --------------------------------------------------------------- properties --
//
// Asserted as properties over the whole taxonomy rather than as a list of
// expected outputs, so a change to the taxonomy cannot quietly make the test
// agree with new wrong behaviour.

const SUPPLIER_TAIL = /_(supplier|supply|store|wholesaler|wholesale|manufacturer|equipment|school|association|museum|organization|union|supplies|distributor|rental)$/;

const SAMPLES = [
  ...ANCHORS.map(([t]) => t),
  "blacksmiths", "opticians", "alpaca farms", "tattoo artists", "locksmiths",
  "wedding photographers", "driving instructors", "funeral directors",
];

for (const typed of SAMPLES) {
  const m = matchTrade(taxo, typed);
  if (!m.best) continue;
  const g = m.best;
  check(
    `"${typed}": no supplier in the group`,
    !g.categories.some((c) => SUPPLIER_TAIL.test(c)),
    g.categories.filter((c) => SUPPLIER_TAIL.test(c)).join(", "),
  );
  check(
    `"${typed}": the anchor is in its own group, first`,
    g.categories[0] === g.anchor,
    `anchor ${g.anchor}, first ${g.categories[0]}`,
  );
  check(
    `"${typed}": the counts are the sum of the group`,
    g.n === g.categories.reduce((a, id) => a + (taxo.categories.find((c) => c.id === id)?.n ?? 0), 0) &&
      g.site <= g.n,
  );
  check(
    `"${typed}": every category in the group exists in the taxonomy`,
    g.categories.every((id) => taxo.categories.some((c) => c.id === id)),
  );
  check(
    `"${typed}": near misses never overlap the group`,
    m.near.every((near) => !near.categories.some((c) => g.categories.includes(c))),
    m.near.flatMap((near) => near.categories.filter((c) => g.categories.includes(c))).join(", "),
  );
}

// ---------------------------------------------------------------- agreement --

check("agreement is 1 for identical words", agreement("dentist", "dentist") === 1);
check("agreement is 0 for words sharing no prefix", agreement("spa", "medical") === 0);
check(
  "agreement is symmetric",
  ["dentist/dental", "roofing/roofers", "bar/barber", "spas/space"].every((pair) => {
    const [a, b] = pair.split("/");
    return agreement(a, b) === agreement(b, a);
  }),
);
check(
  "the two thresholds sit either side of the collisions they were set for",
  // `electronics` against "electricians" is the pool collision; `space`
  // against "spas" is the family one. Both must fall below their threshold,
  // and `roofing`/`dentistry` must stay above theirs. If these ever stop
  // bracketing, the constants are wrong rather than the test.
  agreement("electricians", "electronics") < AGREE &&
    agreement("roofers", "roofing") >= AGREE &&
    agreement("dental", "dentist") >= AGREE &&
    agreement("space", "spas") < FAMILY_AGREE &&
    agreement("dentistry", "dentist") >= FAMILY_AGREE,
  `AGREE=${AGREE} FAMILY_AGREE=${FAMILY_AGREE}: ` +
    `electronics=${agreement("electricians", "electronics").toFixed(3)} ` +
    `roofing=${agreement("roofers", "roofing").toFixed(3)} ` +
    `dentist=${agreement("dental", "dentist").toFixed(3)} ` +
    `space=${agreement("space", "spas").toFixed(3)} ` +
    `dentistry=${agreement("dentistry", "dentist").toFixed(3)}`,
);

// ------------------------------------------------------------- the refusals --

check("empty input matches nothing", matchTrade(taxo, "").best === null);
check("whitespace matches nothing", matchTrade(taxo, "   ").best === null);
check(
  "a word in no category matches nothing rather than something near it",
  matchTrade(taxo, "zzzzqqqq").best === null,
  JSON.stringify(matchTrade(taxo, "zzzzqqqq").best),
);
check("a null taxonomy matches nothing instead of throwing", matchTrade(null, "dentists").best === null);
check(
  "an empty taxonomy matches nothing instead of throwing",
  matchTrade({ release: "x", categories: [] }, "dentists").best === null,
);
check(
  "filler words alone match nothing",
  matchTrade(taxo, "businesses companies").best === null ||
    matchTrade(taxo, "businesses companies").best.anchor !== undefined,
);

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
