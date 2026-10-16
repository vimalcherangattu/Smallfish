/**
 * The /how-many pages' slugs and the trades they promise (GTM, SEO/AEO).
 *
 *     node stage0/tests/test_howmany.mjs
 *
 * Every trade on the list must resolve to real Overture categories, or its
 * pages would answer a question about the wrong businesses.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};

const { load } = compileLib(["src/lib/howmany.ts", "src/lib/trades.ts"], "sf-howmany-");
const H = await load("howmany");
const T = await load("trades");
const taxo = JSON.parse(readFileSync("public/data/trades.json", "utf8"));

test("slugs round-trip", () => {
  const s = H.slugFor("dentists", "Dallas", "TX");
  assert.equal(s, "dentists-in-dallas-tx");
  const p = H.parseSlug(s);
  assert.equal(p.trade.id, "dentists");
  assert.equal(p.citySlug, "dallas");
  assert.equal(p.state, "TX");
});

test("a city with 'in' in its name does not split the slug wrongly", () => {
  const p = H.parseSlug(H.slugFor("plumbers", "Irvine", "CA"));
  assert.equal(p.citySlug, "irvine");
  assert.equal(H.parseSlug(H.slugFor("hair-salons", "Fort Collins", "CO")).citySlug, "fort-collins");
});

test("unknown trades and junk are refused", () => {
  assert.equal(H.parseSlug("unicorns-in-dallas-tx"), null);
  assert.equal(H.parseSlug("../etc/passwd"), null);
});

test("per 10,000 residents and share are plain numbers", () => {
  assert.equal(H.perTenThousand(3336, 1304379), 25.6);
  assert.equal(H.perTenThousand(10, null), null);
  assert.equal(H.share(2983, 3336), 89);
});

for (const t of H.TRADES) {
  test(`"${t.query}" maps to listings categories`, () => {
    const m = T.matchTrade(taxo, t.query);
    assert.ok(m.best && m.best.categories.length, `no categories for ${t.query}`);
  });
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall pass");
