/**
 * What counts as one business for billing (S1-04).
 *
 * **Found by accident, and it is a real charge.** A privacy test flagged the
 * domain `eastvalleyimplant.com` appearing in an export beside a locked
 * record — which turned out not to be a leak but two Overture rows for one
 * practice, "East Valley Implant & Periodontal Center" and "Dr. Joseph Capps".
 * Widening the check found the same shape via shared phone numbers.
 *
 * Measured across the three markets, listings folded into the business
 * they belong to: **326 of dental Phoenix's 2,778 records with a website
 * (11.7%), 21 of Dallas med spa's 2,440 (0.9%), 10 of Tampa HVAC's 2,196
 * (0.5%).** Today only a few hundred businesses per market have been read, so
 * none is billable yet; at full coverage it is a percentage of every invoice,
 * charged twice for one lead.
 *
 * A product that bills per matched business has to know what one business is,
 * and the candidate source does not: Overture carries a row per listing, and a
 * practice with a named dentist, a second suite or an old record has several.
 * Charging per row would be charging for our supplier's duplicates.
 *
 * **Retraction, same day.** This file first said "one website is one business",
 * and called a chain billed once rather than per branch an acceptable cost. It
 * is not acceptable, and the cost is much larger than that sentence implied:
 * **23 Phoenix records share `aspendental.com`, 21 share `toothdoctorarizona.com`,
 * 59 Dallas med spas share `linktr.ee` and 31 share `vagaro.com`.** Those are
 * not duplicate listings. They are distinct practices — some a chain's real
 * branches, some unrelated businesses that happen to use the same booking
 * platform or link-in-bio page. Collapsing them would have hidden 22 real leads
 * behind one Aspen Dental row and merged 59 unrelated med spas into a single
 * "business". Under-billing was the smaller half of that mistake.
 *
 * **The rule is: one website *at one place* is one business.** Records sharing
 * a domain are the same business only when they are also essentially at the
 * same address — within `SAME_PLACE_METRES`. Where there is no website, the
 * record is its own business, because nothing else here merges reliably:
 * names differ by punctuation and addresses by suite line.
 *
 * Distance is what separates the two cases, and it separates them sharply.
 * Pairs sharing a domain, in dental Phoenix:
 *
 *                       same place (<200m)     20km or more apart
 *   groups of 2–3               245                   120
 *   groups of 4+                149                 1,012
 *
 * Small groups are mostly one practice listed twice. Large groups are branches
 * of a chain scattered across a metro — and the 149 co-located pairs inside
 * them are two listings of one branch, which is exactly what should still
 * merge. One rule covers both.
 */

import type { Business } from "@/lib/types";

/**
 * How close two listings on one domain must be to be one business.
 *
 * 200m is a building, not a neighbourhood: it merges a practice listed at
 * "1 Main St" and "1 Main St, Suite 4", and keeps two branches of a chain in
 * the same shopping district apart.
 */
export const SAME_PLACE_METRES = 200;

function metresBetween(a: Business, b: Business): number {
  const R = 6_371_000;
  const p = Math.PI / 180;
  const dLat = (b.lat - a.lat) * p;
  const dLon = (b.lon - a.lon) * p;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

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
  const byDomain = new Map<string, Business[]>();
  for (const b of businesses) {
    const key = billingKey(b);
    const list = byDomain.get(key);
    if (list) list.push(b);
    else byDomain.set(key, [b]);
  }

  const out: Grouped[] = [];
  for (const [key, rows] of byDomain) {
    // A record with no website is already alone, and so is a lone listing.
    if (rows.length === 1 || key.startsWith("id:")) {
      out.push({ key, all: rows, lead: rows[0] });
      continue;
    }
    // Within a domain, split by place. Single-linkage on 200m, which is what
    // keeps 23 Aspen Dental branches apart while still merging the two
    // listings of any one of them.
    const clusters: Business[][] = [];
    for (const b of rows) {
      const near = clusters.find((c) =>
        c.some((other) => metresBetween(other, b) <= SAME_PLACE_METRES),
      );
      if (near) near.push(b);
      else clusters.push([b]);
    }
    clusters.forEach((all, i) =>
      out.push({ key: clusters.length > 1 ? `${key}#${i}` : key, all, lead: all[0] }),
    );
  }

  return out.map((g) => ({
    ...g,
    lead: g.all.reduce((best, b) => (score(b) > score(best) ? b : best), g.all[0]),
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
