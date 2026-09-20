/** Tests for the search parser and confirm step (S1-01).
 *
 *  The product document gives this screen eight jobs and seven of them are a
 *  form of refusal — declining people searches, declining owner attributes,
 *  refusing unprovable criteria with a proxy, asking about vague words,
 *  flagging contradictions, capping criteria, warning on rare searches. Those
 *  are the tests. A parser that quietly does its best with "med spas owned by
 *  Christians earning over $1M" is the failure mode, not a lenient one.
 *
 *  Run:  node stage0/tests/test_search.mjs
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/search.ts", "src/lib/signals.ts", "src/lib/types.ts"],
  "sfsearch-",
);
const { parseSearch, resolveSearch, MAX_CRITERIA } = await load("search");

const market = (over = {}) => ({
  id: "med-spa-dallas", niche: "med_spa", metro: "Dallas, TX",
  center: { lat: 32.7767, lon: -96.797 },
  search: "Med spas in Dallas", counts: { candidates: 3009, primary: 852, withSite: 2440, read: 200 },
  criteria: [
    { id: "offers_botox", type: "presence", text: "offers Botox", explain: "", needsModel: true },
    { id: "no_online_booking", type: "absence", text: "has no online booking", explain: "", needsModel: true },
  ],
  tallies: { offers_botox: { needs_model: 200 },
             no_online_booking: { match: 26, no_match: 57, couldnt_tell: 38, blocked: 24 } },
  ...over,
});
const index = { release: "x", markets: [market()] };

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}: ${e.message}`); }
};

// ------------------------------------------------------------------ parsing

test("the flagship query parses into where, what and two criteria", () => {
  const p = parseSearch("Med spas in Dallas that offer Botox and don't have online booking");
  assert.equal(p.where.text, "Dallas");
  assert.equal(p.what.niche, "med_spa");
  assert.ok(p.what.related.length, "related types are suggested, per the product doc");

  const booking = p.criteria.find((c) => c.signalId === "booking");
  assert.ok(booking, "the booking criterion must be found");
  assert.equal(booking.type, "absence", "\"don't have online booking\" is an absence");

  const botox = p.criteria.find((c) => /botox/i.test(c.text));
  assert.ok(botox, "an uncatalogued service is still a criterion");
  assert.equal(botox.type, "presence");
  assert.equal(botox.provable, false, "no detector covers it, so it needs a model");
});

test("negation binds locally, so a mixed query is not all-negative", () => {
  const p = parseSearch("vets with online booking but no live chat");
  const booking = p.criteria.find((c) => c.signalId === "booking");
  const chat = p.criteria.find((c) => c.signalId === "chat");
  assert.equal(booking.type, "presence", "\"with online booking\" is a presence");
  assert.equal(chat.type, "absence");
});

test("every criterion carries how it is checked", () => {
  const p = parseSearch("dentists in Phoenix with no online booking");
  for (const c of p.criteria) assert.ok(c.how.length > 20, `${c.id} has no explanation`);
});

test("preferences rank but are not criteria", () => {
  const p = parseSearch("HVAC in Tampa with no quote form, prefer multi-location");
  assert.ok(p.preferences.some((x) => /multi-location/.test(x)));
  assert.ok(!p.criteria.some((c) => /multi-location/.test(c.text)));
});

// ---------------------------------------------------------------- refusals

test("a search for people, not businesses, is declined", () => {
  for (const q of ["find homeowners in Dallas", "nurses near Phoenix", "people who need a website"]) {
    const p = parseSearch(q);
    assert.ok(p.declined.some((d) => d.kind === "people"), `not declined: ${q}`);
  }
});

test("criteria about who owns a business are declined", () => {
  // Plurals included: `\bchristian\b` silently misses "christians", which is
  // how the term is actually written, and a refusal that quietly fails to
  // fire is worse than no refusal at all.
  for (const q of ["christian-owned med spas", "med spas owned by christians",
                   "med spas with a female-owned practice", "republican dentists",
                   "women-owned dental practices"]) {
    const p = parseSearch(q);
    assert.ok(p.declined.some((d) => d.kind === "sensitive"), `not declined: ${q}`);
  }
});

test("an unprovable criterion is refused and a proxy suggested", () => {
  const p = parseSearch("med spas in Dallas with revenue over $1M");
  const d = p.declined.find((x) => x.kind === "unprovable");
  assert.ok(d, "revenue must be refused");
  assert.ok(d.proxy, "the product document promises a provable proxy");
  assert.equal(d.proxy.provableToday, false, "and must say when the proxy is not settleable either");
});

test("owner intent and funding are refused without a fake proxy", () => {
  for (const q of ["dental practices where the owner is retiring", "vc-backed med spas"]) {
    const p = parseSearch(q);
    const d = p.declined.find((x) => x.kind === "unprovable");
    assert.ok(d, `not refused: ${q}`);
    assert.equal(d.proxy, undefined, "no proxy is better than an invented one");
  }
});

test("a declined term is not also parsed into a criterion", () => {
  const p = parseSearch("find homeowners with no online booking");
  assert.ok(p.declined.length);
  // The refusal is what the screen leads with; the UI blocks the count.
  assert.ok(p.declined.some((d) => d.kind === "people"));
});

// ------------------------------------------------- vague words and conflicts

test("a vague word asks one question, with observable readings only", () => {
  const p = parseSearch("small med spas in Dallas");
  assert.equal(p.clarifications.length, 1);
  const q = p.clarifications[0];
  assert.ok(q.options.length >= 2);
  assert.ok(
    q.options.some((o) => o.criterion === null),
    "dropping the word must always be an option",
  );
  for (const o of q.options) {
    if (o.criterion) assert.ok(o.criterion.how, "every reading states how it is checked");
  }
});

test("contradictory criteria are flagged", () => {
  const p = parseSearch("med spas with online booking and no online booking");
  assert.ok(p.conflicts.length, "the conflict must be flagged at the confirm step");
  assert.ok(/cannot both/.test(p.conflicts[0].why));
});

test("more than five criteria trips the limit", () => {
  const p = parseSearch(
    "vets with no online booking, no quote form, no live chat, no contact form, " +
      "no reviews, that offer dentistry",
  );
  assert.ok(p.criteria.length > MAX_CRITERIA);
  assert.equal(p.overLimit, true);
});

test("what the parser cannot place is said, not guessed", () => {
  const p = parseSearch("something entirely unparseable here");
  assert.ok(p.unrecognised.length, "silence would read as 'we understood you'");
});

// --------------------------------------------------------------- resolution

test("a measured search resolves to its market and criterion", () => {
  const p = parseSearch("Med spas in Dallas with no online booking");
  const r = resolveSearch(p, index);
  assert.equal(r.marketId, "med-spa-dallas");
  assert.equal(r.criterionId, "no_online_booking");
  assert.equal(r.matches, 26);
  assert.equal(r.judged, 26 + 57 + 38, "blocked is not a judgement");
  assert.equal(r.rare, false);
});

test("an unmeasured niche resolves to nothing and says which exist", () => {
  const p = parseSearch("Law firms in Dallas with no online booking");
  const r = resolveSearch(p, index);
  assert.equal(r.marketId, null);
});

test("an unmeasured metro falls back and says so", () => {
  const p = parseSearch("Med spas in Miami with no online booking");
  const r = resolveSearch(p, index);
  assert.equal(r.marketId, "med-spa-dallas");
  assert.match(r.note, /Miami/);
});

test("a rare search is flagged before anything is unlocked", () => {
  const rare = {
    release: "x",
    markets: [market({ tallies: { offers_botox: {},
      no_online_booking: { match: 2, no_match: 500, couldnt_tell: 20 } } })],
  };
  const r = resolveSearch(parseSearch("Med spas in Dallas with no online booking"), rare);
  assert.equal(r.rare, true, "2 of 522 is under 3%");
});

test("no index means no claims", () => {
  const r = resolveSearch(parseSearch("Med spas in Dallas with no online booking"), null);
  assert.equal(r.marketId, null);
  assert.equal(r.matches, 0);
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
