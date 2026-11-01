/**
 * Why a home page did not come back, and what to try next. Pure, so
 * `stage0/tests/test_fetchoutcome.mjs` holds it.
 *
 * ## What this replaced, and why it mattered
 *
 * `readSite` used to file almost every failure as `fetch_failed`, because
 * Node's fetch throws `TypeError: fetch failed` and puts the reason in
 * `err.cause.code`, which nobody read. Measured 2026-11-01 on 50 agency
 * sites filed that way, checked against Google's public DNS:
 *
 *   - **25 of 50 domains do not exist** (19 NXDOMAIN, 6 with no address).
 *     No fetcher, plain or headless, recovers a site that is not there.
 *   - 7 had broken certificates, 9 answered 404 or 5xx, 2 were empty
 *     script shells, 2 timed out, the rest were transient.
 *
 * And on 100 HVAC Tampa listings with the plain fetch: 64 read, 10 empty
 * script shells, 5 dead, 4 timeouts, 6 4xx/5xx, 3 blocked, 2 broken
 * certificates. So the levers are, in order: say "dead" when it is dead,
 * retry the cases that a second, different request fixes, and render the
 * shells. That is this file's decision table.
 *
 * The outcome names are the ones `unsure.ts` already explains to a customer:
 * `dead`, `timeout`, `http_error`, `js_shell`, `blocked`, and `probe_error`
 * for ours. A failure that could be our network never becomes a fact about
 * the business: DNS failures are confirmed against public DNS before being
 * called `dead`, and a temporary resolver error is `probe_error`.
 */

export type FailKind = "blocked" | "dns" | "tls" | "timeout" | "http_4xx" | "http_5xx" | "not_html" | "refused" | "ours";

/** An HTTP answer we refused, carried as data rather than a string to parse. */
export class HttpStatus extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`);
  }
}

export class NotHtml extends Error {
  constructor() {
    super("not_html");
  }
}

const TLS = /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_SSL/i;

/** Classify one failed request. */
export function failKind(err: unknown): FailKind {
  if (err instanceof HttpStatus) {
    if ([401, 403, 429].includes(err.status)) return "blocked";
    return err.status >= 500 ? "http_5xx" : "http_4xx";
  }
  if (err instanceof NotHtml) return "not_html";
  const e = err as { name?: string; message?: string; cause?: { code?: string; name?: string; message?: string } };
  const code = e?.cause?.code ?? "";
  const msg = `${e?.name ?? ""} ${e?.message ?? ""} ${e?.cause?.name ?? ""} ${e?.cause?.message ?? ""}`;
  if (code === "ENOTFOUND") return "dns";
  // EAI_AGAIN is the resolver saying "try later": that is ours, not theirs.
  if (code === "EAI_AGAIN") return "ours";
  if (TLS.test(code) || TLS.test(msg)) return "tls";
  if (/Timeout|Abort/i.test(msg) || /TIMEOUT/.test(code)) return "timeout";
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || /redirect/i.test(msg)) return "refused";
  return "ours";
}

/** What to try after a failure, given what was asked. `null` means stop. */
export function nextTry(kind: FailKind, url: URL, tried: Set<string>): { url: string; slow?: boolean } | null {
  const root = `${url.origin}/`;
  const plain = url.protocol === "https:" ? `http://${url.host}${url.pathname}${url.search}` : null;
  const pick = (u: string | null, slow = false) => (u && !tried.has(u) ? { url: u, slow } : null);
  switch (kind) {
    // A listing often points at a deep page that has since moved. The
    // business's own home page is what we read anyway.
    case "http_4xx":
    case "not_html":
      return pick(url.pathname !== "/" || url.search ? root : null);
    // A lapsed or mismatched certificate on a small business's site is
    // common, and the same site usually answers over plain http.
    case "tls":
      return pick(plain);
    case "timeout":
      return pick(url.toString(), true);
    case "http_5xx":
    case "refused":
      return pick(url.pathname !== "/" ? root : null);
    default:
      return null;
  }
}

/** The outcome a customer sees, once the retries are spent. `dnsDead` is the
 *  answer from public DNS: true only for a confirmed NXDOMAIN or no address. */
export function outcomeFor(kind: FailKind, dnsDead: boolean | null): string {
  switch (kind) {
    case "blocked":
      return "blocked";
    case "dns":
      return dnsDead ? "dead" : "probe_error";
    case "timeout":
      return "timeout";
    case "tls":
    case "http_4xx":
    case "http_5xx":
    case "not_html":
    case "refused":
      return "http_error";
    default:
      return "probe_error";
  }
}

/** Words on a page once markup is gone. Below `SHELL_CHARS` and the page is a
 *  frame that a browser fills in, not a page we can read. */
export const SHELL_CHARS = 300;

export const visibleChars = (html: string): number =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;

/** Confirm a DNS failure against public DNS, so our resolver's bad day is
 *  never recorded as their dead website. `null` means we could not tell. */
export async function publicDnsSaysDead(host: string, fetcher: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const r = await fetcher(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { Status?: number; Answer?: Array<{ type: number }> };
    if (j.Status === 3) return true;
    if (j.Status === 0) return !(j.Answer ?? []).some((a) => a.type === 1 || a.type === 5 || a.type === 28);
    return null;
  } catch {
    return null;
  }
}
