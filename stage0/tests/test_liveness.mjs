/**
 * The "readable" number on /app/find counts only websites that are there.
 *
 * GTM stream, 2026-11-01: 8–14% of the websites listed for businesses in
 * customer trades are dead domains, and the count called every one of them "a
 * website we can read". That is the number the free front door leads with
 * (DEW), so it is measured, not assumed.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(["src/lib/pool.ts", "src/lib/liveness.ts", "src/lib/fetchoutcome.ts", "src/lib/worklist.ts"], "sf-live-");
const P = await load("pool");
const L = await load("liveness");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

/* ------------------------------------------------------------ the math -- */
check("unmeasured is null, never a guess", P.liveSites(500, null) === null && P.liveSites(500, { checked: 0, dead: 0 }) === null);
{
  const c = P.liveSites(30, { checked: 30, dead: 3 });
  check("a pool checked whole is exact", c.exact && c.live === 27);
}
{
  const c = P.liveSites(2000, { checked: 40, dead: 4 });
  check("a sample is applied to the whole and marked as an estimate", !c.exact && c.live === 1800);
}
check("a pool with live sites is never rounded down to none", P.liveSites(3, { checked: 2, dead: 1 }).live >= 1 && P.liveSites(10000, { checked: 40, dead: 39 }).live >= 1);
check("every site dead is zero", P.liveSites(100, { checked: 40, dead: 40 }).live === 0);
check("more dead than checked cannot happen, and is clamped if it does", P.liveSites(10, { checked: 10, dead: 12 }).live === 0);

/* ----------------------------------------------------------- the words -- */
{
  const plain = P.poolClaim(515, 432, "plumbers", "Denver, Colorado");
  check("without a measurement, it says what the listings say, not 'can read'", /432 list a website\./.test(plain) && !/can read/.test(plain), plain);
  const est = P.poolClaim(515, 432, "plumbers", "Denver, Colorado", P.liveSites(432, { checked: 40, dead: 4 }));
  check("an estimate says 'About'", /About 389 have a live website we can read\./.test(est), est);
  const exact = P.poolClaim(18, 18, "tattoo shops", "Asheville", P.liveSites(18, { checked: 18, dead: 2 }));
  check("an exact count does not", /\. 16 have a live website we can read\./.test(exact), exact);
  const none = P.poolClaim(5, 5, "x", "y", P.liveSites(5, { checked: 5, dead: 5 }));
  check("and all dead is said plainly", /none of their listed websites is still there/.test(none), none);
  check(
    "the note says how it was measured",
    /^We checked 40 of the listed websites at random against public DNS: 4 no longer exist, so/.test(P.liveNote(P.liveSites(432, { checked: 40, dead: 4 }))) &&
      /^We checked all 18 listed websites against public DNS: 1 no longer exists, so/.test(P.liveNote(P.liveSites(18, { checked: 18, dead: 1 }))),
  );
}

/* --------------------------------------------------------- the sample -- */
{
  const asked = [];
  const dns = async (h) => {
    asked.push(h);
    return h.startsWith("dead") ? "nxdomain" : h.startsWith("void") ? "no_address" : h.startsWith("flaky") ? null : "resolves";
  };
  const sites = [
    ...Array.from({ length: 10 }, (_, i) => `https://www.chain.com/loc/${i}`),
    "https://dead1.com", "http://dead2.com/x", "https://void.com", "https://flaky.com",
    "https://a.com", "https://b.com", null, "",
  ];
  const r = await L.measureLiveness(sites, { dns, n: 100 });
  check("a chain's ten listings are one lookup", asked.filter((h) => h === "chain.com").length === 1);
  check("a lookup that fails is dropped from both sides", r.checked === 6 && r.dead === 3, JSON.stringify(r));
  check("no lookup is made for an empty listing", !asked.includes("") && asked.length === 7);
}
{
  const asked = [];
  const many = Array.from({ length: 500 }, (_, i) => `https://s${i}.com`);
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  await L.measureLiveness(many, { dns: async (h) => (asked.push(h), "resolves"), random });
  check("a big pool is sampled, not checked whole", asked.length === L.LIVENESS_SAMPLE && new Set(asked).size === asked.length);
  check("and the sample is spread across the list, not its first rows", asked.some((h) => Number(h.slice(1, -4)) > 250));
}
check("nothing answerable is null", (await L.measureLiveness(["https://x.com"], { dns: async () => null })) === null);

/* ---------------------------------------------------------- wired in -- */
{
  const pool = readFileSync("src/app/api/pool/route.ts", "utf8");
  const supply = readFileSync("src/app/api/supply/route.ts", "utf8");
  const cache = readFileSync("src/lib/countcache.ts", "utf8");
  check("/app/find measures on a miss and keeps it with the count", /measureLiveness\(rows\.map/.test(pool) && /live: check,/.test(pool));
  check("and a cached count carries its measurement back", /claimOf\(hit\.listings, hit\.withSite, hit\.live\)/.test(pool));
  check("the next screen sizes against live sites when measured", /live\?\.live \?\? supply\.withSite/.test(supply));
  check("a write with no measurement never wipes one", /\.\.\.\(v\.live \? \{ live_checked/.test(cache));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
