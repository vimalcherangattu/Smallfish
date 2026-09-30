/**
 * The criterion, said about several businesses.
 *
 *     node stage0/tests/test_predicate.mjs
 *
 * ## The bug this exists to stop coming back
 *
 * `Door.criterionText` is a **noun phrase** — "no way to book online" — and
 * every page that used it supplied the verb itself, as `N have {criterionText}`.
 * Nothing said so anywhere, so the shape had to be inferred from the two entries
 * in a lookup table, and both ways of inferring it are wrong:
 *
 *   - Treating it as a noun phrase and prefixing "have" is right for the two
 *     curated criteria and renders **"42 med spas have offers Botox"** for a
 *     criterion that is not in the table.
 *   - Treating it as a verb phrase and pluralising the leading verb — which is
 *     what `/sample` did — produced **"42 dental clinics in Phoenix no way to
 *     book online"**, with the verb gone entirely.
 *
 * Both were live at once, on the two pages a stranger sees first. The predicate
 * is now built in one place and this holds it against every criterion in every
 * measured market, so a new criterion cannot quietly produce a broken sentence
 * on the SEO pages.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  [
    "src/lib/doors.ts",
    "src/lib/leads.ts",
    "src/lib/billing.ts",
    "src/lib/outreach.ts",
    "src/lib/query.ts",
    "src/lib/signals.ts",
    "src/lib/suppression.ts",
    "src/lib/unlock.ts",
    "src/lib/entitlement.ts",
    "src/lib/pricing.ts",
    "src/lib/types.ts",
  ],
  "sfpred-",
);
const D = await load("doors");

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  pass  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
};

const DATA = path.join(process.cwd(), "public", "data");

test("the curated wordings are used, and read as sentences", () => {
  assert.equal(
    D.predicateFor("no_online_booking", "has no online booking"),
    "have no way to book online",
  );
  assert.equal(
    D.predicateFor("no_quote_form", "has no quote form"),
    "have no way to ask for a quote online",
  );
});

test("an uncurated criterion still produces a plural verb", () => {
  assert.equal(D.predicateFor("offers_botox", "offers Botox"), "offer Botox");
  assert.equal(D.predicateFor("does_commercial", "does commercial work"), "do commercial work");
  assert.equal(D.predicateFor("x", "has no contact form"), "have no contact form");
  assert.equal(D.predicateFor("x", "is mobile friendly"), "are mobile friendly");
});

test("a criterion with no verb at all is given one", () => {
  // `vet-columbus` carries exactly this, and without the rule the sentence
  // reads "42 vet clinics in Columbus not part of a group."
  assert.equal(D.predicateFor("x", "not part of a group"), "are not part of a group");
  assert.equal(D.predicateFor("x", "mobile friendly"), "are mobile friendly");
});

test("and never emits the singular verb it was given", () => {
  for (const [text, banned] of [
    ["offers Botox", /\boffers\b/],
    ["does commercial work", /\bdoes\b/],
    ["has no quote form", /\bhas\b/],
    ["is mobile friendly", /\bis\b/],
  ]) {
    const out = D.predicateFor("uncurated", text);
    assert.ok(!banned.test(out), `"${text}" → "${out}"`);
  }
});

test("a one-word criterion does not lose its only word", () => {
  assert.equal(D.predicateFor("x", "closes"), "close");
  assert.equal(D.predicateFor("x", "has"), "have");
});

/* ------------------------------------------- against every real criterion -- */

const markets = readdirSync(DATA)
  .filter((f) => f.endsWith(".json") && !f.startsWith("contacts-") && !["index.json", "places-us.json", "benchmark.json"].includes(f))
  .map((f) => JSON.parse(readFileSync(path.join(DATA, f), "utf8")))
  .filter((m) => Array.isArray(m.criteria));

test("there are real markets to check against", () => {
  assert.ok(markets.length >= 3, `${markets.length} markets`);
});

for (const m of markets) {
  for (const c of m.criteria) {
    test(`${m.id} · "${c.text}" reads as a sentence about several`, () => {
      const p = D.predicateFor(c.id, c.text);
      const sentence = `42 ${m.niche.replace(/_/g, " ")}s in ${m.metro.split(",")[0]} ${p}.`;

      // The three shapes the two live bugs produced.
      assert.ok(!/\bhave (offers|does|has|is)\b/.test(sentence), `doubled verb: ${sentence}`);
      assert.ok(!/\b(offers|does)\b/.test(p), `singular verb survived: ${sentence}`);
      // A predicate must start with a verb, and the list is closed: our
      // criteria use four of them. The first version of this check read
      // `/^(have|are|do|[a-z]+)\s/`, where the `[a-z]+` alternative matches
      // anything — so it passed "not part of a group", which is a real
      // criterion in `vet-columbus` and produced a sentence with no verb.
      assert.ok(
        /^(have|are|do|were|offer|close|show|take)\b/.test(p),
        `no verb at the front: ${sentence}`,
      );
      assert.ok(p.trim().length > 2, `empty predicate: ${sentence}`);
      assert.ok(!/\s{2}/.test(sentence), `doubled space: ${sentence}`);
    });
  }
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
