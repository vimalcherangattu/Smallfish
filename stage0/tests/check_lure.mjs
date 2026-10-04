/**
 * Exactly one lure-filled element per screen.
 *
 *     npm run build && npx next start -p 3300 &
 *     node stage0/tests/check_lure.mjs http://localhost:3300
 *
 * `PRODUCT-HANDOFF.md` §12, verbatim: *"Exactly one lure-filled element per
 * screen. Grep for the token and count per route."* §2 is why — the lure is
 * the product's one loud colour, and a screen with two of them has told the
 * reader nothing about which thing to do.
 *
 * ## Why this is rendered rather than grepped
 *
 * The handoff says grep, and grep would have missed the regression that
 * prompted this file. `ExportButton` carries `sf-btn-lure` in a component the
 * result screen does not mention; the screen passed `variant="primary"` and
 * acquired a second lure-filled button two files away, next to Copy email.
 * Nothing in either file reads as a lure token. The browser knows, because it
 * resolves the cascade.
 *
 * ## What counts: lure you can press
 *
 * An **interactive** element whose own computed background is the lure, not
 * nested inside another one — so a lure button with a lure-tinted icon chip
 * inside it is one, not two.
 *
 * Measured first and narrowed second. Counting every lure surface flagged two
 * things the designer put there on purpose:
 *
 * - `.dotv`, the 9px dot marking a search that returns something. No text, not
 *   pressable, nothing to mistake for an action.
 * - `.ptile__tag`, the `start here` badge. §6.6 fills the tag while keeping the
 *   tile's plate tinted — *"tinted, never filled — the screen's one lure button
 *   is elsewhere"* — which says in as many words that the badge is expected to
 *   sit on a screen that also has its one lure button.
 *
 * So the rule is §12's purpose rather than its letter: **one lure-filled thing
 * to press.** That also covers §5.5's named exception for free — the progress
 * bar is lure and is not a button, and it was never meant to be counted.
 *
 * The tint (`--lure-tint`, `#E9F7B5`) is a different token and is never
 * counted.
 *
 * ## Zero is fine
 *
 * A screen with nothing to press has no lure, and that is not a failure. Two
 * is.
 */

import { chromium as _chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const LURE = "rgb(200, 240, 60)"; // --lure, #C8F03C

/** The App v2 screens, plus the marketing doors that use the same kit. */
const ROUTES = [
  "/app",
  "/app?q=med+spas+in+Dallas+that+have+no+online+booking",
  "/app?q=dental+practices+in+Phoenix+that+have+no+online+booking",
  "/app?q=plumbers+in+Denver+that+have+no+online+booking",
  "/app/upload",
  "/app/runs",
  "/app/contacted",
  "/app/destinations",
  "/account",
];

const browser = await _chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? "\n          " + detail : ""}`);
  }
};

console.log(`\nLure audit — ${BASE}\n`);

for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(500);

    const found = await page.evaluate((LURE) => {
      // The element **itself**, never its ancestors. A first cut also counted
      // anything inside a link, which put the `start here` badge and every 9px
      // `.dotv` back in the tally because both sit inside an `<a>`. What §12 is
      // about is the thing you press, and the thing you press is the control.
      const pressable = (el) =>
        el.matches("a[href], button, input, select, textarea, [role=button], [role=link]");
      const hits = [];
      for (const el of document.querySelectorAll("body *")) {
        if (getComputedStyle(el).backgroundColor !== LURE) continue;
        if (!pressable(el)) continue;
        // Nested inside something already counted: one surface, not two.
        if (hits.some((h) => h.el.contains(el))) continue;
        hits.push({
          el,
          label: `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} "${(el.textContent ?? "").trim().slice(0, 40)}"`,
        });
      }
      return hits.map((h) => h.label);
    }, LURE);

    check(
      `${route} — ${found.length} lure-filled element${found.length === 1 ? "" : "s"}`,
      found.length <= 1,
      found.join("\n          "),
    );
  } catch (err) {
    check(`${route} — loaded`, false, String(err).slice(0, 160));
  }
  await ctx.close();
}

// The expanded business row is the one that matters most: Copy email is its
// lure, and the header's Download sits beside it. A collapsed list hides the
// collision that an open row reveals.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app?q=med+spas+in+Dallas+that+have+no+online+booking", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(600);
  const open = await page.evaluate((LURE) => {
    const pressable = (el) =>
      el.matches("a[href], button, input, select, textarea, [role=button], [role=link]");
    const n = [];
    for (const el of document.querySelectorAll("body *")) {
      if (getComputedStyle(el).backgroundColor !== LURE) continue;
      if (!pressable(el)) continue;
      if (n.some((h) => h.contains(el))) continue;
      n.push(el);
    }
    return {
      count: n.length,
      labels: n.map((e) => (e.textContent ?? "").trim().slice(0, 40)),
      rowOpen: !!document.querySelector(".rowacts"),
    };
  }, LURE);
  check("a result screen really does have a row open", open.rowOpen);
  check(
    `and with it open there is still one lure — ${open.labels.join(" | ")}`,
    open.count <= 1,
    open.labels.join(" | "),
  );
}

// The badge is excluded above because it is not pressable. That exclusion is
// only safe for as long as it stays that way, so it is held here rather than
// left as an assumption in a comment.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/app", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const tags = await page.evaluate(() =>
    [...document.querySelectorAll(".ptile__tag")].map((e) => ({
      text: (e.textContent ?? "").trim(),
      pressable: e.matches("a[href], button, [role=button]"),
    })),
  );
  check("the `start here` badge exists to be excluded", tags.length > 0, `${tags.length} found`);
  check(
    "and none of them has become a button, which would make it count",
    tags.every((t) => !t.pressable),
    tags.filter((t) => t.pressable).map((t) => t.text).join(" | "),
  );
  await ctx.close();
}

await browser.close();
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
