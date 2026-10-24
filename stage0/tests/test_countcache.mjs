/**
 * A cached count never opens DuckDB, and a fresh one is rationed.
 *
 *     node stage0/tests/test_countcache.mjs
 *
 * ## Why this exists
 *
 * On 2026-10-24 the Vercel team (Hobby, twelve projects) hit 100% of its
 * monthly Active CPU, and going over pauses every project. Each anonymous count
 * was a DuckDB scan of the places data inside a function, ~3 CPU-s, and nothing
 * stopped the next visitor or the same one pressing twice from paying it again.
 *
 * `countcache.ts` caches counts for a week and rations fresh scans per address.
 * What this holds is the *order* in each route — look up first, ration only on
 * a miss, scan last — because that order is the whole saving and it is exactly
 * what a later edit would quietly undo. Comments are stripped before matching
 * (`_source.mjs`), because this repository explains itself in prose and a
 * comment naming `findCandidates` is not a call to it.
 */

import { readFileSync } from "node:fs";

import { code } from "./_source.mjs";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

const src = (f) => code(readFileSync(f, "utf8"));
const before = (s, a, b) => s.indexOf(a) >= 0 && s.indexOf(b) >= 0 && s.indexOf(a) < s.indexOf(b);

// --- the key ---------------------------------------------------------------------

const lib = compileLib(["src/lib/db.ts", "src/lib/countcache.ts"], "sf-countcache-");
const { countKey, TTL_DAYS, PER_HOUR, PER_DAY } = await lib.load("countcache");

const denver = { label: "Denver, Colorado", scope: "city", sample: [], city: { center: [-104.9903, 39.7392] } };
const colorado = {
  label: "Colorado",
  scope: "state",
  sample: [{ center: [-104.9903, 39.7392] }, { center: [-104.8214, 38.8339] }],
  city: null,
};

check(
  "the same categories in a different order are one row",
  countKey("overture", ["b", "a"], denver, 25) === countKey("overture", ["a", "b"], denver, 25),
);
check("a city and its state are different rows", countKey("overture", ["a"], denver, 25) !== countKey("overture", ["a"], colorado, 25));
check("a wider radius is a different row", countKey("overture", ["a"], denver, 25) !== countKey("overture", ["a"], denver, 50));
check("a different provider is a different row", countKey("overture", ["a"], denver, 25) !== countKey("apify", ["a"], denver, 25));
check("the TTL is the week the owner asked for", TTL_DAYS === 7, `${TTL_DAYS}`);
check("the ration allows a person and stops a loop", PER_HOUR >= 5 && PER_DAY >= PER_HOUR && PER_DAY <= 100, `${PER_HOUR}/h ${PER_DAY}/day`);

// --- findCandidates: a count looks up before it scans ----------------------------

const providers = src("src/lib/providers.ts");
const fc = providers.slice(providers.indexOf("export async function findCandidates"));
check("findCandidates reads the cache before scanning a count", before(fc, "readCount(key)", "scanWith(chosen, q)"));
check("a cache hit returns before the ration is asked", before(fc, "if (hit)", "opts.allowScan"));
check("the ration is asked before the scan", before(fc, "opts.allowScan", "scanWith(chosen, q)"));
check("a fresh count is written back", /writeCount\(key/.test(fc));

// --- the anonymous routes --------------------------------------------------------

const pool = src("src/app/api/pool/route.ts");
check("/api/pool reads the cache, with samples, before anything else", before(pool, "readCount(key, true)", "takeScan(req)"));
check("/api/pool rations before it scans", before(pool, "takeScan(req)", "findCandidates("));
check("/api/pool stores the samples it shows", /writeCount\(key, COUNTING, \{[\s\S]{0,120}samples/.test(pool));
check("/api/pool says when a cached number was measured", /measuredAt: hit\.measuredAt/.test(pool));

const supply = src("src/app/api/supply/route.ts");
check("/api/supply rations only a visitor with no account", /allowScan: acct \? undefined : \(\) => takeScan\(req\)/.test(supply));
check("/api/supply answers a spent ration with 429", /Rationed\)[\s\S]{0,60}status: 429/.test(supply));
check("/api/supply passes the measured date to the screen", /measuredAt: supply\.measuredAt/.test(supply));

const mcp = src("src/app/api/mcp/route.ts");
check("the MCP count is rationed per caller", /allowScan: \(\) => takeScan\(req\)/.test(mcp));

// --- the screens say the date ----------------------------------------------------

check("/app says when a cached count was measured", /f\.cached && f\.measuredAt/.test(src("src/components/app/Discover.tsx")));
check("/app/find says when a cached count was measured", /counted\.cached && counted\.measuredAt/.test(src("src/components/app/PoolSearch.tsx")));

// --- the migration -----------------------------------------------------------------

const mig = readFileSync("supabase/migrations/0033_count_cache.sql", "utf8");
check("take_scan is not callable by anon or signed-in roles", /revoke all on function public\.take_scan[\s\S]*from public, anon, authenticated/.test(mig));
check("both tables have RLS on", /supply_counts enable row level security/.test(mig) && /scan_log enable row level security/.test(mig));

console.log(failures ? `\n${failures} failed` : "\nall good");
process.exit(failures ? 1 : 0);
