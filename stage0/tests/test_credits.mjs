/**
 * Footer credits (GTM): "Website by X" finds the agency, never the business
 * itself, never a platform, and a network is counted but not pitched.
 *
 *     node stage0/tests/test_credits.mjs
 */
import assert from "node:assert/strict";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};
const { load } = compileLib(["src/lib/credits.ts"], "sf-credits-");
const C = await load("credits");
const site = "https://www.smiledentalphx.com/";
const foot = (inner) => `<html><body><p>We are a dental office.</p><footer>© 2026 Smile Dental. ${inner}</footer></body></html>`;

test("the words in front of the link", () => {
  const c = C.creditsIn(foot(`Website by <a href="https://acmeweb.co/?ref=smile">Acme Web Co</a>`), site);
  assert.deepEqual(c, [{ agency: "acmeweb.co", name: "Acme Web Co", phrase: "website by" }]);
});
test("the words inside the link", () => {
  const c = C.creditsIn(foot(`<a href="https://www.pixelfoxstudio.com">Designed by Pixel Fox Studio</a>`), site);
  assert.equal(c[0].agency, "pixelfoxstudio.com");
  assert.equal(c[0].name, "Pixel Fox Studio");
});
test("markup between the words and the link", () => {
  const c = C.creditsIn(foot(`<span>Web Design &amp; Development by</span> <strong><a href="//brightlocal-agency.com">Bright</a></strong>`), site);
  assert.equal(c[0]?.agency, "brightlocal-agency.com");
});
test("a link with no credit words is not a credit", () => {
  assert.deepEqual(C.creditsIn(foot(`<a href="https://ada.org">American Dental Association</a>`), site), []);
});
test("the business's own links are never its builder", () => {
  assert.deepEqual(C.creditsIn(foot(`Website by <a href="https://book.smiledentalphx.com">us</a>`), site), []);
});
test("platforms are not agencies", () => {
  assert.deepEqual(C.creditsIn(foot(`Powered by <a href="https://www.squarespace.com">Squarespace</a>`), site), []);
  assert.deepEqual(C.creditsIn(foot(`Built with <a href="https://wordpress.org">WordPress</a>`), site), []);
});
test("a network is found but not prospectable", () => {
  const c = C.creditsIn(foot(`Website powered by <a href="https://www.officite.com">Officite</a>`), site);
  assert.equal(c[0].agency, "officite.com");
  assert.equal(C.prospectable("officite.com"), false);
  assert.equal(C.prospectable("tebra.com"), false);
  assert.equal(C.prospectable("acmeweb.co"), true);
});
test("one agency linked twice is one credit", () => {
  const c = C.creditsIn(foot(`Site by <a href="https://acmeweb.co">Acme</a> | <a href="https://acmeweb.co/contact">Site by Acme</a>`), site);
  assert.equal(c.length, 1);
});

if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nall pass");
