/**
 * What counts as one business for billing (S1-04).
 *
 * **Found by accident, and it is a real charge.** A privacy test flagged the
 * domain `eastvalleyimplant.com` appearing in an export beside a locked
 * record — which turned out not to be a leak but two Overture rows for one
 * practice, "East Valley Implant & Periodontal Center" and "Dr. Joseph Capps".
 * Widening the check found the same shape via shared phone numbers.
 *
 * Measured across the three markets, records sharing a website with another
 * record: **451 domains in dental, 163 in med spa, 151 in HVAC.** Today only a
 * few hundred businesses per market have been read, so exactly one duplicate
 * has actually been billable — 2.4% of that market's matches. At full coverage
 * that is a percentage of every invoice, charged twice for one lead.
 *
 * A product that bills per matched business has to know what one business is,
 * and the candidate source does not: Overture carries a row per listing, and a
 * practice with a named dentist, a second suite or an old record has several.
 * Charging per row would be charging for our supplier's duplicates.
 *
 * **The rule: one website is one business.** Where there is no website, the
 * record is its own business, because nothing else here is reliable enough to
 * merge on — names differ by punctuation and addresses by suite line.
 *
 * The known cost of this rule is a genuine multi-location chain on one domain,
 * which is charged once rather than once per branch. That is the right way to
 * be wrong: the user is buying someone to contact, and a chain on one domain
 * is one conversation. It is also visible rather than hidden — a grouped row
 * says how many locations it stands for.
 */

import type { Business } from "@/lib/types";

/** Bare host, lowercased, `www.` and path removed. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const bare = url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return bare.includes(".") ? bare : null;
}

/** The key two records must share to be one business for billing. */
export const billingKey = (b: Business): string =>
  hostOf(b.site) ?? `id:${b.id}`;

export type Grouped = {
  /** The record that represents the group: the one with the fullest detail. */
  lead: Business;
  /** Every record merged into it, `lead` included. */
  all: Business[];
  key: string;
};

/**
 * Collapse records that are the same business.
 *
 * The lead is chosen, not taken from whichever came first, and **the first
 * thing it is chosen for is evidence**. Records sharing a domain can carry
 * different verdicts — the real pair that started this is one record matched
 * and one never read — because which listings got crawled is an accident of
 * our ordering, not a fact about the business. One site is read once and has
 * one answer, so the group takes the answer of a record that actually has one.
 * Picking on completeness first would have hidden a paid-for match behind an
 * unread duplicate, which is the expensive direction to be wrong in.
 *
 * After that: a phone, then the longest address, then the longest name. A user
 * reading one row for a practice should get the most complete one, and the
 * group size tells them what was folded in.
 */
export function groupForBilling(businesses: Business[]): Grouped[] {
  const groups = new Map<string, Business[]>();
  for (const b of businesses) {
    const key = billingKey(b);
    const list = groups.get(key);
    if (list) list.push(b);
    else groups.set(key, [b]);
  }
  return [...groups.entries()].map(([key, all]) => ({
    key,
    all,
    lead: all.reduce((best, b) => (score(b) > score(best) ? b : best), all[0]),
  }));
}

/** Evidence first, then completeness. See `groupForBilling`. */
function score(b: Business): number {
  const decided = Object.values(b.verdicts ?? {}).some(
    (v) => v && v.verdict !== "unread",
  );
  return (
    (decided ? 1_000_000 : 0) +
    (b.phone ? 1000 : 0) +
    (b.addr?.length ?? 0) +
    (b.name?.length ?? 0) / 100
  );
}

/** How many records were folded away. What a per-row bill would have overcharged. */
export const duplicatesIn = (businesses: Business[]) =>
  businesses.length - groupForBilling(businesses).length;
