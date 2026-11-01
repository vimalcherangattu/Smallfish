/**
 * Website-builder questions settle from the page source, both ways, without a
 * model — and never on pages we did not read.
 *
 * Measured 2026-11-01: of the 20 production reads that opened pages and still
 * came back "couldn't tell", 17 were builder questions. The judge handed the
 * model the page text with the markup stripped, and the markup is the only
 * evidence a builder leaves. `signals.ts` already promised this check "cannot
 * come back couldn't tell"; this holds the judge to it.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

delete process.env.ANTHROPIC_API_KEY; // a settled verdict here must never need one

const { load } = compileLib(
  ["src/lib/read.ts", "src/lib/seller.ts", "src/lib/signals.ts", "src/lib/types.ts", "src/lib/contacts.ts", "src/lib/fetchoutcome.ts"],
  "sf-builder-",
);
const R = await load("read");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const ON = { id: "builder:presence", text: "is on a website builder", type: "presence", explain: "" };
const OFF = { id: "builder:absence", text: "is not on a website builder", type: "absence", explain: "" };
const NO_BOOKING = { id: "booking:absence", text: "has no online booking", type: "absence", explain: "" };

const pages = ["https://acme.com/", "https://acme.com/services", "https://acme.com/contact"];
const read = ({ outcome = "ok", cms = [], n = 3 } = {}) => ({
  result: { outcome, pages: outcome === "ok" || outcome === "js_shell" ? n : 0, chars: 2000, booking: false, vendors: [], quote: false, chat: false, cms },
  text: "Acme Plumbing. Call us today.",
  pagesFetched: outcome === "ok" || outcome === "js_shell" ? pages.slice(0, n) : [],
  coverage: { targeted: n - 1, reached: n - 1 },
});

/* ------------------------------------------------- settled both ways -- */
{
  const v = await R.judge(read(), ON);
  check("no builder markup on the pages read: 'is on a builder' is a no, with no model", v.verdict === "no_match", JSON.stringify(v));
  check("and the proof names every page whose source was read", pages.every((p) => (v.proof ?? "").includes(p)));
}
check("and 'is not on a builder' is a match", (await R.judge(read(), OFF)).verdict === "match");
check("one page read is still a read source", (await R.judge(read({ n: 1 }), OFF)).verdict === "match");

/* ------------------------------------------- a builder found always wins -- */
for (const cms of [["wix"], ["squarespace"], ["godaddy_website_builder"], ["webflow"], ["shopify"], ["duda"], ["weebly"]]) {
  const on = await R.judge(read({ cms }), ON);
  const off = await R.judge(read({ cms }), OFF);
  check(`${cms[0]} found: on-a-builder matches, not-on-a-builder does not`, on.verdict === "match" && off.verdict === "no_match", `${on.verdict}/${off.verdict}`);
}
check("WordPress is not a DIY builder, and is not called one", (await R.judge(read({ cms: ["wordpress"] }), ON)).verdict === "no_match");

/* ------------------------------------------------------- empty shells -- */
check("a JS shell's source is still source: no markup settles it", (await R.judge(read({ outcome: "js_shell", n: 1 }), OFF)).verdict === "match");
check("and a builder in a shell is found", (await R.judge(read({ outcome: "js_shell", n: 1, cms: ["wix"] }), ON)).verdict === "match");

/* ----------------------------------------------- never on nothing read -- */
for (const outcome of ["dead", "timeout", "probe_error", "http_error"]) {
  const v = await R.judge(read({ outcome }), OFF);
  check(`nothing read (${outcome}) is couldn't-tell, never 'not on a builder'`, v.verdict === "couldnt_tell", v.verdict);
}
check("a refusal stays blocked", (await R.judge(read({ outcome: "blocked" }), OFF)).verdict === "blocked");

/* ----------------------------------------------- confined to this signal -- */
check(
  "a signal whose evidence is on one page is not settled by this rule",
  (await R.judge(read(), NO_BOOKING)).verdict === "needs_model",
  "booking still needs its pages judged",
);

/* ------------------------------------------- the two readers agree -- */
{
  const py = readFileSync("stage0/src/engine/tech_signals.py", "utf8");
  const sig = readFileSync("src/lib/signals.ts", "utf8");
  const builders = (sig.match(/const BUILDERS = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "").match(/"([a-z_]+)"/g)?.map((x) => x.slice(1, -1)) ?? [];
  const pyBuilders = ["wix", "squarespace", "godaddy_website_builder", "webflow", "duda", "shopify", "weebly"].filter((k) =>
    new RegExp(`"${k}":\\s*\\[`).test(py),
  );
  const missing = pyBuilders.filter((k) => !builders.includes(k));
  check("every builder the Python catalogue fingerprints, the live reader counts", missing.length === 0, missing.join(", "));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
