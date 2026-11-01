/**
 * "Get specific": what the seller sells reorders what we look for, and what
 * came with the visitor — the door, the categories, the offer — survives every
 * step to sign-up.
 *
 * The defect this holds (QA sweep 2026-11-01): `/app/find` said "Tell us what
 * you sell" and the next screen never asked, and the handoff dropped
 * `?source=`, the confirmed categories and the offer on the way.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(
  ["src/lib/intake.ts", "src/lib/icp.ts", "src/lib/signals.ts", "src/lib/types.ts", "src/lib/handoff.ts"],
  "sfin-",
);
const I = await load("intake");
const S = await load("signals");
const H = await load("handoff");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

// The menu exactly as `/api/supply` builds it.
const menu = S.SIGNALS.filter((s) => s.provable).flatMap((s) => [
  { check: `${s.id}:absence`, text: s.absenceText, label: s.label },
  { check: `${s.id}:presence`, text: s.presenceText, label: s.label },
]);
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/* --------------------------------------------------- skippable -- */
for (const blank of ["", "  ", "ab"]) {
  const f = I.fitOffer(blank, menu);
  check(`skipping it (${JSON.stringify(blank)}) changes nothing`, f.checks === menu && f.fits.size === 0 && !f.refused.length);
}

/* ------------------------------------------- properties, any offer -- */
const offers = [
  "online booking software",
  "AI phone receptionist for missed calls after hours",
  "website redesigns for local businesses",
  "review management",
  "we do quotes and estimates forms",
  "bookkeeping",
  "live chat widget and booking",
];
for (const o of offers) {
  const f = I.fitOffer(o, menu);
  const ids = f.checks.map((c) => c.check);
  check(`"${o}": the menu is reordered, never added to or cut`, sameSet(ids, menu.map((c) => c.check)));
  check(`"${o}": every marked check is first`, ids.slice(0, f.fits.size).every((k) => f.fits.has(k)));
  check(
    `"${o}": nothing refused is offered as a fit`,
    f.refused.every((r) => ![...f.fits].some((k) => menu.find((c) => c.check === k)?.label === r.label)),
  );
}

/* ------------------------------------------------- the examples -- */
{
  const f = I.fitOffer("online booking software", menu);
  check("booking software puts 'has no online booking' first", f.checks[0].text === "has no online booking" && f.fits.has("booking:absence"));
}
{
  const f = I.fitOffer("website redesigns", menu);
  check(
    "a redesign offer is told plainly that mobile-readiness cannot be checked yet",
    f.refused.some((r) => /mobile/.test(r.label)),
  );
}
check("an offer no website can show says so", I.fitOffer("bookkeeping", menu).nothingObservable === true);

/* ------------------------------------------------- what is carried -- */
{
  const carry = { source: "outreach/abc123", sells: "online booking software", cats: ["plumbing", "backflow_service"] };
  const href = I.appHref("plumbers in Denver that has no online booking", carry);
  const back = I.readCarry(Object.fromEntries(new URL(href, "https://x").searchParams));
  check(
    "source, offer and categories survive the trip to the next screen",
    back.source === carry.source && back.sells === carry.sells && back.cats?.join() === carry.cats.join(),
  );
  check(
    "and the question itself is untouched",
    new URL(href, "https://x").searchParams.get("q") === "plumbers in Denver that has no online booking",
  );
}
{
  // The contract with the GTM side: sign-up reads its link with `handoff.ts`.
  const href = I.signUpHref("dentists in Austin", { source: "home", sells: "booking software", cats: ["dental_clinic"] });
  const h = H.readHandoff(Object.fromEntries(new URL(href, "https://x").searchParams));
  check("sign-up receives the door and the offer, as handoff.ts reads them", h.source === "home" && h.sells === "booking software" && h.q === "dentists in Austin");
  check("and not our categories, which are no business of sign-up's", !new URL(href, "https://x").searchParams.has("cats"));
}
{
  const bad = I.readCarry({ source: "<script>alert(1)</script>", cats: "plumbing,'; drop table x;--,dental_clinic", sells: "x".repeat(500) });
  check("a malformed source is refused, not passed on", bad.source === null);
  check("a category that is not an id is dropped before it nears a query", bad.cats?.join() === "plumbing,dental_clinic");
  check("an offer is capped", (bad.sells ?? "").length === 80);
  check("the source rule is handoff.ts's own, so the two never disagree", I.readCarry({ source: "for/acme-agency" }).source === H.readHandoff({ source: "for/acme-agency" }).source);
}

/* ----------------------------------------------- wired, not just written -- */
{
  const find = readFileSync("src/app/app/find/page.tsx", "utf8");
  const pool = readFileSync("src/components/app/PoolSearch.tsx", "utf8");
  const app = readFileSync("src/app/app/page.tsx", "utf8");
  const disc = readFileSync("src/components/app/Discover.tsx", "utf8");
  check("/app/find reads what, where and source", /one\("what"\)/.test(find) && /one\("where"\)/.test(find) && /readCarry\(sp\)\.source/.test(find));
  check("Get specific carries source and the counted categories", /appHref\(q, \{ source, cats: understood\?\.categories/.test(pool));
  check("/app hands the carry to Discover", /readCarry\(sp\)/.test(app) && /carry=\{carry\}/.test(app));
  check("Discover's sign-up link keeps the door and the offer", /signUpHref\(query, \{ source: carry\.source, sells \}\)/.test(disc));
  check("and its checks are ordered by the offer", /fitOffer\(sells, menu\)/.test(disc));
  check("and no bare /app?q= or /sign-up?q= link is left to drop them", !/`\/app\?q=|`\/sign-up\?q=/.test(disc));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
