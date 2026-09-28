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
  ],
  "sfl-",
);
const L = await load("leads");

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

  const r = L.buildLeads({
    query: c.q,
    index,
    market,
    contacts,
    suppressed: new Set(),
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

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
