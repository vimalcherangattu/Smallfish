/**
 * How many we will read, how long it takes, and whether the region can give it.
 *
 *     node stage0/tests/test_sizing.mjs
 *
 * This is the arithmetic a customer reads before spending credits, so what it
 * has to hold is not "the numbers are these" — they move whenever a market is
 * measured — but that the numbers are **derived from the measurements and
 * bounded by reality**. Every assertion below is a property.
 *
 * ## The one that is a promise rather than a property
 *
 * `zeroes` must be non-empty while vet Columbus is in the index. One criterion
 * of four settled 117 sites and matched none of them, and the screen quotes
 * that beside the 18-to-31 range. A range built only from the criteria that
 * matched something is a range built from the successes — the shape of every
 * lead-gen claim this product is the opposite of. If someone drops the zero
 * from the derivation, this fails.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(
  ["src/lib/sizing.ts", "src/lib/jobs.ts", "src/lib/types.ts"],
  "sf-sizing-",
);
const { matchRates, measurements, sizeAsk, perHundred, choices } = await load("sizing");

const index = JSON.parse(readFileSync("public/data/index.json", "utf8"));

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

// --------------------------------------------------------- the measurements --

const all = measurements(index);
const rates = matchRates(index);

check("something has been measured", !!rates, "matchRates returned null");
console.log(
  `measured: ${all.length} settled criteria, ` +
    `${rates.from.length} matched something, ${rates.zeroes.length} matched nothing`,
);
console.log(`range: ${perHundred(rates).low}–${perHundred(rates).high} in every hundred`);

check(
  "the zero is kept, not dropped",
  rates.zeroes.length > 0,
  "no criterion in the index settled sites and matched none — if that is now " +
    "true of the data, say so in the decision log rather than deleting this",
);
check(
  "every measurement has a denominator it could have come from",
  all.every((m) => m.settled > 0 && m.matched <= m.settled),
);
check(
  "a criterion with nothing settled is skipped, not counted as zero",
  // Two of four markets are entirely `needs_model` — our own missing
  // credential. Counting them as 0% would put our environment into a number
  // shown to a customer as theirs.
  all.every((m) => m.settled > 0) && all.length < index.markets.flatMap((m) => m.criteria).length,
  `${all.length} measurements from ${index.markets.flatMap((m) => m.criteria).length} criteria`,
);
check(
  "the denominator includes couldn't-tell and blocked",
  // Constructed, because the real index happens to agree either way on the
  // ordering. A rate over matches+no_match alone is higher and flattering.
  (() => {
    const made = {
      release: "test",
      markets: [
        {
          id: "m",
          metro: "M",
          criteria: [{ id: "c", type: "absence", text: "t", explain: "", needsModel: true }],
          tallies: { c: { match: 10, no_match: 10, couldnt_tell: 60, blocked: 20 } },
        },
      ],
    };
    const r = matchRates(made);
    return Math.abs(r.low - 0.1) < 1e-9;
  })(),
  "a rate over matches+no_match alone would read 0.5 here, not 0.1",
);
check("the range is ordered", rates.low <= rates.high);
check("the range is a fraction, not a percentage", rates.low > 0 && rates.high <= 1);

// ----------------------------------------------------------------- sizeAsk --

const cases = [
  { name: "a big city, comfortable ask", want: 120, withSite: 1838 },
  { name: "a small city, impossible ask", want: 120, withSite: 122 },
  { name: "an ask of one", want: 1, withSite: 1838 },
  { name: "nothing readable at all", want: 120, withSite: 0 },
  { name: "exactly at the ceiling", want: Math.floor(1838 * rates.high), withSite: 1838 },
];

for (const c of cases) {
  const s = sizeAsk({ want: c.want, withSite: c.withSite, rates });
  check(`${c.name}: reads are ordered`, s.reads.low <= s.reads.high, JSON.stringify(s));
  check(
    `${c.name}: never promises to read more sites than exist`,
    s.reads.high <= c.withSite && s.reads.low <= c.withSite,
    JSON.stringify(s),
  );
  check(
    `${c.name}: the wait follows the reads`,
    s.seconds.low <= s.seconds.high && (s.reads.high === 0 || s.seconds.high > 0),
    JSON.stringify(s),
  );
  check(
    `${c.name}: the ceiling is the region's, at the measured rates`,
    s.ceiling.low <= s.ceiling.high && s.ceiling.high <= c.withSite,
    JSON.stringify(s),
  );
  check(
    `${c.name}: short exactly when the ask is past the best-case ceiling`,
    s.short === c.want > s.ceiling.high,
    `want ${c.want}, ceiling.high ${s.ceiling.high}, short ${s.short}`,
  );
  check(
    `${c.name}: realistic never exceeds the ask or the ceiling`,
    s.realistic <= c.want && s.realistic <= Math.max(0, s.ceiling.high),
    JSON.stringify(s),
  );
}

check(
  "a small city is reported short rather than quietly promised",
  sizeAsk({ want: 120, withSite: 122, rates }).short === true,
);
check(
  "a big city is not reported short",
  sizeAsk({ want: 120, withSite: 1838, rates }).short === false,
);
check(
  "more sites to read is never a shorter wait",
  (() => {
    let prev = -1;
    for (const site of [50, 100, 500, 1000, 5000]) {
      const s = sizeAsk({ want: 1000, withSite: site, rates });
      if (s.seconds.high < prev) return false;
      prev = s.seconds.high;
    }
    return true;
  })(),
);

// ----------------------------------------------------------------- choices --

for (const [balance, ceiling] of [
  [120, 561],
  [120, 37],
  [20, 561],
  [1000, 4],
  [1, 1],
]) {
  const c = choices(balance, ceiling);
  check(
    `choices(${balance}, ${ceiling}) never offers more than the balance buys`,
    c.every((n) => n <= balance),
    JSON.stringify(c),
  );
  check(
    `choices(${balance}, ${ceiling}) never offers more than the region holds`,
    c.every((n) => n <= Math.max(1, ceiling)),
    JSON.stringify(c),
  );
  check(
    `choices(${balance}, ${ceiling}) is ascending, distinct and non-empty`,
    c.length > 0 &&
      c.every((n, i) => n > 0 && (i === 0 || n > c[i - 1])),
    JSON.stringify(c),
  );
  check(
    `choices(${balance}, ${ceiling}) tops out at the most that can be had`,
    c[c.length - 1] === Math.max(1, Math.min(balance, ceiling)),
    JSON.stringify(c),
  );
}

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
