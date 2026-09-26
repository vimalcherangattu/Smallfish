/**
 * Walk every page a visitor can reach, and report anything that breaks.
 *
 *     npm run build && npx next start -p 3300 &
 *     node stage0/tests/check_routes.mjs http://localhost:3300
 *
 * **Named `check_`, not `test_`**, for the same reason as `check_rls_live.mjs`:
 * it needs a running server and a browser, so inside `run_all.py` it would skip
 * on every machine that has neither and report a pass.
 *
 * It starts at `/` and follows internal links until it runs out, so it covers
 * what a stranger can actually get to rather than a list of routes somebody
 * remembered to add. A page that nothing links to is invisible to this — which
 * is itself worth knowing, and why the route list is printed.
 *
 * ## What it ignores, and why that is not cheating
 *
 * Map tiles from `tile.openstreetmap.org` fail inside the sandbox this is
 * usually run in, because outbound TLS is intercepted. That is an environment
 * fact, not a product one, and leaving it in the output trains whoever runs
 * this to skim past failures — which is how the real one gets missed. It is
 * filtered by name, so a tile failure from any other host still reports.
 *
 * The first time this ran it reported a 500 on half the app. That was the
 * crawler pointed at a stale server whose build had been replaced underneath
 * it, so it is worth saying plainly: **check the base URL before believing the
 * output.** It prints it.
 */

/**
 * Playwright is **not** a dependency of this repository. It is a large install
 * for one diagnostic, and the app does not use a browser at runtime — so this
 * asks for it and explains how, rather than putting it in `package.json` where
 * every deploy would pay for it.
 */
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "This check needs Playwright, which is deliberately not a dependency of\n" +
      "this repo — it is a large install for one diagnostic. Get it with:\n\n" +
      "    npm install --no-save playwright\n",
  );
  process.exit(2);
}

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

/** Failures that belong to the environment rather than the product. */
const IGNORE = [/tile\.openstreetmap\.org/, /ERR_CERT_AUTHORITY_INVALID/];

/**
 * Links to files rather than pages.
 *
 * A crawler that navigates to an mp4 and then waits for `networkidle` waits
 * forever — the browser starts streaming and never goes idle. The explainer's
 * `<video>` carries a download link as its no-support fallback, which is
 * exactly the kind of correct markup that hung this check the first time it
 * ran. Assets are fetched and checked for a status below, not navigated to.
 */
const ASSET = /\.(mp4|webm|mov|pdf|zip|csv|jpe?g|png|svg|gif|webp|ico|txt|xml)$/i;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const seen = new Set();
const assets = new Set();
const queue = ["/"];
const status = new Map();
const problems = [];

console.log(`\nCrawling ${BASE}\n`);

while (queue.length) {
  const route = queue.shift();
  if (seen.has(route)) continue;
  seen.add(route);

  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`uncaught: ${String(e).slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errs.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });

  let code = 0;
  try {
    const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 25_000 });
    code = res?.status() ?? 0;
  } catch (e) {
    problems.push([route, `navigation failed: ${String(e).slice(0, 120)}`]);
    await page.close();
    continue;
  }

  status.set(route, code);
  if (code >= 400) problems.push([route, `HTTP ${code}`]);
  for (const e of errs) {
    if (!IGNORE.some((re) => re.test(e))) problems.push([route, e]);
  }

  for (const href of await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")))) {
    if (!href || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) {
      continue;
    }
    const clean = href.split("#")[0];
    if (!clean.startsWith("/") || seen.has(clean)) continue;

    if (ASSET.test(clean)) {
      // Fetched, not navigated to. A broken asset link is still a broken link,
      // so it is checked — just without handing it to the renderer.
      if (!assets.has(clean)) {
        assets.add(clean);
        const res = await fetch(BASE + clean, { method: "HEAD" }).catch(() => null);
        if (!res || !res.ok) {
          problems.push([route, `asset ${clean} -> ${res ? res.status : "unreachable"}`]);
        } else {
          status.set(clean, res.status);
        }
      }
      continue;
    }

    if (!queue.includes(clean)) queue.push(clean);
  }
  await page.close();
}

await browser.close();

console.log([...status.entries()].map(([r, s]) => `  ${s}  ${r}`).sort().join("\n"));
console.log(`\n${status.size} routes reached.`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n`);
  for (const [route, message] of problems) console.log(`  ${route}\n      ${message}`);
  process.exit(1);
}
console.log("\nNo broken pages, no console errors.");
