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

import { code } from "./_source.mjs";
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
 *  linked is precisely the case this test exists to fail on. Shared with
 *  `test_optout_reach.mjs`, which hit the same trap — see `_source.mjs`. The
 *  local regex this replaced missed a trailing `// …` after code on one line. */

/**
 * Is this path linked or navigated to from somewhere other than its own page?
 *
 * `ownRoute` exists for a dynamic route, where the two differ. `/app/runs/[id]`
 * is matched by its static prefix `/app/runs/`, but its **own page** is the
 * `[id]` directory — and its natural door is the list at `/app/runs`, which
 * sits in the parent of it. Excluding by the prefix would have discarded that
 * list as self-linking and reported the detail screen orphaned, which is
 * exactly what it did the first time the sweep below ran.
 */
function linkedFrom(route, ownRoute = route) {
  const own = path.join(SRC, "app", ownRoute.replace(/^\//, ""));
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

/* ------------------------------------------- every screen, not just the list -- */

/**
 * The same question asked of **every** route rather than of eight named ones.
 *
 * `MUST_BE_REACHABLE` is a hand-maintained list, which means it covers the
 * screens somebody thought of. It did its job and it cannot catch the next one:
 * a screen built tomorrow is reachable-by-default as far as this file is
 * concerned, because nobody adds their own new route to a list of routes that
 * might be orphaned.
 *
 * `/app/icp` is how that failed in practice. It is S1-23 – S1-26, a whole
 * screen, and its own file says "it gets a place in the navigation and a URL
 * you can come back to". The App v2 shell rewrite cut the sidebar to three
 * items and nothing links to it now. It is not in the list above, so nothing
 * said so.
 *
 * Scoped to `/app/**` and `/account` — the screens the Product stream owns. The
 * marketing pages are GTM's and their entry points are campaigns and search
 * results rather than in-app links, so sweeping them from here would be this
 * stream deciding somebody else's question.
 */

/** Routes with a `page.tsx`, found rather than listed. */
function routesUnder(dir, prefix) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    // A route group `(x)` does not appear in the URL.
    const here = prefix + (/^\(.*\)$/.test(name) ? "" : `/${name}`);
    if (readdirSync(full).includes("page.tsx")) out.push(here);
    out.push(...routesUnder(full, here));
  }
  return out;
}

/**
 * Screens reached by something other than an in-app link, with the reason.
 *
 * **Adding to this list is a decision, not a fix.** An entry put here to quiet
 * the assertion is a screen nobody can get to, carrying a comment that claims
 * otherwise.
 */
const NO_LINK_NEEDED = {
  "/app": "the section root, and the product's main screen",
  "/account": "covered by its own case above, and where Stripe returns to",
  "/app/icp":
    "Deliberately not a front door. `AppNav.tsx` records the decision: 'Who to " +
    "target' was a second front door for the same question the search box " +
    "already asks, and a product that does one thing should not offer six " +
    "places to start doing it. The screen stays at its URL for anyone sent " +
    "there. This entry exists so the next person to notice it has no door " +
    "reads the reason rather than wiring one up — which is what happened on " +
    "2026-10-07, and was reverted for being the duplication the owner had " +
    "already asked us not to add.",
};

test("every screen under /app and /account has a door, or a written reason", () => {
  const APP = path.join(SRC, "app");
  const found = [
    ...routesUnder(path.join(APP, "app"), "/app"),
    ...routesUnder(path.join(APP, "account"), "/account"),
    ...["/app", "/account"].filter((r) =>
      readdirSync(path.join(APP, r.slice(1))).includes("page.tsx"),
    ),
  ];

  const orphans = found
    // A dynamic segment is linked by template literal, so ask about the static
    // part: `/app/reads/[id]` is reachable if anything writes `/app/reads/`.
    .map((r) => ({ route: r, want: r.replace(/\/\[[^\]]+\].*$/, "/") }))
    .filter(
      ({ route, want }) => !NO_LINK_NEEDED[route] && linkedFrom(want, route).length === 0,
    )
    .map(({ route }) => route);

  assert.deepEqual(
    orphans,
    [],
    `no link anywhere in src/ reaches: ${orphans.join(", ")}. A screen with no ` +
      `door is the same as not existing, except that it also has to be ` +
      `maintained — mount it where people work, delete it, or add it to ` +
      `NO_LINK_NEEDED with the reason.`,
  );
});

test("a route named only in a comment is not a door", () => {
  // `code()` is what makes the sweep above mean anything, and this repository
  // names routes in prose constantly: `AppNav.tsx` explains that `/app/icp` is
  // not in the nav *by naming it*. A matcher that counted comments would have
  // reported every screen reachable, forever. Checked on the real file rather
  // than a fixture, because that comment is the live example.
  const nav = code(readFileSync(path.join(SRC, "components/AppNav.tsx"), "utf8"));
  assert.ok(!nav.includes("/app/icp"), "the comment naming /app/icp survived stripping");
  // And the hrefs in the same file do survive, or the stripper is too greedy.
  assert.ok(nav.includes('href: "/app/runs"'), "a real link was stripped");
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
