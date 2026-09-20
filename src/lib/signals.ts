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
    id: "chat",
    label: "live chat",
    question: "Is there a chat widget or instant reply on the site?",
    provable: true,
    detected: (r) => r.chat,
    how: "Looks for a chat widget or messaging script in the page source.",
    absenceText: "has no live chat",
    presenceText: "has live chat",
    costsWhenMissing:
      "a question asked while nobody is at the phone has nowhere to land",
    inCriterion: /\b(chats?|live chat|messenger|live support)\b/i,
    inOffer: /\b(chat\w*|chatbot|messaging|instant repl\w+|website assistant)\b/i,
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
      "a form classifier that can tell a contact form from a newsletter box — " +
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
    inOffer: /\b(redesign|web ?design|rebuild|modern\w* (the )?site|mobile)\b/i,
    wouldTake:
      "a viewport-meta and stylesheet check in the probe. Cheap, but unbuilt — " +
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
    inCriterion: /\b(stale|outdated|abandoned|old site|copyright year)\b/i,
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
