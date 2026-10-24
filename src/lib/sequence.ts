/**
 * The cold sequence and the gates in front of it (GTM, outreach A3).
 *
 * Pure: the copy, the variables each lead carries, and the rules that decide
 * whether a prospect may be written to at all. `instantly.ts` does the
 * sending; `test_sequence.mjs` holds these.
 *
 * ## What the copy may and may not say
 *
 * - It names the agency's niche, its city and a count we measured. It never
 *   quotes the agency's own site back to it: measured on the first batch, a
 *   third of the quotes were menu fragments, and a cold email that quotes a
 *   nav bar is worse than one that quotes nothing.
 * - It sends people to try the product, never to a call. The owner's decision
 *   of 2026-10-15.
 * - The sender is a real person: the three inboxes belong to the owner's
 *   partners, sending under their own names, which is what CASL's sender
 *   identification asks for. The footer carries the postal address and a way
 *   to stop, which CASL and CAN-SPAM both require.
 * - Plain text, no tracking pixels, no rewritten links. Our own `/hi` page
 *   records the click, and tracking links cost deliverability.
 */

import { PLANS } from "@/lib/pricing";
import { looksLikeAgency, looksLikePerson } from "@/lib/prospects";

export const CAMPAIGN_NAME = "Small Fish · agencies · v1";
/** Named sales and growth leaders at companies that sell to small businesses,
 *  found through SuperSearch (owner's call, 2026-10-15). Its own campaign,
 *  because its copy speaks to a seller, not an agency. */
export const SELLER_CAMPAIGN_NAME = "Small Fish · sellers · v1";

/** Agencies that serve no one trade get the widget instead of a trade list:
 *  something free for their own site, which needs no niche to be specific. */
export const WIDGET_CAMPAIGN_NAME = "Small Fish · agencies · widget v1";

export type Audience = "agency" | "seller" | "widget";

/** CASL wants a mailing address; CAN-SPAM wants a physical postal address. */
export const POSTAL_ADDRESS = "52 Mabelle Ave, Etobicoke, ON M9A 4X9, Canada";

export interface Step {
  subject: string;
  body: string;
  /** Days to wait before the next step. */
  delay: number;
}

/**
 * ## Written like one person writing to another (owner, 2026-10-24)
 *
 * "The emails should sound like it's coming from a human." So: first person,
 * short lines, no "Hi {{companyName}} team", no sentence a brochure would
 * carry, one link per email, and a sign-off that is just the sender's name.
 * The footer is an ordinary line, not grey small print, which reads as a
 * newsletter.
 *
 * And it says only what is true. The first version opened "We read the
 * websites of the 3,147 dentists in Chicago": we *count* them, from open
 * listings data; the `/hi` page reads a handful when it is opened. Now it says
 * there are that many with a website, and that a few of them are in the link.
 *
 * Instantly re-syncs this copy onto the live campaigns every hour
 * (`ensureCampaign`), so it may use only the variables already stored on each
 * queued lead: no new `{{…}}` without a backfill.
 */
const sign = "{{sendingAccountFirstName}}";
const FREE = PLANS.find((p) => p.id === "free")!.credits;
const footer =
  `<br/><br/>--<br/>Small Fish, ${POSTAL_ADDRESS}<br/>` +
  `Reply "no" and I won't write again.`;

/**
 * Three steps, three to four days apart. Instantly fills `{{…}}` per lead from
 * `leadVariables`. Short on purpose: the first one fits on a phone screen.
 */
export const STEPS: Step[] = [
  {
    subject: "{{niche}} in {{city}}",
    body:
      "Hi there,<br/><br/>" +
      "I saw you do marketing for {{niche}}, so this might be handy.<br/><br/>" +
      "There are {{count}} {{niche}} in {{city}} with a website. I pulled a few that have no " +
      "{{gap}}, the ones I'd call first if I were you: {{listUrl}}<br/><br/>" +
      "No sign-up to look.<br/><br/>" +
      sign + footer,
    delay: 3,
  },
  {
    subject: "Re: {{niche}} in {{city}}",
    body:
      "Hi again,<br/><br/>" +
      "If those were useful, you can run the same search for any trade in any city. " +
      `The first ${FREE} that fit are free, no card: {{signUpUrl}}<br/><br/>` +
      sign + footer,
    delay: 4,
  },
  {
    subject: "Re: {{niche}} in {{city}}",
    body:
      "Last one from me. If {{city}} isn't where you work, or {{niche}} isn't your trade, " +
      "reply with the ones that are and I'll send that list instead.<br/><br/>" +
      sign + footer,
    delay: 0,
  },
];

/**
 * For a named person at a company that sells to the trade: greeted by first
 * name, and the pitch is their reps' list, not their clients'.
 */
export const SELLER_STEPS: Step[] = [
  {
    subject: "{{niche}} in {{city}}",
    body:
      "Hi {{firstName}},<br/><br/>" +
      "Your team sells to {{niche}}, so this might be handy.<br/><br/>" +
      "There are {{count}} {{niche}} in {{city}} with a website. I pulled a few that have no " +
      "{{gap}}, the ones I'd have a rep call first: {{listUrl}}<br/><br/>" +
      "No sign-up to look.<br/><br/>" +
      sign + footer,
    delay: 3,
  },
  {
    subject: "Re: {{niche}} in {{city}}",
    body:
      "Hi {{firstName}},<br/><br/>" +
      "Your reps can run this themselves for any trade and city, and say what to look for in " +
      `plain words, like "no online booking". The first ${FREE} that fit are free, no card: {{signUpUrl}}<br/><br/>` +
      sign + footer,
    delay: 4,
  },
  {
    subject: "Re: {{niche}} in {{city}}",
    body:
      "Last one from me. If another city or trade would be more useful, reply with it and " +
      "I'll send that list instead.<br/><br/>" +
      sign + footer,
    delay: 0,
  },
];

/**
 * For agencies that serve local businesses in general: give first. A free
 * check for their own site, already set up with their domain, then the
 * search once they have seen what it finds.
 */
export const WIDGET_STEPS: Step[] = [
  {
    subject: "something for {{companyName}}'s website",
    body:
      "Hi there,<br/><br/>" +
      "We made a small widget for agency websites. A visitor types in their own site and sees " +
      "whether it takes bookings online, has a quote form or live chat. If it doesn't, that's " +
      "a lead for you.<br/><br/>" +
      "Here it is with your name already on it: {{previewUrl}}<br/><br/>" +
      "Free, and one line to add if you like it.<br/><br/>" +
      sign + footer,
    delay: 4,
  },
  {
    subject: "Re: something for {{companyName}}'s website",
    body:
      "Hi again,<br/><br/>" +
      "The same check works on a whole city: every dentist, plumber or salon near you that's " +
      `missing online booking or a quote form, with a phone number. The first ${FREE} are free: {{signUpUrl}}<br/><br/>` +
      sign + footer,
    delay: 5,
  },
  {
    subject: "Re: something for {{companyName}}'s website",
    body:
      "Last one from me. If a list for one trade in one city would be more useful, reply with " +
      "both and I'll send it.<br/><br/>" +
      sign + footer,
    delay: 0,
  },
];

export const campaignFor = (a: Audience) =>
  a === "seller"
    ? { name: SELLER_CAMPAIGN_NAME, steps: SELLER_STEPS }
    : a === "widget"
      ? { name: WIDGET_CAMPAIGN_NAME, steps: WIDGET_STEPS }
      : { name: CAMPAIGN_NAME, steps: STEPS };

/** The widget campaign's variables: their domain, ready in the snippet. */
export function widgetVariables(p: Pick<Prospect, "domain">, site: string): Record<string, string> {
  const q = new URLSearchParams({ agency: p.domain });
  return {
    previewUrl: `${site}/embed/check?${q}`,
    widgetUrl: `${site}/check/widget?${q}`,
    signUpUrl: `${site}/app/find?${new URLSearchParams({ source: `outreach/widget/${p.domain}` })}`,
  };
}

/** New people a day the campaign can start: each gets three emails. */
export const newLeadsPerDay = (perInbox: number, inboxes: number) =>
  Math.ceil((perInbox * inboxes) / STEPS.length);

export const ROLE_ADDRESS =
  /^(info|hello|hi|hey|contact|connect|team|office|sales?|support|help|helpme|admin|marketing|ads|cs|inquiries|enquiries|customerservice|customercare|mail|general|studio|reception|service|booking|bookings|jobs|careers|director|dmca|legal|linkup|getbit|start|getstarted|newbusiness|partners?|media|press|billing|accounts?)@/i;

export interface Prospect {
  domain: string;
  name: string | null;
  email: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  status: string;
  list_token: string | null;
  list_query: string | null;
  list_readable: number | null;
  list_listings: number | null;
}

/** Why this prospect may not be written to, or null when it may. Every gate
 *  is a reason a human would give for not sending, said the same way. */
export function blocked(
  p: Prospect & { audience?: string | null },
  ctx: { suppressedDomains: Set<string>; suppressedEmails: Set<string> },
): string | null {
  if (p.status !== "found") return `status is ${p.status}`;
  if (!p.email) return "no address published on their own site";
  // 64% of the first batch were info@ and the like. They reach an inbox nobody
  // decides from, and they hurt the domain when nobody replies.
  if (ROLE_ADDRESS.test(p.email)) return "generic address, not a person";
  if (ctx.suppressedDomains.has(p.domain)) return "domain asked not to be contacted";
  if (ctx.suppressedEmails.has(p.email.toLowerCase())) return "address asked not to be contacted";
  // The widget needs no trade and no list: their own domain is the offer. With
  // no trade quote vouching for the read, it asks more of the address and the
  // name instead (measured: the generalist pool is noisy).
  if (p.audience === "widget") {
    if (!looksLikePerson(p.email)) return "address does not look like a person";
    if (!looksLikeAgency(p.name, p.domain)) return "does not call itself an agency";
    return null;
  }
  if (!p.niche) return "no niche strong enough to write about";
  if (!p.list_token || !p.list_query) return "their free list is not prepared";
  if (!p.city) return "no city";
  const count = p.list_readable ?? p.list_listings ?? 0;
  if (count < 20) return "too few businesses in their niche and city to be worth a list";
  if (ctx.suppressedDomains.has(p.domain)) return "domain asked not to be contacted";
  if (ctx.suppressedEmails.has(p.email.toLowerCase())) return "address asked not to be contacted";
  return null;
}

/** "the Phoenix law firm marketers" is not a company name, and neither is a
 *  title with a pipe in it. Instantly greets with this, so it is cut to the
 *  part before any separator, and dropped when it looks like a slogan. */
export function companyName(name: string | null, domain: string): string {
  const head = (name ?? "").split(/\s[|\-–:·]\s|\s\|\s?/)[0].trim();
  if (head && head.length <= 40 && head.split(/\s+/).length <= 5) return head;
  const d = domain.split(".")[0];
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/** The per-lead variables the steps use. */
export function leadVariables(
  p: Prospect,
  site: string,
  label: { niche: string; gap: string },
): Record<string, string> {
  const count = p.list_readable ?? p.list_listings ?? 0;
  const source = `outreach/${p.list_token}`;
  return {
    niche: label.niche,
    city: p.city ?? "",
    count: count.toLocaleString("en-US"),
    gap: label.gap.replace(/^(a|an) /i, ""),
    listUrl: `${site}/hi/${p.list_token}`,
    widgetUrl: `${site}/check/widget`,
    // PRD v2's entry is the two-field search; `source` names the email.
    signUpUrl: `${site}/app/find?${new URLSearchParams({ source })}`,
  };
}

/**
 * When sending may start, and how fast. Inboxes need two weeks of warm-up
 * before they carry cold mail; the six were created 2026-10-15 and Instantly
 * reports them still being set up, so the first send is no earlier than the
 * date below *and* only once Instantly says every inbox is ready.
 *
 * Then a ramp: a new domain that jumps from nothing to its ceiling is how a
 * domain gets burned. Per inbox per day, by week since go-live.
 */
export const GO_LIVE = "2026-11-02";
export const RAMP = [5, 10, 15, 20, 25];

export function dailyPerInbox(today: string, goLive = GO_LIVE): number {
  const days = Math.floor((Date.parse(today) - Date.parse(goLive)) / 86_400_000);
  if (days < 0) return 0;
  return RAMP[Math.min(Math.floor(days / 7), RAMP.length - 1)];
}
