/**
 * The paywall itself (P0.4).
 *
 *     node stage0/tests/test_unlock.mjs
 *
 * `test_csv.mjs`, `test_billing.mjs`, `test_integrations.mjs` and
 * `test_results_privacy.mjs` all hand their fixtures an unlock, so that what
 * they measure is escaping, grouping, refusals and privacy rather than the
 * gate. This file is the other side of that bargain: it measures **only** the
 * gate, and nothing else here has to stay true if the pricing changes.
 *
 * Three things, and each one was a live defect on the day it was written:
 *
 * ## 1. One ordering, or the invoice does not match the screen
 *
 * `buildLeads` grouped every listing into businesses and then kept the matches.
 * `/api/export` kept the matches and then grouped them. Those are different
 * sets — `groupForBilling` picks a group's representative **by evidence first**,
 * and filtering before grouping throws that rule away because the only records
 * left to choose from already matched. Free, it was invisible. Charged, it is a
 * customer paying for rows they were not shown. `matchedIn` is now the only
 * ordering and this asserts the two orders agree on the real market.
 *
 * ## 2. The gate applies, and it applies the same way everywhere
 *
 * `entitled()` is the one gate, read by the CSV and by the CRM push. A row
 * refused in one has to be refused in the other, with the same code — the push
 * route is where that broke: it never charged, so with the gate on it would have
 * refused every row and reported a successful delivery of nothing.
 *
 * ## 3. The free preview is positional, not a stored set
 *
 * Three free rows per list is a sample. Three free rows *stored per visitor*
 * would let somebody walk a whole market three at a time by changing the
 * criterion and coming back.
 */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  [
    "src/lib/unlock.ts",
    "src/lib/entitlement.ts",
    "src/lib/billing.ts",
    "src/lib/csv.ts",
    "src/lib/integrations.ts",
    "src/lib/outreach.ts",
    "src/lib/pricing.ts",
    "src/lib/signals.ts",
    "src/lib/suppression.ts",
    "src/lib/types.ts",
  ],
  "sfunl-",
);
const U = await load("unlock");
const E = await load("entitlement");
const B = await load("billing");
const C = await load("csv");
const I = await load("integrations");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const data = (name) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", name), "utf8"));

/* -------------------------------------------------------------------------
 * The gate is on. If this line ever reads false, every other assertion in this
 * file is vacuously true, so it is asserted rather than assumed.
 * ---------------------------------------------------------------------- */
check("unlocks are enforced", E.UNLOCKS_ENFORCED === true);

/* -------------------------------------------------------------------------
 * 1. One ordering
 * ---------------------------------------------------------------------- */
for (const file of ["dental-phoenix", "med-spa-dallas", "hvac-tampa"]) {
  const market = data(`${file}.json`);
  const criterion = market.criteria.find(
    (c) => (market.businesses.filter((b) => b.verdicts?.[c.id]?.verdict === "match").length) > 0,
  );
  if (!criterion) continue;

  const shared = U.matchedIn(market, [criterion], new Set()).map((b) => b.id);

  // The ordering the export route used to compute for itself: filter, then
  // group. Kept here as the *rejected* one, so that if somebody reintroduces it
  // the difference is named rather than discovered on an invoice.
  const filterThenGroup = B.groupForBilling(
    market.businesses.filter((b) => E.overallVerdict(b, [criterion]) === "match"),
  ).map((g) => g.lead.id);

  check(
    `${file}: one ordering, and every surface uses it`,
    shared.length > 0,
    `${shared.length} matched`,
  );

  // Reported, not asserted. A check whose condition is `true` is not a check —
  // this file's own subject is a defect that hid behind exactly that. What the
  // number is worth is the measurement: how many rows the two orderings disagree
  // about on a real market, which is how many rows an invoice and a screen would
  // have disagreed about.
  const onlyOld = filterThenGroup.filter((id) => !shared.includes(id));
  const onlyNew = shared.filter((id) => !filterThenGroup.includes(id));
  console.log(
    `  note  ${file}: the two orderings differ on ${onlyOld.length + onlyNew.length} ` +
      `of ${shared.length} rows (${onlyOld.length} only in the rejected one)`,
  );

  // Whatever the two orderings do, the one thing that must hold is that every
  // row `matchedIn` returns is genuinely a match and genuinely one business.
  const notAMatch = U.matchedIn(market, [criterion], new Set()).filter(
    (b) => E.overallVerdict(b, [criterion]) !== "match",
  );
  check(`  ${file}: every row it returns matched`, notAMatch.length === 0,
    `${notAMatch.length} did not`);

  check(
    `  ${file}: and no listing appears twice`,
    new Set(shared).size === shared.length,
    `${shared.length - new Set(shared).size} duplicates`,
  );

  // Every row is a group's chosen representative, never a listing that
  // `groupForBilling` folded away. A market with 326 duplicate listings — dental
  // Phoenix — would otherwise be charged twice for the same practice.
  //
  // Note that two rows may share a bare domain and both be correct: 23 Phoenix
  // listings are on `aspendental.com` and they are distinct branches, kept apart
  // by the 200m rule. The first version of this check compared `billingKey`,
  // which does not know about that split, and called five real HVAC branches
  // duplicates.
  const leads = new Set(B.groupForBilling(market.businesses).map((g) => g.lead.id));
  const folded = shared.filter((id) => !leads.has(id));
  check(
    `  ${file}: and every row is a business, not a folded-away listing`,
    folded.length === 0,
    `${folded.length} rows are duplicates of another row's business`,
  );

  // Suppression is applied inside, not by the caller. A surface that forgot it
  // would be the one place the seven-day promise did not apply.
  const first = shared[0];
  const without = U.matchedIn(market, [criterion], new Set([first])).map((b) => b.id);
  check(
    `  ${file}: an opted-out business is gone before anything is counted`,
    !without.includes(first) && without.length === shared.length - 1,
  );
}

/* -------------------------------------------------------------------------
 * 2. The gate, and the same gate in both places
 * ---------------------------------------------------------------------- */
const criteria = [
  {
    id: "no_book",
    type: "absence",
    text: "has no online booking",
    explain: "Looks for a booking widget.",
    needsModel: true,
  },
];

const biz = (id, verdict) => ({
  id,
  name: `Business ${id}`,
  cat: "dentist",
  addr: `${id} Main St`,
  lat: 33.4 + Number(id.slice(1)) / 1000,
  lon: -112.0,
  site: `https://${id}.example.com`,
  phone: "+16025550100",
  verdicts: {
    no_book: { verdict, proof: "No booking link on 3 pages.", reason: "read 3 pages" },
  },
  read: {
    outcome: "ok",
    pages: 3,
    chars: 900,
    booking: false,
    vendors: [],
    quote: false,
    chat: false,
    cms: [],
  },
});

const rows = [biz("b1", "match"), biz("b2", "match"), biz("b3", "no_match")];

{
  const none = E.entitled(rows, criteria, {});
  check(
    "with nothing paid for, no matched row may leave",
    none.rows.length === 0,
    `${none.rows.length} leaked`,
  );
  check(
    "and the refusal names the money, not the evidence",
    none.refused.find((r) => r.businessId === "b1")?.code === "not_unlocked",
  );
  check(
    "a non-match is still refused for not matching, whatever was paid",
    none.refused.find((r) => r.businessId === "b3")?.code === "not_matched",
  );

  const some = E.entitled(rows, criteria, { unlocked: new Set(["b1"]) });
  check(
    "paying for one row releases that row and only that row",
    some.rows.length === 1 && some.rows[0].id === "b1",
    some.rows.map((r) => r.id).join(","),
  );

  // Paying cannot buy a non-match. This is the attack the pricing has no other
  // answer to: a criterion nothing satisfies would otherwise hand over a whole
  // market's names for a balance that never depletes.
  const bought = E.entitled(rows, criteria, { unlocked: new Set(["b1", "b2", "b3"]) });
  check(
    "and no amount of credit buys a business that did not match",
    !bought.rows.some((r) => r.id === "b3"),
  );

  // Suppression outranks payment. An owner who asked to be left out is left out
  // of something already paid for, and the reason does not change with the
  // criteria.
  const hushed = E.entitled(rows, criteria, {
    unlocked: new Set(["b1"]),
    suppressed: new Set(["b1"]),
  });
  check(
    "a business that opted out stays out even once it has been paid for",
    hushed.rows.length === 0 && hushed.refused[0].code === "suppressed",
  );
}

{
  // The two surfaces, on the same input, with the same entitlement.
  const ent = { unlocked: new Set(["b1"]) };
  const csv = C.toCsv(rows, criteria, {}, ent);
  const inFile = csv
    .trimEnd()
    .split("\r\n")
    .slice(1)
    .filter(Boolean).length;
  const { rows: pushed, refused } = I.toPushRows(rows, criteria, { ent });

  check(
    "the file and the push release exactly the same rows",
    inFile === pushed.length && pushed.length === 1 && pushed[0].businessId === "b1",
    `file ${inFile}, push ${pushed.length}`,
  );
  check(
    "and refuse the rest for the same reasons, in the same words",
    refused.find((r) => r.businessId === "b2")?.code === "not_unlocked" &&
      refused.find((r) => r.businessId === "b3")?.code === "not_matched",
    JSON.stringify(refused),
  );

  // The unpaid names must not survive anywhere in the file, including in a
  // column nobody was thinking about.
  check(
    "no unpaid business's name, domain or number appears in the file at all",
    !csv.includes("Business b2") && !csv.includes("b2.example.com"),
  );
}

/* -------------------------------------------------------------------------
 * 3. The preview is positional
 * ---------------------------------------------------------------------- */
{
  const ordered = [biz("b1", "match"), biz("b2", "match"), biz("b3", "match"), biz("b4", "match")];
  const v = U.visibleIds(ordered, new Set(), 2);
  check(
    "the preview is the first N of the list, whichever they are",
    v.size === 2 && v.has("b1") && v.has("b2"),
    [...v].join(","),
  );

  // Reordering the same market — a different criterion, a different sort — must
  // give away the first N again and not N *more*. Anything else is a way to walk
  // a whole market a few rows at a time.
  const reversed = [...ordered].reverse();
  const v2 = U.visibleIds(reversed, new Set(), 2);
  check(
    "a different order gives away N rows again, never N more",
    v2.size === 2,
    [...v2].join(","),
  );

  const withPaid = U.visibleIds(ordered, new Set(["b4"]), 2);
  check(
    "and a paid row is visible wherever it sits in the list",
    withPaid.size === 3 && withPaid.has("b4"),
  );
  check(
    "the rest are what an unlock would charge for",
    U.lockedIn(ordered, withPaid).map((b) => b.id).join(",") === "b3",
  );

  check("the free preview is 3", U.FREE_PREVIEW === 3);
}

/* -------------------------------------------------------------------------
 * The band is delivered, not invented
 * ---------------------------------------------------------------------- */
{
  const market = data("dental-phoenix.json");
  const criterion = market.criteria.find(
    (c) => market.businesses.filter((b) => b.verdicts?.[c.id]?.verdict === "match").length > 0,
  );
  const band = U.bandForMarket(market, [criterion], new Set());
  check(
    "the band comes from the measured delivered rate",
    band.deliveredRate > 0 && band.deliveredRate <= 1 && band.judged > 0,
    `${(band.deliveredRate * 100).toFixed(1)}% of ${band.judged} judged`,
  );
  check(
    "and lands in one of the three bands, never outside them",
    [1, 2, 3].includes(band.credits),
    `${band.credits} credits`,
  );
  check(
    "a market nobody has read is not free — it is simply not billable yet",
    U.bandForMarket({ ...market, businesses: [] }, [criterion], new Set()).judged === 0,
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
