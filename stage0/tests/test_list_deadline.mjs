/**
 * The list a cold email links to must answer inside Vercel's 60 s limit.
 *
 * 2026-11-02: /hi/GcJSwmwZmC ended in "Something went wrong on our side" — the
 * first visit counted the market and read sites in one request, a read that
 * started at 44 s ran past 60 s, and Vercel killed it. Every queued prospect's
 * list was unbuilt, so every first click from outreach could land on this.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(["src/lib/deadline.ts"], "sf-deadline-");
const P = await load("deadline");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const slow = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
{
  const t = Date.now();
  const v = await P.withDeadline(slow(5000, "late"), 200);
  check("a read that outlives the budget is abandoned, not awaited", v === null && Date.now() - t < 1000);
}
check("a read inside the budget comes back", (await P.withDeadline(slow(20, "ok"), 1000)) === "ok");
check("no budget left means no read", (await P.withDeadline(slow(1, "x"), 0)) === null);

{
  const src = readFileSync("src/lib/prospecting.ts", "utf8");
  check("every read in buildList is raced against what is left", /withDeadline\(\s*\(async \(\) => \{\s*const r = await readSite/.test(src));
  check(
    "running out of time with nothing found is not saved as 'nothing found' for a week",
    /if \(!rows\.length && \(outOfTime[\s\S]{0,80}\)\) \{[\s\S]{0,120}reason: "busy"/.test(src) &&
      src.indexOf('reason: "busy"') < src.indexOf("list_rows: rows, list_read: read"),
  );
  const ui = readFileSync("src/components/ProspectList.tsx", "utf8");
  check("and the visitor is told their sites were slow, and to refresh", /r\.reason === "busy"/.test(ui));
  const route = readFileSync("src/app/api/outreach/list/[token]/route.ts", "utf8");
  const budget = Number(src.match(/budgetMs = (\d+)_?(\d*)/)?.slice(1).join("") ?? NaN);
  const max = Number(route.match(/maxDuration = (\d+)/)?.[1] ?? NaN);
  check("the budget leaves room under the route's limit for the count and the save", budget / 1000 <= max - 10, `${budget}ms vs ${max}s`);
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
