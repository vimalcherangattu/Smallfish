/**
 * A finished read looks finished.
 *
 *     node stage0/tests/test_read_screen.mjs
 *
 * ## What the owner was looking at
 *
 * A real read, 12 sites in Dallas, all 12 done, 0 matched. The screen said:
 *
 *   - **READING**, as a kicker, above a bar at 100%.
 *   - *"This runs while the page is open. Close it and the read pauses where
 *     it is."* — about a read that had already stopped.
 *   - A panel headed *"What is actually happening"* explaining, in the present
 *     tense, that twelve sites were in flight. None were.
 *   - **"Open the 0 that fit →"**, as the brightest element on the page.
 *
 * One bug produced all four. `ReadProgress` polls; the page around it does
 * not. `running` is computed in the server component from the state it saw on
 * arrival, so a job that finished afterwards left every server-rendered part
 * of the screen describing a read in progress, with the client-rendered
 * counters sitting underneath at 12 of 12.
 *
 * The page's honest endings live in that server half: a read that found
 * something renders the list, and one that found nothing renders a screen
 * saying so with somewhere to go. **Neither could ever appear.** The only
 * thing offering to show results was a button that offered to open zero of
 * them, and that pointed at `/app?q=…`, the counting screen, rather than at
 * any list.
 *
 * So the assertions here are about the handover: the client tells the server
 * when the job stops, and the dead button is gone.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { code } from "./_source.mjs";

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

const read = (p) => code(readFileSync(path.join(process.cwd(), p), "utf8"));
const progress = read("src/components/ReadProgress.tsx");
const page = read("src/app/app/reads/[id]/page.tsx");

/* ------------------------------------------------------------- the handover -- */

test("the client hands the page back when the job stops", () => {
  assert.match(progress, /useRouter/);
  assert.match(progress, /router\.refresh\(\)/);
  // On the transition, not on every poll.
  assert.match(progress, /if \(row\.state !== "done" && row\.state !== "failed"\) return;/);
});

test("and does it once, or it refreshes forever", () => {
  // `router.refresh()` re-renders the server component, which re-renders this
  // one with a fresh `initial`. Without the guard that is a loop.
  assert.match(progress, /handedOver\.current = true;/);
  assert.match(progress, /if \(handedOver\.current\) return;/);
});

/* ------------------------------------------------------- the dead CTA is gone -- */

test("nothing offers to open the matches that do not exist", () => {
  assert.ok(
    !/that fit →/.test(progress),
    'ReadProgress still renders an "Open the N that fit" button',
  );
  // And nothing in it points at the counting screen as though it were a list.
  assert.ok(
    !/\/app\?q=/.test(progress),
    "ReadProgress links to /app?q=, which counts a market rather than showing one",
  );
});

test("the page still has an honest ending for a read that found nothing", () => {
  // The branch that could never render. It is the thing the refresh exists to
  // reach, so if it goes, the refresh has nothing to show.
  assert.match(page, /Nothing fit, out of the/);
  assert.match(page, /Ask for something else/);
});

/* ------------------------------------------------------------- the heading -- */

test("the heading is a subject, not the raw query as a headline", () => {
  // "gym in Dallas that has no online booking" set as an H1 reads as a
  // sentence fragment. The same split the search box and the counting screen
  // use gives "Gym in Dallas".
  assert.match(page, /splitQuery\(job\.query\)/);
  assert.ok(
    !/<h1 className="t-h1" style=\{\{ marginTop: 8 \}\}>\s*\{job\.query\}/.test(page),
    "the running heading is still the raw query",
  );
});

/* ------------------------------------------- the counting screen, same class -- */

test("the counting screen says what it is counting", () => {
  // Same defect, earlier in the flow: "Looking through the listings. About ten
  // seconds. We are counting the listings themselves rather than a cache of
  // them." Two sentences about our data layer, and no mention of the search.
  const discover = read("src/components/app/Discover.tsx");
  assert.match(discover, /Counting \$\{asked\.what\} in \$\{asked\.where\}/);
  assert.ok(!/cache of them/.test(discover), "the cache sentence is still there");
});

test("and its progress bar does not claim progress it cannot know", () => {
  const discover = read("src/components/app/Discover.tsx");
  // It was fixed at 40% with the transition switched off.
  assert.ok(!/width: "40%"/.test(discover), "the bar is still parked at 40%");
  assert.match(discover, /className="track waiting"/);
  const kit = readFileSync(path.join(process.cwd(), "public/app/kit.css"), "utf8");
  assert.match(kit, /@keyframes sf-wait/);
  // Reduced motion must leave something visible rather than a bar parked
  // off-screen by the global 1ms animation override.
  assert.match(kit, /\.sf \.track\.waiting i \{ animation: none;/);
});

/* --------------------------------------------------------- one balance, once -- */

test("the credit balance is not on screen twice", () => {
  // The appbar pill and the rail's meter card rendered the same numbers one
  // above the other down the left edge.
  const shell = read("src/components/app/Shell.tsx");
  assert.match(shell, /credit\$\{noRail \? "" : " railed"\}/);
  const kit = readFileSync(path.join(process.cwd(), "public/app/kit.css"), "utf8");
  assert.match(kit, /\.sf \.appbar \.credit\.railed \{ display: none; \}/);
  // Below 900px the rail is hidden, so the pill has to come back or the
  // balance disappears on a phone.
  assert.match(kit, /\.sf \.appbar \.credit\.railed \{ display: inline-flex; \}/);
});

test("a screen with no rail is still full height", () => {
  // `className={noRail ? undefined : "appwrap"}` left the wrapper unclassed,
  // so it lost `min-height: 100dvh` along with the grid and every short
  // signed-out screen sat in a 338px column with the viewport empty below it.
  const shell = read("src/components/app/Shell.tsx");
  assert.match(shell, /noRail \? "appsolo" : "appwrap"/);
  const kit = readFileSync(path.join(process.cwd(), "public/app/kit.css"), "utf8");
  assert.match(kit, /\.sf \.appsolo \{[^}]*min-height: 100dvh/);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
