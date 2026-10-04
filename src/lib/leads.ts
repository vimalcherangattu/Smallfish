import { groupForBilling } from "@/lib/billing";
import { outreachFor } from "@/lib/outreach";
import { splitQuery } from "@/lib/query";
import { signalForCriterion } from "@/lib/signals";
import { applySuppression } from "@/lib/suppression";
import { bandForMarket, FREE_PREVIEW, matchedIn, visibleIds } from "@/lib/unlock";
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
  /**
   * True when this row has not been paid for, in which case **every field above
   * that could identify the business is null or masked** — see `unlock.ts`.
   * `has` says what unlocking would reveal, which is the honest way to price a
   * row without giving it away.
   */
  locked: boolean;
  has: { phone: boolean; email: boolean; message: boolean };
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
  /** Rows on this page whose identity is withheld until they are paid for. */
  locked: number;
  /** Rows this workspace already holds, free to show again for twelve months. */
  owned: number;
  /** Credits per match on this market — the delivered band, never a quote. */
  creditsEach: number;
  /** Matched rows shown in full before anything is paid for. */
  preview: number;
  /**
   * Businesses here with a website nobody has read yet.
   *
   * On screen beside `read`, because "42 to call, out of 200 read" and "42 to
   * call, out of 2,778 that have a website" are different claims and only the
   * first one is true. It is also the offer: this is exactly the work the
   * worker does.
   */
  unread: number;
}

const NICHE_WORDS: Record<string, RegExp> = {
  med_spa: /\b(med(ical)?[ -]?spas?|aesthetics?|botox)\b/i,
  dental: /\b(dental|dentists?|orthodont\w*)\b/i,
  hvac: /\b(hvac|heating|air ?conditioning|furnace)\b/i,
  veterinary: /\b(vets?|veterinar\w+|animal hospitals?)\b/i,
};

/**
 * Businesses in this market with a website nobody has read yet.
 *
 * The honest definition of "unread": a site we hold and an outcome we do not. A
 * business with no website is not unread, it is unreadable, and counting it
 * would promise reading that cannot happen.
 *
 * This is the worker's first real source of work — 6,814 sites across the three
 * measured markets, already extracted, needing no Overture pull and no upload.
 */
export const unreadIn = (market: Market): Business[] =>
  market.businesses.filter((b) => !!b.site && !b.read?.outcome);

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

/**
 * The same sentence with the business taken out of it.
 *
 * `plainWhy` names the domain — "No online booking anywhere on the 3 pages of
 * brightsmiledental.com we read" — which is the whole identity of the row. A
 * locked row says the true thing without it. The page count stays: it is what
 * makes the claim checkable in shape, and it names nobody.
 */
function maskedWhy(c: Criterion, b: Business): string {
  const pages = b.read?.pages ?? 0;
  const read = `${pages} page${pages === 1 ? "" : "s"} read`;
  if (c.type === "absence") {
    const thing = c.text
      .replace(/^has no /i, "")
      .replace(/^is not /i, "")
      .replace(/^does not /i, "");
    return `No ${thing} anywhere on their site. ${read}.`;
  }
  return `Their site shows ${c.text.replace(/^has /i, "")}. ${read}.`;
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
/** What the sender offers, in their own words, captured at sign-up as `sells`
 *  and carried on every door (`doors.ts`). */
export interface Sender {
  sells?: string | null;
}

export interface Email {
  subject: string;
  body: string;
}

/** A stable number from a string, so the same business always gets the same
 *  wording. Not for security — for reproducibility: a draft that changes
 *  between two loads of the same screen is a draft nobody can trust, and the
 *  home page renders this at build time and again in the browser. */
function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = <T,>(options: T[], from: string): T => options[seed(from) % options.length];

/** Whether two phrases are the same thing in different words — "online
 *  booking" against "online booking", or "booking" inside "online booking".
 *  Used only to stop the draft repeating itself, never to decide a claim. */
function near(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const [x, y] = [n(a), n(b)];
  return x === y || x.includes(y) || y.includes(x);
}

/** The town, from the postal address. "7502 E Camelback Rd, Scottsdale, AZ"
 *  → "Scottsdale". Null rather than a guess when the shape is unfamiliar. */
export function townOf(addr: string): string | null {
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const town = parts[parts.length - 2];
  return /^[A-Za-z][A-Za-z .'-]*$/.test(town) ? town : null;
}

/** The seller's offer, reduced to a noun phrase that survives being dropped
 *  into a sentence. People type both "online booking" and "I set up online
 *  booking", and the second spliced into "I help small businesses with …"
 *  produced "with I set up online booking". */
export function offerOf(sells: string | null | undefined): string | null {
  const raw = (sells ?? "").trim().replace(/[.!]+$/, "");
  if (!raw) return null;
  const stripped = raw
    .replace(/^(i|we)\s+(can\s+)?(do|sell|offer|provide|build|set\s*up|install|help\s+with)\s+/i, "")
    .trim();
  return stripped.length >= 2 ? stripped : null;
}

/**
 * The opening email: a subject and a body.
 *
 * ## What changed on 2026-10-04, and why the old one could not be answered
 *
 * The previous draft never said **who was writing or what they sold**. It
 * ended "Happy to show you what it would look like on your own site" without
 * naming the thing, because `composeMessage(business, criterion)` was never
 * given the sender. The recipient could not reply to it even if they wanted
 * to. `sells` has been captured at sign-up and carried on every door since
 * P0.3; it simply never reached here.
 *
 * It also had no subject, and it opened by telling a stranger what was wrong
 * with their website — the first sentence a recipient read was a criticism
 * from somebody who had not introduced themselves.
 *
 * ## Why these are not, and cannot yet be, deeply personal
 *
 * Measured 2026-10-04 on dental Phoenix: `proof` is populated on all 51
 * `no_match` rows and on **none of the 42 matches**. That is the absence-proof
 * rule showing through, not a gap in the data — you can quote the booking
 * widget you found; **you cannot quote the absence of one.** So for the
 * flagship absence criteria there is no sentence of theirs to cite, and an
 * email that sounds like it read their About page would be inventing.
 *
 * What is actually on hand is used, all of it: their domain, their town, the
 * platform the site is built on, whether they already run chat or an enquiry
 * route, and what the sender sells. Richer openers need something *positive*
 * read from their site — services, specialisms — which is not stored at all
 * today and needs both a schema change and `ANTHROPIC_API_KEY`.
 *
 * ## Why the wording varies
 *
 * Forty-two matches used to produce forty-two near-identical emails, varying
 * only by domain. Anyone who compared two of them saw a form letter. The ask
 * and one connective are now chosen by a hash of the business id: stable for a
 * given business, different across a list. **Only our own phrasing varies —
 * never a claim**, so every sentence about the recipient still traces to
 * something recorded.
 */
export function composeEmail(
  b: Business,
  criterion: Criterion,
  sender: Sender = {},
): Email | null {
  const r = b.read;
  if (!r || r.outcome !== "ok" || r.pages === 0) return null;
  if (b.verdicts[criterion.id]?.verdict !== "match") return null;

  const where = host(b.site) ?? "your site";
  const signal = signalForCriterion(criterion.text);
  // The article has to come off. Four of the catalogue's labels carry one — "a
  // way to request a quote online", "a contact form" — and the sentence below
  // supplies its own negative, so the draft that went out on every HVAC Tampa
  // door read *"There's no a way to request a quote online"*. The label is
  // written to stand alone ("we look for a contact form"); here it is the object
  // of "no", and "no" already does the work of the article.
  const thing = (
    signal?.label ??
    criterion.text.replace(/^has no /i, "").replace(/^is not /i, "").replace(/^does not /i, "")
  ).replace(/^an? /i, "");

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

  // 4. Who is writing. The whole reason the old draft was unanswerable: a
  //    stranger described a gap in your website and never said what they did
  //    about it. Only written when we actually know — we never guess a trade.
  const offer = offerOf(sender.sells);
  const town = townOf(b.addr);
  const intro = offer
    ? pick(
        [
          `I help small businesses with ${offer}.`,
          `I set up ${offer} for small businesses${town ? ` around ${town}` : ""}.`,
          `I work with small businesses on ${offer}.`,
        ],
        b.id,
      )
    : null;

  // 5. A small ask, naming the thing once. Not "worth a quick look?" at nothing
  //    in particular — a named, cheap next step the recipient can answer in a
  //    second. Without an offer to name it stays general, because the
  //    alternative is inventing what the sender does.
  //
  //    When the seller's offer is the same thing as the gap — which is the
  //    common case, somebody selling booking to clinics with no booking — the
  //    phrase has already appeared in the intro and the observation. Saying it
  //    a fourth time is what made the draft read like a machine wrote it, so
  //    the ask says "it".
  const echoes = !!offer && near(offer, thing);
  const named = echoes ? "it" : offer;
  const ask = offer
    ? pick(
        [
          `Happy to show you what ${named} would look like on your site — worth a short reply?`,
          `If it's useful I can show you what ${named} would look like for you. Worth a short reply?`,
          `I can show you what ${named} would look like on ${where} — worth a short reply?`,
        ],
        `${b.id}:ask`,
      )
    : "Happy to show you what it would look like on your own site — worth a short reply?";

  const body = [
    "Hi there,",
    intro,
    [observation, consequence].filter(Boolean).join(" "),
    easier,
    ask,
  ]
    .filter(Boolean)
    .join("\n\n");

  // The subject names the thing and the site, and nothing else. Neutral on
  // purpose: a subject that opens with the problem reads as a cold pitch
  // before the recipient has read a word of the email.
  const subject =
    criterion.type === "absence"
      ? `${thing.charAt(0).toUpperCase()}${thing.slice(1)} on ${where}`
      : `${thing.charAt(0).toUpperCase()}${thing.slice(1)} at ${b.name}`;

  return { subject, body };
}

/** The body alone, for the surfaces that only ever showed one.
 *
 *  A wrapper rather than a second generator: the claims live in exactly one
 *  place, which is the rule this module is built around. */
export function composeMessage(
  b: Business,
  criterion: Criterion,
  sender: Sender = {},
): string | null {
  return composeEmail(b, criterion, sender)?.body ?? null;
}

export function buildLeads({
  query,
  index,
  market,
  contacts,
  suppressed,
  unlocked = new Set<string>(),
  preview = FREE_PREVIEW,
  limit = 200,
}: {
  query: string;
  index: MarketIndex | null;
  market: Market;
  contacts: Contacts;
  suppressed: Set<string>;
  /** Businesses this workspace has paid for. Empty for a signed-out visitor. */
  unlocked?: ReadonlySet<string>;
  preview?: number;
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

  // `matchedIn`, not a filter written here. The screen, the CSV, the push and
  // the unlock all have to agree on which rows exist and in what order, because
  // the rows on the invoice are the rows on the screen. See `unlock.ts`.
  const matched = matchedIn(market, [criterion], suppressed);
  const unclear = all.filter((b) => {
    const v = verdictOf(b);
    return v === "couldnt_tell" || v === "blocked";
  }).length;
  const didNotFit = all.filter((b) => verdictOf(b) === "no_match").length;

  const page = matched.slice(0, limit);
  const visible = visibleIds(matched, unlocked, preview);

  const leads: Lead[] = page.map((b, i) => {
    const c = contacts[b.id] ?? {};
    const usable = !c.withheld;
    const o = outreachFor(b, market.criteria);
    // The business's own listed number is the one that is always there; a
    // number scraped off the site is better when we have it.
    const phone = prettyPhone((usable ? firstValue(c.phones) : null) ?? b.phone ?? null);
    const email = (usable ? firstValue(c.emails) : null) ?? null;
    // `outreachFor` holds the veto; this writes the sentence. A draft is only
    // produced when it would have produced one.
    const message = o.withheld ? null : composeMessage(b, criterion);
    const has = { phone: !!phone, email: !!email, message: !!message };

    // A row nobody has paid for. Everything that could name the business is
    // dropped here rather than hidden by the component — a field that reaches
    // the browser has been given away, whatever the CSS says about it. The id
    // goes too: it is an Overture GERS id, which resolves to the business.
    if (!visible.has(b.id)) {
      return {
        id: `locked-${i}`,
        name: "",
        why: maskedWhy(criterion, b),
        site: null,
        domain: null,
        phone: null,
        email: null,
        contactPage: null,
        message: null,
        proof: null,
        pagesRead: b.read?.pages ?? 0,
        locked: true,
        has,
      };
    }

    return {
      id: b.id,
      name: b.name,
      why: plainWhy(criterion, b),
      site: b.site,
      domain: host(b.site),
      phone,
      email,
      contactPage: (usable ? c.contactPage : null) ?? null,
      message,
      proof: b.verdicts[criterion.id]?.proof ?? b.verdicts[criterion.id]?.reason ?? null,
      pagesRead: b.read?.pages ?? 0,
      locked: false,
      has,
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
    locked: leads.filter((l) => l.locked).length,
    owned: page.filter((b) => unlocked.has(b.id)).length,
    creditsEach: bandForMarket(market, [criterion], suppressed).credits,
    preview,
    unread: unreadIn(market).length,
  };
}

/** The CSV a user downloads. Same columns as the row on screen, in the same
 *  order, so the file is not a different product from the list. */
export function leadsToCsv(r: LeadResult): string {
  const esc = (s: string | null) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Business", "Why it fits", "Phone", "Email", "Website", "Message"];
  // Locked rows carry no identity at all, so writing them out would be a file of
  // blank lines with a page count on them. They are not in the file for the same
  // reason they are not on the screen.
  const rows = r.leads
    .filter((l) => !l.locked)
    .map((l) => [l.name, l.why, l.phone, l.email, l.site, l.message].map(esc).join(","));
  return [head.join(","), ...rows].join("\r\n");
}
