/**
 * Every built screen is reachable from the product.
 *
 *     node stage0/tests/test_reachable.mjs
 *
 * ## Why this is worth a test file
 *
 * Three things were built, tested, and then reachable only from somewhere
 * nobody looking for them would be. The templates library — four pages, thirty
 * passing assertions — was linked from `/benchmark` and nowhere else, a
 * methodology page somebody reads once. The map has been at `/app/explore`
 * since the search-first rebuild demoted it, reachable from an ICP result or a
 * saved run. `PushToDestination` was mounted on that same map page and so was
 * absent from the screen where people actually work — recorded in `LeadList`
 * as having been "the same as not existing".
 *
 * Note which of the two checks below caught it. The per-route "is this linked
 * at all" checks **passed the whole time**: `/templates` had its link from
 * `/benchmark`. Only the search-screen check fails on the state that shipped,
 * which is the honest lesson — "linked somewhere" is a much weaker property
 * than "linked where somebody would look".
 *
 * **Built work nobody can reach is the same as unbuilt work, except that it
 * also has to be maintained**, and it is invisible in every other kind of test:
 * the unit tests pass, the page renders, the route builds. Only a link check
 * catches it.
 *
 * `check_routes.mjs` crawls the deployed site and finds pages that break.
 * This is the other direction — pages that work and that nothing points at.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
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

const SRC = path.join(process.cwd(), "src");

/** Every .tsx and .ts under src/, as one string. Crude and sufficient: a link
 *  is a link wherever it is written. */
function allSource() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push({ file: full, text: readFileSync(full, "utf8") });
    }
  };
  walk(SRC);
  return out;
}

const files = allSource();

/** Comments stripped: a route named only in a comment explaining why it is not
 *  linked is precisely the case this test exists to fail on. */
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Is this path linked or navigated to from somewhere other than its own page? */
function linkedFrom(route) {
  const own = path.join(SRC, "app", route.replace(/^\//, ""));
  return files
    .filter((f) => !f.file.startsWith(own))
    .filter((f) => {
      const c = code(f.text);
      return (
        c.includes(`href="${route}"`) ||
        c.includes(`href={\`${route}`) ||
        // A route named in a navigation table rather than inline in JSX. The
        // sidebar's five destinations live in one `ITEMS` array so the "five
        // items, never six" rule has one place to be broken; that made every
        // one of them invisible to a matcher that only knew `href="…"`, and
        // `/app/contacted` failed this test while sitting in the nav.
        c.includes(`href: "${route}"`) ||
        c.includes(`push("${route}`) ||
        c.includes(`push(\`${route}`) ||
        c.includes(`"${route}?`) ||
        c.includes(`\`${route}?`)
      );
    })
    .map((f) => path.relative(process.cwd(), f.file));
}

/**
 * The screens a customer is meant to be able to get to, and what "reachable"
 * means for each. A route reachable only from its own page is not reachable.
 */
const MUST_BE_REACHABLE = [
  "/templates",
  "/app/explore",
  "/app/upload",
  "/app/contacted",
  "/app/runs",
  "/sample",
  "/account",
  "/pricing",
];

for (const route of MUST_BE_REACHABLE) {
  test(`${route} is linked from somewhere in the product`, () => {
    const from = linkedFrom(route);
    assert.ok(from.length > 0, `nothing links to ${route}`);
  });
}

/* --------------------------------------- the four search modes, specifically -- */

test("all four search modes are reachable from the search screen itself", () => {
  // The flow document specifies four: type, map, templates, upload. Typing is
  // the screen. The other three have to be one link away from it, or somebody
  // who does not already know they exist never finds them.
  // "The search screen" is the page plus the components it renders — the four
  // ways in are tiles in `FirstRun`, and the unread-city screen offers upload
  // and templates from `NotRead`. Reading only `page.tsx` would have reported
  // all three missing on the day they became more prominent, not less.
  const app = [
    "app/app/page.tsx",
    "components/app/FirstRun.tsx",
    "components/app/NotRead.tsx",
  ]
    .map((f) => code(readFileSync(path.join(SRC, f), "utf8")))
    .join("\n");
  for (const route of ["/templates", "/app/explore", "/app/upload"]) {
    assert.ok(app.includes(route), `the search screen does not offer ${route}`);
  }
});

/* ------------------------------------- a template links into a real search -- */

test("a template's call to action carries a search, not an empty box", () => {
  const page = code(
    readFileSync(path.join(SRC, "app/templates/[slug]/page.tsx"), "utf8"),
  );
  assert.match(page, /\/app\?q=\$\{encodeURIComponent/);
  assert.ok(
    !/href="\/app"\s*\n\s*className="mt-10/.test(page),
    "the call to action still lands on a blank search box",
  );
});

test("and never links a derived row, whose counts describe the opposite search", () => {
  const page = code(
    readFileSync(path.join(SRC, "app/templates/[slug]/page.tsx"), "utf8"),
  );
  assert.match(page, /filter\(\(u\) => !u\.derived && u\.matches > 0\)/);
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
