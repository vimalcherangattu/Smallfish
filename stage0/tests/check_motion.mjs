/**
 * The choreography never hides content it fails to bring back.
 *
 *     npm run build && npx next start -p 3300 &
 *     node stage0/tests/check_motion.mjs http://localhost:3300
 *
 * The v3 home page reveals most of its blocks on scroll, which means they
 * start at `opacity: 0` and depend on a script to return. That is a bargain
 * worth making only if the script is certain to win, and the first build of it
 * did not:
 *
 *   **IntersectionObserver fires when the intersection changes.** Jump the
 *   scroll to the foot of the page — Cmd+End, a hash link, a hard flick — and
 *   an element goes from "below the viewport, not intersecting" straight to
 *   "above it, not intersecting". The ratio was zero and still is, so no
 *   callback runs. Measured: one jump left **21 blocks invisible** for as long
 *   as the page stayed open, including the whole junk-list diagram.
 *
 * So this test does the thing that broke it. It loads the page, jumps straight
 * to the bottom, and fails if anything is still transparent — in both the
 * ordinary case and under `prefers-reduced-motion`, where the reveal must be
 * neutralised rather than merely frozen at nothing.
 */

import { chromium as _chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const browser = await _chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

for (const reduced of [false, true]) {
  const label = reduced ? "reduced motion" : "ordinary";
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // The move that broke it: straight to the bottom, no intermediate frames.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  const r = await page.evaluate(() => {
    const hidden = [];
    for (const el of document.querySelectorAll(".rise, .stagger > *, .dotfield circle")) {
      if (getComputedStyle(el).opacity !== "1") {
        const cls = (el.className || "").toString().slice(0, 40);
        hidden.push(`${el.tagName.toLowerCase()}.${cls}`);
      }
    }
    const junk = document.querySelector(".junk .jrow.out .nm");
    return {
      hidden: hidden.slice(0, 6),
      hiddenCount: hidden.length,
      js: document.documentElement.classList.contains("js"),
      strike: junk ? getComputedStyle(junk).backgroundSize : null,
      counters: [...document.querySelectorAll("[data-count]")].map((e) => e.textContent.trim()),
    };
  });

  check(`${label}: the script installed itself`, r.js);
  check(
    `${label}: nothing is left invisible after a jump to the bottom`,
    r.hiddenCount === 0,
    `${r.hiddenCount} still transparent — ${r.hidden.join(", ")}`,
  );
  check(
    `${label}: the struck-through rows finished drawing`,
    r.strike === "100% 1px",
    `background-size is ${r.strike}`,
  );
  // The count-up replays a number the server already rendered; it must never
  // leave a zero on screen, and never a figure the page did not come with.
  check(
    `${label}: every counted number settled on a real value`,
    r.counters.length > 0 && r.counters.every((t) => t !== "0" && /[1-9]/.test(t)),
    r.counters.join(" · "),
  );

  await ctx.close();
}

// --- and with no JavaScript at all, the page is still readable -------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const r = await page.evaluate === undefined ? null : await page.evaluate(() => ({
    hidden: [...document.querySelectorAll(".rise, .stagger > *")].filter(
      (e) => getComputedStyle(e).opacity !== "1",
    ).length,
    js: document.documentElement.classList.contains("js"),
    text: (document.body.innerText || "").length,
  }));
  check("no JavaScript: `.js` is absent, so nothing was ever hidden", r && !r.js && r.hidden === 0,
    r ? `js=${r.js}, hidden=${r.hidden}` : "could not evaluate");
  check("no JavaScript: the page still has its copy", (r?.text ?? 0) > 1500, `${r?.text ?? 0} chars`);
  await ctx.close();
}

await browser.close();
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
