/**
 * "pheonix" is not nowhere.
 *
 *     node stage0/tests/test_nearest_city.mjs
 *
 * The owner typed it. Two keystrokes from the fourth-largest city in the
 * country, and the product said "We couldn't place that" and stopped — a dead
 * end for a transposed vowel, on the screen that had just told them any US city
 * works.
 *
 * ## The sharp edge is the other direction
 *
 * A suggester that is too eager is worse than none, because it turns a typo
 * into a confident answer about a city nobody asked for — the same class of
 * mistake as `marketFor`'s old `?? candidates[0]`, which answered Dallas with
 * Phoenix data. So the assertions below are mostly about what it must **not**
 * do: never fire for a city that already resolves, never reach past its edit
 * budget, and never be acted on without the person pressing it (that last one
 * lives in `NotRead.tsx`, which renders it as a link and not a redirect).
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(["src/lib/region.ts"], "sf-near-");
const { nearestCity, resolveRegion, distance } = await load("region");

const places = JSON.parse(readFileSync("public/data/places-us.json", "utf8"));

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

console.log(`places-us.json: ${places.cities.length} cities`);

// ------------------------------------------------------------- the distance --

check(
  "a transposition costs one edit, not two",
  // The whole reason three rows are kept instead of two. A plain Levenshtein
  // scores this 2, which is outside the budget for a 7-letter word.
  distance("pheonix", "phoenix", 2) === 1,
  `got ${distance("pheonix", "phoenix", 2)}`,
);
check("identical strings are zero", distance("dallas", "dallas", 2) === 0);
check(
  "it gives up rather than counting past the cap",
  distance("zzzzzzzzzz", "phoenix", 2) > 2,
);
check(
  "it is symmetric",
  ["pheonix/phoenix", "dalas/dallas", "austn/austin"].every((p) => {
    const [a, b] = p.split("/");
    return distance(a, b, 3) === distance(b, a, 3);
  }),
);

// ---------------------------------------------------------------- the typos --

const TYPOS = [
  ["pheonix", "Phoenix"],
  ["dalas", "Dallas"],
  ["austn", "Austin"],
  ["bosie", "Boise"],
  ["clevland", "Cleveland"],
  ["chigago", "Chicago"],
  ["san franciso", "San Francisco"],
  ["Los Angelas", "Los Angeles"],
];

for (const [typed, want] of TYPOS) {
  const n = nearestCity(places, typed);
  check(
    `"${typed}" → ${want}`,
    n?.city.name === want,
    n ? `got ${n.label}` : "no suggestion at all",
  );
}

// ------------------------------------------------- what it must not do -------

check(
  "a city that already resolves gets no suggestion",
  // Otherwise the screen offers to correct a spelling that was right, and the
  // person doubts the answer they were given.
  ["Phoenix", "Dallas", "Boise", "New York", "Columbus"].every(
    (c) => resolveRegion(places, c) && nearestCity(places, c) === null,
  ),
);
check(
  "a state that resolves gets no suggestion",
  ["Texas", "Arizona", "tx"].every((s) => nearestCity(places, s) === null),
);
check(
  "nonsense gets no suggestion rather than the nearest big city",
  ["zzzqqville", "qqqqqqqq", "asdfghjkl"].every((s) => nearestCity(places, s) === null),
  ["zzzqqville", "qqqqqqqq", "asdfghjkl"]
    .map((s) => `${s} → ${nearestCity(places, s)?.label ?? "—"}`)
    .join(", "),
);
check(
  "a short word is held to one edit, so near-miss real names are not swapped",
  // "Troy" and "Tracy", "Cary" and "Gary" are two edits apart and both real.
  // A flat budget of two would offer to replace one real city with another.
  nearestCity(places, "troy") === null && nearestCity(places, "cary") === null,
  `troy → ${nearestCity(places, "troy")?.label ?? "—"}, cary → ${nearestCity(places, "cary")?.label ?? "—"}`,
);
check(
  "very short input is refused outright",
  ["ab", "x", "nyx"].every((s) => nearestCity(places, s) === null),
);
check(
  "a null places file returns null rather than throwing",
  nearestCity(null, "pheonix") === null,
);
check(
  "every suggestion is a real city in the file, with its state spelled out",
  TYPOS.every(([typed]) => {
    const n = nearestCity(places, typed);
    return (
      n &&
      places.cities.some((c) => c.name === n.city.name && c.state === n.city.state) &&
      n.label.includes(",")
    );
  }),
);

// ------------------------------------------------------------- the aliases --

const ALIASES = [
  ["nyc", "New York"],
  ["philly", "Philadelphia"],
  ["vegas", "Las Vegas"],
  ["sf", "San Francisco"],
  ["nola", "New Orleans"],
];
for (const [typed, want] of ALIASES) {
  const r = resolveRegion(places, typed);
  check(`"${typed}" resolves to ${want}`, r?.city?.name === want, r ? r.label : "null");
}
check(
  "a nickname never outranks a real state code",
  // "la" is Louisiana. If it ever resolves to Los Angeles, somebody has put a
  // nickname above `STATE_ABBR` and a search for a state silently became a
  // search for a city.
  resolveRegion(places, "la")?.scope === "state",
  JSON.stringify(resolveRegion(places, "la")?.label ?? null),
);

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
