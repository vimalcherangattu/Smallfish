/** The saturation set and its publishing gate (S1-13, S1-14).
 *
 *  Programmatic pages are the fastest way to publish a claim nobody checked,
 *  so the tests are about what the gate refuses. A page headed "dental
 *  practices in Phoenix with no online booking" that lands on three results is
 *  worse than no page at all — it spends the visitor's attention and teaches
 *  them the product is thin.
 *
 *  node stage0/tests/test_saturation.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/saturation.ts", "src/lib/types.ts"], "sfsat-");
const { MIN_PROVEN_MATCHES, saturationSet, slugFor } = await load("saturation");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`); }
};

const index = JSON.parse(readFileSync("public/data/index.json", "utf8"));
const { pages, refused } = saturationSet(index);

check("the measured data publishes some pages", pages.length > 0);
check("and refuses others", refused.length > 0,
  "a build that drops what it cannot justify silently looks like one with nothing to drop");

check("every published page clears the gate",
  pages.every((p) => p.matches >= MIN_PROVEN_MATCHES),
  pages.map((p) => `${p.slug}:${p.matches}`).join(" "));
check("every refusal is below it",
  refused.every((r) => r.matches < MIN_PROVEN_MATCHES));
check("and every refusal says why in words a person can act on",
  refused.every((r) => r.why && r.why.length > 20));

check("a market with nothing judged says so, rather than reading as zero matches",
  refused.some((r) => /need a model run/.test(r.why)),
  "no verdicts and no matches are different facts");

check("slugs are unique", new Set(pages.map((p) => p.slug)).size === pages.length);
check("slugs are url-safe", pages.every((p) => /^[a-z0-9-]+$/.test(p.slug)));
check("a slug reads like the search someone would type",
  slugFor("dental", "Phoenix, AZ", "no_online_booking")
    === "dental-practices-with-no-online-booking-phoenix",
  slugFor("dental", "Phoenix, AZ", "no_online_booking"));

check("every page carries what it could not settle, not just what it matched",
  pages.every((p) => typeof p.couldNotSettle === "number" && typeof p.blocked === "number"),
  "42 matches from 166 read is a different claim from 42 from a whole market");
check("and the judged count is at least the match count",
  pages.every((p) => p.judged >= p.matches));

check("no index at all publishes nothing rather than throwing",
  saturationSet(null).pages.length === 0);

{
  // The gate must actually bite: drop every market to 19 matches and nothing
  // should publish.
  const thin = JSON.parse(JSON.stringify(index));
  for (const m of thin.markets)
    for (const c of Object.values(m.tallies ?? {})) if (c.match) c.match = 19;
  check(`nothing publishes at ${MIN_PROVEN_MATCHES - 1} matches`,
    saturationSet(thin).pages.length === 0,
    "if this passes at 19 the threshold is decorative");
}

// The sitemap is built from this same function, so a page that fails the gate
// can never be advertised. Asserted rather than assumed, because "generate the
// pages from A and the sitemap from B" is exactly how the two drift.
check("the sitemap source is the published set, not a second list",
  readFileSync("src/app/sitemap.ts", "utf8").includes("saturationSet"),
  "if the sitemap ever hardcodes slugs, a refused page can still be advertised");
check("and robots.txt keeps crawlers out of the demo and the API",
  ["/api/", "/app"].every((p) =>
    readFileSync("src/app/robots.ts", "utf8").includes(`"${p}"`)),
  "several megabytes of JSON behind a client-rendered screen indexes nothing");

console.log(`\n        published: ${pages.map((p) => `${p.slug} (${p.matches})`).join(", ")}`);
console.log(`        refused:   ${refused.map((r) => `${r.slug} (${r.matches})`).join(", ")}`);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
