/**
 * The prospect finder's judgment (GTM, outreach A1).
 *
 *     node stage0/tests/test_prospects.mjs
 *
 * Every niche we attach to an agency becomes a sentence in a cold email, so the
 * rules here are about what we decline to claim: a footer list of forty
 * industries is not a niche, a niche without a quote is not a niche, and an
 * address on somebody else's domain is not the agency's.
 */

import assert from "node:assert/strict";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};

const { load } = compileLib(["src/lib/prospects.ts"], "sf-prospects-");
const P = await load("prospects");

test("an agency that leads with a trade gets it, with its own sentence", () => {
  const text = "Dental Marketing That Fills Chairs. We help dental practices across Arizona grow. Our dentists see more new patients.";
  const hits = P.nichesIn(text, text.slice(0, 200));
  assert.equal(hits[0].id, "dental");
  assert.ok(hits[0].leads);
  assert.match(hits[0].quote, /dent/i);
  assert.equal(P.primaryNiche(hits).id, "dental");
});

test("one passing mention is not enough to write about", () => {
  const hits = P.nichesIn("Full-service digital agency. Clients include a roofing company and others in town.");
  assert.equal(hits[0].id, "roofing");
  assert.equal(P.primaryNiche(hits), null);
});

test("a generalist listing many trades gets no niche unless it leads with one", () => {
  const list = ["dentists", "plumbers", "HVAC companies", "roofers", "law firms", "realtors", "chiropractors"]
    .map((t) => `We have done marketing for many ${t} over the years. Our ${t} clients grow. We run ads for ${t} well.`).join(" ");
  const hits = P.nichesIn(`We are a creative agency. ${list}`, "We are a creative agency.");
  assert.ok(hits.length > 5);
  assert.equal(P.primaryNiche(hits), null);
});

test("word boundaries: 'incidental' is not dental, 'flaw' is not law", () => {
  assert.deepEqual(P.nichesIn("Incidental costs are a flaw in most proposals we review.").map((h) => h.id), []);
});

test("quotes are trimmed to a readable length", () => {
  const long = "Over the years we have come to do marketing for HVAC companies " + "and many other kinds of businesses ".repeat(20) + ".";
  const hits = P.nichesIn(long);
  assert.ok(hits[0].quote.length <= 200, String(hits[0].quote.length));
});

test("the agency's own named address beats a role address beats a stranger's", () => {
  assert.equal(P.pickEmail(["info@acme.com", "jane@acme.com", "dev@gmail.com"], "acme.com"), "jane@acme.com");
  assert.equal(P.pickEmail(["dev@gmail.com", "hello@acme.com"], "acme.com"), "hello@acme.com");
  // measured: an Austin agency published another company's address
  assert.equal(P.pickEmail(["sam@otheragency.com"], "acme.com"), null);
  assert.equal(P.pickEmail(["noreply@acme.com", "careers@acme.com"], "acme.com"), null);
});

test("domains are keyed without www or scheme", () => {
  assert.equal(P.domainOf("http://www.Acme.com/about"), "acme.com");
  assert.equal(P.domainOf("acme.com"), "acme.com");
  assert.equal(P.domainOf("::"), null);
});

test("every niche names a trade, and the agency categories exist in the taxonomy", async () => {
  for (const n of P.NICHES) assert.ok(n.trade && n.label && n.pattern instanceof RegExp, n.id);
});

test("a contractor's testimonial is not an agency's niche", () => {
  // measured: Phoenix, a company filed as a marketing agency
  const t = "They took care of the plumbing, HVAC, and installed new flooring. Great plumbing work. Fixed our plumbing fast.";
  assert.deepEqual(P.nichesIn(t).map((h) => h.id), []);
});

test("'competitive landscape' is not landscaping", () => {
  assert.deepEqual(P.nichesIn("We read the competitive landscape. The media landscape changes fast. A new landscape for brands.").map((h) => h.id), []);
});

test("a nav bar repeated on every page counts once and is never the quote", () => {
  const nav = "About Us Services SEO Web Design Dental Marketing Med Spa Marketing Contact";
  const text = [nav, nav, nav, "We have grown dental practices across Texas for ten years."].join("\n");
  const hits = P.nichesIn(text);
  const d = hits.find((h) => h.id === "dental");
  assert.equal(d.mentions, 2);
  assert.match(d.quote, /^We have grown dental practices/);
  assert.equal(hits.find((h) => h.id === "medspa"), undefined, "a niche named only in a menu has no quote");
});

test("restaurants count only when the agency leads with them", () => {
  assert.deepEqual(P.nichesIn("Press: Nation's Restaurant News covered our client work this year.").map((h) => h.id), []);
  assert.equal(P.nichesIn("Restaurant marketing that fills tables. We work with restaurants only.", "Restaurant marketing that fills tables.")[0].id, "restaurant");
});

test("entities are decoded before quoting", () => {
  const hits = P.nichesIn("We&#8217;re the agency dentists call. We help dental offices across the whole of Texas grow. Dental SEO done right for every kind of clinic.");
  assert.match(hits[0].quote, /We're/);
});

const fs = await import("node:fs");
const taxo = JSON.parse(fs.readFileSync("public/data/trades.json", "utf8"));
test("agency categories are real Overture ids", () => {
  const ids = new Set(taxo.categories.map((c) => c.id));
  for (const c of P.AGENCY_CATEGORIES) assert.ok(ids.has(c), c);
});

const sig = fs.readFileSync("src/lib/signals.ts", "utf8");
test("every niche has a gap, and every gap is a provable signal", () => {
  for (const n of P.NICHES) {
    const g = P.GAP[n.id];
    assert.ok(g, `no gap for ${n.id}`);
    const block = sig.slice(sig.indexOf(`id: "${g}"`), sig.indexOf(`id: "${g}"`) + 400);
    assert.match(block, /provable: true/, `${g} is not provable`);
  }
});

test("the list query reads as a search", () => {
  assert.equal(P.listQuery({ id: "dental", label: "dentists" }, "Phoenix, AZ", "has no online booking"), "dentists in Phoenix, AZ that have no online booking");
});

test("tokens are ten characters with no lookalikes", () => {
  const t = P.token((n) => Uint8Array.from({ length: n }, (_, i) => i * 37));
  assert.equal(t.length, 10);
  assert.doesNotMatch(t, /[01IlO]/);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall pass");
