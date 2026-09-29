import { groupForBilling } from "@/lib/billing";
import { outreachFor } from "@/lib/outreach";
import { splitQuery } from "@/lib/query";
import { signalForCriterion } from "@/lib/signals";
import { applySuppression } from "@/lib/suppression";
import type { Business, Criterion, Market, MarketIndex } from "@/lib/types";

/**
 * A typed sentence in, a list of businesses to call out.
 *
 * ## Why this exists at all
 *
 * The product had three screens between "dentists in Phoenix who don't book
 * online" and a phone number: a confirm page quoting a cost per website read, a
 * map with radius buttons, and a panel of verdict filters. Every one of them
 * was showing the measurement engine to somebody who came to find leads. This
 * function is the whole path collapsed into one call, so the screen above it
 * can be a box and a list.
 *
 * ## It runs on the server, and that is the point
 *
 * The market files are megabytes. Assembling here means a browser receives the
 * forty rows that matched, already carrying the contact and the drafted
 * message — no fetch, no spinner, no client-side filtering of 2,778 listings
 * to find 42.
 *
 * ## What it does not do
 *
 * It does not invent. A business with nothing observed gets `message: null`,
 * and the caller shows the row without a draft rather than a draft without a
 * basis. `outreachFor` already refuses on its own terms; this passes the
 * refusal through instead of papering over it.
 */

export interface Lead {
  id: string;
  name: string;
  /** Plain-language reason this one is on the list. Never our vocabulary. */
  why: string;
  site: string | null;
  domain: string | null;
  phone: string | null;
  email: string | null;
  contactPage: string | null;
  /** Ready to send. Null when nothing specific enough was observed. */
  message: string | null;
  /** The sentence off their own site, for the row that wants to be checked. */
  proof: string | null;
  pagesRead: number;
}

export interface LeadResult {
  /** What we understood, echoed back in the user's own words. */
  what: string;
  where: string;
  criterion: string;
  /** The metro these actually came from, which can differ from what was typed. */
  metro: string;
  marketId: string;
  criterionId: string;
  criterionText: string;
  leads: Lead[];
  /** Businesses whose sites we could not read. A count, never a list of rows. */
  unclear: number;
  /** Checked and did not fit. */
  didNotFit: number;
  /**
   * Websites actually read. **Not** the number of businesses found.
   *
   * The first version of this screen said "We checked 2,800 and these are the
   * ones that fit." We had not checked 2,800 — that is how many dental listings
   * in Phoenix have a website at all. We read 200 of them. Saying the larger
   * number is the precise kind of overclaim this product is supposed to be the
   * alternative to, and it was on screen within an hour of the screen existing.
   */
  read: number;
  /** Businesses with a website in this market, read or not. */
  found: number;
}

const NICHE_WORDS: Record<string, RegExp> = {
  med_spa: /\b(med(ical)?[ -]?spas?|aesthetics?|botox)\b/i,
  dental: /\b(dental|dentists?|orthodont\w*)\b/i,
  hvac: /\b(hvac|heating|air ?conditioning|furnace)\b/i,
  veterinary: /\b(vets?|veterinar\w+|animal hospitals?)\b/i,
};

export const host = (url: string | null) =>
  (url ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] || null;

/**
 * Which read market a typed search lands on, if any.
 *
 * Only a criterion something actually settled counts. A market whose verdicts
 * are all "needs a model" has been listed, not read, and offering it hands
 * somebody an empty list that reads as a broken product.
 */
export function marketFor(index: MarketIndex | null, what: string, where: string) {
  if (!index) return null;
  const niche = Object.entries(NICHE_WORDS).find(([, re]) => re.test(what))?.[0];
  if (!niche) return null;

  const candidates = index.markets.filter((m) => m.niche === niche);
  if (!candidates.length) return null;

  const city = where.split(",")[0].trim().toLowerCase();
  const market =
    candidates.find((m) => city && m.metro.toLowerCase().includes(city)) ?? candidates[0];

  const settled = market.criteria
    .map((c) => ({ c, matches: market.tallies?.[c.id]?.match ?? 0 }))
    .filter((x) => x.matches > 0)
    .sort((a, b) => b.matches - a.matches)[0];
  if (!settled) return null;

  return {
    market,
    criterion: settled.c,
    matches: settled.matches,
    sameCity: !!city && market.metro.toLowerCase().includes(city),
  };
}

/**
 * A published contact, as `export_app_data.py` writes it.
 *
 * Each one carries where it was found and how, which is why these are objects
 * and not strings — a phone number with no provenance is the sort of thing this
 * product exists not to hand anybody. `withheld` is set when the domain is
 * shared by a chain or a platform, in which case nothing on it can be
 * attributed to this location and none of it is used.
 */
export interface PublishedValue {
  value: string;
  page?: string | null;
  how?: string | null;
}

export type Contacts = Record<
  string,
  {
    emails?: PublishedValue[];
    phones?: PublishedValue[];
    contactPage?: string | null;
    withheld?: string | null;
  }
>;

const firstValue = (v: PublishedValue[] | undefined): string | null =>
  (v ?? []).map((x) => x?.value).find((s) => typeof s === "string" && s.trim()) ?? null;

/**
 * Why this business is on the list, said the way a person would say it.
 *
 * The stored proof is written for an auditor — "no booking signal on 6 pages
 * crawled, no third-party scheduler script". That belongs on the row, behind a
 * toggle, for the user who wants to check us. It does not belong in the first
 * line somebody reads.
 */
function plainWhy(c: Criterion, b: Business): string {
  const pages = b.read?.pages ?? 0;
  const where = host(b.site) ?? "their site";
  if (c.type === "absence") {
    const thing = c.text
      .replace(/^has no /i, "")
      .replace(/^is not /i, "")
      .replace(/^does not /i, "");
    return `No ${thing} anywhere on the ${pages} page${pages === 1 ? "" : "s"} of ${where} we read.`;
  }
  return `${where} shows ${c.text.replace(/^has /i, "")}.`;
}

/** US numbers, as a person writes them. Overture stores `+16027773777` and
 *  scraped ones arrive already formatted, so both shapes have to survive. */
export function prettyPhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^\d]/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (n.length !== 10) return raw.trim() || null;
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

const CMS_LABEL: Record<string, string> = {
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  shopify: "Shopify",
  webflow: "Webflow",
  godaddy_website_builder: "GoDaddy's builder",
};

/**
 * The message the user actually sends.
 *
 * ## Why this is not `outreachFor`
 *
 * `outreach.ts` decides **whether we are allowed to write anything** — it holds
 * the rule that an opener with no observed basis is never produced, and it is
 * tested on exactly that. It stays in charge of that decision and this function
 * only runs when it says yes.
 *
 * What it produced, though, was written for a reviewer: every draft ended with
 * "Happy to be wrong — if there is online booking I missed, say so and I will
 * drop it." That hedge is right, and it belongs to us, not in a stranger's
 * inbox. Rendered down a list of 42 it also made every draft look identical,
 * because the hedge and the consequence were the longest parts of each one and
 * the only thing that changed was the domain.
 *
 * ## The variation here is real, and it stops where the evidence does
 *
 * Measured on dental Phoenix: 26 of 42 sites report a platform, 9 have an
 * enquiry route but no booking, none run chat, and pages read vary 2–4. That
 * supports three or four genuinely different second sentences, so there are
 * three or four — not 42 paraphrases of one. Manufacturing the other 38 would
 * be writing copy and calling it evidence, which is the thing this product
 * exists not to do.
 */
export function composeMessage(b: Business, criterion: Criterion): string | null {
  const r = b.read;
  if (!r || r.outcome !== "ok" || r.pages === 0) return null;
  if (b.verdicts[criterion.id]?.verdict !== "match") return null;

  const where = host(b.site) ?? "your site";
  const signal = signalForCriterion(criterion.text);
  const thing =
    signal?.label ??
    criterion.text.replace(/^has no /i, "").replace(/^is not /i, "").replace(/^does not /i, "");

  // 1. What is true of their site, said the way the recipient would say it.
  //
  //    The previous version opened "I went through 2 pages of yoursite.com and
  //    couldn't find online booking anywhere", which is three mistakes in one
  //    sentence: it is about us rather than them, it volunteers that we looked
  //    at only two pages, and it reads like surveillance. How thoroughly we
  //    read is *our* evidence and belongs on our screen, under "how we know".
  const observation =
    criterion.type === "absence"
      ? `There's no ${thing} on ${where}${b.phone ? " — everything points at the phone" : ""}.`
      : `I noticed ${where} ${criterion.text.replace(/^has /i, "has ")}.`;

  // 2. Why that costs them something, in their terms. Straight from the signal
  //    catalogue, which carries a consequence only for signals we can prove;
  //    an uncatalogued gap gets stated and left alone rather than given an
  //    invented cost.
  const consequence = signal?.costsWhenMissing
    ? `That means ${signal.costsWhenMissing}.`
    : null;

  // 3. The one observation that lowers the perceived size of the job. Each
  //    branch is a recorded fact, never an inference about the business.
  let easier: string | null = null;
  if (criterion.type === "absence" && r.quote) {
    easier = "You already take enquiries through the site, so the form habit is there — this is the next step, not a new one.";
  } else if (r.chat) {
    easier = "You already run chat, so the appetite for handling this online is clearly there.";
  } else if (r.cms.length) {
    const label = CMS_LABEL[r.cms[0]] ?? r.cms[0];
    easier = `You're on ${label}, so this is usually an add-on rather than a rebuild.`;
  }

  // 4. A small ask. Not "worth a quick look?" at nothing in particular — a
  //    named, cheap next step the recipient can say yes or no to in a second.
  const ask = "Happy to show you what it would look like on your own site — worth a short reply?";

  return ["Hi there,", [observation, consequence].filter(Boolean).join(" "), easier, ask]
    .filter(Boolean)
    .join("\n\n");
}

export function buildLeads({
  query,
  index,
  market,
  contacts,
  suppressed,
  limit = 200,
}: {
  query: string;
  index: MarketIndex | null;
  market: Market;
  contacts: Contacts;
  suppressed: Set<string>;
  limit?: number;
}): LeadResult | null {
  const split = splitQuery(query);
  const hit = marketFor(index, split.what, split.where);
  if (!hit) return null;

  const criterion = market.criteria.find((c) => c.id === hit.criterion.id);
  if (!criterion) return null;

  // One row per business before anything is counted, so the number on screen is
  // the number in the file and the number on the invoice. 326 of dental
  // Phoenix's listings are a second entry for a practice already in the set.
  const all = applySuppression(
    groupForBilling(market.businesses).map((g) => g.lead),
    suppressed,
  );

  const verdictOf = (b: Business) => b.verdicts[criterion.id]?.verdict ?? "unread";

  const matched = all.filter((b) => verdictOf(b) === "match");
  const unclear = all.filter((b) => {
    const v = verdictOf(b);
    return v === "couldnt_tell" || v === "blocked";
  }).length;
  const didNotFit = all.filter((b) => verdictOf(b) === "no_match").length;

  const leads: Lead[] = matched.slice(0, limit).map((b) => {
    const c = contacts[b.id] ?? {};
    const usable = !c.withheld;
    const o = outreachFor(b, market.criteria);
    return {
      id: b.id,
      name: b.name,
      why: plainWhy(criterion, b),
      site: b.site,
      domain: host(b.site),
      // The business's own listed number is the one that is always there; a
      // number scraped off the site is better when we have it.
      phone: prettyPhone((usable ? firstValue(c.phones) : null) ?? b.phone ?? null),
      email: (usable ? firstValue(c.emails) : null) ?? null,
      contactPage: (usable ? c.contactPage : null) ?? null,
      // `outreachFor` holds the veto; this writes the sentence. A draft is only
      // produced when it would have produced one.
      message: o.withheld ? null : composeMessage(b, criterion),
      proof: b.verdicts[criterion.id]?.proof ?? b.verdicts[criterion.id]?.reason ?? null,
      pagesRead: b.read?.pages ?? 0,
    };
  });

  return {
    what: split.what,
    where: split.where,
    criterion: split.criterion,
    metro: market.metro,
    marketId: market.id,
    criterionId: criterion.id,
    criterionText: criterion.text,
    leads,
    unclear,
    didNotFit,
    read: market.counts?.read ?? 0,
    found: all.length,
  };
}

/** The CSV a user downloads. Same columns as the row on screen, in the same
 *  order, so the file is not a different product from the list. */
export function leadsToCsv(r: LeadResult): string {
  const esc = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Business", "Why it fits", "Phone", "Email", "Website", "Message"];
  const rows = r.leads.map((l) =>
    [l.name, l.why, l.phone, l.email, l.site, l.message].map(esc).join(","),
  );
  return [head.join(","), ...rows].join("\r\n");
}
