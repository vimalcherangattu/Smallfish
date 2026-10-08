import "server-only";

import { flat, MAX_PAGES, robotsAllows, safeUrl } from "@/lib/seller";
import { signalForCriterion } from "@/lib/signals";
import { contactsFrom } from "@/lib/contacts";
import type { Criterion, ReadResult, Verdict, VerdictKind } from "@/lib/types";

/**
 * Read one business's website and settle one question about it.
 *
 * ## Why this exists in TypeScript
 *
 * The reading pipeline was Python under `stage0/`, which is why "any trade, any
 * US city" has never been live: the Next.js app cannot run it. `seller.ts`
 * already proved the whole shape works here — polite fetch, model judgment,
 * quoted proof validated against the page — for reading a *seller's* own site.
 * This is the same machinery pointed at a prospect, which is the half that
 * turns a queued job into a list.
 *
 * ## The rules it inherits, and does not get to reinterpret
 *
 *   - **robots.txt is honoured**, the crawler identifies itself, and there is a
 *     delay between two requests to one host. `seller.ts` owns the first two.
 *   - **Absence needs positive proof.** A "no X" verdict requires that pages
 *     where X would live were actually read and nothing was found. If the fetch
 *     failed, or nothing relevant was reachable, the answer is `couldnt_tell` —
 *     never `no_match`. This is enforced below rather than trusted to a prompt.
 *   - **A quote that is not on the page is not a quote.** The model returns the
 *     sentence it relied on and it is checked against the text actually
 *     fetched. A proof that fails that check downgrades the verdict.
 *   - **Our failures are ours.** A timeout, a DNS error or a proxy problem is
 *     recorded as our outcome, not as something true about the business.
 */

const MODEL = process.env.SMALLFISH_MODEL_WORKER ?? "claude-sonnet-5";
const UA =
  "SmallFishBot/0.1 (+https://www.getsmallfish.com/bot; business listing verification)";
const PAGE_TIMEOUT_MS = 12_000;
/** Seconds between two requests to the same host, matching the Python probe. */
export const PER_DOMAIN_DELAY_MS = 1500;

const lastHit = new Map<string, number>();

/** Wait out this host's share of the politeness delay. */
async function throttle(host: string) {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + PER_DOMAIN_DELAY_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

/**
 * Links on one page, absolute where they can be made so.
 *
 * `contactsFrom` wants `mailto:` and the socials, and those are the two kinds
 * a relative-URL resolver would mangle, so they pass through as written.
 */
function linksOf(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!href) continue;
    if (/^(mailto:|tel:)/i.test(href)) {
      out.push(href);
      continue;
    }
    try {
      out.push(new URL(href, base).toString());
    } catch {
      /* a malformed href is not worth failing a read over */
    }
  }
  return [...new Set(out)];
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

/**
 * The pages where the answer is likely to live, chosen by what is being asked.
 *
 * A booking question is settled on a "book"/"appointment" page; a quote
 * question on "quote"/"estimate". Following the same four links for every
 * criterion is how an absence verdict becomes a guess — the pages that would
 * have carried the evidence were never opened.
 */
function pagesFor(html: string, base: URL, criterion: Criterion): string[] {
  const signal = signalForCriterion(criterion.text);
  const byId: Record<string, RegExp> = {
    booking: /book|appointment|schedul|reserv|new-?patient/i,
    quote_form: /quote|estimate|request|pricing|contact/i,
    contact_form: /contact|get-?in-?touch|enquir|inquir/i,
    chat: /contact|support|help/i,
    reviews: /review|testimonial/i,
  };
  const wanted = (signal && byId[signal.id]) ?? /about|service|contact|book|quote/i;

  // Match the link's **text** as well as its path. Pointed at a real site the
  // path-only version found nothing on simplydentistry.com — its nav is
  // /new-patients and /our-office — so one page was read and the absence rule
  // then correctly refused to settle. Reading the anchor text finds the pages a
  // person would click, which is the whole point of "we read it the way you
  // would".
  const out: string[] = [];
  const anchors = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi);
  const seen = new Set<string>();
  const consider = (href: string, label: string) => {
    try {
      const u = new URL(href, base);
      if (u.hostname !== base.hostname) return;
      const text = label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!wanted.test(u.pathname) && !wanted.test(text)) return;
      const clean = `${u.origin}${u.pathname}`;
      if (clean === `${base.origin}${base.pathname}` || seen.has(clean)) return;
      seen.add(clean);
      out.push(clean);
    } catch {
      /* a malformed href is not worth failing a read over */
    }
  };
  for (const m of anchors) {
    consider(m[1], m[2] ?? "");
    if (out.length >= MAX_PAGES - 1) break;
  }
  // A site whose nav is built by script leaves no anchors to read. Falling back
  // to the bare hrefs keeps those readable rather than unsettleable.
  if (!out.length) {
    for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
      consider(m[1], "");
      if (out.length >= MAX_PAGES - 1) break;
    }
  }
  return out;
}

/** Cheap technology detection, the same optimisation the Python side makes: a
 *  catalogued vendor script settles a presence question without a model call.
 *  It is never a precondition — a site with no detectable vendor still gets
 *  read and judged. */
function detect(html: string) {
  const vendors: string[] = [];
  const v: Record<string, RegExp> = {
    calendly: /calendly\.com/i,
    acuity: /acuityscheduling|squarespace-scheduling/i,
    nexhealth: /nexhealth/i,
    zocdoc: /zocdoc/i,
    localmed: /localmed/i,
    setmore: /setmore/i,
    square: /squareup\.com\/appointments/i,
    mindbody: /mindbodyonline/i,
    vagaro: /vagaro\.com/i,
    housecallpro: /housecallpro/i,
    servicetitan: /servicetitan/i,
    jobber: /getjobber|jobber\.com/i,
  };
  for (const [name, re] of Object.entries(v)) if (re.test(html)) vendors.push(name);

  const cms: string[] = [];
  if (/wp-content|wp-includes/i.test(html)) cms.push("wordpress");
  if (/squarespace/i.test(html)) cms.push("squarespace");
  if (/wix\.com|wixstatic/i.test(html)) cms.push("wix");
  if (/shopify/i.test(html)) cms.push("shopify");
  if (/webflow/i.test(html)) cms.push("webflow");
  if (/godaddy|starfield/i.test(html)) cms.push("godaddy_website_builder");

  // Only a **vendor script** counts as booking detected.
  //
  // The first version also matched the words "book now" / "schedule online"
  // anywhere in the HTML, and the very first real site it was pointed at —
  // simplydentistry.com — came back `booking: true` and was judged `no_match`.
  // The measured dataset has it as a match. The page says "book your
  // appointment by calling", which is a phone instruction, and the regex read
  // it as a booking widget.
  //
  // That is the expensive direction to be wrong in. `CLAUDE.md`: a false
  // positive costs a missed match, a false negative costs a false match — and
  // here the false positive silently deleted a real lead from somebody's list.
  // Text near the word "book" is not a booking system; a script from a booking
  // vendor is. Everything else goes to the model, which reads the sentence
  // rather than matching it.
  return {
    vendors,
    cms,
    booking: vendors.length > 0,
    quote: /action=["'][^"']*(quote|estimate)|id=["'][^"']*(quote|estimate)-?form/i.test(html),
    chat: /intercom|drift\.com|tawk\.to|livechat|crisp\.chat|tidio/i.test(html),
  };
}

export interface SiteRead {
  result: ReadResult;
  /** The text we actually fetched, for the quote check. Never persisted — we
   *  store extracted facts, not page copies. */
  text: string;
  pagesFetched: string[];
  /**
   * How well we covered the places this criterion would show up, which is what
   * an **absence** verdict is proved with. See `judge`.
   *
   * `targeted` is how many criterion-relevant routes the home page linked to;
   * `reached` is how many of those we actually got. A site that links none is
   * not badly covered — the home page is the whole site, and that is complete.
   */
  coverage: { targeted: number; reached: number };
}

/** Fetch what is needed to answer `criterion` about this site. */
export async function readSite(
  rawUrl: string,
  criterion: Criterion,
  /**
   * What the listing says about this business, for attribution and for the
   * phone check. Optional, because a CSV upload may carry only a website, and
   * `contactsFrom` degrades honestly: with no name it attributes nothing and
   * withholds, which is the safe direction.
   */
  business?: { name?: string | null; addr?: string | null; phone?: string | null },
): Promise<SiteRead> {
  const empty = (outcome: string): SiteRead => ({
    result: { outcome, pages: 0, chars: 0, booking: false, vendors: [], quote: false, chat: false, cms: [] },
    text: "",
    pagesFetched: [],
    coverage: { targeted: 0, reached: 0 },
  });

  const url = safeUrl(rawUrl);
  if (!url) return empty("bad_url");
  if (!(await robotsAllows(url))) return empty("robots_disallow");

  const get = async (u: string) => {
    await throttle(new URL(u).hostname);
    const res = await fetch(u, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(String(res.status));
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) throw new Error("not_html");
    return await res.text();
  };

  let first: string;
  try {
    first = await get(url.toString());
  } catch (err) {
    // Distinguish *their* refusal from *our* failure. A 403 is the site
    // blocking us; a timeout is as likely to be our network, and the coverage
    // report's rule is that our failures never count against a business.
    const msg = String(err);
    const outcome = /40[13]|429/.test(msg)
      ? "blocked"
      : /timeout|abort/i.test(msg)
        ? "our_timeout"
        : "fetch_failed";
    return empty(outcome);
  }

  const htmls = [first];
  const fetched = [url.toString()];
  const targets = pagesFor(first, url, criterion);
  let reached = 0;
  for (const link of targets) {
    try {
      htmls.push(await get(link));
      fetched.push(link);
      reached += 1;
    } catch {
      /* one unreachable sub-page does not fail the read */
    }
  }

  const all = htmls.join("\n");
  const d = detect(all);
  const perPage = htmls.map((h, i) => ({
    url: fetched[i] ?? url.toString(),
    text: textOf(h),
    links: linksOf(h, fetched[i] ?? url.toString()),
  }));
  const text = perPage.map((p) => p.text).join(" \n ");

  // **Contacts, while we are already on the page.**
  //
  // The read used to throw this away: it fetched the pages, judged the
  // criterion and kept neither the text nor the links, so every cold-city job
  // delivered the phone Overture listed and no email, ever. The extraction
  // rules are `contacts.ts`, ported from the batch script that produced the
  // shipped `contacts-*.json` files rather than invented here.
  //
  // **Attribution is weaker on this path than in the batch**, and knowingly
  // so. It tests a distinctive name word or the business's town against the
  // page and the domain; a job carries the name but not the address, so the
  // town half cannot run. Measured on 570 dental businesses: 85% are named on
  // their own site, 83% mention their town, 93% do one or the other. So this
  // attributes about 85% and withholds the rest, where the batch withholds 7%.
  // Withholding is the safe direction — the alternative is printing a
  // stranger's phone number beside somebody's name — and an `addr` column on
  // `job_sites` would recover the difference.
  const contacts = contactsFrom({
    pages: perPage,
    business: { name: business?.name ?? null, addr: business?.addr ?? null, site: url.toString() },
    listedPhone: business?.phone ?? null,
  });

  return {
    result: { outcome: "ok", pages: htmls.length, chars: text.length, ...d, contacts },
    text,
    pagesFetched: fetched,
    coverage: { targeted: targets.length, reached },
  };
}

/* ------------------------------------------------- the absence rule, pure -- */

/**
 * Does this verdict assert that the thing **is there**?
 *
 * A criterion of type `absence` reads "has no X", so a `match` asserts X is
 * missing and a `no_match` asserts it is present. For `presence` it is the
 * other way round. This decides what can prove the verdict: a quote can only
 * ever show something is there.
 */
export const assertsPresence = (
  criterionType: string,
  verdict: "match" | "no_match",
): boolean => (criterionType === "presence") === (verdict === "match");

/**
 * Did we look in enough places to trust the silence?
 *
 * The same rule `engine/absence.py` has had since S0-13, which the live judge
 * did not implement. **A complete one-page site passes**: there is no second
 * page to read and nowhere else the criterion could be hiding, which is what
 * `homepage_is_whole_site` means there. What fails is having found routes that
 * would show it and reaching none of them.
 *
 * The live judge used `pages < 2` instead, so every one-page site was refused —
 * and a small business is usually a one-page site.
 */
export const coverageProvesAbsence = (c: { targeted: number; reached: number }): boolean =>
  !(c.targeted > 0 && c.reached === 0);

/**
 * What proves an absence: the pages we opened, not a sentence off them.
 *
 * CLAUDE.md: "A 'no X' verdict requires that the X-relevant pages were read and
 * no signal was found." It is a statement about our own crawl, so we write it
 * rather than asking the model to describe it.
 */
export const absenceProof = (label: string, pages: string[]): string =>
  `No ${label} on ${pages.length === 1 ? "the one page this site has" : `${pages.length} pages`}: ` +
  `${pages.join(", ")}. No ${label} script on any of them.`;

/* ------------------------------------------------------------------ judge -- */

interface ModelVerdict {
  verdict: "match" | "no_match" | "couldnt_tell";
  proof?: string;
  reason?: string;
}

/**
 * Settle the criterion against what was read.
 *
 * Technology detection answers first where it can, because it is free and
 * certain: a booking vendor's script on the page settles "has online booking"
 * without a model call. It can only ever produce a **presence** answer — a
 * missing script is not proof of a missing feature, which is the absence rule
 * again.
 */
export async function judge(
  read: SiteRead,
  criterion: Criterion,
): Promise<Verdict> {
  const signal = signalForCriterion(criterion.text);
  const r = read.result;

  if (r.outcome !== "ok" || r.pages === 0) {
    return {
      verdict: (r.outcome === "blocked" ? "blocked" : "couldnt_tell") as VerdictKind,
      reason:
        r.outcome === "blocked"
          ? "the site refused automated reading"
          : `the site could not be read (${r.outcome})`,
    };
  }

  // Free and certain, for presence only.
  if (signal?.detected?.(r)) {
    const present = criterion.type === "presence";
    return {
      verdict: (present ? "match" : "no_match") as VerdictKind,
      proof: r.vendors.length
        ? `${r.vendors.join(", ")} found on the page`
        : `${signal.label} found on the page`,
      reason: `technology detection settled this without a model call`,
    };
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      verdict: "needs_model" as VerdictKind,
      reason: "no model key is configured on this deployment",
    };
  }

  const body = read.text.slice(0, 30_000);
  const prompt =
    `You are checking one factual question about a business from its own website.\n\n` +
    `QUESTION: ${criterion.text}\n` +
    `HOW TO CHECK: ${criterion.explain}\n\n` +
    `Answer "match" only if the question is TRUE of this business.\n` +
    `Answer "no_match" only if you found positive evidence it is FALSE.\n` +
    `Answer "couldnt_tell" if the pages you were given do not settle it. ` +
    `Guessing is worse than couldn't-tell; there is no penalty for it.\n\n` +
    // **A quote is only possible for a thing that is there.**
    //
    // This used to demand one for every verdict, and that single sentence is
    // why no absence criterion could ever match: no page says "we have no live
    // chat", so the model either refused to answer or invented a quote that
    // failed the containment check below. Either way, "couldn't tell".
    //
    // So the quote is asked for when the answer asserts something is present,
    // and when it asserts something is absent the proof is the pages we read —
    // which is what CLAUDE.md's absence rule asks for, and what `judge` builds
    // below rather than trusting the model to describe.
    `If your answer says the thing IS present, you MUST quote, verbatim, one ` +
    `sentence or phrase from the text below that shows it. Quote exactly; do ` +
    `not paraphrase.\n` +
    `If your answer says the thing is NOT present, leave "proof" empty. Do not ` +
    `invent a sentence saying it is missing; no website says that. Answer ` +
    `"couldnt_tell" instead if the pages given do not cover where it would be.\n\n` +
    `Reply as JSON: {"verdict":"match|no_match|couldnt_tell","proof":"<exact quote or empty>","reason":"<one short sentence>"}\n\n` +
    `--- PAGE TEXT (${read.pagesFetched.length} pages) ---\n${body}`;

  let out: ModelVerdict;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const txt = res.content.map((c) => ("text" in c ? c.text : "")).join("");
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    out = JSON.parse(m[0]) as ModelVerdict;
  } catch {
    // Our failure, not theirs.
    return { verdict: "couldnt_tell" as VerdictKind, reason: "the model call did not return a usable answer" };
  }

  const verdict = out.verdict;
  if (verdict !== "match" && verdict !== "no_match") {
    return { verdict: "couldnt_tell" as VerdictKind, reason: out.reason ?? "not settled from the pages read" };
  }

  // **Which way round this verdict points**, which decides what can prove it.
  //
  // A criterion of type `absence` reads "has no X", so a `match` asserts X is
  // *missing* and a `no_match` asserts it is *there*. For `presence` it is the
  // other way round. A quote can only ever show that something is there.
  const assertsPresent = assertsPresence(criterion.type, verdict);

  if (assertsPresent) {
    // The quote check, unchanged. A proof that is not in the text we fetched is
    // not proof, whatever the model believed, so the verdict drops rather than
    // shipping a citation a customer could check and find missing.
    const proof = (out.proof ?? "").trim();
    if (!proof || !flat(read.text).includes(flat(proof))) {
      return {
        verdict: "couldnt_tell" as VerdictKind,
        reason: proof
          ? "the supporting quote was not found on the pages we read"
          : "no supporting quote was given",
      };
    }
    return { verdict: verdict as VerdictKind, proof, reason: out.reason ?? "" };
  }

  // ------------------------------------------------- proving an absence --
  //
  // CLAUDE.md: "A 'no X' verdict requires that the X-relevant pages were read
  // and no signal was found. Missing evidence is 'couldn't tell', never 'no'."
  // That is coverage, not a quote, and the engine used to demand a quote here
  // as well — which no page can supply, so nothing ever settled.
  //
  // Coverage is complete when we read the home page and every
  // criterion-relevant route it linked to. **A site that links none is not
  // poorly covered**: the home page is the whole site. The old proxy for this
  // was `pages < 2`, which failed exactly those one-page sites, and small
  // businesses are mostly one-page sites.
  const { targeted } = read.coverage;
  if (!coverageProvesAbsence(read.coverage)) {
    return {
      verdict: "couldnt_tell" as VerdictKind,
      reason:
        `the ${targeted === 1 ? "page" : "pages"} that would show it could not be ` +
        `fetched, so we cannot call it absent`,
    };
  }

  // The detector gets the last word against the model. If a vendor script for
  // this signal is on the page, the thing is there whatever the model said.
  if (signal?.detected?.(r)) {
    return {
      verdict: (criterion.type === "presence" ? "match" : "no_match") as VerdictKind,
      proof: r.vendors.length ? `${r.vendors.join(", ")} found on the page` : `${signal.label} found on the page`,
      reason: "technology detection found it on the page",
    };
  }

  // The proof is what we looked at, written here rather than taken from the
  // model: it is a statement about our own crawl, and only we know it.
  const label = signal?.label ?? "it";
  return {
    verdict: verdict as VerdictKind,
    proof: absenceProof(label, read.pagesFetched),
    reason: out.reason ?? `read ${read.pagesFetched.length} pages and found no ${label}`,
  };
}
