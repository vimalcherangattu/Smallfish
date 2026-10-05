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

  // "We opened N <trade> websites to build this list."
  //
  // The sentence used to be "We read 200 of the 2,419 … that have a website.
  // 2,240 have not been opened yet", and the second half was our queue depth —
  // not something a customer asked for, and it reframed a finished list as a
  // partial one. The denominator went with it.
  //
  // What stays guarded is the part that has to be true: the list is standing on
  // a stated number of websites we opened, and that number cannot exceed what
  // was actually read. Without it "26 fit" stands on nothing, which is the
  // overclaim this project retracted once already.
  const m = /We opened\s+([\d,]+)\s+/.exec(text.replace(/\s+/g, " "));
  check("the result screen says how many websites it opened", !!m, text.slice(0, 160));
  if (m) {
    const read = Number(m[1].replace(/,/g, ""));
    check(
      "and never claims to have opened more than it did",
      read > 0 && read <= market.counts.read,
      `claims ${read}, measured ${market.counts.read}`,
    );
    check(
      "and does not quote the market size beside it any more",
      !/of the\s+[\d,]+/.test(text.replace(/\s+/g, " ")),
      "a denominator is back on the results screen",
    );
    // The backlog sentence, held out by name.
    check(
      "and says nothing about what has not been opened",
      !/have not been opened|haven.t been opened|not been read/i.test(text),
    );
  }
  void withSite;
  await page.close();
}

/* ------------------------------- a city with nothing measured gets counted */
{
  // **This block used to assert a dead end**, and that is why it changed.
  //
  // It checked that the screen said we could not start a city from its name,
  // that it quoted no figure, and that it pointed at CSV upload instead. All
  // three were true and all three were describing a missing feature: nothing
  // could supply candidates for a city we had not extracted by hand (P0.2).
  //
  // `src/lib/supply.ts` supplies them now, so the screen states a real count
  // off the real listings. The assertions below are the stronger promises that
  // replaced the old ones — the counts are consistent with each other, the
  // categories being scanned are named, and finding out is still free. A test
  // asserting the old copy would have been a test defending a limitation.
  //
  // It is slow on purpose: this waits on a live ~9s scan of a 10.5 GB release,
  // because the number on screen is the thing being checked.
  const page = await ctx.newPage();
  await page.goto(BASE + "/app?q=plumbers+in+Denver+that+have+no+online+booking", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () => !/Looking through the listings/.test(document.body.textContent ?? ""),
    { timeout: 45_000 },
  );
  const text = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");

  const counted = text.match(
    /([\d,]+)\s+plumbers in Denver, Colorado\.\s*([\d,]+) of them have a website/i,
  );
  const num = (s) => Number(String(s).replace(/,/g, ""));

  check(
    "a city with nothing measured still gets a real count",
    !!counted && num(counted[1]) > 0,
    text.slice(0, 220),
  );
  check(
    "and the readable count cannot exceed the listing count",
    !!counted && num(counted[2]) <= num(counted[1]),
    counted ? `${counted[1]} listings, ${counted[2]} with a website` : "no counts on screen",
  );
  check(
    "and the screen names the categories it will scan rather than choosing silently",
    /Looking in/i.test(text) && /plumbing/i.test(text),
    text.slice(0, 300),
  );
  check(
    "and the measured match rate is quoted with the search that matched nothing",
    // 18 to 31 in every hundred, and one criterion of four that found none.
    // Quoting only the range would be quoting only the successes.
    //
    // Matched on the two ideas rather than the sentence, so a rewrite of the
    // copy does not fail this and a quiet removal of the zero still does.
    /\d+ to \d+ in every hundred/i.test(text) && /fitted nothing/i.test(text),
    text.slice(0, 400),
  );
  check(
    "and nothing was charged for finding out",
    /Nothing has been charged/i.test(text),
    text.slice(-300),
  );
  await page.close();
}

/* --------------------------------------- a place we cannot place says so */
{
  const page = await ctx.newPage();
  await page.goto(BASE + "/app?q=plumbers+in+Zzzqqville", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(600);
  const text = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");

  check(
    "a place we cannot place says so plainly",
    /couldn.?t place/i.test(text),
    text.slice(0, 200),
  );
  check(
    "and does not narrate our reading history at it",
    !/haven.t been through|have not been through|nobody has read|not read (this|that) (city|one)/i.test(text),
    text.slice(0, 300),
  );
  check(
    // There is no market here to have a size, so any thousands-figure on this
    // screen would be a number borrowed from somewhere it does not belong. The
    // counted screen above is where figures are allowed, and there they are
    // checked against each other.
    "and quotes no market figure, because it has none to quote",
    !/\b\d{1,2},\d{3}\b/.test(text),
    (text.match(/\b\d{1,2},\d{3}\b/g) ?? []).join(", "),
  );
  check(
    "and still offers somewhere to go",
    /upload|your own list|something else/i.test(text),
    text.slice(0, 300),
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
