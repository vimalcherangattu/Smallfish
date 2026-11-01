/**
 * Why a home page did not come back, and what the reader tries next.
 * The property: a site is only called dead when public DNS says so, our own
 * failures never become facts about the business, and every retry is a
 * different request from the one that failed.
 *
 *     node stage0/tests/test_fetchoutcome.mjs
 */
import assert from "node:assert/strict";
import { compileLib } from "./_tsmodules.mjs";

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  pass  ${name}`); }
  catch (e) { failures += 1; console.log(`  FAIL  ${name}: ${e.message}`); }
};
const { load } = compileLib(["src/lib/fetchoutcome.ts"], "sf-fetchoutcome-");
const F = await load("fetchoutcome");
const nodeErr = (code, message = "") => Object.assign(new TypeError("fetch failed"), { cause: { code, message } });

await test("Node's fetch reasons are read from err.cause, not the message", () => {
  assert.equal(F.failKind(nodeErr("ENOTFOUND")), "dns");
  assert.equal(F.failKind(nodeErr("CERT_HAS_EXPIRED")), "tls");
  assert.equal(F.failKind(nodeErr("ERR_TLS_CERT_ALTNAME_INVALID")), "tls");
  assert.equal(F.failKind(nodeErr("DEPTH_ZERO_SELF_SIGNED_CERT")), "tls");
  assert.equal(F.failKind(nodeErr("UND_ERR_CONNECT_TIMEOUT")), "timeout");
  assert.equal(F.failKind(Object.assign(new Error("x"), { name: "TimeoutError" })), "timeout");
  assert.equal(F.failKind(nodeErr("ECONNREFUSED")), "refused");
});
await test("a resolver that says 'try later' is ours, never theirs", () => {
  assert.equal(F.failKind(nodeErr("EAI_AGAIN")), "ours");
  assert.equal(F.outcomeFor("ours", null), "probe_error");
  assert.equal(F.failKind(new Error("something we have never seen")), "ours");
});
await test("dead only when public DNS confirms it", () => {
  assert.equal(F.outcomeFor("dns", true), "dead");
  assert.equal(F.outcomeFor("dns", false), "probe_error");
  assert.equal(F.outcomeFor("dns", null), "probe_error");
});
await test("401, 403 and 429 are a refusal and are not retried", () => {
  for (const s of [401, 403, 429]) {
    const k = F.failKind(new F.HttpStatus(s));
    assert.equal(k, "blocked");
    assert.equal(F.nextTry(k, new URL("https://a.com/x"), new Set()), null);
  }
});
await test("a moved deep link retries the home page, once", () => {
  const u = new URL("https://a.com/locations/tampa");
  const t = F.nextTry("http_4xx", u, new Set([u.toString()]));
  assert.equal(t.url, "https://a.com/");
  assert.equal(F.nextTry("http_4xx", new URL("https://a.com/"), new Set(["https://a.com/"])), null);
});
await test("a broken certificate retries over plain http, and plain http does not loop", () => {
  assert.equal(F.nextTry("tls", new URL("https://a.com/"), new Set()).url, "http://a.com/");
  assert.equal(F.nextTry("tls", new URL("http://a.com/"), new Set()), null);
});
await test("a timeout gets one slower try, never two", () => {
  const u = new URL("https://a.com/");
  const t = F.nextTry("timeout", u, new Set());
  assert.equal(t.slow, true);
  assert.equal(F.nextTry("timeout", u, new Set([u.toString()])), null);
});
await test("every retry differs from what was already tried", () => {
  const kinds = ["blocked", "dns", "tls", "timeout", "http_4xx", "http_5xx", "not_html", "refused", "ours"];
  for (const k of kinds) for (const s of ["https://a.com/", "https://a.com/x?y=1", "http://a.com/p"]) {
    const tried = new Set([s]);
    const t = F.nextTry(k, new URL(s), tried);
    if (t && !t.slow) assert.ok(!tried.has(t.url), `${k} ${s} retried itself`);
  }
});
await test("an empty frame is a shell; a page with words is not", () => {
  const shell = '<!DOCTYPE html><html><head><script>window.location.href="/lander"</script></head></html>';
  assert.ok(F.visibleChars(shell) < F.SHELL_CHARS);
  assert.ok(F.visibleChars(`<p>${"We fix air conditioners in Tampa. ".repeat(12)}</p>`) >= F.SHELL_CHARS);
});
await test("public DNS: NXDOMAIN is dead, an address is alive, an error is unknown", async () => {
  const fake = (body, ok = true) => async () => ({ ok, json: async () => body });
  assert.equal(await F.publicDnsSaysDead("x.com", fake({ Status: 3 })), true);
  assert.equal(await F.publicDnsSaysDead("x.com", fake({ Status: 0, Answer: [{ type: 1 }] })), false);
  assert.equal(await F.publicDnsSaysDead("x.com", fake({ Status: 0, Answer: [] })), true);
  assert.equal(await F.publicDnsSaysDead("x.com", fake({ Status: 2 })), null);
  assert.equal(await F.publicDnsSaysDead("x.com", fake({}, false)), null);
});

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall pass");
