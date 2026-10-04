/**
 * The couldn't-tell tab (`PRODUCT-HANDOFF.md` §5.4), against the real markets.
 *
 *     node stage0/tests/test_unsure.mjs
 *
 * Three things, and each one was wrong in the code this replaces.
 *
 * ## 1. A number is not an answer
 *
 * `LeadResult.unclear` was a count, so the screen could say *38* and stop. The
 * handoff requires a tab that says what we opened and what we were looking for.
 * This asserts the groups exist, carry named examples, and sum to the count —
 * so the headline and the tab can never disagree.
 *
 * ## 2. `needs_model` was being dropped on the floor
 *
 * `unclear` filtered for `couldnt_tell` and `blocked` only. In hvac Tampa's
 * "does commercial work", `needs_model` is **every** non-unread verdict: 200 of
 * them, 0 matches, 0 no-matches. So the screen read "0 fit · 0 we couldn't
 * tell" with 200 businesses sitting unjudged. That is the exact shrug the
 * product exists to replace, produced by our own filter.
 *
 * ## 3. Our failures stay ours
 *
 * `CLAUDE.md`: *"Never blame the environment on the business."* `probe_error`
 * is our network. `needs_model` is our judgement not having run. Both have to
 * be marked `ours` and read in the first person, or we tell a customer a
 * business has a broken website when what broke was us. med spa Dallas has 7
 * real `probe_error` rows to check this against.
 *
 * ## And the thing that must not creep in
 *
 * `unread` is not a couldn't-tell. 2,960 of dental Phoenix's 3,126 listings
 * have never been opened; there is no judgement to report, only work not done.
 * Folding them in would turn "we couldn't tell on 73" into "we couldn't tell on
 * 3,033" — a 40× overstatement of our own uncertainty, in the honest block.
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
    "src/lib/unsure.ts",
    "src/lib/entitlement.ts",
    "src/lib/pricing.ts",
  ],
  "sfu-",
);
const L = await load("leads");
const S = await load("unsure");

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

const run = (q, file) =>
  L.buildLeads({
    query: q,
    index,
    market: data(`${file}.json`),
    contacts: data(`contacts-${file}.json`),
    suppressed: new Set(),
    unlocked: new Set(),
  });

/* -------------------------------------------------------------------------
 * 1 · groups, not a number
 * ---------------------------------------------------------------------- */
{
  const r = run("med spas in Dallas that have no online booking", "med-spa-dallas");
  check("a real market produces groups", r.unsure.length >= 3, `${r.unsure.length} groups`);
  check(
    "and they sum to the count the headline uses",
    r.unsure.reduce((a, g) => a + g.count, 0) === r.unclear,
    `${r.unsure.reduce((a, g) => a + g.count, 0)} vs unclear ${r.unclear}`,
  );
  check(
    "every group says what stopped us in a sentence, not a code",
    r.unsure.every((g) => /\s/.test(g.headline) && g.detail.length > 30 && !/[_]/.test(g.headline)),
    r.unsure.map((g) => g.headline).join(" | "),
  );
  check(
    "every group names examples a reader can go and check",
    r.unsure.every((g) => g.rows.length > 0 && g.rows.every((x) => x.name)),
  );
  check(
    "no group lists more examples than it has",
    r.unsure.every((g) => g.rows.length <= Math.min(3, g.count)),
  );
}

/* -------------------------------------------------------------------------
 * 2 · the 200 that used to vanish
 * ---------------------------------------------------------------------- */
{
  const market = data("hvac-tampa.json");
  const c = market.criteria.find((x) => x.id === "does_commercial");
  const n = market.businesses.filter((b) => b.verdicts?.[c.id]?.verdict === "needs_model").length;
  check("hvac Tampa still has the unjudged population this is about", n === 200, `${n}`);

  const groups = S.unsureGroups(market.businesses, c);
  check(
    "they land in the tab instead of nowhere",
    groups.reduce((a, g) => a + g.count, 0) === n,
    `${groups.reduce((a, g) => a + g.count, 0)} of ${n}`,
  );
  check(
    "as one group, not scattered across six about their sites",
    groups.length === 1 && groups[0].id === "needs_model",
    groups.map((g) => `${g.id}:${g.count}`).join(" "),
  );
}

/* -------------------------------------------------------------------------
 * 3 · our failures stay ours
 *
 * Measured first, asserted second. `probe_error` and `timeout` never reach this
 * tab today — `export_app_data.py` relabels both as `unread` on purpose — so an
 * assertion written against med spa Dallas's booking criterion passes over an
 * empty array and proves nothing. The group that does fire is `needs_model`,
 * and it is the one that matters: 200 businesses, every one of them unjudged
 * because our model has not run.
 * ---------------------------------------------------------------------- */
{
  const market = data("hvac-tampa.json");
  const c = market.criteria.find((x) => x.id === "does_commercial");
  const groups = S.unsureGroups(market.businesses, c);
  const ours = groups.filter((g) => g.ours);

  check("there is an ours group to assert against at all", ours.length > 0, `${groups.length} groups`);
  check(
    "and it is not a rounding error — it is the whole population",
    ours.reduce((a, g) => a + g.count, 0) === 200,
  );
  check(
    "it says so in the first person, never about their site",
    ours.every((g) => /\b(our|us|we)\b/i.test(g.headline + " " + g.detail)),
    ours.map((g) => g.headline).join(" | "),
  );
  // Not "contains the word their" — "Nobody has read the words on their page"
  // names whose page it is and blames nobody. The property that matters is the
  // **subject**: an ours headline may never open by making the business the one
  // that did something.
  check(
    "the subject of an ours headline is us, never the business",
    ours.every((g) => !/^their\b/i.test(g.headline.trim())),
    ours.map((g) => g.headline).join(" | "),
  );
  // The other direction: a group about their site must not claim it was ours.
  const theirs = S.unsureGroups(
    data("med-spa-dallas.json").businesses,
    data("med-spa-dallas.json").criteria.find((x) => x.id === "no_online_booking"),
  ).filter((g) => !g.ours);
  check("there are groups about their sites too", theirs.length >= 4, `${theirs.length}`);
  check(
    "none of them blames our network for their site",
    theirs.every((g) => !/\bour (network|proxy|read|crawler)\b/i.test(g.detail)),
  );
  // The mirror of the subject rule above: a group not marked ours is a
  // statement about their site, so it has to name them. One that said only
  // "could not be read" would be the ambiguity this whole split removes.
  check(
    "and every one of them names them in its headline",
    theirs.every((g) => /\b(their|they)\b/i.test(g.headline)),
    theirs.map((g) => g.headline).join(" | "),
  );

  // The sentence above the results has to carry the same split.
  const mixed = S.unsureSentence(
    [
      { id: "a", headline: "", detail: "", ours: false, count: 30, rows: [] },
      { id: "b", headline: "", detail: "", ours: true, count: 7, rows: [] },
    ],
    "med spas",
  );
  check("the honest sentence counts our share out loud", /7 of those are our own gap/.test(mixed), mixed);
  check(
    "when it is all ours it does not say their sites don't settle it",
    /our gap, not theirs/.test(
      S.unsureSentence([{ id: "a", headline: "", detail: "", ours: true, count: 9, rows: [] }], "x"),
    ),
  );
  check("and with nothing to admit it says nothing", S.unsureSentence([], "x") === null);
  check("it always says the rows were free", /not charged/.test(mixed));
}

/* -------------------------------------------------------------------------
 * 4 · unread is not couldn't-tell
 * ---------------------------------------------------------------------- */
{
  const market = data("dental-phoenix.json");
  const c = market.criteria.find((x) => x.id === "no_online_booking");
  const unread = market.businesses.filter(
    (b) => b.verdicts?.[c.id]?.verdict === "unread",
  ).length;
  check("dental Phoenix is still mostly unopened", unread > 2500, `${unread}`);

  const groups = S.unsureGroups(market.businesses, c);
  const total = groups.reduce((a, g) => a + g.count, 0);
  check(
    "none of the unopened listings are counted as uncertainty",
    total < 200 && total > 0,
    `${total} unsure against ${unread} unread`,
  );
  check(
    "the gap between the two is the whole point — they are different numbers",
    unread / total > 10,
    `${(unread / total).toFixed(0)}x`,
  );

  const r = run("dental practices in Phoenix that have no online booking", "dental-phoenix");
  check("and the result keeps them apart", r.unread > r.unclear * 10, `${r.unread} vs ${r.unclear}`);
}

/* -------------------------------------------------------------------------
 * 5 · nothing in here speaks engine
 * ---------------------------------------------------------------------- */
{
  const r = run("med spas in Dallas that have no online booking", "med-spa-dallas");
  const text = r.unsure.map((g) => `${g.headline} ${g.detail}`).join(" ");
  const jargon = ["verdict", "criterion", "probe", "crawl", "http", "js_shell", "outcome", "null"];
  const found = jargon.filter((w) => new RegExp(`\\b${w}`, "i").test(text));
  check("the groups are in English, not in our vocabulary", found.length === 0, found.join(", "));
  check(
    "no group calls an absence a failure",
    !/\b(fail|error|invalid|broken)\b/i.test(
      r.unsure.filter((g) => !g.ours).map((g) => g.headline).join(" "),
    ),
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
