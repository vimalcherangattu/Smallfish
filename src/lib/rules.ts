/**
 * The intake, turned into rules the engine can actually settle (PRD v2, step 3).
 *
 * ## What this adds that the catalogue never had: listing rules
 *
 * `signals.ts` is ten website signals, and every one of them costs a read to
 * answer. PRD v2's pipeline has a step before that — *"pre-filter with rules
 * (free). Drop permanently closed, wrong category, chains above a location
 * threshold, and anything failing a hard listing rule. No LLM here."* — and
 * nothing in the codebase could do it, because nothing modelled a rule that
 * the **listing** settles.
 *
 * That step is not a nicety, it is the margin. A listing rule costs nothing
 * and removes businesses before we pay $0.018 to read them, so "4+ stars"
 * applied first is the difference between reading 600 and reading 2,000. With
 * the floor at 70% (`MIN_GROSS_MARGIN`) that is the cheapest lever there is,
 * and the only one the customer experiences as the product being *better*
 * rather than smaller.
 *
 * ## Three sources, and the order is the cost
 *
 * - **listing** — rating, review count, a website at all, chain or not.
 *   Free, instant, and applied before anything is fetched.
 * - **website** — the `signals.ts` catalogue. Costs a read.
 * - **reviews** — what customers complain about. Costs the review pull, and
 *   only for businesses that already passed the read (see
 *   `REVIEWS_PER_MATCH`).
 *
 * A rule knows its own source, so `fit.ts` can say which were settled and the
 * worker can order the work cheapest first without a second table saying so.
 *
 * ## It still refuses out loud
 *
 * The one discipline carried over from `icp.ts` whole: an intake asking for
 * something no source settles comes back in `refused`, with what it would
 * take. Employee count is the standing example — Overture carries name,
 * category, website, phone, address and location, and nothing about size — and
 * the honest answer is to say so on the screen rather than quietly drop it and
 * hand over a list that does not mean what the customer asked for.
 */

import type { Candidate } from "@/lib/providers";
import { SIGNALS } from "@/lib/signals";
import type { Rule, RuleSource } from "@/lib/fit";

export type { Rule, RuleSource };

/** A rule the listing settles, with the predicate that settles it. */
export interface ListingRule extends Rule {
  source: "listing";
  /** `null` when the listing does not carry the field. Never a guess. */
  test: (c: Candidate) => boolean | null;
}

export interface Refusal {
  /** The words from the intake that triggered it. */
  asked: string;
  /** Why we cannot settle it, in the customer's terms. */
  why: string;
  /** What it would take, when there is an answer. */
  wouldTake?: string;
}

export interface Rules {
  rules: Rule[];
  listing: ListingRule[];
  refused: Refusal[];
}

/* ------------------------------------------------- what a listing settles -- */

const num = (text: string, re: RegExp): number | null => {
  const m = re.exec(text);
  const v = m?.[1] ? Number(m[1]) : NaN;
  return Number.isFinite(v) ? v : null;
};

/**
 * Listing rules, read off the intake.
 *
 * Deliberately a small, closed set. These are the fields a Maps listing
 * actually carries, and inventing a seventh would be the `provable: false`
 * mistake in a new place: a rule that reads plausibly and settles nothing.
 */
export function listingRulesFrom(text: string): ListingRule[] {
  const t = text.toLowerCase();
  const out: ListingRule[] = [];

  const stars = num(t, /(\d(?:\.\d)?)\s*\+?\s*(?:star|stars)/);
  if (stars !== null) {
    out.push({
      id: "rating_min",
      text: `rated ${stars} or better`,
      source: "listing",
      must: true,
      // Null, not false, when the provider gave no rating: Overture carries
      // none at all, so a false here would silently empty the whole pool the
      // moment the paid provider was switched off.
      test: (c) => (typeof c.rating === "number" ? c.rating >= stars : null),
    });
  }

  const reviews = num(t, /(\d+)\s*\+?\s*reviews?/);
  if (reviews !== null) {
    out.push({
      id: "reviews_min",
      text: `at least ${reviews} reviews`,
      source: "listing",
      must: true,
      test: (c) => (typeof c.reviews === "number" ? c.reviews >= reviews : null),
    });
  }

  if (/\bno website\b|\bwithout a website\b/.test(t)) {
    out.push({
      id: "no_site",
      text: "no website",
      source: "listing",
      must: true,
      test: (c) => !c.site,
    });
  } else if (/\bhas a website\b|\bwith a website\b/.test(t)) {
    out.push({
      id: "has_site",
      text: "has a website",
      source: "listing",
      must: true,
      test: (c) => Boolean(c.site),
    });
  }

  if (/\bnot a chain\b|\bindependent\b|\bno chains?\b|\bsingle location\b/.test(t)) {
    out.push({
      id: "independent",
      text: "independent, not a chain",
      source: "listing",
      must: true,
      // Settled across the pool rather than on one row — see `applyListing`.
      // A single listing cannot tell you it is a chain.
      test: () => null,
    });
  }

  return out;
}

/**
 * Chain-ness is a property of the pool, not of a row.
 *
 * One listing cannot tell you whether it is a branch. Several listings sharing
 * a normalised name can, and that is the only free way to know. The threshold
 * is three because two is a partnership and a second location as often as it
 * is a chain, and the rule's own wording is "not a chain".
 */
const CHAIN_AT = 3;

const bareName = (name: string): string =>
  name
    .toLowerCase()
    .split(/[-–—,(|]/)[0]!
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(llc|inc|pc|pa|dds|dmd|pllc|ltd|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Apply the free rules across a pool, before anything is fetched.
 *
 * Returns the survivors and why each of the rest went, so the screen can say
 * "320 of 2,048, because 1,500 are under 4 stars" rather than presenting a
 * smaller number with no account of it. A rule that cannot be settled for a
 * given row (`null`) **keeps** the row: the read decides it later, and
 * dropping on an absent field is the same mistake as calling a site we could
 * not open a "no".
 */
export function applyListing(
  pool: Candidate[],
  rules: ListingRule[],
): { kept: Candidate[]; dropped: Record<string, number> } {
  const counts = new Map<string, number>();
  for (const c of pool) {
    const n = bareName(c.name);
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  }

  const dropped: Record<string, number> = {};
  const kept = pool.filter((c) => {
    for (const r of rules) {
      const verdict =
        r.id === "independent" ? (counts.get(bareName(c.name)) ?? 1) < CHAIN_AT : r.test(c);
      if (verdict === false) {
        dropped[r.id] = (dropped[r.id] ?? 0) + 1;
        return false;
      }
    }
    return true;
  });
  return { kept, dropped };
}

/* ------------------------------------------------------- the whole intake -- */

/**
 * Things people ask for that no source we have can settle.
 *
 * Each one is a real sentence from the owner's own brief or the ICP flow, and
 * each is refused with the reason rather than dropped. `search.ts` already
 * refuses employee counts with a measured justification; this keeps the same
 * wording so a customer meets one answer, not two.
 */
const CANNOT: Array<{ re: RegExp; asked: string; why: string; wouldTake?: string }> = [
  {
    re: /\b(\d+\s*(?:to|-|–)\s*\d+\s*(?:employees|staff)|employee count|headcount|team size)\b/,
    asked: "employee count",
    why: "staff counts are rarely published and almost never current",
    wouldTake: "a payroll or filings source, which we do not have",
  },
  {
    re: /\b(revenue|turnover|annual sales|how much they make)\b/,
    asked: "revenue",
    why: "a small business does not publish what it earns",
  },
  {
    re: /\b(funding|raised|investors|vc[- ]backed)\b/,
    asked: "funding",
    why: "the businesses this product finds are not the kind that raise money",
  },
  {
    re: /\b(decision maker|job title|who runs it|owner'?s name)\b/,
    asked: "a named decision maker",
    why: "we read the name only when the business publishes it on its own site",
    wouldTake: "a people database, which is a different product and a different licence",
  },
];

/**
 * The intake, in: a line about what they sell and a line about a good
 * customer. Rules, out.
 *
 * Lexical today, and that is a deliberate first cut rather than the finish.
 * PRD v2 wants one model call to turn the intake into three to six rules, and
 * the seam for it is `rules` — this returns the same shape a model would, so
 * swapping the producer changes nothing downstream. Doing the lexical pass
 * first means the pre-filter, the ordering and the refusals are all testable
 * without a key, and the model lands against a settled contract.
 */
export function rulesFrom(args: { sells: string; wants: string }): Rules {
  const wants = (args.wants ?? "").trim();
  const sells = (args.sells ?? "").trim();
  const text = `${wants} ${sells}`.toLowerCase();

  const listing = listingRulesFrom(wants);

  // Website rules come from the catalogue, which already knows how to read an
  // offer and which way round the signal runs.
  const website: Rule[] = [];
  for (const s of SIGNALS) {
    if (!s.provable) continue;
    const named = s.inCriterion.test(wants) || s.inOffer.test(sells);
    if (!named) continue;
    const wantsAbsence =
      (s.offerNeeds ?? "absence") === "absence"
        ? !new RegExp(`\\b(has|with|uses)\\b[^.]{0,20}${s.id}`).test(text)
        : false;
    website.push({
      id: s.id,
      text: wantsAbsence ? s.absenceText : s.presenceText,
      source: "website",
      // A signal the customer named is something they asked for. Nice-to-have
      // is for rules we propose, not rules they typed.
      must: true,
    });
  }

  const refused: Refusal[] = [];
  for (const c of CANNOT) {
    if (c.re.test(text)) refused.push({ asked: c.asked, why: c.why, wouldTake: c.wouldTake });
  }
  for (const s of SIGNALS) {
    if (s.provable || !s.inCriterion.test(wants)) continue;
    refused.push({ asked: s.label, why: "we cannot settle this off a website today", wouldTake: s.wouldTake });
  }

  return { rules: [...listing, ...website], listing, refused };
}

/**
 * Cheapest first, so the work is ordered by what it costs to answer.
 *
 * Listing, then website, then reviews. The worker reads this rather than
 * holding its own opinion about ordering, because two places deciding the
 * order of the same work is how one of them ends up paying for a read the
 * other had already ruled out.
 */
const COST: Record<RuleSource, number> = { listing: 0, website: 1, reviews: 2 };
export const cheapestFirst = (rules: Rule[]): Rule[] =>
  [...rules].sort((a, b) => COST[a.source] - COST[b.source]);
