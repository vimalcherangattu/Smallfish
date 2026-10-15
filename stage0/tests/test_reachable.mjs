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
 * (deleted 2026-10-15) as having been "the same as not existing".
 *
 * ## The same failure, one level up: a test pointed at a dead file
 *
 * `LeadList.tsx` and three sibling components were the pre-App-v2 app. Nothing
 * imported them, and `test_refund.mjs` and `test_spent_balance.mjs` asserted
 * real behaviour — a refunded row stays struck through, a contacted tick
 * reverts when the server refuses — **against those files**. They passed. The
 * live screen had reproduced the buttons without the server calls, so "not a
 * fit, refunds the credit" refunded nothing for weeks behind a green suite.
 *
 * This file's own lesson, applied to itself: built work nobody can reach is
 * the same as unbuilt work. A *test* nobody's code can reach is worse than an
 * absent one, because it reports the property as held.
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

/**
 * The files that are actually in the build, by following imports from the
 * route tree.
 *
 * **Why this exists.** `linkedFrom` used to ask whether *any* file under
 * `src/` carried the href, and on 2026-10-15 that turned out to be a much
 * weaker question than it reads as. `/app/destinations` — the CRM connector
 * screen — had exactly one link in the codebase, and it was in
 * `src/components/AppNav.tsx`: the pre-App-v2 sidebar, which nothing has
 * imported since App v2 shipped. The sweep below reported the screen
 * reachable for weeks. It was not reachable at all, and worse, the push
 * component on the results screen rendered `null` until a destination existed,
 * so the only way to configure one was behind a page you could not get to.
 *
 * It was found by deleting the dead file, not by this test. That is the wrong
 * way round, so: a door in a file no page can reach is not a door.
 *
 * Deliberately crude. A route file is a root; anything a root imports is in,
 * transitively. It resolves `@/` and relative specifiers and ignores packages,
 * which is all this repository uses.
 */
function inTheBuild() {
  const byPath = new Map(files.map((f) => [f.file, f]));
  /** `@/x` → `src/x`, `./x` → sibling. Returns the file that exists, or null:
   *  a specifier may name a directory index, a `.ts` or a `.tsx`. */
  const resolve = (from, spec) => {
    const base = spec.startsWith("@/")
      ? path.join(SRC, spec.slice(2))
      : spec.startsWith(".")
        ? path.resolve(path.dirname(from), spec)
        : null;
    if (!base) return null;
    for (const cand of [
      `${base}.tsx`,
      `${base}.ts`,
      path.join(base, "index.tsx"),
      path.join(base, "index.ts"),
    ]) {
      if (byPath.has(cand)) return cand;
    }
    return null;
  };

  // Every route, layout and route handler is a root. Next renders these
  // whether or not anything in `src/` imports them.
  const roots = files
    .filter((f) => f.file.startsWith(path.join(SRC, "app")))
    .map((f) => f.file);
  // `middleware.ts` too, and anything else at the top of `src/`, for the same
  // reason: the framework is the importer.
  for (const f of files) {
    if (path.dirname(f.file) === SRC) roots.push(f.file);
  }

  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = byPath.get(file)?.text ?? "";
    // `import x from "…"`, `import "…"`, `export … from "…"` and the dynamic
    // `import("…")`. Comments are not stripped here on purpose: a commented
    // import does not make a file live, but counting one only ever errs toward
    // calling a file live, which is the safe direction for this test — it can
    // never invent an orphan.
    for (const m of text.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)) {
      const next = resolve(file, m[1] ?? m[2]);
      if (next) stack.push(next);
    }
  }
  return seen;
}

const LIVE = inTheBuild();

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
    // A link in a file no page imports is not a link. See `inTheBuild`.
    .filter((f) => LIVE.has(f.file))
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
  // `/app/contacted` came off this list on 2026-10-15, and it is the only
  // entry ever to have done so. See `NO_LINK_NEEDED` below for the reason —
  // the short version is that the mark is on the row and the aggregate screen
  // was the product claiming to do a second thing.
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
  "/app/contacted":
    "Lost its door on 2026-10-15, on the owner's mandate: 'I want this " +
    "product to do one thing very well.' The one thing is finding small " +
    "businesses worth calling and proving why. Keeping track of who you " +
    "called afterwards is a CRM — the second-best version of something the " +
    "customer already owns — and a nav item for it on every screen said the " +
    "product was about two things. **The feature it serves is not gone:** " +
    "'Mark as contacted' is on the row in `BizRow.tsx`, it persists through " +
    "`/api/contacted`, and `/app` and `/app/reads/[id]` both read it back and " +
    "render the row as contacted. That is the mark doing its job where the " +
    "person already is. This screen was the same rows listed a second time " +
    "under their own heading. It stays at its URL so nobody mid-flow loses a " +
    "page they had open, and `Shell.tsx`'s `derive` still resolves it.",
  "/app/icp":
    "Deliberately not a front door. The decision was recorded in `AppNav.tsx`, " +
    "the pre-App-v2 sidebar, which was deleted on 2026-10-15 — so the reason " +
    "it held is quoted here in full rather than cited: 'Who to " +
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
  // names routes in prose constantly: `Shell.tsx` explains that
  // `/app/destinations` is reachable from the results screen *by naming it*,
  // and `/app/contacted` lost its nav item on the owner's mandate with the
  // reason written above the array. A matcher that counted comments would have
  // reported every screen reachable, forever. Checked on the real file rather
  // than a fixture, because those comments are the live example.
  //
  // This used to read `components/AppNav.tsx`, the pre-App-v2 sidebar, deleted
  // on 2026-10-15. `Shell.tsx` is its replacement in the product and carries
  // the same two properties: a route named only in prose, and a navigation
  // table of real `href:` entries.
  const nav = code(readFileSync(path.join(SRC, "components/app/Shell.tsx"), "utf8"));
  assert.ok(
    !nav.includes("/app/destinations"),
    "the comment naming /app/destinations survived stripping",
  );
  // And the hrefs in the same file do survive, or the stripper is too greedy.
  assert.ok(nav.includes('href: "/app/runs"'), "a real link was stripped");
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
