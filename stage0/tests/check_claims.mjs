/**
 * The numbers on screen say what they actually are.
 *
 *     npm run build && npx next start -p 3300 &
 *     node stage0/tests/check_claims.mjs http://localhost:3300
 *
 * `CLAUDE.md`'s standing rule is "measure before trusting a number", and this
 * project's named failure is a figure that was true of something else. It has
 * now happened three times, each on a different screen, each time by taking a
 * number that was to hand and writing the nearest-sounding sentence around it:
 *
 * 1. *"We checked 2,800 and these are the ones that fit."* We had read 200;
 *    2,800 was how many dental listings in Phoenix have a website. Caught by
 *    `test_leads.mjs`, which holds `read` to `counts.read`.
 * 2. *"We read 200 of the 2,988 med spas in Dallas that have a website."*
 *    2,988 is every grouped listing; 2,419 have a website. Overstated by 569.
 *    Fixed by giving `LeadResult` a `withSite` of its own.
 * 3. *"1,000 businesses there have a website"* on an unread city. 1,000 is
 *    `CITY_CAP` — a **cap on our own work**, not a count of theirs. Denver's
 *    plumbers were never counted at all.
 *
 * All three are the same mistake and none of them is visible in the code: each
 * reads perfectly as a sentence, and each needs the data beside it to catch.
 * So this reads the rendered page and checks the claims against the files.
 *
 * ## What it cannot do
 *
 * It cannot check a sentence nobody wrote a rule for. It holds the specific
 * claims that have been wrong, plus one general rule — no screen may state a
 * cap as a population — and it grows when the next one is found.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium as _chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const data = (f) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", f), "utf8"));

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? "\n          " + detail : ""}`);
  }
};

const browser = await _chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });

console.log(`\nClaim audit — ${BASE}\n`);

/* ------------------------------------------- a read market states both counts */
{
  const market = data("med-spa-dallas.json");
  const withSite = market.businesses.filter((b) => b.site).length;

  const page = await ctx.newPage();
  await page.goto(BASE + "/app?q=med+spas+in+Dallas+that+have+no+online+booking", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(600);
  const text = (await page.textContent("body")) ?? "";

  // "We read 200 of the N … that have a website." N is the websites, and it is
  // smaller than the listing count — if the two are ever equal the sentence has
  // gone back to counting listings.
  const m = /We read\s+([\d,]+)\s+of the\s+([\d,]+)/.exec(text.replace(/\s+/g, " "));
  check("the result screen states what it read against what it could read", !!m, text.slice(0, 120));
  if (m) {
    const read = Number(m[1].replace(/,/g, ""));
    const against = Number(m[2].replace(/,/g, ""));
    check(
      "and the thing it read against is websites, not listings",
      against <= withSite && against < market.businesses.length,
      `claims ${against}, websites ${withSite}, listings ${market.businesses.length}`,
    );
    check(
      "and it never claims to have read more than it did",
      read <= market.counts.read,
      `claims ${read}, measured ${market.counts.read}`,
    );
    check(
      "and the two are different numbers — a market read end to end would be suspicious here",
      read < against,
      `${read} vs ${against}`,
    );
  }
  await page.close();
}

/* --------------------------------------------- an unread city states a cap */
{
  const page = await ctx.newPage();
  await page.goto(BASE + "/app?q=plumbers+in+Denver+that+have+no+online+booking", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(600);
  const text = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");

  check(
    "a city nobody has read says so",
    /haven.t been through/i.test(text),
    text.slice(0, 120),
  );
  // The fix, held: the number is introduced as a bound on our work.
  check(
    "and the number beside it is framed as a bound on our reading",
    /would open up to\s+[\d,]+/i.test(text),
    text.slice(0, 400),
  );
  // The regression, held: a cap must never be stated as a fact about them.
  check(
    "never as a count of businesses that have a website",
    !/[\d,]+ businesses there have a website/i.test(text),
    text.slice(0, 400),
  );
  check(
    "and nothing was charged for finding out",
    /Nothing was charged/i.test(text),
  );
  await page.close();
}

/* --------------------------------- the one claim this product may never make */
{
  // `CLAUDE.md`: "every" is the one word this product cannot use — we read 200
  // of 2,778. Checked across the screens that quote figures.
  for (const route of [
    "/app",
    "/app?q=med+spas+in+Dallas+that+have+no+online+booking",
    "/app?q=plumbers+in+Denver+that+have+no+online+booking",
  ]) {
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    const text = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
    const bad = [
      /every (business|site|website|listing) (in|we)/i,
      /all \d[\d,]* (businesses|sites|websites) (in|we)/i,
      /we('ve| have) read every/i,
    ].filter((re) => re.test(text));
    check(`${route} claims no total coverage`, bad.length === 0, bad.map(String).join(" | "));
    await page.close();
  }
}

await browser.close();
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
