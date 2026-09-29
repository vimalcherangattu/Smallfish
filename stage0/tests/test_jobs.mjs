/**
 * The wait is derived from the crawler, not invented to look impressive.
 *
 *     node stage0/tests/test_jobs.mjs
 *
 * This flow was asked for with a specific instruction: make it take hours, to
 * convey how much work goes on behind a search. The flow is right and is built.
 * The padding is not, and this file is what stops it arriving later — by anyone,
 * including whoever is asked for it again.
 *
 * So the estimate is checked **against the probe's own constants**, read out of
 * `stage0/src/coverage/site_probe.py` at test time. If somebody doubles the
 * quoted wait without slowing the crawler down, these fail.
 */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(["src/lib/jobs.ts"], "sfjb-");
const J = await load("jobs");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

// --- the constants are the crawler's, not a copy that has drifted -----------
const probe = readFileSync(
  path.join(process.cwd(), "stage0", "src", "coverage", "site_probe.py"),
  "utf8",
);
const num = (re) => {
  const m = probe.match(re);
  return m ? Number(m[1]) : NaN;
};
const realConcurrency = num(/GLOBAL_CONCURRENCY\s*=\s*(\d+)/);
const realDelay = num(/PER_DOMAIN_DELAY\s*=\s*([\d.]+)/);

check(
  "the probe still declares the constants this estimate rests on",
  Number.isFinite(realConcurrency) && Number.isFinite(realDelay),
  `concurrency ${realConcurrency}, delay ${realDelay}`,
);
check(
  `concurrency matches the crawler (${realConcurrency})`,
  J.CONCURRENCY === realConcurrency,
  `jobs.ts says ${J.CONCURRENCY}`,
);
check(
  `the per-domain delay matches the crawler (${realDelay}s)`,
  J.PER_DOMAIN_DELAY === realDelay,
  `jobs.ts says ${J.PER_DOMAIN_DELAY}`,
);

// --- pages per site is within what the finished markets actually recorded ---
{
  const pages = [];
  for (const f of ["dental-phoenix", "med-spa-dallas", "hvac-tampa"]) {
    const m = JSON.parse(
      readFileSync(path.join(process.cwd(), "public", "data", `${f}.json`), "utf8"),
    );
    for (const b of m.businesses) if (b.read?.pages > 0) pages.push(b.read.pages);
  }
  const mean = pages.reduce((a, b) => a + b, 0) / pages.length;
  check(
    "pages-per-site is the measured mean, within half a page",
    Math.abs(J.PAGES_PER_SITE - mean) < 0.5,
    `jobs.ts says ${J.PAGES_PER_SITE}, measured ${mean.toFixed(2)} across ${pages.length} sites`,
  );
}

// --- the estimate is the arithmetic, and nothing more -----------------------
{
  const sites = 2778;
  const expected = Math.ceil(
    (sites * (J.PAGES_PER_SITE * J.PER_DOMAIN_DELAY + J.JUDGE_SECONDS)) / J.CONCURRENCY,
  );
  check(
    "the estimate is exactly the derivation, with no padding factor",
    J.estimateSeconds(sites) === expected,
    `${J.estimateSeconds(sites)} vs ${expected}`,
  );
}

// The specific number that would betray a fudge: every dental practice in
// Phoenix with a website is about half an hour, not "several hours". If this
// ever reports hours, somebody has multiplied something.
check(
  "reading all of dental Phoenix is quoted in minutes, not hours",
  J.estimateSeconds(2778) < 3600,
  J.humanDuration(J.estimateSeconds(2778)),
);

// --- and it still grows, so a genuinely long read says so -------------------
check(
  "a whole-state read is quoted in hours",
  J.estimateSeconds(12000) > 3600,
  J.humanDuration(J.estimateSeconds(12000)),
);
check(
  "the estimate is monotonic in the number of sites",
  [10, 100, 1000, 10000].every((n, i, a) => i === 0 || J.estimateSeconds(n) > J.estimateSeconds(a[i - 1])),
);

// --- a short read does not get a "we'll email you" page ---------------------
check(
  "a 20-site read is not dressed up as something to leave",
  !J.worthLeaving(20) && J.humanDuration(J.estimateSeconds(20)) === "under two minutes",
);
check("a 1,000-site read is", J.worthLeaving(1000));

// --- progress is never fabricated -------------------------------------------
{
  const job = (over) => ({
    id: "x", state: "reading", query: "q", market: "", criterion: "",
    progress: { total: 0, read: 0, judged: 0, matched: 0, unclear: 0, ...over },
    createdAt: "", finishedAt: null, notifyEmail: null,
  });
  check(
    "percent is null while the total is unknown",
    J.percent(job({ total: 0, read: 0 })) === null,
    "a bar that moves before there is anything to move against is a lie",
  );
  check(
    "percent never reaches 100 until the job says done",
    J.percent(job({ total: 10, read: 10, judged: 10 })) < 100,
  );
  check(
    "a done job is 100",
    J.percent({ ...job({ total: 10, read: 10, judged: 10 }), state: "done" }) === 100,
  );
  check(
    "the couldn't-tell count is carried on the finished description",
    J.describe({ ...job({ total: 10, judged: 8, matched: 3 }), state: "done" }).includes("8"),
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
