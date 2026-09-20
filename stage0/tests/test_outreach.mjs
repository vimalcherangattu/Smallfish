/** Tests for outreach notes and the ICP inference (S1-22 – S1-26).
 *
 *  These two modules are the only places in the product that *write prose about
 *  a business*, which makes them the only places a fabrication can reach a
 *  recipient. Almost every test below is therefore a refusal test: the useful
 *  property is not that a good note is produced, it is that no note is produced
 *  when the evidence is not there.
 *
 *  Run:  node stage0/tests/test_outreach.mjs
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/outreach.ts", "src/lib/icp.ts", "src/lib/signals.ts", "src/lib/types.ts"],
  "sfout-",
);
const { outreachFor, domainOf } = await load("outreach");
const { inferFromOffer, candidatesFor } = await load("icp");

const criteria = [
  { id: "no_online_booking", type: "absence", text: "has no online booking",
    explain: "Looks for a booking widget.", needsModel: true },
  { id: "offers_botox", type: "presence", text: "offers Botox",
    explain: "Reads the services pages.", needsModel: true },
];

const readOk = {
  outcome: "ok", pages: 4, chars: 5000, booking: false,
  vendors: [], quote: false, chat: false, cms: ["wordpress"],
};

const base = {
  id: "x", name: "About/face", cat: "medical_spa", lat: 1, lon: -2,
  addr: "1 A St", site: "aboutfacesouthlake.com", phone: "18172965483",
  primary: true, read: readOk,
  verdicts: {
    no_online_booking: { verdict: "match", reason: "3 relevant page(s) read; no sign of it" },
    offers_botox: { verdict: "needs_model", reason: "no model has run" },
  },
};

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}: ${e.message}`); }
};

// ---------------------------------------------------------------- outreach

test("a matched, read business gets a note, a pain point and its basis", () => {
  const o = outreachFor(base, criteria);
  assert.equal(o.withheld, null);
  assert.ok(o.icebreaker.includes("aboutfacesouthlake.com"));
  assert.ok(o.icebreaker.includes("4 pages"));
  assert.ok(o.painPoint);
  assert.ok(o.basis.length >= 2, "the note must carry its evidence");
});

test("nothing is written for a business that was never read", () => {
  const { read, ...noRead } = base;
  const o = outreachFor(noRead, criteria);
  assert.equal(o.note, null);
  assert.match(o.withheld, /not been read/);
});

test("nothing is written when the site could not be read", () => {
  for (const outcome of ["blocked", "dead", "timeout", "thin", "js_shell"]) {
    const o = outreachFor({ ...base, read: { ...readOk, outcome } }, criteria);
    assert.equal(o.note, null, `${outcome} must not produce a note`);
    assert.ok(o.withheld.includes(outcome));
  }
});

test("a readable site with zero pages read is still refused", () => {
  const o = outreachFor({ ...base, read: { ...readOk, pages: 0 } }, criteria);
  assert.equal(o.note, null);
});

test("nothing is written when no criterion matched", () => {
  for (const v of ["no_match", "couldnt_tell", "blocked", "needs_model", "unread"]) {
    const b = { ...base, verdicts: { ...base.verdicts,
      no_online_booking: { verdict: v, reason: "" } } };
    const o = outreachFor(b, criteria);
    assert.equal(o.note, null, `${v} must not produce a note`);
    assert.match(o.withheld, /invented/);
  }
});

test("every basis line is evidence, and the note names no unobserved fact", () => {
  const o = outreachFor(base, criteria);
  // The chat aside must not appear: this probe saw no chat widget.
  assert.ok(!o.note.includes("chat"), "must not claim a chat widget nobody saw");
  assert.ok(o.note.includes("phone number"), "a listed phone is observed, so it may be cited");
});

test("the chat aside appears only when a chat widget was detected", () => {
  const o = outreachFor({ ...base, read: { ...readOk, chat: true } }, criteria);
  assert.ok(o.note.includes("chat"));
  assert.ok(o.basis.some((l) => /chat widget/.test(l)));
});

test("a business with no phone is not told its pages point to one", () => {
  const o = outreachFor({ ...base, phone: null }, criteria);
  assert.ok(!o.note.includes("phone number"));
});

test("an uncatalogued gap is stated without an invented consequence", () => {
  const odd = [{ id: "no_zzz", type: "absence", text: "has no widget for zzz",
    explain: "", needsModel: true }];
  const b = { ...base, verdicts: { no_zzz: { verdict: "match", reason: "none found" } } };
  const o = outreachFor(b, odd);
  assert.ok(o.icebreaker, "the observed gap can still be stated");
  assert.equal(o.painPoint, null, "no catalogue entry means no claimed cost");
});

test("the closing hedge names what was looked for", () => {
  const o = outreachFor(base, criteria);
  assert.ok(o.note.includes("online booking"));
  assert.ok(/Happy to be wrong/.test(o.note));
});

test("the basis carries no duplicates", () => {
  const o = outreachFor({ ...base, read: { ...readOk, chat: true } }, criteria);
  assert.equal(new Set(o.basis).size, o.basis.length);
});

test("domainOf strips scheme, www and path", () => {
  assert.equal(domainOf("https://www.lipsbysivan.com/about"), "lipsbysivan.com");
  assert.equal(domainOf(null), null);
});

// --------------------------------------------------------------------- ICP

test("an offer about missed calls proposes the booking criterion", () => {
  const i = inferFromOffer("We answer calls 24/7 so clinics stop losing after-hours bookings.");
  assert.ok(i.propose.some((p) => p.signal.id === "booking"));
  assert.equal(i.nothingObservable, false);
  for (const p of i.propose) assert.equal(p.type, "absence");
});

test("an unprovable signal is refused, never proposed", () => {
  const i = inferFromOffer("We rebuild outdated, non-mobile websites for local businesses.");
  assert.ok(!i.propose.some((p) => !p.signal.provable), "nothing unprovable may be proposed");
  assert.ok(i.refused.length, "and it must be refused out loud");
  for (const r of i.refused) assert.ok(r.wouldTake.length > 10, "with what it would take");
});

test("an offer that maps to nothing observable says so", () => {
  const i = inferFromOffer("We provide executive coaching and leadership retreats.");
  assert.equal(i.nothingObservable, true);
  assert.equal(i.propose.length, 0);
});

test("candidates come from measured tallies and are sorted by count", () => {
  const index = {
    release: "x",
    markets: [
      { id: "a", niche: "dental", metro: "Phoenix, AZ", center: { lat: 0, lon: 0 },
        search: "", counts: { candidates: 10, primary: 5, withSite: 8, read: 200 },
        criteria: [{ id: "no_online_booking", type: "absence", text: "has no online booking",
          explain: "", needsModel: true }],
        tallies: { no_online_booking: { match: 11 } } },
      { id: "b", niche: "med_spa", metro: "Dallas, TX", center: { lat: 0, lon: 0 },
        search: "", counts: { candidates: 10, primary: 5, withSite: 8, read: 200 },
        criteria: [{ id: "no_online_booking", type: "absence", text: "has no online booking",
          explain: "", needsModel: true }],
        tallies: { no_online_booking: { match: 26 } } },
    ],
  };
  const c = candidatesFor(inferFromOffer("online booking software"), index);
  assert.equal(c.length, 2);
  assert.equal(c[0].matches, 26, "most matches first");
  assert.ok(c[0].why.includes("?"), "the reasoning must be shown");
});

test("no candidates without a provable proposal, and none without an index", () => {
  const i = inferFromOffer("executive coaching");
  assert.equal(candidatesFor(i, { release: "x", markets: [] }).length, 0);
  assert.equal(candidatesFor(inferFromOffer("booking"), null).length, 0);
});

test("a presence criterion is not matched to an absence proposal", () => {
  const index = {
    release: "x",
    markets: [{ id: "a", niche: "dental", metro: "X", center: { lat: 0, lon: 0 },
      search: "", counts: { candidates: 1, primary: 1, withSite: 1, read: 1 },
      criteria: [{ id: "has_booking", type: "presence", text: "has online booking",
        explain: "", needsModel: true }],
      tallies: { has_booking: { match: 99 } } }],
  };
  assert.equal(candidatesFor(inferFromOffer("booking software"), index).length, 0);
});

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
