/**
 * The two-day nudge, and the six ways it refuses to send (P0.5).
 *
 *     node stage0/tests/test_nudge.mjs
 *
 * ## The failure this feature risks
 *
 * A nudge that arrives after the person already did the thing is the clearest
 * possible signal that nobody is reading their account — and it is the most
 * common way a drip sequence makes a product feel automated in the bad sense.
 * So almost all of the work in `nudge_candidates` is *not sending it*, and
 * almost all of this file is checking that the exclusions are still there.
 *
 * The selection itself was verified against the live project on 2026-09-30 with
 * seven planted workspaces. Exactly one was chosen; the other six — too new,
 * too old, already spent a credit, already nudged, closed, comped — were each
 * excluded for their own reason.
 *
 * What is left here is the ordering and the honesty of the route, which a
 * database cannot hold.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  pass  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
};

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");
/** Comments stripped: a rule named only in the comment explaining it is exactly
 *  the case these checks must fail on. `_source.py` records why. */
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const route = read("src/app/api/mail/nudge/route.ts");
const sql = read("supabase/migrations/0021_nudge_candidates.sql");
const vercel = JSON.parse(read("vercel.json"));

/* ------------------------------------------------ the six exclusions -- */

const EXCLUSIONS = [
  ["already spent a credit", /kind in \('match', 'no_website_unlock'\)/],
  ["already nudged", /ms\.kind = 'nudge'/],
  ["closed", /a\.closed_at is null/],
  ["comped", /a\.comped_until is null or a\.comped_until < now\(\)/],
  ["too new", /a\.created_at < now\(\) - make_interval\(hours => greatest\(p_after_hours/],
  ["too old", /a\.created_at > now\(\) - make_interval\(hours => greatest\(p_before_hours/],
];

for (const [what, re] of EXCLUSIONS) {
  test(`a workspace that has ${what} is not selected`, () => assert.match(sql, re));
}

test("the window closes rather than running forever", () => {
  // Past a week it is not a nudge, it is a product emailing a stranger about
  // an account they have forgotten.
  assert.match(sql, /p_before_hours integer default 168/);
  assert.match(sql, /p_after_hours integer default 48/);
});

/* --------------------------------------------------- the ordering -- */

test("the provider is checked before anything is claimed", () => {
  const bare = code(route);
  const provider = bare.indexOf("mailConfigured()");
  const claim = bare.indexOf("claimMail(");
  assert.ok(provider > 0 && claim > 0, "one of them is not called");
  assert.ok(provider < claim, "a claim is taken before the provider is known");
});

test("and with no provider it claims nothing at all", () => {
  // Claiming first on a deployment with no key would mark every waiting note
  // as spoken for, so the day the key arrives none of them goes out.
  const block = route.slice(route.indexOf("if (!mailConfigured())"));
  assert.match(block.slice(0, 600), /sent: 0/);
  assert.match(block.slice(0, 600), /still a candidate/);
});

test("the claim is taken before the send, not after", () => {
  const bare = code(route);
  const loop = bare.slice(bare.indexOf("for (const c of candidates)"));
  assert.ok(
    loop.indexOf("claimMail(") < loop.indexOf("sendMail("),
    "two overlapping runs could both write to one person",
  );
});

test("and what happened is recorded either way", () => {
  const bare = code(route);
  // Both the no-address path and the send path write a result, so "nothing
  // arrived" is a fact somebody can query rather than a silence.
  assert.equal((bare.match(/recordMail\(/g) ?? []).length, 2);
});

/* ------------------------------------------------------ the guard -- */

test("it is behind the same secret as the worker", () => {
  assert.match(route, /if \(!secret\) return false;/);
  assert.ok(!/if \(!secret\) return true/.test(route));
  assert.match(route, /diff \|= /, "the secret is compared without constant time");
});

/* ------------------------------------------------------ the budget -- */

test("one run is bounded and the rest waits for the next", () => {
  assert.match(route, /Date\.now\(\) - started > BUDGET_MS/);
  const budget = Number((route.match(/BUDGET_MS = ([\d_]+)/) ?? [])[1]?.replace(/_/g, ""));
  const max = Number((route.match(/maxDuration = (\d+)/) ?? [])[1]);
  assert.ok(Number.isFinite(budget) && Number.isFinite(max), `${budget} / ${max}`);
  assert.ok(max * 1000 - budget >= 10_000, `only ${max * 1000 - budget}ms of headroom`);
});

/* ------------------------------------------------------ the schedule -- */

test("the nudge runs daily, not every minute", () => {
  const entry = vercel.crons.find((c) => c.path === "/api/mail/nudge");
  assert.ok(entry, "no cron entry for the nudge");
  const [minute, hour] = entry.schedule.split(" ");
  assert.notEqual(minute, "*", "the nudge would fire every minute");
  assert.notEqual(hour, "*", "the nudge would fire every hour");
  // The window is 48h–7d wide. A nudge that fires within a minute of somebody
  // crossing the 48-hour line is a product watching a clock, not a person.
});

test("the worker has a cron entry at all", () => {
  const entry = vercel.crons.find((c) => c.path === "/api/worker");
  assert.ok(entry, "no cron entry for the worker");
});

/* ---------------------------------------------- deployable on the plan --
 *
 * This replaces an assertion that the worker's schedule is exactly
 * `* * * * *`, which was true, tested, and **broke every deployment for three
 * days**.
 *
 * Vercel's Hobby plan caps cron jobs at once per day, and a more frequent
 * expression does not degrade — it fails the build outright. So from
 * 2026-09-30 14:47 (the commit that introduced `* * * * *`) to 2026-10-03,
 * thirteen commits were pushed to `main`, every one of them failed to deploy,
 * and the live site stayed on the last good commit. Nothing in the repository
 * noticed, because the test encoded the *wish* (tick every minute) rather than
 * the *constraint* (what this plan will actually accept). A green suite and a
 * frozen production site at the same time is the worst failure mode available.
 *
 * The rule: minute and hour must each be a single literal number. Anything
 * else — `*`, a step, a list, a range — runs more than once a day.
 *
 * If the plan is upgraded to Pro, this test is what to change, deliberately,
 * in the same commit that upgrades it.
 */
test("every cron runs at most once a day, which is what Hobby deploys", () => {
  const ONCE = /^\d{1,2}$/;
  for (const c of vercel.crons) {
    const [minute, hour] = c.schedule.split(" ");
    assert.ok(
      ONCE.test(minute) && ONCE.test(hour),
      `${c.path} is "${c.schedule}" — more than once a day, so Vercel refuses ` +
        `the deployment and nothing else in the push ships either`,
    );
  }
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
