/**
 * What a failed or empty fetch **means**, and what to try next. Pure, so
 * `stage0/tests/test_fetchoutcome.mjs` can hold it.
 *
 * ## Why this exists — measured 2026-11-01, and a retraction
 *
 * The plan said the fix for zero-page reads was "plain fetch, then headless".
 * The production rows say otherwise. Of 72 reads, 22 returned zero pages, and:
 *
 *   - **14 were one national chain** (24hourfitness.com), read up to ten times
 *     in one twelve-site job. That is a work-list problem, fixed in
 *     `worklist.ts`, not a fetch problem.
 *   - **3 were the site refusing us** (403). A browser must not be used to get
 *     round a refusal; CLAUDE.md, "crawl politely and identify honestly".
 *   - **The other 5, re-fetched by hand:** a Google `business.site` page (404,
 *     the product was shut down in 2024), a domain that no longer resolves, an
 *     "Under Construction" page answering 503, a Wix page that answers fine
 *     now, and a DNS hiccup on our side.
 *
 * A headless browser recovers **none** of those five. A retry recovers two,
 * and a correct label tells the customer the truth about the other three. So
 * headless is not built. It would also run Chromium inside Vercel functions on
 * a Hobby team whose CPU allowance is already the binding constraint (STATUS,
 * 2026-10-24). If `js_shell` ever becomes a large share of real reads, that is
 * the measurement that would justify it, and this module is where it shows up.
 *
 * ## The vocabulary
 *
 * The outcomes are the ones `unsure.ts` already explains to a customer and the
 * Python probe (`site_probe.py`) already measures: `blocked`, `robots_blocked`,
 * `dead`, `timeout`, `http_error`, `js_shell`, `thin`, `social_only`,
 * `probe_error`, `ok`. The live reader used to emit `fetch_failed` and
 * `our_timeout` instead, which matched no group, so every failure — a dead
 * domain and our own timeout alike — was told to the customer as "we read
 * their site but not enough of it to be sure". That blamed them for our
 * network, and was false about theirs.
 */

/** Statuses that mean a server answered and turned us away. Same set as
 *  `site_probe.py`, so the two readers count the same thing. */
export const BLOCKED_STATUSES = new Set([401, 402, 403, 405, 406, 409, 418, 429, 451]);

/** Below this much visible text, with scripts on the page, the HTML is a shell
 *  a browser fills in. `site_probe.py`'s `SHELL_TEXT_CHARS`. */
export const SHELL_TEXT_CHARS = 250;
/** Below this, there is a page but not enough on it to settle anything.
 *  `site_probe.py`'s `THIN_TEXT_CHARS`. */
export const THIN_TEXT_CHARS = 400;

export type FetchFailure =
  | { kind: "status"; status: number }
  | { kind: "not_html" }
  | { kind: "error"; code: string; message: string };

/**
 * Turn whatever `fetch` threw, or the status it returned, into a failure we
 * can reason about. Node's fetch hides the useful part in `err.cause.code`.
 */
export function failureOf(err: unknown): FetchFailure {
  if (err && typeof err === "object" && "failure" in err) {
    return (err as { failure: FetchFailure }).failure;
  }
  const e = err as { name?: string; message?: string; cause?: { code?: string; name?: string } } | null;
  const code = String(e?.cause?.code ?? e?.cause?.name ?? e?.name ?? "");
  const message = String(e?.message ?? err ?? "");
  return { kind: "error", code, message };
}

/** Our resolver could not find the name. **Not yet a fact about them**: it is
 *  confirmed against public DNS (`publicDns`) before anything is called dead.
 *  Measured by the GTM stream, 2026-11-01: 25 of 50 "fetch_failed" agency
 *  domains really do not exist, and 8–14% of listed sites in customer trades. */
const UNRESOLVED = /^(ENOTFOUND|ERR_NAME_NOT_RESOLVED)$/;
/** Network failures that are as likely ours as theirs: a resolver hiccup, a
 *  dropped connection, our proxy. These are retried and never blamed on them. */
const OUR_CODES = /^(EAI_AGAIN|ECONNRESET|EPIPE|UND_ERR_SOCKET|UND_ERR_CLOSED|ECONNABORTED)$/;
const TIMEOUT = /timeout|abort/i;
/** The host answers and refuses the connection: their server, not ours. */
const REFUSED = /^(ECONNREFUSED|EHOSTUNREACH|ENETUNREACH)$/;
/** Their certificate is expired, mismatched or self-signed. GTM measured 7 of
 *  50 failures like this; the same site usually answers over plain http. */
const TLS_CODES = /^(CERT_|ERR_TLS|ERR_SSL|DEPTH_ZERO|UNABLE_TO|SELF_SIGNED|HOSTNAME_MISMATCH)/;

export const isTls = (f: FetchFailure): boolean =>
  f.kind === "error" && (TLS_CODES.test(f.code) || /certificate|\bssl\b|\btls\b/i.test(f.message));

export const isUnresolved = (f: FetchFailure): boolean => f.kind === "error" && UNRESOLVED.test(f.code);

/**
 * The outcome a failure is recorded as.
 *
 * `dns` is what public DNS said about the host, and matters only for a name
 * our resolver could not find: `"nxdomain"` or `"no_address"` make it dead;
 * anything else — it resolves publicly, or we could not ask — is ours.
 *
 * A 404 is `http_error`, not `dead`, as in `site_probe.py`: the host is there
 * and a page is not. `dead` is kept for "the address leads nowhere", which is
 * what `unsure.ts` tells the customer it means.
 */
export function classify(f: FetchFailure, dns: PublicDns = null): string {
  if (f.kind === "status") return BLOCKED_STATUSES.has(f.status) ? "blocked" : "http_error";
  if (f.kind === "not_html") return "http_error";
  if (isUnresolved(f)) return dns === "nxdomain" || dns === "no_address" ? "dead" : "probe_error";
  if (TIMEOUT.test(f.code) || TIMEOUT.test(f.message)) return "timeout";
  if (OUR_CODES.test(f.code)) return "probe_error";
  if (isTls(f) || REFUSED.test(f.code)) return "http_error";
  // Unknown is ours. Saying "their site is broken" about something we cannot
  // name is the expensive direction to be wrong in.
  return "probe_error";
}

/**
 * Worth one more try, after the politeness delay?
 *
 * Only what can plausibly answer differently a moment later: our own network,
 * a timeout, a 5xx. Never a refusal — asking again after a 403 or a robots
 * "no" is exactly the behaviour a polite crawler does not have.
 */
export function retryable(f: FetchFailure): boolean {
  if (f.kind === "status") return f.status >= 500 && f.status <= 504;
  if (f.kind === "not_html") return false;
  // Asking the same question twice does not change a certificate or create a
  // domain: those go to `plainHttpOf` and `publicDns` instead.
  if (isTls(f) || isUnresolved(f)) return false;
  const o = classify(f);
  return o === "timeout" || o === "probe_error";
}

/**
 * The site's own front door, when the listing points somewhere deeper.
 *
 * Listings carry deep links — `24hourfitness.com/FindClubDetail.mvc?clubid=…`,
 * tracking parameters, retired location pages — and when that one URL fails
 * the read used to end there, with the home page never tried. Returns null
 * when the URL already is the root, so a dead home page is not fetched twice.
 */
export function rootOf(url: URL): URL | null {
  const deep = (url.pathname !== "/" && url.pathname !== "") || url.search !== "";
  return deep ? new URL(`${url.protocol}//${url.host}/`) : null;
}

/** Falling back to the root is for a URL that did not work, not for one that
 *  refused us: a 403 on a deep page is the site saying no, not a broken link. */
export function tryRootAfter(f: FetchFailure): boolean {
  // Not after a certificate failure: the home page carries the same certificate.
  return classify(f) === "http_error" && !isTls(f);
}

/** The same address over plain http, for a site whose certificate failed. */
export function plainHttpOf(url: URL): URL | null {
  return url.protocol === "https:" ? new URL(`http://${url.host}${url.pathname}${url.search}`) : null;
}

/* ----------------------------------------------------- public DNS check -- */

/** `"nxdomain"`: the name does not exist. `"no_address"`: it exists and points
 *  at nothing. `"resolves"`: public DNS finds it, so our resolver was wrong.
 *  `null`: we could not ask — never evidence either way. */
export type PublicDns = "nxdomain" | "no_address" | "resolves" | null;

/**
 * Ask Google's public resolver about a host our own resolver could not find,
 * so our resolver's bad day is never recorded as their dead website. Same
 * check the GTM stream measured with (`dns.google/resolve`).
 */
export async function publicDns(host: string, fetcher: typeof fetch = fetch): Promise<PublicDns> {
  try {
    const r = await fetcher(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { Status?: number; Answer?: Array<{ type: number }> };
    if (j.Status === 3) return "nxdomain";
    if (j.Status !== 0) return null; // SERVFAIL and friends: their DNS is broken, or ours is; not proof
    // A (1), CNAME (5) or AAAA (28) is somewhere to go.
    return (j.Answer ?? []).some((a) => a.type === 1 || a.type === 5 || a.type === 28) ? "resolves" : "no_address";
  } catch {
    return null;
  }
}

/**
 * The home page came back, but is there anything on it to read?
 *
 * A shell or a near-empty page goes to the model as a couple of hundred
 * characters of navigation and comes back "couldn't tell" — a paid model call
 * that cannot answer. Labelled here, it costs nothing and says why.
 */
export function emptiness(textChars: number, scriptCount: number): "js_shell" | "thin" | null {
  if (textChars < SHELL_TEXT_CHARS && scriptCount >= 3) return "js_shell";
  if (textChars < THIN_TEXT_CHARS) return "thin";
  return null;
}
