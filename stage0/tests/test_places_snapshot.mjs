/**
 * Our own copy of the places, and the contract that guards it.
 *
 *     node stage0/tests/test_places_snapshot.mjs
 *
 * ## Why this exists
 *
 * On 2026-10-24 search was down for hours because `supply.ts` read Overture's
 * release live and Overture deleted it. Data sourcing step 1
 * (`docs/DATA-SOURCING.md`) moves the read onto a copy we own, built by
 * `stage0/src/coverage/snapshot_places.py` and promoted only when it passes a
 * contract. Those two files have to agree about things neither can check
 * alone, and the fallback has to stay, or the next outage is ours again.
 *
 * Static checks only: it reads the source, it does not need R2 or a network.
 */

import { readFileSync } from "node:fs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

const supply = readFileSync("src/lib/supply.ts", "utf8");
const job = readFileSync("stage0/src/coverage/snapshot_places.py", "utf8");
const taxo = JSON.parse(readFileSync("public/data/trades.json", "utf8"));
const places = JSON.parse(readFileSync("public/data/places-us.json", "utf8"));

// --- the two halves ask the same question ------------------------------------

const appRadius = Number(supply.match(/export const RADIUS_MILES = (\d+)/)?.[1]);
const jobRadius = Number(job.match(/^RADIUS_MILES = (\d+)/m)?.[1]);
check(
  "the canaries count the radius the app searches",
  appRadius > 0 && appRadius === jobRadius,
  `supply.ts ${appRadius}, snapshot_places.py ${jobRadius}`,
);

// `id` is copied under its own name; every other column is aliased.
check("the copy has the column the app reads: id", /SELECT id,/.test(job));
for (const col of ["name", "cat", "site", "phone", "addr", "town", "lon", "lat"]) {
  check(`the copy has the column the app reads: ${col}`, new RegExp(`AS ${col}\\b`).test(job));
}

// --- the canaries are real -----------------------------------------------------

const ids = new Set(taxo.categories.map((c) => c.id));
const cities = new Set(places.cities.map((c) => `${c.name}|${c.state}`));
const canaries = [...job.matchAll(/\("([a-z_]+)", "([^"]+)", "(US-[A-Z]{2})"\)/g)];
check("there are canaries", canaries.length >= 10, `${canaries.length}`);
for (const [, anchor, city, state] of canaries) {
  check(`canary ${anchor} @ ${city}: the category exists`, ids.has(anchor));
  check(`canary ${anchor} @ ${city}: the city resolves`, cities.has(`${city}|${state}`));
}

// --- the contract holds the gate, the app holds the fallback --------------------

check(
  "the manifest is written only after the contract passes",
  job.indexOf("CONTRACT FAILED") > 0 && job.indexOf("CONTRACT FAILED") < job.indexOf("manifest.json' (FORMAT json)"),
);
check(
  "an unconfigured deployment never tries the copy",
  /if \(snapshotConfigured\(\)\)/.test(supply),
);
check(
  "a failing copy falls back to Overture rather than failing the search",
  /catch \(err\)[\s\S]{0,200}reading Overture directly/.test(supply),
);
check(
  "the manifest's glob is validated before it reaches SQL",
  /manifest glob looks wrong/.test(supply),
);
check(
  "R2 settings are validated before they reach SQL",
  /const SAFE = \/\^\[A-Za-z0-9_.-\]\+\$\//.test(supply),
);

console.log(failures ? `\n${failures} failed` : "\nall good");
process.exit(failures ? 1 : 0);
