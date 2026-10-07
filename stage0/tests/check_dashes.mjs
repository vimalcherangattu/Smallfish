/**
 * No em dash in anything a visitor reads, on the app's own screens.
 *
 *     npm run build && npx next start -p 3300 &
 *     node stage0/tests/check_dashes.mjs http://localhost:3300
 *
 * The rule is the GTM session's, applied across 87 files by hand on 2026-10-06
 * ("No em dashes in anything a visitor reads"). Nothing guarded it, so it was a
 * rule that held until the next person wrote a sentence — and the next person
 * did, within a day, on the screens below.
 *
 * ## Scoped to `/app`, deliberately
 *
 * This checks the routes the Product stream owns. The marketing pages are
 * GTM's, and `/benchmark` legitimately renders a bare "—" as the value of a
 * target with no number yet, which is data rather than prose. Policing their
 * pages from here would be this stream deciding a copy question that is not
 * its own.
 *
 * ## Rendered, not grepped
 *
 * A dash reaches a reader through a string literal, a JSON file, a generated
 * market file or an HTML entity, and only the browser knows which of those
 * ended up on screen. `innerText` is also what makes this ignore the dashes in
 * the source comments explaining the rule.
 */

import { chromium as _chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const ROUTES = [
  "/app",
  "/app?q=dentists+in+Phoenix+that+have+no+online+booking",
  "/app?q=plumbers+in+Zzzqqville",
  "/app/upload",
  "/app/runs",
  "/app/contacted",
  "/account",
];

const browser = await _chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

console.log(`\nEm-dash audit — ${BASE}\n`);

for (const route of ROUTES) {
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const text = (await page.innerText("body")) ?? "";
    const hits = [...text.matchAll(/[^\n]{0,44}—[^\n]{0,44}/g)].map((m) => m[0].trim());
    check(
      `${route} reads without an em dash`,
      hits.length === 0,
      hits.slice(0, 3).map((h) => `"${h}"`).join("\n          "),
    );
  } catch (err) {
    check(`${route} loads`, false, String(err).slice(0, 160));
  }
  await page.close();
}

await browser.close();
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
