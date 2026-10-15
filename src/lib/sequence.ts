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

export const CAMPAIGN_NAME = "Small Fish · agencies · v1";

/** CASL wants a mailing address; CAN-SPAM wants a physical postal address. */
export const POSTAL_ADDRESS = "52 Mabelle Ave, Etobicoke, ON M9A 4X9, Canada";

export interface Step {
  subject: string;
  body: string;
  /** Days to wait before the next step. */
  delay: number;
}

const sign = "{{sendingAccountFirstName}}<br/>Small Fish";
const footer =
  `<br/><br/><span style="color:#888;font-size:12px">${POSTAL_ADDRESS}. ` +
  `Not useful? Reply "no" and we won't write again.</span>`;

/**
 * Three steps, three to four days apart. Instantly fills `{{…}}` per lead from
 * `leadVariables`. Short on purpose: the first one fits on a phone screen.
 */
export const STEPS: Step[] = [
  {
    subject: "{{niche}} in {{city}}",
    body:
      "Hi {{companyName}} team,<br/><br/>" +
      "You do marketing for {{niche}}, so this might be useful. We read the websites of " +
      "the {{count}} {{niche}} in {{city}} and pulled out the ones with no {{gap}}.<br/><br/>" +
      "Here are a few, free: {{listUrl}}<br/><br/>" +
      "Each one comes with the reason it made the list, straight off their own site.<br/><br/>" +
      sign + footer,
    delay: 3,
  },
  {
    subject: "Re: {{niche}} in {{city}}",
    body:
      "Hi again,<br/><br/>" +
      "The full list is free to start, no card: {{signUpUrl}}<br/><br/>" +
      "You can also ask for any trade in any US city, and say what to look for in plain words, " +
      "like \"no online booking\" or \"no quote form\".<br/><br/>" +
      sign + footer,
    delay: 4,
  },
  {
    subject: "Re: {{niche}} in {{city}}",
    body:
      "Last note from me. If another city or another trade would be more useful, reply with it " +
      "and I'll send that list instead.<br/><br/>" +
      sign + footer,
    delay: 0,
  },
];

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
  p: Prospect,
  ctx: { suppressedDomains: Set<string>; suppressedEmails: Set<string> },
): string | null {
  if (p.status !== "found") return `status is ${p.status}`;
  if (!p.email) return "no address published on their own site";
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
    signUpUrl: `${site}/sign-up?${new URLSearchParams({ source, q: p.list_query ?? "" })}`,
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
