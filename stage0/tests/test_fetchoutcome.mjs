/**
 * What a failed fetch means, and what the reader tries next.
 *
 * The cases are the five real failures re-fetched on 2026-11-01 (see the
 * module note in `src/lib/fetchoutcome.ts`), plus the properties that must hold
 * whatever the case: a refusal is never retried and never worked round, our
 * own network is never blamed on the business, and every outcome is one the
 * customer-facing `unsure.ts` can explain.
 */

import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(["src/lib/fetchoutcome.ts"], "sffo-");
const F = await load("fetchoutcome");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const status = (n) => ({ kind: "status", status: n });
const net = (code, message = "fetch failed") => ({ kind: "error", code, message });
/** What Node's fetch actually throws: a TypeError whose cause carries the code. */
const thrown = (code) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

/* --------------------------------------------- the five real failures -- */
// Corrected 2026-11-02: this file first asserted a 404 was "dead". The Python
// probe and the GTM stream's measurement both say otherwise — the host is
// there, a page is not — and `unsure.ts` tells the customer "dead" means the
// address leads nowhere.
check("a business.site page that answers 404 is an http error, not dead", F.classify(status(404)) === "http_error");

/* ------------------------------------- dead needs public DNS to say so -- */
const unresolved = F.failureOf(thrown("ENOTFOUND"));
check("a name our resolver cannot find is ours until public DNS agrees", F.classify(unresolved) === "probe_error");
check("public DNS NXDOMAIN makes it dead", F.classify(unresolved, "nxdomain") === "dead");
check("a name that exists and points nowhere is dead", F.classify(unresolved, "no_address") === "dead");
check("a name public DNS resolves was our resolver's fault", F.classify(unresolved, "resolves") === "probe_error");
check("and a lookup we could not make is evidence of nothing", F.classify(unresolved, null) === "probe_error");
check("asking our resolver again is not how this is settled", !F.retryable(unresolved));
{
  const fake = (status, body) => async () => ({ ok: status === 200, json: async () => body });
  const cases = [
    [fake(200, { Status: 3 }), "nxdomain", "Status 3 is NXDOMAIN"],
    [fake(200, { Status: 0, Answer: [{ type: 1 }] }), "resolves", "an A record resolves"],
    [fake(200, { Status: 0, Answer: [{ type: 5 }] }), "resolves", "a CNAME resolves"],
    [fake(200, { Status: 0, Answer: [] }), "no_address", "no address records is nowhere to go"],
    [fake(200, { Status: 2 }), null, "SERVFAIL proves nothing"],
    [fake(503, {}), null, "dns.google failing proves nothing"],
    [async () => { throw new Error("offline"); }, null, "no network proves nothing"],
  ];
  for (const [fetcher, want, name] of cases) {
    check(`publicDns: ${name}`, (await F.publicDns("example.invalid", fetcher)) === want);
  }
}

/* ----------------------------------------------- broken certificates -- */
const expired = F.failureOf(thrown("CERT_HAS_EXPIRED"));
check("an expired certificate is recognised as a TLS failure", F.isTls(expired) && F.isTls(F.failureOf(thrown("ERR_TLS_CERT_ALTNAME_INVALID"))));
check("and is not retried as-is: the same request gets the same certificate", !F.retryable(expired));
check("it is retried over plain http instead", F.plainHttpOf(new URL("https://acme.com/a?b=1"))?.toString() === "http://acme.com/a?b=1");
check("a plain http address has no plainer form", F.plainHttpOf(new URL("http://acme.com/")) === null);
check("nor does it send us to the home page, which carries the same certificate", !F.tryRootAfter(expired));
check("a site refusing the connection is an http error, not a dead domain", F.classify(net("ECONNREFUSED")) === "http_error");
check(
  "an Under Construction page answering 503 is an http error, and worth one retry",
  F.classify(status(503)) === "http_error" && F.retryable(status(503)),
);
check(
  "a DNS hiccup is ours, not theirs, and is retried",
  F.classify(F.failureOf(thrown("EAI_AGAIN"))) === "probe_error" && F.retryable(net("EAI_AGAIN")),
);
check(
  "a timeout is retried",
  F.retryable(F.failureOf(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }))),
);

/* ------------------------------------------------------- the refusals -- */
const refusals = [401, 403, 429, 451];
check(
  "every refusal is recorded as blocked",
  refusals.every((s) => F.classify(status(s)) === "blocked"),
);
check(
  "a refusal is never retried",
  refusals.every((s) => !F.retryable(status(s))),
  "asking again after a no is what a polite crawler does not do",
);
check(
  "and a refusal on a deep page never sends us round to the front door",
  refusals.every((s) => !F.tryRootAfter(status(s))),
);
check("a 4xx that is not a refusal is not retried", !F.retryable(status(404)) && !F.retryable(status(400)));

/* ------------------------------------------------ never blame them -- */
check(
  "a failure we cannot name is ours",
  F.classify(net("", "something odd")) === "probe_error" &&
    F.classify(F.failureOf(new Error("boom"))) === "probe_error",
  "calling their site broken on no evidence is the expensive direction",
);
check(
  "a connection reset is ours",
  F.classify(net("ECONNRESET")) === "probe_error",
);
check(
  "a refused connection or a broken certificate is theirs, and neither is called dead",
  F.classify(net("ECONNREFUSED")) === "http_error" && F.classify(net("CERT_HAS_EXPIRED")) === "http_error",
);

/* ------------------------------------------ the vocabulary is shared -- */
// Every outcome the classifier can produce must be one `unsure.ts` groups, or
// the customer is told the wrong reason. Read from the source so this cannot
// drift: the old reader's `fetch_failed` and `our_timeout` matched nothing.
{
  const { readFileSync } = await import("node:fs");
  const unsure = readFileSync("src/lib/unsure.ts", "utf8");
  const known = new Set([...unsure.matchAll(/outcomes:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]),
  ));
  const produced = new Set([
    ...[200, 301, 400, 401, 403, 404, 410, 429, 500, 503].map((s) => F.classify(status(s))),
    F.classify({ kind: "not_html" }),
    ...["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "CERT_HAS_EXPIRED", "", "UND_ERR_SOCKET"].map((c) =>
      F.classify(net(c)),
    ),
    F.classify(net("", "timeout")),
    F.classify(net("ENOTFOUND"), "nxdomain"),
    "robots_blocked",
    "js_shell",
    "thin",
  ]);
  const orphans = [...produced].filter((o) => !known.has(o));
  check("every outcome the reader records has an explanation in unsure.ts", orphans.length === 0, orphans.join(", "));
}

/* --------------------------------------------- falling back to root -- */
check(
  "a retired deep link falls back to the site's home page",
  F.rootOf(new URL("http://www.24hourfitness.com/FindClubDetail.mvc?clubid=00215"))?.toString() ===
    "http://www.24hourfitness.com/",
);
check("a tracking query counts as deep", F.rootOf(new URL("https://example.com/?utm_source=x")) !== null);
check(
  "the home page is not fetched twice",
  F.rootOf(new URL("https://example.com/")) === null && F.rootOf(new URL("https://example.com")) === null,
);
check(
  "the root is tried after a broken page, not after a timeout",
  F.tryRootAfter(status(404)) && F.tryRootAfter({ kind: "not_html" }) && !F.tryRootAfter(net("", "timeout")),
  "a timeout is retried in place; trying another page of a slow site is just slower",
);

/* -------------------------------------------------- empty pages -- */
check("a scripted page with no words is a shell", F.emptiness(40, 12) === "js_shell");
check("a short page without scripts is thin, not a shell", F.emptiness(40, 0) === "thin");
check("a page with words on it is neither", F.emptiness(5000, 30) === null);
check(
  "the thresholds are the Python probe's, so both readers count the same",
  F.SHELL_TEXT_CHARS === 250 && F.THIN_TEXT_CHARS === 400,
);

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
