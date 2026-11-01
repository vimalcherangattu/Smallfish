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
check("a business.site page that answers 404 is dead", F.classify(status(404)) === "dead");
check("a domain that no longer resolves is dead", F.classify(F.failureOf(thrown("ENOTFOUND"))) === "dead");
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
  "a refused connection or a broken certificate is theirs",
  F.classify(net("ECONNREFUSED")) === "dead" && F.classify(net("CERT_HAS_EXPIRED")) === "dead",
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
  "the root is tried after a dead or broken page, not after a timeout",
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
