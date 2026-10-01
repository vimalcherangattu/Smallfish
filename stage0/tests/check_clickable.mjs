/**
 * Every control can actually be clicked.
 *
 *     npm run build && npx next start -p 3300 &
 *     node stage0/tests/check_clickable.mjs http://localhost:3300
 *
 * ## Why this exists
 *
 * The marketing header shipped with six dead links — the logo, How we check,
 * Markets, Pricing, Sign in, Sign up — and **every check in this repo passed.**
 * `test_reachable.mjs` proved the links existed and pointed somewhere real.
 * `check_routes.mjs` proved the destinations rendered. `check_mobile.mjs`
 * measured the tap targets and found them a comfortable size. The nav was
 * present, correctly sized, correctly addressed, and inert: a decorative
 * absolutely-positioned school of fish painted on top of it and swallowed
 * every click.
 *
 * None of those checks could have found it, because each one asks about the
 * control in isolation. The defect is not in the control, it is in what is
 * **over** the control, and the only way to ask that question is to ask the
 * browser: at the point a finger lands, what would receive the click?
 *
 * ## What it does
 *
 * Crawls from `/` the way `check_routes.mjs` does, and for every visible
 * link, button and field, scrolls it into view and calls
 * `document.elementFromPoint` at its centre. Three outcomes:
 *
 * - **The control, or something inside it.** Clicking works — a `<span>`
 *   inside a link is still the link.
 * - **An ancestor of the control.** Nothing is covering it; the centre of its
 *   bounding box simply fell outside its own line boxes, which happens to an
 *   inline link that wraps. Not a finding. (Measured, inline controls are
 *   hit-tested at the centre of their first client rect for this reason, so
 *   this outcome is rare.)
 * - **The control's own label, or something inside it.** A `<label>` forwards
 *   its click to the field it labels, so a visually-hidden file input under a
 *   styled label is working exactly as intended. This was a finding on
 *   `/app/upload` on the first run and it was wrong; the rule below asks the
 *   DOM which field a label actually drives rather than guessing from nesting.
 * - **Anything else.** Something unrelated is on top, and the click goes
 *   there instead. That is the bug, and the blocker is named with the four
 *   properties that explain it: `position`, `z-index`, `pointer-events` and
 *   `aria-hidden` — a decorative layer typically has all four wrong at once.
 *
 * ## It runs at two widths
 *
 * A covering layer is a geometry bug, so it can exist at one width and not
 * another: a decoration placed off the right edge of a phone lands squarely
 * over the nav on a desktop. Both are checked.
 *
 * ## Animated decoration
 *
 * The layer that caused this drifts continuously, so a blocker can be over a
 * control at one instant and clear at the next. A control that fails is
 * re-tested a second later and the finding says whether it was blocked both
 * times or only once; **either is a failure**, because a link you can only
 * click at certain moments is not a working link. A decoration that correctly
 * sets `pointer-events: none` never fails at any moment, so a passing run is
 * not a matter of timing.
 *
 * Exits 1 on any finding, 2 when it cannot reach the site.
 */

import { chromium as _chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 800, mobile: false },
  { label: "phone", width: 390, height: 844, mobile: true },
];

/** Assets are fetched, not navigated: an mp4 with `networkidle` never settles. */
const ASSET = /\.(mp4|jpg|jpeg|png|svg|webp|ico|txt|xml|csv|json|pdf)$/i;

/**
 * The sweep, run inside the page. Returns one entry per control that did not
 * receive its own click, plus the links found so the crawl can continue.
 */
function sweep() {
  const SELECTOR = [
    "a[href]",
    "button",
    "summary",
    "input",
    "select",
    "textarea",
    '[role="button"]',
    '[role="link"]',
  ].join(",");

  const name = (el) => {
    if (!el) return "(nothing)";
    const cls = (el.className || "")
      .toString()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3);
    return `${el.tagName.toLowerCase()}${cls.length ? "." + cls.join(".") : ""}`;
  };

  /**
   * Where to aim. An inline element that wraps has a bounding box whose centre
   * can sit in the gutter between its lines, so aim at the middle of its first
   * client rect instead; for everything else the two are the same point.
   */
  const aim = (el) => {
    const rects = el.getClientRects();
    const r = rects.length ? rects[0] : el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  };

  const controls = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (parseFloat(cs.opacity) === 0) continue;
    if (el.disabled) continue;
    // A hidden field is not a control anybody aims at.
    if (el.tagName === "INPUT" && el.type === "hidden") continue;
    // The control itself opting out of the pointer is a deliberate choice
    // somebody made in CSS, not a layer covering it; it is also what the fix
    // for this bug class looks like, so flagging it would be backwards.
    if (cs.pointerEvents === "none") continue;
    const at = aim(el);
    if (!at) continue;
    controls.push({ el, at });
  }

  const findings = [];
  for (const { el, at } of controls) {
    // Bring it into the viewport. `elementFromPoint` is in viewport
    // coordinates and returns null outside them, so an off-screen control
    // would otherwise read as "nothing on top" and pass for the wrong reason.
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const a = aim(el);
    if (!a) continue;
    if (a.y < 0 || a.y > innerHeight || a.x < 0 || a.x > innerWidth) {
      // Cannot be scrolled into the window at all — a different defect, and
      // one `check_mobile.mjs` already reports as overflow.
      continue;
    }

    const hit = document.elementFromPoint(a.x, a.y);

    // Its own box, or something inside it: the click lands on the control.
    // An ancestor: nothing is over it, the aim point just missed its line box.
    let reaches = hit && (hit === el || el.contains(hit) || hit.contains(el));

    // A label drives the field it labels, so a click on the label is a click
    // on the field. `label.control` is the browser's own answer to "which
    // field does this label operate", which handles both `for=` and nesting
    // and is right where guessing from the DOM tree is not.
    if (!reaches && hit) {
      const label = hit.closest("label");
      if (label && label.control === el) reaches = true;
    }

    if (reaches) continue;

    const cs = hit ? getComputedStyle(hit) : null;
    findings.push({
      control: name(el),
      text: (el.textContent || el.value || el.getAttribute("aria-label") || "")
        .trim()
        .slice(0, 40),
      href: el.getAttribute("href") || null,
      at: { x: Math.round(a.x), y: Math.round(a.y) },
      size: `${Math.round(a.w)}x${Math.round(a.h)}`,
      blocker: name(hit),
      blockerText: hit ? (hit.textContent || "").trim().slice(0, 30) : "",
      // The four properties that explain a covering layer. A decoration that
      // takes clicks it was never meant to take usually has all four of them
      // telling the same story at once.
      position: cs ? cs.position : null,
      zIndex: cs ? cs.zIndex : null,
      pointerEvents: cs ? cs.pointerEvents : null,
      ariaHidden: hit ? hit.closest("[aria-hidden='true']") !== null : false,
      // Who put it there. The blocker is often a leaf inside the layer that
      // is actually wrong, and the layer is the thing to fix.
      ancestry: (() => {
        const chain = [];
        for (let p = hit; p && p !== document.body && chain.length < 5; p = p.parentElement) {
          const pcs = getComputedStyle(p);
          chain.push(`${name(p)}{${pcs.position},z=${pcs.zIndex},pe=${pcs.pointerEvents}}`);
        }
        return chain;
      })(),
    });
  }

  const links = [];
  for (const a of document.querySelectorAll("a[href]")) links.push(a.getAttribute("href"));
  return { findings, links };
}

const browser = await _chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});

let total = 0;
let routes = 0;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  });

  const seen = new Set();
  const queue = ["/"];
  console.log(`\nClick test at ${vp.width}x${vp.height} (${vp.label}) — ${BASE}\n`);

  while (queue.length) {
    const route = queue.shift();
    if (seen.has(route) || ASSET.test(route)) continue;
    seen.add(route);

    const page = await ctx.newPage();
    let first;
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 20000 });
      // Fonts, hydration and the first frame of any animation.
      await page.waitForTimeout(800);
      first = await page.evaluate(sweep);
    } catch (err) {
      console.log(`  FAIL  ${route} — ${String(err).split("\n")[0]}`);
      total += 1;
      await page.close();
      continue;
    }

    // Re-test only if something failed, to say whether a drifting decoration
    // was over it the whole time or caught it once. Both are findings.
    let again = { findings: [] };
    if (first.findings.length) {
      await page.waitForTimeout(1200);
      again = await page.evaluate(sweep).catch(() => ({ findings: [] }));
    }
    const stillBlocked = new Set(again.findings.map((f) => `${f.control}|${f.text}`));

    if (first.findings.length) {
      console.log(`  FAIL  ${route}`);
      for (const f of first.findings) {
        const when = stillBlocked.has(`${f.control}|${f.text}`) ? "always" : "intermittently";
        console.log(
          `          ${f.control} "${f.text}"${f.href ? ` → ${f.href}` : ""} ` +
            `(${f.size} at ${f.at.x},${f.at.y}) is ${when} covered`,
        );
        console.log(
          `            by ${f.blocker} — position:${f.position} z-index:${f.zIndex} ` +
            `pointer-events:${f.pointerEvents}${f.ariaHidden ? " aria-hidden" : ""}` +
            (f.blockerText ? ` "${f.blockerText}"` : ""),
        );
        for (const a of f.ancestry.slice(1)) console.log(`            inside ${a}`);
      }
      total += first.findings.length;
    } else {
      console.log(`  ok    ${route}`);
    }

    for (const href of first.links) {
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

  routes += seen.size;
  await ctx.close();
}

await browser.close();

console.log(`\n${routes} route-widths checked.`);
if (total) {
  console.log(`${total} control(s) that cannot be clicked.`);
  process.exit(1);
}
console.log("Every link, button and field receives its own click.");
