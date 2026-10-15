/**
 * The pool: how many of a kind of business exist in a place, and five of them.
 *
 * PRD v2's step 2, and the first thing a stranger sees. It has one job — make
 * the market feel real before anybody does any work — and one rule, which the
 * PRD states twice and which this file exists to keep:
 *
 * > **The pool count must be real.** Never invent it. A made-up number that
 * > later shrinks to 300 destroys trust in everything after it.
 *
 * ## The rising count is theatre we cannot honestly perform
 *
 * The PRD asks for a live estimate that rises — *"1,240+ and counting"* — then
 * the exact number when discovery finishes. That shape needs a source that
 * yields partial counts. **Ours does not.** The Overture read is one scan that
 * returns a total: there is no moment at which we truthfully know "at least
 * 1,240", so any number shown before it lands would be a guess dressed as a
 * measurement, which is the thing the same paragraph forbids.
 *
 * So the resolution is split from the count, and the fast half carries no
 * number at all:
 *
 * - **Resolve** (instant, two JSON reads): what we understood — the trade, the
 *   categories, the place. This is what lands well inside the PRD's five
 *   seconds, and it is the feedback that actually matters, because the thing a
 *   stranger is unsure of is whether we understood "plumers in dallas".
 * - **Count** (about nine seconds for a city): the true total, and how many of
 *   them have a website we could read.
 *
 * What the screen shows in between is "counting", not a number. Slower to a
 * digit, and the digit is true.
 *
 * ## Two numbers, because one of them is the one that matters
 *
 * "2,048 dentists in Austin" is the market. "1,838 of them have a website" is
 * what we can actually read, and it is the smaller, less flattering, more
 * useful number. Both are shown. Quoting only the first would be the
 * "we checked 2,800" overclaim this repository has already had to retract once.
 */

import type { Candidate } from "@/lib/providers";

export interface Understood {
  /** The category group we matched, as a person would say it. */
  trade: string;
  /** The Overture category ids behind it. Shown on request, not by default. */
  categories: string[];
  /** Other groups the words could have meant, best first. */
  near: string[];
  /** The place, as resolved. */
  where: string;
  /** city, county, state or radius — what kind of boundary this is. */
  kind: string;
}

export interface PoolSample {
  name: string;
  /** The neighbourhood or town, when the listing carries one. */
  town: string | null;
  rating: number | null;
  reviews: number | null;
  hasSite: boolean;
}

/**
 * Five businesses that make the pool feel real.
 *
 * Not `rows.slice(0, 5)`. The first five rows of a category scan are frequently
 * one chain's branches — five lines reading "Aspen Dental" tells somebody their
 * market is a franchise, which is a false impression created by row order. So:
 *
 * - **One per name.** Deduped case-insensitively on a normalised name, so
 *   "Aspen Dental" and "Aspen Dental - South" collapse.
 * - **One per town, while that lasts.** Spread across neighbourhoods first,
 *   then fill from whatever is left, so a dense suburb does not take all five.
 * - **Readable ones first.** A sample with a website is a sample the product
 *   could actually do something with; leading with sites we cannot open sets
 *   the wrong expectation on the very first screen.
 */
export function sampleRows(rows: Candidate[], n = 5): PoolSample[] {
  const seenName = new Set<string>();
  const seenTown = new Set<string>();
  const first: Candidate[] = [];
  const rest: Candidate[] = [];

  // Readable first, and within that the order the provider gave, which for
  // Overture is release order and carries no editorial meaning.
  const ordered = [...rows].sort((a, b) => Number(Boolean(b.site)) - Number(Boolean(a.site)));

  for (const r of ordered) {
    const name = normalise(r.name);
    if (!name || seenName.has(name)) continue;
    seenName.add(name);
    const town = townOf(r);
    if (town && !seenTown.has(town)) {
      seenTown.add(town);
      first.push(r);
    } else {
      rest.push(r);
    }
  }

  return [...first, ...rest].slice(0, n).map((r) => ({
    name: r.name.trim(),
    town: townOf(r),
    rating: typeof r.rating === "number" ? r.rating : null,
    reviews: typeof r.reviews === "number" ? r.reviews : null,
    hasSite: Boolean(r.site && r.site.trim().length > 3),
  }));
}

/**
 * A chain's branches collapse onto one name.
 *
 * Trailing location suffixes are what make "Aspen Dental" look like five
 * businesses. Cut at the first dash, comma or bracket, drop the punctuation,
 * fold the case. Crude on purpose: a false merge costs one sample slot, a false
 * split costs the whole impression the screen exists to give.
 */
const normalise = (name: string): string =>
  name
    .toLowerCase()
    .split(/[-–—,(|]/)[0]!
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(llc|inc|pc|pa|dds|dmd|pllc|ltd|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The town or neighbourhood off the address, or null.
 *
 * Overture addresses are "123 Main St, Austin, TX 78701", so the town is the
 * second comma field. Returning null rather than guessing is deliberate — the
 * sample row simply omits it, and `contacts.ts` already learned that a town
 * inferred wrongly is worse than one left out.
 */
function townOf(r: Candidate): string | null {
  const parts = (r.addr ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const town = parts[1];
  if (!town || /^\d/.test(town) || town.length < 2) return null;
  return town;
}

/**
 * The sentence over the count, with both numbers in it.
 *
 * `listings` is the market, `withSite` is what we can read. The second is
 * always the smaller and is never dropped, because every claim this product
 * makes downstream is about sites it opened.
 */
export function poolClaim(
  listings: number,
  withSite: number,
  trade: string,
  where: string,
): string {
  if (listings === 0) return `We found no ${trade} in ${where}.`;
  const n = listings.toLocaleString("en-US");
  const w = withSite.toLocaleString("en-US");
  if (withSite === 0) {
    return `${n} ${trade} in ${where}, and none of them has a website we can read.`;
  }
  return `${n} ${trade} in ${where}. ${w} have a website we can read.`;
}

/**
 * Is this pool worth going on with?
 *
 * Not a hard gate — somebody may well want the eleven roofers in a small town.
 * It is the difference between a screen that says "here is your market" and one
 * that says "this is thin, and here is why". `withSite` is the denominator that
 * matters: a thousand listings with no websites is not a market this product
 * can serve, and saying so now is cheaper than saying it after a read.
 */
export function thinness(listings: number, withSite: number): string | null {
  if (listings === 0) return "Nothing here. Try a nearby city, or a broader trade.";
  if (withSite === 0) {
    return "None of these has a website, so there is nothing for us to read. " +
      "This product cannot help with this one.";
  }
  if (withSite < 25) {
    return `Only ${withSite} have a website, so this is a small pool. ` +
      `Widening the area will find more.`;
  }
  return null;
}
