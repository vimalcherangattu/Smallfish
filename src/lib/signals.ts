/** The observable-signal catalogue — one vocabulary, three consumers.
 *
 *  Everything the product says about a business has to trace back to something
 *  a website actually showed. This file is the list of those things, and it is
 *  deliberately the *only* list: `outreach.ts` reads it to name a pain point,
 *  `icp.ts` reads it to propose criteria, and both recognise a criterion by
 *  matching its text here. One catalogue means the ICP flow cannot propose a
 *  criterion the engine has no detector for, and outreach cannot claim a
 *  consequence for a gap nobody looked for.
 *
 *  `provable: false` entries are the important half. They are the gaps buyers
 *  ask for that we cannot settle today, kept here so the ICP flow can **refuse
 *  them out loud** — `docs/icp-discovery.md` rule 1: "ICP discovery must refuse
 *  unprovable criteria *before* proposing them, or it will invent appealing
 *  ICPs the engine cannot deliver, which is worse than not offering the flow at
 *  all." Deleting them would make the flow silently better-looking and worse.
 */

import type { ReadResult } from "@/lib/types";

/**
 * Platforms that count as a builder, matching what `read.ts` detects.
 *
 * WordPress is deliberately out: it is as often a developer's choice as a
 * DIY one, so "on WordPress" says nothing about who built it, and a criterion
 * that fires on half the web is not a criterion.
 */
const BUILDERS = new Set(["wix", "squarespace", "godaddy_website_builder", "webflow", "shopify", "duda", "weebly"]);

export interface ObservableSignal {
  id: string;
  /** Short noun phrase, as it reads mid-sentence. */
  label: string;
  /** The question the engine asks of the site. Shown as the reasoning. */
  question: string;
  /** Whether a detector can settle this today. See the file comment. */
  provable: boolean;
  /** What the probe measured, when it measured anything. */
  detected?: (r: ReadResult) => boolean;
  /** How the check is described to the user. */
  how: string;
  /** Criterion text when the offer needs the signal to be *missing*. */
  absenceText: string;
  /** Criterion text when the offer needs the signal to be *present*. */
  presenceText: string;
  /** The business consequence of the signal being absent. A "likely", not a
   *  fact: we observed the gap, not its effect. Phrased so the reader can
   *  check it against their own operation. */
  costsWhenMissing: string;
  /** Recognises this signal in a criterion's own wording. */
  inCriterion: RegExp;
  /** Recognises this signal in a free-text description of what someone sells. */
  inOffer: RegExp;
  /** Only for `provable: false`: what it would take to settle it. */
  wouldTake?: string;
  /**
   * Which side of this signal an offer is needed on. Defaults to `absence`.
   *
   * Nearly every entry here is a gap somebody sells into: you sell booking
   * software to practices that have none. **`builder` is the other kind** — a
   * web designer wants the sites that *are* on Wix, not the ones that are not
   * — and before this field the catalogue had no way to say so, so
   * `inferFromOffer` turned "we rebuild outdated websites" into "is not on a
   * website builder", which is the opposite of the ask.
   */
  offerNeeds?: "absence" | "presence";
  /**
   * The evidence is in the **source of every page**, not on one page a link
   * leads to. A website builder stamps its own markup into whatever it serves,
   * so the HTML we already fetched settles the question both ways: found is
   * present, not found on the pages read is absent, with no model call.
   *
   * Why this needs saying (measured 2026-11-01): the judge hands the model the
   * page *text*, with scripts and markup stripped, so for a builder question
   * the model is shown everything except the evidence. Of the 20 production
   * reads that opened pages and still came back "couldn't tell", 17 were
   * builder questions. The absence rule is not bent: the relevant pages for
   * this signal are any page's source, and those were read.
   */
  inSource?: boolean;
  /**
   * For an `inSource` signal: something in the source that might be this
   * signal under a name we do not know. When it fires, absence is **not**
   * settled from the source and the read goes to the model as before.
   */
  sourceHint?: (r: ReadResult) => boolean;
  /**
   * Settled from what the read learned about the **site itself** — public DNS
   * and the security certificate (`ReadResult.health`) — never from its words,
   * and never by a model. See `secure_site`.
   */
  fromHealth?: boolean;
  /**
   * Words that name this signal's **absence** without a negation word in
   * them. "Down", "broken", "insecure" mean *no* working, secure site, and the
   * parser finds absence only by looking for "no"/"not"/"without", so without
   * this "has a website that is down" was parsed as the opposite — caught on
   * production 2026-11-02, minutes after the criterion shipped. Combined with
   * negation by exclusive-or, so "is not down" still means working.
   */
  inverse?: RegExp;
  /**
   * The row's "why", when the generic template would garble it. Generalised:
   * it names no business, quotes nothing, and is shown on locked rows. Keyed by
   * the criterion type that matched.
   */
  matchWhy?: { absence: string; presence: string };
}

export const SIGNALS: ObservableSignal[] = [
  {
    id: "booking",
    label: "online booking",
    question: "Can a customer book an appointment without phoning?",
    provable: true,
    detected: (r) => r.booking || r.vendors.length > 0,
    how: "Looks for a booking widget, a Book Now link, or booking software on the site.",
    absenceText: "has no online booking",
    presenceText: "has online booking",
    costsWhenMissing:
      "every appointment has to be taken by phone, so enquiries that arrive " +
      "outside opening hours wait for a call back",
    // Plurals are explicit: `\breview\b` can never match "reviews", which is
    // how a user would actually write it.
    inCriterion: /\b(online bookings?|book online|booking (widget|system|software)s?|appointments?)\b/i,
    inOffer:
      /\b(booking|scheduling|schedul\w*|appointment|calendar|reception|receptionist|answer\w* (calls|the phone)|missed calls?|after[- ]hours)\b/i,
  },
  {
    id: "quote_form",
    label: "a way to request a quote online",
    question: "Can a prospect ask for a price without phoning?",
    provable: true,
    detected: (r) => r.quote,
    how: "Looks for a quote, estimate or request-a-price route on the site.",
    absenceText: "has no quote form",
    presenceText: "has a quote form",
    costsWhenMissing:
      "a prospect who wants a price has to call during business hours, and the " +
      "ones who will not call reach whoever answers first instead",
    inCriterion: /\b(quotes?|quote forms?|estimates?|request a price|pricing forms?)\b/i,
    inOffer: /\b(quote|estimate|lead (capture|form|gen\w*)|enquir\w+|inquir\w+|intake)\b/i,
  },
  {
    // **Proposed by the GTM stream, 2026-11-02, from its own measurements:**
    // 8–14% of the websites listed for businesses in customer trades do not
    // exist any more, and 7 of 50 failed reads were broken certificates. For
    // anyone selling websites, hosting or marketing that is the strongest lead
    // there is, and it costs nothing to prove: the read already asks.
    //
    // **The signal is the working, secure site**, so the lead is its absence,
    // as with every gap here. Both verdicts need positive proof, and neither is
    // ever "couldn't tell" dressed up:
    //   - missing  ← public DNS says the name does not exist or points nowhere,
    //               or the certificate failed with a named error;
    //   - present  ← a page loaded over https and the certificate passed.
    // Our own failures (a timeout, our resolver, a lookup we could not make)
    // prove neither and stay "couldn't tell".
    id: "secure_site",
    label: "a working, secure website",
    question: "Does their website still exist, and does it load without a security warning?",
    provable: true,
    fromHealth: true,
    inverse: /^(down|offline|broken|insecure|not secure|dead)/i,
    detected: (r) => r.health?.httpsOk === true && !r.health?.tls && !r.health?.dns,
    how: "Checks the listed address against public DNS and checks its security certificate when we open it.",
    absenceText: "has a website that is down or insecure",
    presenceText: "has a working, secure website",
    matchWhy: {
      absence: "Their listed website is down, or warns visitors that it is not secure.",
      presence: "Their website loads securely.",
    },
    costsWhenMissing:
      "anyone who looks them up finds nothing, or a browser warning, and most " +
      "people leave rather than call",
    inCriterion:
      /\b(down|offline|broken|insecure|not secure|ssl|https|certificates?|secure (web ?)?sites?|working (web ?)?sites?|dead (web ?)?sites?)\b/i,
    inOffer:
      /\b(hosting|ssl|https|certificates?|domains?|web ?site (maintenance|care|support|management|security)|website security|uptime)\b/i,
  },
  {
    id: "chat",
    label: "live chat",
    question: "Is there a chat widget or instant reply on the site?",
    provable: true,
    detected: (r) => r.chat,
    // A chat widget is a script on every page, and the judge shows the model
    // text with the scripts stripped, so it could never see one. Measured on 25
    // law firms against a rendered page: settling "no chat" from the source
    // was right for 19 of 20; the 20th loaded WhatsApp from script at runtime.
    inSource: true,
    sourceHint: (r) => r.chatHint === true,
    how: "Looks for a chat widget or messaging script in the page source.",
    absenceText: "has no live chat",
    presenceText: "has live chat",
    costsWhenMissing:
      "a question asked while nobody is at the phone has nowhere to land",
    inCriterion: /\b(chats?|live chat|messenger|live support)\b/i,
    inOffer: /\b(chat\w*|chatbot|messaging|instant repl\w+|website assistant)\b/i,
  },

  {
    id: "builder",
    label: "a DIY website builder",
    question: "Was this site assembled on a drag-and-drop website builder?",
    provable: true,
    // **The cheapest check in the catalogue.** The builder leaves its own
    // markup in the page source, so this settles with no model call at all and
    // cannot come back "couldn't tell" — `icpplan.ts` reports it as `observed`
    // rather than `read` for exactly that reason.
    detected: (r) => r.cms.some((c) => BUILDERS.has(c)),
    inSource: true,
    matchWhy: {
      absence: "Not built on a DIY website builder.",
      presence: "Built on a DIY website builder such as Wix or Squarespace.",
    },
    how: "Looks for the builder's own markup in the page source: Wix, Squarespace, GoDaddy, Webflow, Shopify, Duda or Weebly.",
    absenceText: "is not on a website builder",
    presenceText: "is on a website builder",
    // An offer about websites wants the ones that *are* on a builder.
    offerNeeds: "presence",
    costsWhenMissing:
      "the site was assembled from a template, so changing how it works usually " +
      "means rebuilding it rather than editing it",
    inCriterion: /\b(wix|squarespace|godaddy|webflow|shopify|website builder|drag[- ]and[- ]drop|template site)\b/i,
    inOffer:
      /\b(web ?site designs?|web designs?|redesigns?|rebuild(s|ing)? (their|the)? ?(web ?sites?)?|new web ?sites?|wix|squarespace|webflow)\b/i,
  },

  {
    id: "published_phone",
    label: "a phone number on their site",
    question: "Does the site publish a number you could ring?",
    provable: true,
    // Read off the page by `contacts.ts`, which refuses a number that neither
    // matches the listing nor sits beside a word like "call" in the listing's
    // own area code. So this is "they publish a number we could verify", not
    // "a ten-digit string appears somewhere".
    detected: (r) => (r.contacts?.phones.length ?? 0) > 0,
    how: "Reads the number off their own pages and checks it against the one on their listing.",
    absenceText: "publishes no phone number on their site",
    presenceText: "publishes a phone number on their site",
    offerNeeds: "presence",
    costsWhenMissing:
      "there is no number on the site to ring, so anyone who wants to speak to " +
      "them has to find one somewhere else",
    inCriterion: /\b(phone|telephone|number to (call|ring)|contact number|reachable by phone)\b/i,
    inOffer: /\b(cold call|calling|phone outreach|dialer|call list)\b/i,
  },
  {
    id: "published_email",
    label: "an email address on their site",
    question: "Does the site publish an address you could write to?",
    provable: true,
    detected: (r) => (r.contacts?.emails.length ?? 0) > 0,
    how: "Takes the address off a mailto: link or the page itself, ignoring the platform's own.",
    absenceText: "publishes no email address on their site",
    presenceText: "publishes an email address on their site",
    offerNeeds: "presence",
    costsWhenMissing:
      "there is no address on the site to write to, so the only way in is a " +
      "form or the phone",
    inCriterion: /\b(e-?mail(s| address)?|address to write|mailto)\b/i,
    inOffer: /\b(email outreach|cold email|sequenc\w+|newsletter|mail merge)\b/i,
  },

  // ---- Wanted, not provable today. Kept so the flow can say no. ----
  {
    id: "contact_form",
    label: "a contact form",
    question: "Is there any web form at all, other than a newsletter box?",
    provable: false,
    how: "Not settled today: the probe separates quote routes from newsletter " +
      "signups, but has no general contact-form detector.",
    absenceText: "has no contact form",
    presenceText: "has a contact form",
    costsWhenMissing:
      "the site offers no written way to get in touch",
    inCriterion: /\bcontact forms?\b/i,
    inOffer: /\bcontact forms?\b/i,
    wouldTake:
      "a form classifier that can tell a contact form from a newsletter box, " +
      "the bare <form> pattern was removed from the detector because it fired " +
      "on every mailing-list signup.",
  },
  {
    id: "mobile",
    label: "a mobile-ready site",
    question: "Does the site render for a phone?",
    provable: false,
    how: "Not settled today: the probe stores extracted facts, not layout.",
    absenceText: "is not mobile-ready",
    presenceText: "is mobile-ready",
    costsWhenMissing:
      "most of the traffic arrives on a phone and bounces",
    inCriterion: /\b(mobile|responsive|viewport)\b/i,
    inOffer: /\b(redesigns?|web ?designs?|rebuild(s|ing)?|modern\w* (the )?sites?|mobile)\b/i,
    wouldTake:
      "a viewport-meta and stylesheet check in the probe. Cheap, but unbuilt, " +
      "and a viewport tag is weak evidence of a site that actually works on a phone.",
  },
  {
    id: "stale",
    label: "a recently updated site",
    question: "Has the site been touched in the last few years?",
    provable: false,
    how: "Not settled today: no copyright-year or last-modified extraction.",
    absenceText: "has a site that looks abandoned",
    presenceText: "has a recently updated site",
    costsWhenMissing: "the site reads as abandoned to anyone who lands on it",
    inCriterion: /\b(stale|outdated|abandoned|old site|copyright year|recently updated)\b/i,
    inOffer: /\b(redesign|refresh|outdated|modernis|moderniz)\w*/i,
    wouldTake:
      "a copyright-year and Last-Modified read. Both are easy to fake and often " +
      "auto-generated, so this needs validation before it is trusted.",
  },
  {
    id: "reviews",
    label: "review collection",
    question: "Does the site ask customers for reviews, or show them?",
    provable: false,
    how: "Not settled today: no review-widget detector.",
    absenceText: "collects no reviews on the site",
    presenceText: "shows reviews on the site",
    costsWhenMissing: "social proof lives entirely off-site, where it is not controlled",
    inCriterion: /\b(reviews?|testimonials?|reputation)\b/i,
    inOffer: /\b(review\w*|reputation|testimonial\w*)\b/i,
    wouldTake: "a review-widget catalogue in tech_signals.py, in the same shape as booking.",
  },
];

export const SIGNAL_BY_ID: Record<string, ObservableSignal> = Object.fromEntries(
  SIGNALS.map((s) => [s.id, s]),
);

/** Which signal a criterion is about, by its own wording — never by its id.
 *
 *  Criterion ids are per-market strings from the fixtures; matching on them
 *  would tie this to four hand-written markets. The engine's rule is that any
 *  criterion in any vertical must work without a catalogue lookup, so the text
 *  is what is read. Returns null when nothing in the catalogue covers it, which
 *  callers must handle rather than guess. */
export function signalForCriterion(text: string): ObservableSignal | null {
  return SIGNALS.find((s) => s.inCriterion.test(text)) ?? null;
}
