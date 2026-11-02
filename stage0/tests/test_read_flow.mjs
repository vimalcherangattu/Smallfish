/**
 * The read path end to end, with `fetch` faked so it runs offline: what each
 * kind of broken site is recorded as, and which fallback runs.
 *
 * The cases are the GTM stream's measurements of 2026-11-01: broken
 * certificates that answer over plain http (7 of 50 failures), domains that do
 * not exist (25 of 50, confirmed against public DNS), and empty script shells
 * a browser fills in (10 of 100 HVAC Tampa listings).
 */

import { compileLib } from "./_tsmodules.mjs";

delete process.env.ANTHROPIC_API_KEY;

const { load } = compileLib(
  ["src/lib/read.ts", "src/lib/seller.ts", "src/lib/signals.ts", "src/lib/types.ts", "src/lib/contacts.ts", "src/lib/fetchoutcome.ts"],
  "sf-flow-",
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

const WORDS = "<p>" + "Family plumbing in Tampa since 1987. We fix leaks, water heaters and drains. ".repeat(12) + "</p>";
const page = (body) => `<html><head><title>x</title></head><body>${body}</body></html>`;
const SHELL = `<html><head>${'<script src="/a.js"></script>'.repeat(4)}</head><body><div id="root"></div></body></html>`;
const tlsError = (code) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

const seen = [];
const html = (u, body, status = 200) => {
  const r = new Response(body, { status, headers: { "content-type": "text/html" } });
  Object.defineProperty(r, "url", { value: u });
  return r;
};
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input) => {
  const u = String(input);
  seen.push(u);
  if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
  if (u.startsWith("https://dns.google/resolve")) {
    const name = new URL(u).searchParams.get("name");
    if (name === "gone.test") return json({ Status: 3 });
    if (name === "nowhere.test") return json({ Status: 0, Answer: [] });
    if (name === "flaky.test") return json({ Status: 0, Answer: [{ type: 1 }] });
    throw new Error("unexpected dns lookup " + name);
  }
  const host = new URL(u).host;
  if (host === "expired.test") {
    if (u.startsWith("https:")) throw tlsError("CERT_HAS_EXPIRED");
    return html(u, page(WORDS));
  }
  if (host === "allbad.test") {
    if (u.startsWith("https:")) throw tlsError("ERR_TLS_CERT_ALTNAME_INVALID");
    throw tlsError("ECONNREFUSED");
  }
  if (host === "gone.test" || host === "nowhere.test" || host === "flaky.test") throw tlsError("ENOTFOUND");
  if (host === "shell.test") return html(u, SHELL);
  if (host === "fine.test") return html(u, page(WORDS));
  throw new Error("unexpected fetch " + u);
};

const crit = { id: "x", text: "has no online booking", type: "absence", explain: "" };
const read = (u) => R.readSite(u, crit, { name: "Acme" });

/* ----------------------------------------------- broken certificates -- */
{
  const r = await read("https://expired.test/");
  check("an expired certificate is read over plain http", r.result.outcome === "ok" && r.pagesFetched[0] === "http://expired.test/", r.result.outcome);
  check("and the certificate failure is kept, though the read succeeded", r.result.health?.tls === "CERT_HAS_EXPIRED");
  check("and nothing claims it loaded securely", !r.result.health?.httpsOk);
}
{
  const r = await read("https://allbad.test/");
  check("a certificate failure with nothing over http is an http error, not dead", r.result.outcome === "http_error", r.result.outcome);
  check("and still records the certificate failure", r.result.health?.tls === "ERR_TLS_CERT_ALTNAME_INVALID");
}

/* ------------------------------------------------- dead needs DNS -- */
{
  const r = await read("https://gone.test/");
  check("a name public DNS says does not exist is dead", r.result.outcome === "dead" && r.result.health?.dns === "nxdomain", JSON.stringify(r.result));
}
{
  const r = await read("https://nowhere.test/");
  check("a name that points nowhere is dead", r.result.outcome === "dead" && r.result.health?.dns === "no_address");
}
{
  const r = await read("https://flaky.test/");
  check("a name public DNS resolves is our failure, never theirs", r.result.outcome === "probe_error" && !r.result.health?.dns, JSON.stringify(r.result));
}

/* ------------------------------------------------------ script shells -- */
R.setRenderer(null);
{
  const r = await read("https://shell.test/");
  check("without a renderer, an empty shell is js_shell", r.result.outcome === "js_shell");
}
{
  const calls = [];
  R.setRenderer(async (u, ua) => {
    calls.push([u, ua]);
    return page(WORDS);
  });
  const r = await read("https://shell.test/");
  check("with one, the shell is rendered and read", r.result.outcome === "ok" && r.result.health?.rendered === true, r.result.outcome);
  check("rendered with our own user agent, not a browser's", calls.length > 0 && /SmallFishBot/.test(calls[0][1]));
  R.setRenderer(null);
}
{
  R.setRenderer(async () => null);
  const r = await read("https://shell.test/");
  check("a renderer that fails leaves it js_shell, not a guess", r.result.outcome === "js_shell");
  R.setRenderer(null);
}
{
  let called = false;
  R.setRenderer(async () => {
    called = true;
    return page(WORDS);
  });
  await read("https://fine.test/");
  check("a page with words on it is never sent to the browser", !called);
  R.setRenderer(null);
}

/* ----------------------------------------------------------- healthy -- */
{
  const r = await read("https://fine.test/");
  check("a page loaded over https records that its certificate passed", r.result.outcome === "ok" && r.result.health?.httpsOk === true);
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
