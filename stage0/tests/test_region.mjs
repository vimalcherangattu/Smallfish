/**
 * Any US region resolves, and a big one is sampled rather than refused (S2-09).
 *
 *     node stage0/tests/test_region.mjs
 *
 * The behaviour under test is a product decision as much as a technical one.
 * "Carpenters in Texas" used to be answered with "Texas is too big, pick a
 * city", which moves our cost problem onto the customer and answers a question
 * they did not ask. The rule now is that no region is refused for being large:
 * it is capped, spread across the cities where the businesses actually are, and
 * reported as the sample it is.
 *
 * Three ways that goes wrong, and each has a check below:
 *
 *   - **A sample that is not a sample.** 100 businesses drawn from Houston with
 *     "Texas" written at the top is a Houston list. The spread has to reach
 *     several cities and give each enough rows to mean something.
 *   - **A cap that is not reported.** A capped read presented as a complete one
 *     is the same defect as a guessed verdict: more confidence than the
 *     evidence carries.
 *   - **A typo that costs $50.** An unrecognised place must not fall back to
 *     "everywhere". Reading all of America because somebody misspelt a city is
 *     the most expensive possible reading of a mistake.
 */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/region.ts"], "sfreg-");
const R = await load("region");

const places = JSON.parse(
  readFileSync(path.join(process.cwd(), "public", "data", "places-us.json"), "utf8"),
);

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

// --- the data it rests on ----------------------------------------------------
check("every state is present", places.states.length === 51, `${places.states.length}`);
check(
  "and the cities carry real coordinates, not typed-from-memory ones",
  (() => {
    const austin = places.cities.find((c) => c.name === "Austin" && c.state === "US-TX");
    return (
      austin &&
      Math.abs(austin.center[0] + 97.74) < 0.1 &&
      Math.abs(austin.center[1] - 30.27) < 0.1
    );
  })(),
  "Austin should be near -97.74, 30.27",
);
check(
  "a state carries no bounding box",
  places.states.every((s) => !("bbox" in s)),
  "an Overture division row is a point; its bbox has zero area and would fail every containment test",
);

// --- a city ------------------------------------------------------------------
{
  const r = R.resolveRegion(places, "Austin, TX");
  check("a city resolves", r?.scope === "city" && r.city.state === "US-TX", JSON.stringify(r?.label));
  check("and is not reported as a sample", r && r.sampled === false);
  check("and offers nothing to narrow to, because there is nothing", r?.narrowTo.length === 0);
}
check(
  "a city named without its state still resolves",
  R.resolveRegion(places, "Phoenix")?.city?.state === "US-AZ",
);

// Overture stores "Saint Louis", "Fort Worth", "Mount Pleasant" and
// "Lee's Summit". Almost nobody types those. Before the aliases existed,
// "St. Louis" returned nothing and the failure read as "we do not cover
// Missouri" rather than "we disagree about an abbreviation".
for (const [typed, want] of [
  ["St. Louis, MO", "Saint Louis"],
  ["St Louis", "Saint Louis"],
  ["Ft. Worth", "Fort Worth"],
  ["Mt. Pleasant, SC", "Mount Pleasant"],
  ["Lees Summit, MO", "Lee's Summit"],
  ["San Antonio, TX", "San Antonio"],
  ["Washington, DC", "Washington"],
]) {
  check(`"${typed}" finds ${want}`, R.resolveRegion(places, typed)?.city?.name === want,
    R.resolveRegion(places, typed)?.label ?? "NULL");
}
{
  // Austin, Minnesota exists. Picking the larger silently would hand somebody a
  // list from the wrong state with nothing on screen to say so.
  const r = R.resolveRegion(places, "Austin");
  check(
    "an ambiguous city name says which one it picked",
    r?.scope === "city" && /more than one/i.test(r.note ?? ""),
    r?.note ?? "no note",
  );
  const mn = R.resolveRegion(places, "Austin, Minnesota");
  check("and naming the state picks the other one", mn?.city?.state === "US-MN", mn?.label);
}

// --- a state -----------------------------------------------------------------
{
  const r = R.resolveRegion(places, "Texas");
  check("a state resolves rather than being refused", r?.scope === "state", JSON.stringify(r?.label));
  check("it is capped", r && R.readsFor(r) <= R.CAP, `${r && R.readsFor(r)} reads`);
  check("it is marked as a sample", r?.sampled === true);
  check(
    "the sample reaches several cities, not just the biggest one",
    (r?.sample.length ?? 0) >= 5,
    `${r?.sample.length} cities`,
  );
  check(
    "and every city in it gets enough rows to be worth showing",
    r?.perCity.every((n) => n >= 6),
    JSON.stringify(r?.perCity),
  );
  check(
    "the note says there are more and how to get a better list",
    /more/i.test(r?.note ?? "") && /narrow/i.test(r?.note ?? ""),
    r?.note ?? "no note",
  );
  check(
    "and it offers cities to narrow to",
    (r?.narrowTo.length ?? 0) >= 8,
    `${r?.narrowTo.length}`,
  );
  check(
    "the biggest city in Texas is in the sample",
    r?.sample.some((c) => c.name === "Houston"),
    JSON.stringify(r?.sample.map((c) => c.name)),
  );
}
for (const typed of ["texas", "TX", "tx", "Texas"]) {
  check(`"${typed}" resolves to Texas`, R.resolveRegion(places, typed)?.label === "Texas");
}

// --- everywhere ---------------------------------------------------------------
for (const typed of ["the US", "USA", "America", "united states", "nationwide"]) {
  const r = R.resolveRegion(places, typed);
  check(`"${typed}" is read, not refused`, r?.scope === "country", JSON.stringify(r?.label));
  check(`  and capped at ${R.CAP}`, r && R.readsFor(r) <= R.CAP);
}
{
  const r = R.resolveRegion(places, "America");
  check(
    "a country search spreads across cities in different states",
    new Set(r.sample.map((c) => c.state)).size >= 3,
    JSON.stringify(r.sample.map((c) => `${c.name} ${c.state}`)),
  );
}

// --- the expensive mistake -----------------------------------------------------
for (const nonsense of ["Atlantis", "asdfgh", "", "   ", "Paris, France", "Toronto, Ontario"]) {
  check(
    `"${nonsense}" resolves to nothing, not to everywhere`,
    R.resolveRegion(places, nonsense) === null,
    "falling back to the whole country turns a typo into the most expensive search we offer",
  );
}

// --- the spread itself ----------------------------------------------------------
{
  const cities = [
    { name: "A", state: "US-XX", pop: 2_000_000, center: [0, 0] },
    { name: "B", state: "US-XX", pop: 1_000_000, center: [0, 0] },
    { name: "C", state: "US-XX", pop: 50_000, center: [0, 0] },
  ];
  const s = R.spread(100, cities);
  check("the spread never exceeds the cap", s.reduce((a, b) => a + b, 0) <= 100, JSON.stringify(s));
  check("it is proportional to population", s[0] > s[1] && s[1] > s[2], JSON.stringify(s));
  check("and the smallest city still gets a usable slice", s[2] >= 6, JSON.stringify(s));
  check("an empty list spreads to nothing rather than dividing by zero", R.spread(100, []).length === 0);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
