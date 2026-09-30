/**
 * The happy path: a typed sentence produces a list somebody can work.
 *
 *     node stage0/tests/test_leads.mjs
 *
 * This runs against the real market files, because the two defects it exists to
 * catch were both invisible in the code and obvious the moment the page was
 * rendered with actual data.
 *
 * ## The first: a number nobody measured
 *
 * The results screen shipped saying **"We checked 2,800 and these are the ones
 * that fit."** We had not checked 2,800. That is how many dental listings in
 * Phoenix have a website at all; we read 200 of them. The overclaim was on
 * screen within an hour of the screen existing, on a product whose entire
 * argument is that it does not do that. `read` may never exceed `counts.read`.
 *
 * ## The second: forty-two identical emails
 *
 * Every draft ended with the same two sentences — a consequence and a hedge —
 * which meant a user sending the list sent forty-two copies of one message with
 * the domain swapped. The hedge is ours and now lives on the screen; the
 * consequence is gone. What remains has to vary on something **observed**, so
 * this asserts several distinct second sentences across a real market and no
 * draft for a business whose site was never read.
 *
 * ## And the third, cheapest to break
 *
 * Our vocabulary. "Verdict", "criterion", "couldn't tell", "cold market" are
 * how the engine talks. A lead list that uses them is the measurement rig
 * wearing a product's clothes.
 */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  [
    "src/lib/leads.ts",
    "src/lib/query.ts",
    "src/lib/outreach.ts",
    "src/lib/billing.ts",
    "src/lib/suppression.ts",
    "src/lib/signals.ts",
    "src/lib/types.ts",
    "src/lib/unlock.ts",
    "src/lib/entitlement.ts",
    "src/lib/pricing.ts",
  ],
  "sfl-",
);
const L = await load("leads");
const U = await load("unlock");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const data = (f) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", f), "utf8"));

const index = data("index.json");

const CASES = [
  { q: "dental practices in Phoenix that have no online booking", file: "dental-phoenix" },
  { q: "HVAC companies in Tampa that have no quote form", file: "hvac-tampa" },
  { q: "med spas in Dallas that have no online booking", file: "med-spa-dallas" },
];

for (const c of CASES) {
  const market = data(`${c.file}.json`);
  let contacts = {};
  try {
    contacts = data(`contacts-${c.file}.json`).contacts ?? {};
  } catch {
    contacts = {};
  }

  // The list a paying customer sees: everything unlocked.
  //
  // The paywall went on in P0.4, so the default list withholds all but the free
  // preview and the assertions below — every lead has a contact, most carry a
  // draft — would be measuring the paywall instead of the product. Those are the
  // same properties a customer's list has to have *after* they pay, which is the
  // list this builds. What the paywall does is measured in `test_unlock.mjs` and
  // in the locked-row checks at the bottom of this file.
  const everything = new Set(market.businesses.map((b) => b.id));
  const r = L.buildLeads({
    query: c.q,
    index,
    market,
    contacts,
    suppressed: new Set(),
    unlocked: everything,
  });

  check(`"${c.q}" returns a list`, !!r && r.leads.length > 0, `${r?.leads.length ?? 0} leads`);
  if (!r) continue;

  // --- the number we claim to have read ------------------------------------
  check(
    `  ${c.file}: the read count is the measured one`,
    r.read === market.counts.read,
    `claims ${r.read}, measured ${market.counts.read}`,
  );
  // Written out plainly on purpose. The first version of this line was a
  // ternary over three clauses that passed whatever the inputs were — the same
  // defect as the negation test in `test_query.mjs`, which was green on the bug
  // it had been written to catch. A check that cannot fail is not a check.
  check(
    `  ${c.file}: and is never inflated to the candidate pool`,
    r.read < market.counts.withSite,
    `claims ${r.read} read, ${market.counts.withSite} merely have a website`,
  );

  // --- every lead is usable -------------------------------------------------
  const noContact = r.leads.filter((l) => !l.phone && !l.email && !l.contactPage);
  check(
    `  ${c.file}: every lead carries a way to reach them`,
    noContact.length === 0,
    `${noContact.length} with none`,
  );

  const badPhone = r.leads.filter((l) => l.phone && !/^\(\d{3}\) \d{3}-\d{4}$/.test(l.phone));
  check(
    `  ${c.file}: phone numbers are formatted, not raw digits`,
    badPhone.length === 0,
    badPhone.slice(0, 3).map((l) => l.phone).join(", "),
  );

  // --- the drafts ------------------------------------------------------------
  const drafts = r.leads.map((l) => l.message).filter(Boolean);
  check(`  ${c.file}: most leads carry a draft`, drafts.length >= r.leads.length * 0.6,
    `${drafts.length} of ${r.leads.length}`);

  // The hedge belongs on our screen, not in a stranger's inbox.
  for (const phrase of ["Happy to be wrong", "say so and I will drop it", "If that is right"]) {
    check(
      `  ${c.file}: no draft contains "${phrase}"`,
      !drafts.some((d) => d.includes(phrase)),
    );
  }

  // Four of the signal catalogue's labels carry an indefinite article, and the
  // draft supplies its own negative. Every HVAC Tampa opener went out reading
  // "There's no a way to request a quote online" — on the personal door, which
  // is the one page whose entire argument is that we do not make things up.
  const doubled = drafts.filter((d) => /\bno an? \b/i.test(d));
  check(
    `  ${c.file}: no draft doubles the article after "no"`,
    doubled.length === 0,
    doubled[0]?.match(/.{0,30}\bno an? \b.{0,30}/i)?.[0],
  );

  // The same shape, one word over: a draft is a sentence a person sends, so a
  // double space or a repeated word is a tell. Tested line by line — the drafts
  // are deliberately separated by blank lines, and the first version of this
  // check read `\s{2}` across the whole string and so failed on every paragraph
  // break in the product.
  const ungrammatical = drafts.filter((d) =>
    d.split("\n").some((line) => / {2}| an? an? |\b(\w+) \1\b/i.test(line)),
  );
  check(
    `  ${c.file}: and no draft repeats a word or doubles a space`,
    ungrammatical.length === 0,
    ungrammatical[0]?.slice(0, 80),
  );

  // Variation has to come from evidence. Comparing the tail after the domain,
  // because the domain differing is not a different message.
  const tails = new Set(drafts.map((d) => d.replace(/^[\s\S]*?anywhere\./, "").trim()));
  check(
    `  ${c.file}: drafts vary on something observed`,
    tails.size >= 3,
    `${tails.size} distinct second sentences across ${drafts.length} drafts`,
  );

  // A site that was never read cannot produce a draft — the absence-proof rule,
  // pointed at outreach.
  const invented = r.leads.filter((l) => l.message && l.pagesRead === 0);
  check(
    `  ${c.file}: no draft was written for a site nobody read`,
    invented.length === 0,
    invented.slice(0, 3).map((l) => l.name).join(", "),
  );

  // --- our words stay out of the customer's list ----------------------------
  const surface = [
    ...r.leads.map((l) => `${l.why} ${l.message ?? ""}`),
    r.criterionText,
  ].join(" ");
  for (const word of ["verdict", "criterion", "couldn't tell", "cold market", "unlocked"]) {
    check(
      `  ${c.file}: the list never says "${word}"`,
      !new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(surface),
    );
  }
}

// --- a search we cannot answer says so, rather than answering anyway --------
{
  const market = data("dental-phoenix.json");
  const r = L.buildLeads({
    query: "carpenters in Austin that don't show pricing",
    index,
    market,
    contacts: {},
    suppressed: new Set(),
  });
  check(
    "an unread trade returns nothing rather than the nearest market",
    r === null,
    "a carpentry search must not quietly answer with dental clinics",
  );
}

// --- a removed business is gone from the list, not just from the file -------
{
  const market = data("dental-phoenix.json");
  const full = L.buildLeads({
    query: CASES[0].q,
    index,
    market,
    contacts: {},
    suppressed: new Set(),
  });
  const dropped = full.leads[0].id;
  const after = L.buildLeads({
    query: CASES[0].q,
    index,
    market,
    contacts: {},
    suppressed: new Set([dropped]),
  });
  check(
    "an opted-out business leaves the list entirely",
    after.leads.length === full.leads.length - 1 &&
      !after.leads.some((l) => l.id === dropped),
  );
}

// --- the CSV is the same product as the screen ------------------------------
{
  const market = data("dental-phoenix.json");
  const r = L.buildLeads({
    query: CASES[0].q,
    index,
    market,
    contacts: {},
    suppressed: new Set(),
    unlocked: new Set(market.businesses.map((b) => b.id)),
  });
  const csv = L.leadsToCsv(r);
  const lines = csv.split("\r\n");
  check("the CSV has a row per lead plus a header", lines.length === r.leads.length + 1);
  check("and leads with the business name", lines[0].startsWith("Business,"));
  check(
    "and carries the message the screen showed",
    r.leads[0].message ? csv.includes(r.leads[0].message.slice(0, 40)) : true,
  );
}

/* ---------------------------------------------------------------------------
 * The paywall, on the real market (P0.4).
 *
 * `UNLOCKS_ENFORCED` is true, and the thing it has to be true *of* is the
 * screen, not just the download. Gating the CSV while `/app` renders every name,
 * phone, email and drafted opener is not billing; it is an inconvenience with a
 * price on it, and it is what this product shipped with for weeks.
 *
 * So these assert the one property that makes the gate real: **a locked row
 * contains nothing that identifies the business.** Not hidden with CSS, not
 * blurred — absent, because a field that reached the browser has been given
 * away whatever it looks like.
 * ------------------------------------------------------------------------- */
{
  const market = data("dental-phoenix.json");
  const contacts = data("contacts-dental-phoenix.json").contacts ?? {};
  const build = (unlocked) =>
    L.buildLeads({
      query: CASES[0].q,
      index,
      market,
      contacts,
      suppressed: new Set(),
      unlocked,
    });

  const cold = build(new Set());
  const open = cold.leads.filter((l) => !l.locked);
  check(
    "a visitor who has paid nothing sees exactly the free preview in full",
    open.length === cold.preview && cold.preview === U.FREE_PREVIEW,
    `${open.length} open, preview ${cold.preview}`,
  );
  check(
    "and the rest are on the page as locked rows, not silently dropped",
    cold.leads.length > open.length && cold.locked === cold.leads.length - open.length,
    `${cold.leads.length} rows, ${cold.locked} locked`,
  );

  // The identity leak, field by field. Every one of these shipped to the browser
  // before P0.4.
  const locked = cold.leads.filter((l) => l.locked);
  const leaks = { name: [], site: [], domain: [], phone: [], email: [], message: [], proof: [], id: [] };
  const realIds = new Set(market.businesses.map((b) => b.id));
  for (const l of locked) {
    if (l.name) leaks.name.push(l.name);
    if (l.site) leaks.site.push(l.site);
    if (l.domain) leaks.domain.push(l.domain);
    if (l.phone) leaks.phone.push(l.phone);
    if (l.email) leaks.email.push(l.email);
    if (l.message) leaks.message.push(l.message);
    if (l.proof) leaks.proof.push(l.proof);
    if (realIds.has(l.id)) leaks.id.push(l.id);
  }
  for (const [field, found] of Object.entries(leaks)) {
    check(
      `  a locked row carries no ${field}`,
      found.length === 0,
      `${found.length} of ${locked.length}, e.g. ${String(found[0]).slice(0, 48)}`,
    );
  }

  // The masked reason has to stay useful, or the locked row is a blank line with
  // a price on it and nobody can judge whether the rest is worth buying.
  check(
    "a locked row still says why it matched, and how much was read",
    locked.every((l) => /page/.test(l.why) && l.why.length > 20),
    locked[0]?.why,
  );
  check(
    "and says what unlocking would hand over",
    locked.some((l) => l.has.phone) && locked.some((l) => l.has.message),
  );

  // Paying for three particular rows reveals those three and no others.
  const ids = U.matchedIn(market, [market.criteria.find((c) => c.id === cold.criterionId)], new Set())
    .slice(U.FREE_PREVIEW, U.FREE_PREVIEW + 3)
    .map((b) => b.id);
  const paid = build(new Set(ids));
  const revealed = paid.leads.filter((l) => !l.locked).map((l) => l.id);
  check(
    "unlocking three rows reveals exactly those three, on top of the preview",
    revealed.length === U.FREE_PREVIEW + 3 && ids.every((id) => revealed.includes(id)),
    `${revealed.length} open`,
  );
  check(
    "and the price per match is the band this market delivered, not a quote",
    paid.creditsEach >= 1 && paid.creditsEach <= 3,
    `${paid.creditsEach} credits`,
  );

  // The CSV is built from the same rows, so a locked row must not become a line
  // of empty commas in a file somebody is about to send to a client.
  const coldCsv = L.leadsToCsv(cold).split("\r\n");
  check(
    "locked rows are absent from the CSV rather than blank in it",
    coldCsv.length === open.length + 1,
    `${coldCsv.length - 1} rows for ${open.length} unlocked`,
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
