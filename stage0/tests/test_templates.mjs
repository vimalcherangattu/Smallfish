/**
 * The templates library holds its refusals (S2-01).
 *
 * The library is derived from `signals.ts`, and the whole risk is that it
 * drifts into a second, friendlier catalogue — one that offers the searches
 * buyers ask for rather than the ones the engine settles. Every check here
 * exists to fail if that happens.
 *
 *     node stage0/tests/test_templates.mjs
 */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const ROOT = process.cwd();
const { dir, load } = compileLib(["src/lib/templates.ts"], "sftpl-");
const { templateLibrary, templateSlug } = await load("templates");
const { SIGNALS } = await load("signals");
const { MIN_PROVEN_MATCHES } = await load("saturation");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const index = JSON.parse(
  readFileSync(path.join(ROOT, "public/data/index.json"), "utf8"),
);
const { published, unmeasured, refused } = templateLibrary(index);

// --- the library is the catalogue, not a second list -----------------------
const catalogueIds = new Set(SIGNALS.map((s) => s.id));
check(
  "every template traces to a signal in the catalogue",
  [...published, ...unmeasured].every((t) => catalogueIds.has(t.signalId)),
  "a template with no signal is a claim with no detector",
);

check(
  "no unprovable signal is ever published or offered",
  [...published, ...unmeasured].every(
    (t) => SIGNALS.find((s) => s.id === t.signalId)?.provable === true,
  ),
  "this is the drift the whole file exists to prevent",
);

const unprovable = SIGNALS.filter((s) => !s.provable).map((s) => s.id).sort();
check(
  "and every unprovable signal is refused out loud rather than dropped",
  JSON.stringify(refused.map((r) => r.signalId).sort()) === JSON.stringify(unprovable),
  `catalogue says ${unprovable}, library refuses ${refused.map((r) => r.signalId).sort()}`,
);

check(
  "each refusal says what it would take to settle it",
  refused.every((r) => r.wouldTake && r.wouldTake !== "unrecorded" && r.wouldTake.length > 30),
);

// --- the publishing gate ---------------------------------------------------
check(
  `nothing publishes below ${MIN_PROVEN_MATCHES} proven matches`,
  published.every((t) => t.matches >= MIN_PROVEN_MATCHES),
);
check(
  "and nothing at or above it is left unpublished",
  unmeasured.every((t) => !published.some((p) => p.slug === t.slug)),
);
check(
  "the gate is the saturation gate, not a second number",
  readFileSync(path.join(ROOT, "src/lib/templates.ts"), "utf8").includes(
    "MIN_PROVEN_MATCHES",
  ),
  "a second threshold is how two pages disagree about what is proven",
);

// --- the counts are the measured ones, summed, not invented ----------------
for (const t of published) {
  const summed = t.uses.reduce((n, u) => n + u.matches, 0);
  check(
    `${t.slug}: the headline count is the sum of its markets`,
    t.matches === summed,
    `${t.matches} shown, ${summed} across ${t.uses.length} markets`,
  );
  check(
    `${t.slug}: every market it cites was actually read`,
    t.uses.every((u) => u.judged > 0),
  );
  check(
    `${t.slug}: couldn't-tell is carried, not dropped`,
    t.couldNotSettle === t.uses.reduce((n, u) => n + u.couldNotSettle, 0),
  );
}

// --- the complement ---------------------------------------------------------
// One read settles both directions. The presence counts are the `no_match`
// tallies of criteria run as absences, and they have to reconcile exactly —
// this is the check that a derived count is arithmetic, not an estimate.
const tallyTotal = (verdict) =>
  index.markets.reduce(
    (n, m) =>
      n +
      m.criteria.reduce((k, c) => {
        const sig = SIGNALS.find((s) => s.inCriterion.test(c.text));
        return sig?.id === "booking" ? k + (m.tallies?.[c.id]?.[verdict] ?? 0) : k;
      }, 0),
    0,
  );

const bookingAbsent = published.find((t) => t.slug === "no-online-booking");
const bookingPresent = published.find((t) => t.slug === "online-booking");

check(
  "the absence template sums the match tallies exactly",
  bookingAbsent?.matches === tallyTotal("match"),
  `${bookingAbsent?.matches} vs ${tallyTotal("match")}`,
);
check(
  "the presence template sums the no-match tallies exactly",
  bookingPresent?.matches === tallyTotal("no_match"),
  `${bookingPresent?.matches} vs ${tallyTotal("no_match")}`,
);
check(
  "a derived count is marked as derived on every row it appears in",
  bookingPresent?.uses.every((u) => u.derived) && bookingPresent?.derivedOnly === true,
  "an unmarked complement is a count the reader cannot trace",
);
check(
  "and a derived row keeps the criterion that was actually run",
  bookingPresent?.uses.every((u) => /no online booking/i.test(u.criterionText)),
  "otherwise the row shows a question nobody asked the site",
);
check(
  "a derived row links to no programmatic page",
  published.every((t) => t.uses.every((u) => !(u.derived && u.pageSlug))),
  "the /find page is about the criterion that was run, not its complement",
);
check(
  "no template cites a market that produced nothing for it",
  published.every((t) => t.uses.every((u) => u.matches > 0)),
);

const tpl = readFileSync(path.join(ROOT, "src/app/templates/[slug]/page.tsx"), "utf8");
check(
  "the template page explains a derived count instead of just printing it",
  /derived/.test(tpl) && /opposite question/i.test(tpl),
);

// --- slugs ----------------------------------------------------------------
const slugs = [...published, ...unmeasured].map((t) => t.slug);
check("no two templates share a slug", new Set(slugs).size === slugs.length);
check(
  "slugs carry the polarity",
  templateSlug(SIGNALS.find((s) => s.id === "booking"), "absence") === "no-online-booking" &&
    templateSlug(SIGNALS.find((s) => s.id === "booking"), "presence") === "online-booking",
);

// --- what the pages promise -----------------------------------------------
const page = readFileSync(path.join(ROOT, "src/app/templates/page.tsx"), "utf8");
check(
  "the library page says the counts are stored, not scanned per visit",
  /stored from the last time/i.test(page),
  "S2-01 says 'live counts'; we ship stored ones and the page has to say so",
);
check(
  "and says a template is not the limit of what can be searched",
  /not the limit/i.test(page),
  "otherwise the library reads as the product's ceiling, which is the two-layer rule inverted",
);

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
