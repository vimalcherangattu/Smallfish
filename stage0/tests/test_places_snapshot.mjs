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
  job.indexOf("CONTRACT FAILED") > 0 && job.indexOf("CONTRACT FAILED") < job.indexOf('put_json("manifest.json"'),
);
{
  // Old copies are deleted only once the manifest points elsewhere, so the
  // live copy is never removed, and two are kept for a rollback.
  const promoted = job.slice(job.indexOf('put_json("manifest.json"'));
  check("old copies are pruned only after the manifest moves", /prune\(keep\)/.test(promoted));
  check("the previous copy is kept for a rollback", /keep = \{copy_id\} \| \(\{manifest\["previous"\]\}/.test(job));
  check(
    "the tile index is written before the manifest that names it",
    job.indexOf('put_json(f"places/{copy_id}/index.json"') > 0 &&
      job.indexOf('put_json(f"places/{copy_id}/index.json"') < job.indexOf('put_json("manifest.json"'),
  );
  check("a new layout never writes over the live copy's folder", /copy_id = f"\{release\}\.\{LAYOUT\}"/.test(job));
}
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

check(
  "only a missing manifest counts as a first run",
  /NoSuchKey/.test(job) && !/except duckdb\.Error:\s*\n\s*live = None/.test(job),
);

// --- tile selection --------------------------------------------------------------

{
  const { compileLib } = await import("./_tsmodules.mjs");
  const lib = compileLib(["src/lib/supply.ts", "src/lib/region.ts"], "sf-tiles-");
  const { tilesFor } = await lib.load("supply");
  const tile = (f, b) => ({ f, b });
  const T = [
    tile("denver", [-105.2, -104.8, 39.5, 39.9]),
    tile("boulder", [-105.4, -105.1, 39.9, 40.2]),
    tile("miami", [-80.4, -80.0, 25.6, 25.9]),
    tile("far", [-120, -119, 47, 48]),
  ];
  const denver = { label: "Denver", scope: "city", sample: [], city: { center: [-104.9903, 39.7392] } };
  const got = tilesFor(T, denver, 25).map((t) => t.f).sort().join(",");
  check("a city search opens the tiles its radius overlaps, and only those", got === "boulder,denver", got);
  const state = { label: "Two cities", scope: "state", sample: [{ center: [-104.9903, 39.7392] }, { center: [-80.1918, 25.7617] }], city: null };
  const got2 = tilesFor(T, state, 25).map((t) => t.f).sort().join(",");
  check("a state search tests each sampled city, not their union", got2 === "boulder,denver,miami", got2);
  check("a search nowhere near any tile opens none", tilesFor(T, { label: "x", scope: "city", sample: [], city: { center: [-70, 44] } }, 25).length === 0);
}
check("an empty selection is an honest zero, not an error", /CREATE TEMP TABLE hits \(id VARCHAR/.test(supply));
check("tile paths from the bucket are checked before they reach SQL", /const TILE_PATH = /.test(supply) && /TILE_PATH\.test\(t\.f\)/.test(supply));

console.log(failures ? `\n${failures} failed` : "\nall good");
process.exit(failures ? 1 : 0);
