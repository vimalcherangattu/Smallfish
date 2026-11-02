/**
 * "Has a website that is down or insecure" — the criterion the GTM stream
 * proposed on 2026-11-02. Both verdicts need positive evidence; our own
 * failures prove neither; and it never slows down a read that is not asking.
 */

import { compileLib } from "./_tsmodules.mjs";

delete process.env.ANTHROPIC_API_KEY;

const { load } = compileLib(
  ["src/lib/read.ts", "src/lib/seller.ts", "src/lib/signals.ts", "src/lib/types.ts", "src/lib/contacts.ts", "src/lib/fetchoutcome.ts"],
  "sf-secure-",
);
const R = await load("read");
const S = await load("signals");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const DOWN = { id: "secure_site:absence", text: "has a website that is down or insecure", type: "absence", explain: "" };
const UP = { id: "secure_site:presence", text: "has a working, secure website", type: "presence", explain: "" };
const sig = S.SIGNALS.find((s) => s.id === "secure_site");

/* ------------------------------------------------------------ mapping -- */
check("both phrasings find this signal", S.signalForCriterion(DOWN.text)?.id === "secure_site" && S.signalForCriterion(UP.text)?.id === "secure_site");
{
  const wrong = S.SIGNALS.flatMap((s) => [s.absenceText, s.presenceText].map((t) => [s.id, t]))
    .filter(([id, t]) => S.signalForCriterion(t)?.id !== id);
  check("every criterion in the catalogue still finds its own signal", wrong.length === 0, wrong.map((w) => w.join(" → ")).join("; "));
}
check("it is offered as something we can prove", sig?.provable === true);

/* ---------------------------------------------------- the verdict, pure -- */
const read = (outcome, health, pagesFetched = []) => ({
  result: { outcome, pages: pagesFetched.length, chars: 0, booking: false, vendors: [], quote: false, chat: false, cms: [], ...(health ? { health } : {}) },
  text: "",
  pagesFetched,
  coverage: { targeted: 0, reached: 0 },
});
const v = (r, c = DOWN) => R.healthVerdict(r, c, sig);

const brokenCases = [
  ["NXDOMAIN", read("dead", { dns: "nxdomain", host: "gone.com" }), /no record of gone\.com/],
  ["a name pointing nowhere", read("dead", { dns: "no_address", host: "x.com" }), /points it at no server/],
  ["an expired certificate, even though http then worked", read("ok", { tls: "CERT_HAS_EXPIRED", host: "x.com" }, ["http://x.com/"]), /CERT_HAS_EXPIRED/],
  ["https refused outright", read("ok", { noHttps: true, host: "x.com" }, ["http://x.com/"]), /Not secure/],
];
for (const [name, r, proof] of brokenCases) {
  const d = v(r);
  check(`${name}: a match, with the evidence as the proof`, d.verdict === "match" && proof.test(d.proof ?? ""), JSON.stringify(d));
  check(`${name}: and "has a working, secure website" is a no`, v(r, UP).verdict === "no_match");
}
{
  const ok = read("ok", { httpsOk: true }, ["https://fine.com/"]);
  check("a page loaded over https with a passing certificate: not a match", v(ok).verdict === "no_match" && /https:\/\/fine\.com/.test(v(ok).proof ?? ""));
  check("and is a match for the working-site phrasing", v(ok, UP).verdict === "match");
}
for (const [name, r] of [
  ["our timeout", read("timeout")],
  ["our resolver, unconfirmed", read("probe_error")],
  ["an http page with nothing learned about https", read("ok", {}, ["http://x.com/"])],
  ["a 404", read("http_error")],
  ["a listing with no usable address", read("dead")],
]) {
  check(`${name}: couldn't tell, never either verdict`, v(r).verdict === "couldnt_tell" && v(r, UP).verdict === "couldnt_tell", v(r).verdict);
}
check("a site that refused us is blocked", v(read("blocked")).verdict === "blocked");
check("the judge routes this criterion here, with no model key", (await R.judge(read("dead", { dns: "nxdomain", host: "g.com" }), DOWN)).verdict === "match");

/* ---------------------------------------------- the read, fetch faked -- */
const page = `<html><body><p>${"Family plumbing in Tampa since 1987, call us. ".repeat(20)}</p></body></html>`;
const html = (u) => {
  const r = new Response(page, { status: 200, headers: { "content-type": "text/html" } });
  Object.defineProperty(r, "url", { value: u });
  return r;
};
const err = (code) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
const asked = [];
globalThis.fetch = async (input) => {
  const u = String(input);
  if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
  asked.push(u);
  const { host, protocol } = new URL(u);
  if (protocol === "http:") return html(u);
  if (host === "nohttps.test") throw err("ECONNREFUSED");
  if (host === "badcert.test") throw err("ERR_TLS_CERT_ALTNAME_INVALID");
  if (host === "slow.test") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  if (host === "fine.test") return html(u);
  throw new Error("unexpected " + u);
};

const cases = [
  ["nohttps.test", "match", "an http-only site that refuses https"],
  ["badcert.test", "match", "an http site whose https certificate is wrong"],
  ["fine.test", "no_match", "an http listing whose https works"],
  ["slow.test", "couldnt_tell", "an https side that times out (could be ours)"],
];
for (const [host, want, name] of cases) {
  const r = await R.readSite(`http://${host}/`, DOWN, {});
  const d = await R.judge(r, DOWN);
  check(`${name}: ${want}`, d.verdict === want, `${d.verdict} ${JSON.stringify(r.result.health ?? {})}`);
}
{
  asked.length = 0;
  await R.readSite("http://fine.test/", { id: "b", text: "has no online booking", type: "absence", explain: "" }, {});
  check("any other criterion never makes the extra https request", !asked.some((u) => u.startsWith("https:")), asked.join(", "));
}

/* ------------------------------------------- the parser's polarity -- */
// Caught on production 2026-11-02, minutes after shipping: "has a website that
// is down or insecure" parsed as "has a working, secure website", because the
// parser only finds absence through "no"/"not"/"without". Every phrasing a
// person or a chip produces is run through the real parser here.
{
  const { load: loadQ } = compileLib(["src/lib/search.ts", "src/lib/signals.ts", "src/lib/types.ts"], "sf-secure-q-");
  const Q = await loadQ("search");
  const typeOf = (q) => {
    const cs = Q.parseSearch(q).criteria.filter((c) => c.signalId === "secure_site");
    const types = [...new Set(cs.map((c) => c.type))];
    return types.length === 1 ? types[0] : types.join("+") || "none";
  };
  const cases = [
    ["roofers in Omaha that has a website that is down or insecure", "absence"], // the chip
    ["roofers in Omaha that has a working, secure website", "presence"], // the other chip
    ["dentists in Austin whose website is down", "absence"],
    ["plumbers in Tampa with broken websites", "absence"],
    ["gyms with an insecure site", "absence"],
    ["salons with a site that is not secure", "absence"],
    ["vets with dead websites", "absence"],
    ["vets whose site is offline", "absence"],
    ["dentists whose website is not down", "presence"],
    ["dentists with a secure website", "presence"],
    ["dentists with no secure website", "absence"],
  ];
  for (const [q, want] of cases) {
    const got = typeOf(q);
    check(`"${q}" → ${want}`, got === want, got);
  }
  // And the chips: whatever text the screen offers must parse back to itself.
  for (const s of S.SIGNALS.filter((x) => x.provable)) {
    for (const [text, type] of [[s.absenceText, "absence"], [s.presenceText, "presence"]]) {
      const cs = Q.parseSearch(`plumbers in Denver that ${text}`).criteria.filter((c) => c.signalId === s.id);
      check(`chip "${text}" parses back as ${s.id}:${type}`, cs.length > 0 && cs.every((c) => c.type === type), cs.map((c) => c.type).join(","));
    }
  }
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
