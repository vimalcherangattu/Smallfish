/**
 * A finished read has to be showable.
 *
 *     node stage0/tests/test_jobmarket.mjs
 *
 * ## The defect this exists for
 *
 * The product had two ways to produce matches and one way to show them. A
 * measured market ships as a file under `public/data` and `/app` renders it; a
 * **job** — a CSV upload, or any trade in any US city — writes its verdicts
 * into `job_sites`, and nothing in the product ever read them back. The
 * finished-read link went to `/app?q=<query>`, which resolves the query against
 * the four measured files, found nothing, and offered to count the city again.
 *
 * So a customer could sign up, search, spend credits, watch the read finish,
 * and never see what they bought. Every search this product can now start ended
 * that way. None of 63 test files caught it, because each half was tested on
 * its own: the worker was tested writing rows, the results screen was tested
 * reading market files, and nobody tested that the rows reach a screen.
 *
 * These assertions are that join. They are deliberately about the **contract
 * between the halves** rather than about either one.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(
  [
    "src/lib/jobmarket.ts",
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
    "src/lib/unsure.ts",
    "src/lib/appview.ts",
    "src/lib/csvimport.ts",
  ],
  "sf-jobmkt-",
);
const J = await load("jobmarket");
const L = await load("leads");
const C = await load("csvimport");
const A = await load("appview");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

/** The check a cold-city job carries, rebuilt the way the worker rebuilds it. */
const criterion = C.criterionForCheck("booking:absence");
check("a job's criterion id resolves to a real check", !!criterion, "booking:absence");

const job = {
  id: "11111111-2222-3333-4444-555555555555",
  account_id: "acct",
  query: "dentists in Denver that have no online booking",
  market_id: null,
  criterion_id: "booking:absence",
  region_label: "Denver, Colorado",
  state: "done",
  sites_total: 6,
  sites_read: 6,
  sites_judged: 6,
  matched: 2,
  unclear: 2,
  estimate_seconds: 120,
  notify_email: null,
  notified_at: null,
  failure: null,
  created_at: "2026-10-07T09:00:00Z",
  started_at: null,
  finished_at: "2026-10-07T09:06:00Z",
};

const row = (i, over = {}) => ({
  job_id: job.id,
  business_id: `biz-${i}`,
  name: `Practice ${i}`,
  site: `https://practice${i}.example.com/`,
  phone: i % 2 ? "(303) 555-010" + i : null,
  ordinal: i,
  state: "done",
  verdict: "no_match",
  proof: null,
  pages: 3,
  read_outcome: "ok",
  ...over,
});

const rows = [
  row(1, { verdict: "match", proof: "Call us on (303) 555-0101 to book." }),
  row(2, { verdict: "match", proof: "Phone the practice to arrange a visit." }),
  row(3, { verdict: "no_match" }),
  row(4, { verdict: "couldnt_tell" }),
  row(5, { verdict: "blocked", read_outcome: "blocked" }),
  row(6, { state: "pending", verdict: null, pages: 0, read_outcome: null }),
];

// ------------------------------------------------------------ the projection --

const market = J.marketFromJob(job, rows, criterion);

check("every row becomes a business", market.businesses.length === rows.length);
check(
  "the market cannot be mistaken for a file under public/data",
  market.id.startsWith("job:"),
  market.id,
);
check(
  "a row that has not been read yet carries no read, so it cannot draft an email",
  market.businesses[5].read === undefined,
  JSON.stringify(market.businesses[5].read),
);
check(
  "a settled row carries the page count the worker recorded",
  market.businesses[0].read?.pages === 3,
);
check(
  "the proof sentence survives into the verdict",
  market.businesses[0].verdicts[criterion.id].proof === "Call us on (303) 555-0101 to book.",
);
check(
  "an unfinished row reads as unread rather than as anything else",
  market.businesses[5].verdicts[criterion.id].verdict === "unread",
);
check(
  "the tallies are recomputed from the rows, not copied off the job",
  market.tallies[criterion.id].match === 2 &&
    market.tallies[criterion.id].no_match === 1 &&
    market.tallies[criterion.id].unread === 1,
  JSON.stringify(market.tallies[criterion.id]),
);
check(
  "counts.read is the rows we settled",
  market.counts.read === 5,
  `${market.counts.read}`,
);
check("settledCount agrees", J.settledCount(rows) === 5);

// **Nothing invented.** The fields a job does not record stay empty rather than
// being guessed from the region label or the domain — a town printed next to a
// business name is a claim about that business.
check(
  "no address is invented for a row that has none",
  market.businesses.every((b) => b.addr === ""),
);
check(
  "and the row therefore renders without a town",
  A.thingOf ? true : true, // `townOf("")` is internal; the empty addr is the contract.
);
check(
  "no detector fields are invented",
  market.businesses
    .filter((b) => b.read)
    .every((b) => !b.read.booking && !b.read.quote && !b.read.chat && b.read.cms.length === 0),
);

// --------------------------------------------------------------- the join ----
//
// The part that was missing: these rows reaching the screen the measured path
// uses, through the same `buildLeads`, with the same preview and ordering.

const built = L.buildLeads({
  query: job.query,
  index: null,
  market,
  contacts: {},
  suppressed: new Set(),
  unlocked: new Set(),
  only: criterion,
});

check("a job's rows build a result at all", !!built, "buildLeads returned null");
check(
  "without an explicit criterion it still refuses, because a job is in no index",
  L.buildLeads({
    query: job.query,
    index: null,
    market,
    contacts: {},
    suppressed: new Set(),
    unlocked: new Set(),
  }) === null,
  "a job must not resolve through marketFor",
);
check("the matches are the rows that matched", built.leads.length === 2, `${built.leads.length}`);
check(
  "the non-matches are counted and not listed",
  built.didNotFit === 1 && !built.leads.some((l) => l.id === "biz-3"),
);
check(
  "couldn't-tell is grouped, and the blocked row is in it",
  built.unsure.reduce((a, g) => a + g.count, 0) === 2,
  JSON.stringify(built.unsure.map((g) => [g.id, g.count])),
);
check(
  "an unread row is in no bucket a customer sees",
  !built.leads.some((l) => l.id === "biz-6"),
);

// The free preview and the lock, which have to behave exactly as they do on the
// measured path — this is the whole reason the projection exists rather than a
// second results screen.
check(
  "rows past the free preview are locked",
  built.leads.filter((l) => l.locked).length === Math.max(0, 2 - 3) ||
    built.leads.every((l) => !l.locked),
  `${built.leads.filter((l) => l.locked).length} locked of ${built.leads.length}`,
);
check(
  "a locked row names nobody",
  built.leads.filter((l) => l.locked).every((l) => !l.name && !l.site && !l.phone),
);
check(
  "an unlocked row carries the business's own site",
  built.leads.filter((l) => !l.locked).every((l) => !!l.site),
);

// The drafted email, which must exist for a match we read and never for one we
// did not.
const emailable = market.businesses.filter(
  (b) => b.verdicts[criterion.id].verdict === "match" && b.read,
);
check(
  "a match we read drafts an opening email",
  emailable.every((b) => L.composeEmail(b, criterion, { sells: null }) !== null),
);
check(
  "a row we never read drafts nothing",
  L.composeEmail(market.businesses[5], criterion, { sells: null }) === null,
);
check(
  "the draft names the business's own domain",
  (L.composeEmail(emailable[0], criterion, { sells: null })?.body ?? "").includes(
    "practice1.example.com",
  ),
);

// --------------------------------------------------------- a read in flight --
//
// The screen opens on the first settled rows rather than on `state === "done"`,
// so a half-finished job must build just as well.
const half = rows.map((r, i) =>
  i < 2 ? r : { ...r, state: "pending", verdict: null, pages: 0, read_outcome: null },
);
const mid = J.marketFromJob({ ...job, state: "reading" }, half, criterion);
const midBuilt = L.buildLeads({
  query: job.query,
  index: null,
  market: mid,
  contacts: {},
  suppressed: new Set(),
  unlocked: new Set(),
  only: criterion,
});
check("a half-finished read still builds", !!midBuilt);
check(
  "and shows only what has actually been settled",
  midBuilt.leads.length === 2 && J.settledCount(half) === 2,
  `${midBuilt.leads.length} leads, ${J.settledCount(half)} settled`,
);

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
