/**
 * Read the seller's own site to learn what they sell (S1-22).
 *
 * The ICP flow exists because the research describes a buyer who cannot name
 * their vertical, geography and gap — and asking that buyer to type a precise
 * description of their own offer is asking them to do the thing they came here
 * unable to do. So they paste their URL and we read it.
 *
 * ## Why this is TypeScript and not the Python crawler
 *
 * `stage0/src/coverage/site_probe.py` and `engine/fetcher.py` implement the
 * crawling posture this project argues for: robots.txt, per-domain throttling,
 * an honest user agent, a cache. This does not reuse them, and the reason is a
 * real distinction rather than convenience.
 *
 * Crawling is fetching thousands of sites whose owners did not ask. **This is
 * fetching one site, once, because its owner pasted the URL and pressed a
 * button.** That is nearer to "open this link for me" than to crawling, and it
 * is why the throttle and the cache are absent: there is no fleet to be polite
 * across.
 *
 * What is *not* dropped is robots.txt. It costs one request and honouring it
 * even here is the difference between a principle and a convenience.
 *
 * ## Nothing is invented
 *
 * Every field comes back with the sentence it came from, and a field whose
 * quote cannot be found in the fetched text **is dropped**. This is
 * `verify_quote` from `engine/judge.py` applied to a different task, for the
 * same reason: a model that has read a plumber's site can produce a fluent,
 * plausible, entirely invented description of who they serve, and the customer
 * has no way to tell. A missing field says "the site does not say", which is
 * information. A guessed one is a lie that reads like a finding.
 */

const MODEL = process.env.SMALLFISH_MODEL_WORKER ?? "claude-sonnet-5";

/** How much of a site to read. Four pages is what the measured crawl averages
 *  (3.30 per readable site), and more would cost more for a diminishing view
 *  of a small business's site. */
export const MAX_PAGES = 4;
export const MAX_CHARS = 40_000;

/** One extracted fact, and the sentence that supports it. */
export type Grounded = {
  value: string;
  /** Verbatim from the page. Verified present before this is returned. */
  quote: string;
  /** Which page it came from. */
  source: string;
};

export type SellerProfile = {
  url: string;
  /** Pages actually read, in order. */
  pagesRead: string[];
  /** What they sell. Null when the site does not say plainly. */
  sells: Grounded | null;
  /** Who they sell it to — the vertical, if the site names one. */
  serves: Grounded | null;
  /** The problem in their own words. This is the most valuable field and the
   *  one most likely to be absent: most sites describe a service, not a pain. */
  problem: Grounded | null;
  /** Where they work. */
  geography: Grounded | null;
  /** Fields the model proposed and could not support with a real quote. Kept
   *  and shown, because "we could not confirm this" is the honest half. */
  dropped: Array<{ field: string; why: string }>;
  costUsd: number;
};

export type SellerResult =
  | { ok: true; profile: SellerProfile }
  | { ok: false; reason: string; stage: "url" | "robots" | "fetch" | "model" | "config" };

const env = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ??
  {};

/** A URL we are willing to fetch. Rejects anything that is not public http(s),
 *  because a URL box that will fetch `http://localhost` or `http://169.254.169.254`
 *  is a server-side request forgery hole with a text input in front of it. */
export function safeUrl(raw: string): URL | null {
  const trimmed = raw.trim();

  // A scheme that is present must be http(s). The first version prefixed
  // anything not starting with "http" with `https://`, which turned
  // `file:///etc/passwd` into `https://file:///etc/passwd` — a URL that parses,
  // whose protocol is then https, and which sailed past the protocol check
  // below. The prefix is a convenience for `example.com`, and it must not be
  // able to launder a scheme.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") return null;

  let u: URL;
  try {
    u = new URL(scheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    // Anything that parses as a bare IP: the metadata endpoints and the private
    // ranges all live there, and a small business site never does.
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":")
  ) {
    return null;
  }
  return u;
}

const UA =
  "SmallFishBot/0.1 (+https://www.getsmallfish.com/bot; reading a site at its " +
  "owner's request; contact: abuse@getsmallfish.com)";

/** Does robots.txt allow us? Fails **open** on a fetch error, and that is
 *  deliberate: a robots.txt we could not read is not a disallow, and treating
 *  it as one would refuse the owner access to their own site because their
 *  server hiccuped. */
export async function robotsAllows(u: URL): Promise<boolean> {
  try {
    const res = await fetch(new URL("/robots.txt", u).toString(), {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return true;
    const txt = await res.text();
    // Deliberately simple: only a blanket `User-agent: *` block with a
    // `Disallow: /` stops us. A site that disallows a subtree is not refusing
    // to be read by its own owner.
    const blocks = txt.split(/user-agent:/i).slice(1);
    return !blocks.some((b) => {
      const [agent, ...rest] = b.split("\n");
      if (agent.trim() !== "*") return false;
      return rest.some((line) => /^\s*disallow:\s*\/\s*$/i.test(line));
    });
  } catch {
    return true;
  }
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Internal links worth following: the pages that say what a business does. */
function pickLinks(html: string, base: URL): string[] {
  const wanted = /about|service|what-we|who-we|solution|product|pricing|industr/i;
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname !== base.hostname) continue;
      if (!wanted.test(u.pathname)) continue;
      const clean = `${u.origin}${u.pathname}`;
      if (clean !== `${base.origin}${base.pathname}` && !out.includes(clean)) out.push(clean);
    } catch {
      /* a malformed href is not worth a failure */
    }
    if (out.length >= MAX_PAGES - 1) break;
  }
  return out;
}

/** Normalised for quote checking: the model will not reproduce whitespace and
 *  punctuation exactly, and failing a true quote on a curly apostrophe would
 *  drop real findings. Same normalisation idea as `judge.py`. */
export const flat = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export async function readSeller(rawUrl: string): Promise<SellerResult> {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) {
    return {
      ok: false,
      stage: "config",
      reason:
        "Reading a site needs ANTHROPIC_API_KEY, which is not set on this " +
        "deployment. Describe what you sell instead — the rest of the flow " +
        "works on a typed description.",
    };
  }

  const url = safeUrl(rawUrl);
  if (!url) {
    return { ok: false, stage: "url", reason: "That does not look like a public website address." };
  }
  if (!(await robotsAllows(url))) {
    return {
      ok: false,
      stage: "robots",
      reason:
        `${url.hostname}'s robots.txt asks automated readers to stay out, and we ` +
        "honour that even when it is your own site. Describe what you sell instead.",
    };
  }

  // --- fetch -------------------------------------------------------------
  const pages: Array<{ url: string; text: string }> = [];
  try {
    const res = await fetch(url.toString(), {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        ok: false,
        stage: "fetch",
        reason: `${url.hostname} answered ${res.status}. We cannot read it, so we will not guess at it.`,
      };
    }
    const html = await res.text();
    pages.push({ url: url.toString(), text: textOf(html) });

    for (const link of pickLinks(html, url)) {
      try {
        const r = await fetch(link, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(12000),
        });
        if (r.ok) pages.push({ url: link, text: textOf(await r.text()) });
      } catch {
        /* one page failing is not the read failing */
      }
    }
  } catch (err) {
    return {
      ok: false,
      stage: "fetch",
      reason: `We could not reach ${url.hostname}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  const corpus = pages
    .map((p) => `### ${p.url}\n${p.text.slice(0, MAX_CHARS / pages.length)}`)
    .join("\n\n");

  if (flat(corpus).length < 200) {
    return {
      ok: false,
      stage: "fetch",
      reason:
        `There is almost no readable text on ${url.hostname} — it may be built ` +
        "entirely in images or script. Describe what you sell instead.",
    };
  }

  // --- extract -----------------------------------------------------------
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });

  const prompt = `Below is the text of a business's own website.

Extract only what the site actually says. For each field give the value and a
VERBATIM quote from the text above that supports it. If the site does not say,
return null for that field — do not infer, and do not generalise from the
industry. A missing field is a useful answer; a guessed one is not.

Fields:
- sells: what this business sells or does
- serves: the kind of customer or industry they sell to, if named
- problem: the customer problem they describe, in the site's own words
- geography: the area they serve, if stated

Return JSON only:
{"sells":{"value":"...","quote":"..."}|null,
 "serves":{...}|null,"problem":{...}|null,"geography":{...}|null}

WEBSITE TEXT:
${corpus.slice(0, MAX_CHARS)}`;

  let raw = "";
  let costUsd = 0;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    raw = msg.content.map((c) => ("text" in c ? c.text : "")).join("");
    // Sonnet 5 list pricing, per million tokens. Reported rather than hidden,
    // because this product tells customers what things cost.
    costUsd =
      (msg.usage.input_tokens / 1e6) * 3 + (msg.usage.output_tokens / 1e6) * 15;
  } catch (err) {
    return {
      ok: false,
      stage: "model",
      reason: `We read ${url.hostname} but could not interpret it: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  let parsed: Record<string, { value?: string; quote?: string } | null>;
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  } catch {
    return { ok: false, stage: "model", reason: "The extraction came back unreadable." };
  }

  // --- verify every quote ------------------------------------------------
  const haystack = flat(corpus);
  const dropped: Array<{ field: string; why: string }> = [];
  const grounded = (field: string): Grounded | null => {
    const got = parsed[field];
    if (!got || !got.value || !got.quote) return null;
    if (!haystack.includes(flat(got.quote))) {
      // The whole point. A fluent, plausible sentence that is not on the page
      // is exactly what this check exists to catch.
      dropped.push({
        field,
        why: `Proposed "${got.value}" but the supporting sentence is not on the site.`,
      });
      return null;
    }
    const source =
      pages.find((p) => flat(p.text).includes(flat(got.quote!)))?.url ?? pages[0].url;
    return { value: got.value, quote: got.quote, source };
  };

  return {
    ok: true,
    profile: {
      url: url.toString(),
      pagesRead: pages.map((p) => p.url),
      sells: grounded("sells"),
      serves: grounded("serves"),
      problem: grounded("problem"),
      geography: grounded("geography"),
      dropped,
      costUsd,
    },
  };
}

/** Turn a profile into the free-text description the existing ICP inference
 *  already consumes, so S1-22 upgrades the *input* and changes nothing
 *  downstream — which is exactly what the plan said it would do. */
export function profileToDescription(p: SellerProfile): string {
  return [p.sells?.value, p.problem?.value, p.serves?.value, p.geography?.value]
    .filter(Boolean)
    .join(". ");
}
