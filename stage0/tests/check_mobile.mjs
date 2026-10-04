/**
 * Every page works on a phone.
 *
 *     npm run build && npx next start -p 3300 &
 *     node stage0/tests/check_mobile.mjs http://localhost:3300
 *
 * Crawls the same way `check_routes.mjs` does — from `/`, following internal
 * links — but in a 390 x 844 viewport with a touch pointer, which is an
 * iPhone 14 and close enough to the median phone that a page passing here
 * passes on most of them.
 *
 * ## What it checks, and why each one
 *
 * - **Sideways scroll.** The single worst mobile defect: the page can be swiped
 *   off its own edge, every block is misaligned, and it is invisible on a
 *   desktop browser because the viewport is wide enough to hide it. Measured as
 *   `scrollWidth` past `clientWidth` by more than a rounding pixel.
 * - **What is sticking out.** Knowing the page overflows is not enough to fix
 *   it, so the offenders are named: any element whose box crosses the right
 *   edge, with its tag, class and width. Usually one grid or one fixed width.
 * - **Tap targets.** Anything you are meant to press smaller than 44 x 44,
 *   which is the size a finger actually hits. Links inside a run of prose are
 *   exempt: they are read, not aimed at, and padding them to 44px would wreck
 *   the paragraph.
 * - **Text nobody can read.** Under 12px on a phone.
 * - **Input zoom.** A font under 16px in a text field makes iOS Safari zoom the
 *   whole page on focus and never zoom back. It is the most common reason a
 *   mobile form feels broken, and it is a one-line fix nobody makes because it
 *   looks fine on a desktop.
 *
 * Exits 1 on any finding, 2 when it cannot reach the site.
 */

import { chromium as _chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const WIDTH = 390;
const HEIGHT = 844;

/** Assets are fetched, not navigated: an mp4 with `networkidle` never settles. */
const ASSET = /\.(mp4|jpg|jpeg|png|svg|webp|ico|txt|xml|csv|json|pdf)$/i;

const browser = await _chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

const seen = new Set();
const queue = ["/"];
const findings = [];

console.log(`Mobile audit at ${WIDTH}x${HEIGHT} — ${BASE}\n`);

while (queue.length) {
  const route = queue.shift();
  if (seen.has(route) || ASSET.test(route)) continue;
  seen.add(route);

  const page = await ctx.newPage();
  let report;
  try {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 20000 });
    // Let fonts and the marquee settle; a mid-animation transform is not an
    // overflow, and measuring during one produced phantom findings.
    await page.waitForTimeout(700);

    report = await page.evaluate((vw) => {
      const doc = document.documentElement;
      const out = {
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        overflow: [],
        smallTaps: [],
        smallText: [],
        zoomInputs: [],
        links: [],
      };

      const name = (el) => {
        const cls = (el.className || "").toString().split(/\s+/).filter(Boolean).slice(0, 2);
        return `${el.tagName.toLowerCase()}${cls.length ? "." + cls.join(".") : ""}`;
      };

      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;

        // Sticking out past the right edge. Decorative marks are placed off
        // the page on purpose and their containers clip them, so only count
        // an element that is not inside something hiding its overflow.
        if (r.right > vw + 1) {
          let clipped = false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const pcs = getComputedStyle(p);
            if (/hidden|clip/.test(pcs.overflowX) || /hidden|clip/.test(pcs.overflow)) {
              clipped = true;
              break;
            }
          }
          if (!clipped && out.overflow.length < 8) {
            out.overflow.push({
              el: name(el),
              right: Math.round(r.right),
              width: Math.round(r.width),
              text: (el.textContent || "").trim().slice(0, 40),
            });
          }
        }

        const fs = parseFloat(cs.fontSize);
        const tag = el.tagName.toLowerCase();

        // Tap targets.
        if (tag === "button" || tag === "select" || (tag === "a" && el.getAttribute("href"))) {
          // A link sitting inside a paragraph is read, not aimed at.
          const inProse = !!el.closest("p, li, figcaption");
          const tiny = r.height < 44 && r.width < 44;
          const short = r.height < 32;
          if (!inProse && (tiny || short) && out.smallTaps.length < 8) {
            out.smallTaps.push({
              el: name(el),
              w: Math.round(r.width),
              h: Math.round(r.height),
              text: (el.textContent || "").trim().slice(0, 30),
            });
          }
        }

        // Unreadably small text, only on elements that directly hold words.
        //
        // Text inside a labelled image is exempt, and the reason is a real bug
        // this check had: `getComputedStyle().fontSize` on an SVG `<text>` is
        // in the SVG's **user coordinate space**, not rendered pixels. The US
        // map on the home page has `viewBox="-6 -4 112 70"` drawn at 353px
        // wide, so its city labels report 2.7px and render at 11.5. Eight
        // findings, none of them real.
        //
        // The exemption is `[role="img"]` rather than "any SVG": an element
        // that declares itself an image and carries an `aria-label` is a
        // picture whose meaning reaches a screen reader by its name, and the
        // words inside it are part of the drawing. An SVG used as layout —
        // no role, no label — is still checked, and so is every HTML element.
        const inImage = !!el.closest('[role="img"]');
        const ownText = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join("");
        if (!inImage && ownText.length > 3 && fs > 0 && fs < 12 && out.smallText.length < 8) {
          out.smallText.push({ el: name(el), px: fs, text: ownText.slice(0, 30) });
        }

        // iOS zooms the page when a field's font is under 16px.
        if (tag === "input" || tag === "textarea" || tag === "select") {
          const type = (el.getAttribute("type") || "text").toLowerCase();
          const typable = tag !== "input" || !["checkbox", "radio", "submit", "button"].includes(type);
          if (typable && fs > 0 && fs < 16 && out.zoomInputs.length < 8) {
            out.zoomInputs.push({ el: name(el), px: fs });
          }
        }
      }

      for (const a of document.querySelectorAll("a[href]")) out.links.push(a.getAttribute("href"));
      return out;
    }, WIDTH);
  } catch (err) {
    findings.push({ route, kind: "load", detail: String(err).split("\n")[0] });
    await page.close();
    continue;
  }

  const bad = [];
  if (report.scrollW > report.clientW + 1) {
    bad.push(`scrolls sideways (${report.scrollW}px wide in a ${report.clientW}px window)`);
    for (const o of report.overflow) {
      bad.push(`    ↳ ${o.el} reaches ${o.right}px, ${o.width}px wide — "${o.text}"`);
    }
  }
  for (const t of report.smallTaps) bad.push(`tap target ${t.w}x${t.h} — ${t.el} "${t.text}"`);
  for (const t of report.smallText) bad.push(`${t.px}px text — ${t.el} "${t.text}"`);
  for (const z of report.zoomInputs) bad.push(`${z.px}px field — ${z.el} (iOS will zoom the page)`);

  if (bad.length) {
    findings.push({ route, kind: "layout", detail: bad });
    console.log(`  FAIL  ${route}`);
    for (const b of bad) console.log(`          ${b}`);
  } else {
    console.log(`  ok    ${route}`);
  }

  for (const href of report.links) {
    if (!href || href.startsWith("#")) continue;
    let path;
    try {
      const u = new URL(href, BASE + route);
      if (u.origin !== new URL(BASE).origin) continue;
      path = u.pathname;
    } catch {
      continue;
    }
    if (!seen.has(path) && !ASSET.test(path)) queue.push(path);
  }

  await page.close();
}

await browser.close();

console.log(`\n${seen.size} routes checked at ${WIDTH}px.`);
if (findings.length) {
  console.log(`${findings.length} route(s) with problems.`);
  process.exit(1);
}
console.log("No sideways scroll, no unreachable controls, no zooming fields.");
