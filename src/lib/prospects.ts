/**
 * Who Small Fish sells to first, found by Small Fish (GTM, outreach A1).
 *
 * The first buyers are marketing agencies that already serve a local trade: a
 * dental marketing shop in Phoenix needs a list of Phoenix dentists without a
 * booking button far more than any one dentist needs us. So the prospect
 * finder runs the engine on agencies themselves: Overture's agency categories
 * for a city, each agency's own site read politely, and this file deciding
 * which trades the agency says it serves.
 *
 * Pure, so `stage0/tests/test_prospects.mjs` can hold it. The same rules as
 * everywhere else in the engine apply:
 *
 * - **A niche needs a quote.** Every niche we attach to an agency carries the
 *   sentence from their own site that names it. An email that says "you work
 *   with dentists" has to be able to point at where they said so.
 * - **Missing is not "no".** An agency whose pages name no trade is
 *   `unknown`, not "generalist". It is simply not emailed.
 * - **Err toward silence, not toward a claim.** A word that appears once in a
 *   footer list of forty industries is weaker than one in a headline, so the
 *   mention count travels with the niche and the first email only names a
 *   niche the agency mentions in three distinct sentences, or leads with.
 */

/** Overture taxonomy ids for agencies. Counts in `public/data/trades.json`. */
export const AGENCY_CATEGORIES = [
  "marketing_agency",
  "advertising_agency",
  "web_designer",
  "internet_marketing_service",
] as const;

export interface Niche {
  /** Stable id, used as the key everywhere downstream. */
  id: string;
  /** How the email says it. */
  label: string;
  /** What we hand `matchTrade` to build their free list. */
  trade: string;
  /** Word-bounded, case-insensitive. Written against real agency copy. */
  pattern: RegExp;
  /** Only counts when the agency leads with it. Restaurants turn up in press
   *  links and client lists on every agency site; measured on Austin, four of
   *  thirty sites "mentioned restaurants" and none specialised in them. */
  leadOnly?: boolean;
}

/**
 * The trades worth naming. Each one is a trade Small Fish can build a list
 * for in any US city, which is the whole point: the niche becomes the free
 * list in the first email.
 */
export const NICHES: Niche[] = [
  { id: "dental", label: "dentists", trade: "dentists", pattern: /\b(dental|dentists?|dentistry|orthodont\w*)\b/i },
  { id: "medspa", label: "med spas", trade: "med spas", pattern: /\b(med ?spas?|medical spas?|aesthetic (?:clinics?|practices?)|medspas?)\b/i },
  { id: "hvac", label: "HVAC companies", trade: "hvac", pattern: /\b(hvac|heating and (?:air|cooling)|air conditioning)\b/i },
  { id: "plumbing", label: "plumbers", trade: "plumbers", pattern: /\b(plumbers?|plumbing)\b/i },
  { id: "roofing", label: "roofers", trade: "roofers", pattern: /\b(roofers?|roofing)\b/i },
  { id: "legal", label: "law firms", trade: "lawyers", pattern: /\b(law firms?|attorneys?(?![’']? fees)|lawyers?|legal practices?)\b/i },
  { id: "chiro", label: "chiropractors", trade: "chiropractors", pattern: /\b(chiropract\w*)\b/i },
  { id: "vet", label: "veterinary clinics", trade: "veterinarians", pattern: /\b(veterinar\w*|vet clinics?|animal hospitals?)\b/i },
  { id: "realestate", label: "real estate agents", trade: "real estate agents", pattern: /\b(real estate agents?|realtors?|real estate brokerages?)\b/i },
  { id: "restaurant", label: "restaurants", trade: "restaurants", pattern: /\b(restaurants?|restaurateurs?)\b/i, leadOnly: true },
  { id: "landscaping", label: "landscapers", trade: "landscapers", pattern: /\b(landscapers?|landscaping|landscape (?:design|contractors?|companies|company)|lawn care)\b/i },
  { id: "electrical", label: "electricians", trade: "electricians", pattern: /\b(electricians?|electrical contractors?)\b/i },
  { id: "physio", label: "physical therapists", trade: "physical therapists", pattern: /\b(physical therap\w+|physiotherap\w+)\b/i },
  { id: "salon", label: "salons", trade: "beauty salons", pattern: /\b(hair salons?|beauty salons?|salons? and spas?)\b/i },
];

export interface NicheHit {
  id: string;
  label: string;
  trade: string;
  /** Times the niche appears across the pages we read. */
  mentions: number;
  /** One sentence from their site that names it, trimmed. */
  quote: string;
  /** In the home page's title or first heading: they lead with it. */
  leads: boolean;
}

/** The first email names a niche only when this holds. */
export const strongEnough = (h: Pick<NicheHit, "mentions" | "leads">): boolean =>
  h.leads || h.mentions >= 3;

const QUOTE_MAX = 180;
const WINDOW = 80;

/** The handful of entities WordPress leaves in text. */
export function decode(text: string): string {
  return (text ?? "")
    .replace(/&#8217;|&#039;|&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Sentences, roughly. Agency copy is mostly fragments and lists, so a
 *  newline or bullet ends one as well as a full stop does. */
export function sentencesOf(text: string): string[] {
  return decode(text)
    .split(/(?<=[.!?])\s+|\s*[\n•|]+\s*/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12);
}

/**
 * Does this read like a sentence somebody wrote, or like a menu?
 *
 * `readSite` keeps text, not markup, so a nav bar arrives as one long run of
 * Title Case labels with no full stop. Measured on Austin agencies, those were
 * most of the first quotes. A sentence has lower-case words in it.
 */
export function readsLikeProse(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length < 5) return false;
  const lower = words.filter((w) => /^[a-z]/.test(w)).length;
  return lower / words.length >= 0.4;
}

/** A sentence too long to quote is cut to the stretch around the match, at
 *  word boundaries, and marked as cut. */
function window(s: string, pattern: RegExp): string {
  if (s.length <= QUOTE_MAX) return s;
  const at = s.search(pattern);
  const from = Math.max(0, at - WINDOW);
  const to = Math.min(s.length, at + WINDOW);
  let cut = s.slice(from, to);
  if (from > 0) cut = `…${cut.replace(/^\S*\s/, "")}`;
  if (to < s.length) cut = `${cut.replace(/\s\S*$/, "")}…`;
  return cut;
}

/** The shortest prose sentence that names the niche, so the quote reads as
 *  theirs and not as a menu we chose to cut. */
function quoteFor(sentences: string[], pattern: RegExp): string | null {
  const prose = sentences.filter((s) => pattern.test(s) && readsLikeProse(s));
  if (!prose.length) return null;
  const best = prose.sort((a, b) => a.length - b.length).find((s) => s.length >= 25) ?? prose[0];
  return window(best, pattern);
}

/**
 * Words that say the sentence is about marketing work.
 *
 * Overture files plenty of non-agencies under the agency categories. Measured
 * on Phoenix, the one "dental" hit that was not an agency was a contractor
 * quoting a testimonial: "They took care of the plumbing, HVAC, and installed
 * new flooring". An agency talks about the trade in terms of its work.
 */
export const MARKETING_CUE =
  /\b(marketing|market|seo|search|websites?|web design|ads|advertis\w*|leads?|clients?|brand\w*|grow\w*|campaigns?|patients|customers|social media|ppc|google|agency|digital|online|calls?|bookings?|reviews?)\b/i;

/** Distinct sentences naming it. Raw occurrences count a nav bar once per
 *  page read, which made four pages of the same menu look like a specialism. */
const mentionsIn = (sentences: string[], pattern: RegExp): number =>
  new Set(sentences.filter((s) => pattern.test(s)).map((s) => s.toLowerCase())).size;

/**
 * Which trades this agency says it serves, strongest first.
 *
 * `headline` is the home page's `<title>` plus first `<h1>`, when the caller
 * has it; an agency that leads with "Dental Marketing" is a different prospect
 * from one that lists dentists twelfth in a footer.
 */
export function nichesIn(text: string, headline = ""): NicheHit[] {
  const sentences = sentencesOf(text).filter((s) => MARKETING_CUE.test(s));
  const out: NicheHit[] = [];
  for (const n of NICHES) {
    const mentions = mentionsIn(sentences, n.pattern);
    if (!mentions) continue;
    const leads = n.pattern.test(decode(headline));
    if (n.leadOnly && !leads) continue;
    const quote = quoteFor(sentences, n.pattern);
    if (!quote) continue;
    out.push({
      id: n.id,
      label: n.label,
      trade: n.trade,
      mentions,
      quote,
      leads,
    });
  }
  return out.sort((a, b) => Number(b.leads) - Number(a.leads) || b.mentions - a.mentions);
}

/**
 * The niche the outreach is about, or null when nothing is strong enough.
 *
 * An agency naming ten trades equally is a generalist, and an email built on
 * whichever came first would be a guess dressed as research. Above five
 * niches, only one it leads with counts.
 */
export function primaryNiche(hits: NicheHit[]): NicheHit | null {
  const strong = hits.filter(strongEnough);
  if (!strong.length) return null;
  if (hits.length > 5 && !strong[0].leads) return null;
  return strong[0];
}

/** The domain a prospect is keyed on: one agency, one row, however its
 *  listing spelled the URL. */
export function domainOf(site: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * The address to write to, from what the site published.
 *
 * **Only an address on the agency's own domain.** Measured on Austin, one
 * agency's site carried another company's address (a partner, or whoever built
 * the site), and a cold email to the wrong company under the right company's
 * name is the worst version of this. A named person's address beats a role
 * address, and addresses that only ever bounce or annoy are dropped.
 */
export function pickEmail(emails: string[], domain: string | null): string | null {
  if (!domain) return null;
  // Pages carry addresses URL-encoded ("%20hello@…"), which parse as a
  // different mailbox from the one printed. Decode before judging.
  const decoded = emails.map((e) => {
    try {
      return decodeURIComponent(e).trim().toLowerCase();
    } catch {
      return e.trim().toLowerCase();
    }
  });
  const clean = [...new Set(decoded)].filter(
    (e) =>
      /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) &&
      (e.endsWith(`@${domain}`) || e.endsWith(`.${domain}`)) &&
      !/^(no-?reply|donotreply|privacy|abuse|postmaster|webmaster|careers|jobs|hr|billing|accounts?|press|media|legal|unsubscribe)@/.test(e),
  );
  const role = (e: string) => /^(info|hello|hi|contact|team|office|sales|support|admin|marketing|inquiries|enquiries)@/.test(e);
  return clean.sort((a, b) => Number(role(a)) - Number(role(b)))[0] ?? null;
}

/**
 * The gap an agency in this niche sells into, as a catalogue signal id.
 *
 * Booking for practices that take appointments, a quote form for trades that
 * price jobs, live chat for the rest. Every id here is `provable: true` in
 * `signals.ts`; `test_prospects.mjs` holds that, because the free list in the
 * first email has to be a list the engine can actually settle.
 */
export const GAP: Record<string, string> = {
  dental: "booking", medspa: "booking", chiro: "booking", vet: "booking",
  physio: "booking", salon: "booking", restaurant: "booking",
  hvac: "quote_form", plumbing: "quote_form", roofing: "quote_form",
  electrical: "quote_form", landscaping: "quote_form",
  legal: "chat", realestate: "chat",
};

/** The search we hand the app: "dentists in Phoenix, AZ with no online booking". */
export function listQuery(niche: Pick<Niche, "id" | "label">, where: string, absenceText: string): string {
  return `${niche.label} in ${where} that ${absenceText.replace(/^has no /, "have no ")}`;
}

/** An unguessable link token. Ten base-62 characters is ~59 bits. */
export function token(rand: (n: number) => Uint8Array): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from(rand(10), (b) => abc[b % abc.length]).join("");
}

/**
 * Does this business call itself an agency? Overture's agency categories hold
 * printers, sign shops, a chemicals firm and an insurance rep (measured on the
 * 2026-10-15 backfill), so the widget campaign, which has no trade quote to
 * vouch for the read, asks the name or domain to say so.
 */
const AGENCY_WORD =
  /(marketing|media|digital|design|web|creative|advertis|agency|brand|seo|studio|interactive|communicat|social|\bads?\b|ppc|growth|pixel|labs?\b|consult)/i;
export const looksLikeAgency = (name: string | null, domain: string): boolean =>
  AGENCY_WORD.test(name ?? "") || AGENCY_WORD.test(domain.split(".")[0]);

/**
 * Common US first names, for telling `jeremy@` from `newbiz@`. Not a census:
 * a list long enough that a person's address usually matches, and a role
 * mailbox never does. A miss only means the agency is not written to.
 */
const FIRST_NAMES = new Set(
  (
    "aaron adam adrian aidan alan albert alex alexa alexander alexis alice alicia allison alyssa amanda amber amy ana andrea andrew angela angie anna anne annie anthony april ari ariel ashley austin barbara barry becky ben benjamin beth betty bill billy blake bob bobby brad bradley brandon brenda brent brett brian brianna bridget brittany brooke bruce bryan caitlin calvin cameron candice carl carla carlos carmen carol caroline carrie casey cassie catherine cathy chad charles charlie chelsea cheryl chris christian christina christine christopher cindy claire clara cody colin connor corey courtney craig cristina crystal curtis cynthia dale dan dana daniel danielle danny darren dave david dawn dean debbie deborah denise dennis derek diana diane dominic don donald donna doug douglas drew dustin dylan ed eddie edward elaine elena eli elizabeth ellen emily emma eric erica erik erin ethan eugene evan frank fred gabriel gary gavin george gina glen glenn grace greg gregory hannah harry heather heidi helen henry holly ian isaac isabel jack jackie jacob jake james jamie jan jane janet janice jared jason jay jeff jeffrey jen jenna jennifer jenny jeremy jerry jesse jessica jill jim jimmy joan joanna joe joel john johnny jon jonathan jordan jose joseph josh joshua joy joyce juan judy julia julie justin kara karen kate katherine kathleen kathy katie kayla keith kelly ken kendra kenneth kerry kevin kim kimberly kristen kristin kyle lance larry laura lauren leah lee leo leslie linda lindsay lisa liz lori louis lucas luis luke lynn madison maggie marc marcus margaret maria marie marissa mark martin mary matt matthew megan melanie melissa michael michelle mike miguel mindy molly monica morgan nancy natalie nathan neil nicholas nick nicole noah nora olivia omar oscar pam pamela pat patricia patrick paul paula peter phil philip rachel randy ray raymond rebecca renee rich richard rick rob robert robin rod roger ron ronald rose ross russell ruth ryan sally sam samantha samuel sandra sara sarah scott sean seth shannon sharon shawn sheila shelby sherry sophia stacy stephanie stephen steve steven sue susan suzanne tammy tanya tara taylor ted teresa terry thomas tiffany tim timothy tina todd tom tommy tony tracy travis trevor tricia troy tyler valerie vanessa victor victoria vincent wayne wendy william zach zachary"
  ).split(" "),
);

/** `jeremy@` and `jeremy.smith@` count; `newbiz@` and `jsmith@` do not. */
export function looksLikePerson(email: string): boolean {
  const local = email.split("@")[0].toLowerCase();
  if (!/^[a-z]+([._-][a-z]+)?$/.test(local)) return false;
  const [first] = local.split(/[._-]/);
  if (FIRST_NAMES.has(first)) return true;
  // "jsmith@" cannot be told from "growth@" without a surname list, so it
  // is left out: a missed person costs one email, a role inbox costs the domain.
  return false;
}
