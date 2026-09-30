/**
 * What a credit buys, in one place (S1-06 × S1-08, P0.4).
 *
 * `entitlement.ts` answers *may this row leave*. This answers the two questions
 * that come before it: **which rows are we talking about, in what order**, and
 * **what does a row that has not been paid for look like**.
 *
 * ## Why the ordering lives here rather than in each surface
 *
 * There were two orderings, and they disagreed. `buildLeads` grouped every
 * listing into businesses and then kept the matches; `/api/export` kept the
 * matches and then grouped them. Those are not the same set. `groupForBilling`
 * picks a group's representative **by evidence first** — deliberately, so that a
 * paid-for match is never hidden behind an unread duplicate of itself — and
 * filtering before grouping throws that rule away, because the only records left
 * to choose from are the ones that already matched.
 *
 * While nothing was charged, the disagreement was invisible: both produced a
 * plausible list. The moment a credit is spent it stops being cosmetic, because
 * **the rows on the invoice have to be the rows on the screen.** So there is one
 * function, `matchedIn`, and the screen, the file, the push and the unlock all
 * call it.
 *
 * ## What a locked row shows
 *
 * The export route has told signed-out visitors this for months: *"the count and
 * the three example matches are free and need no account; names and contact
 * details are what a credit buys."* That sentence is now enforced rather than
 * asserted. A locked row keeps everything that is true of the market and
 * identifies nobody — how many pages were read, whether there is a phone, an
 * email, a drafted opener — and drops the name, the domain, the contacts, the
 * message and the quoted proof.
 *
 * The proof goes because it is a sentence lifted off their own site. Leaving it
 * on a locked row would hand over a search string that finds the business in one
 * query, which is the same leak as printing the domain.
 */

import { groupForBilling } from "@/lib/billing";
import { overallVerdict } from "@/lib/entitlement";
import { bandFor } from "@/lib/pricing";
import { applySuppression } from "@/lib/suppression";
import type { Business, Criterion, Market, VerdictKind } from "@/lib/types";

/**
 * Matched rows shown in full before anything is paid for.
 *
 * Three, not zero, and not twenty. Zero makes the screen a paywall in front of
 * a claim nobody can check, which is the thing this product is meant to be the
 * alternative to. Twenty is the whole free plan given away to anyone who never
 * signs in. Three is enough to read the evidence, the contact and the drafted
 * opener end to end and decide whether the rest is worth anything.
 */
export const FREE_PREVIEW = 3;

/**
 * The businesses that matched, one row per business, in the order every surface
 * must agree on.
 *
 * Grouped **before** filtering — see the note at the top of this file. Suppressed
 * businesses are removed here rather than by the caller, because a surface that
 * forgets is a broken promise with a seven-day deadline attached to it.
 */
export function matchedIn(
  market: Market,
  criteria: Criterion[],
  suppressed: ReadonlySet<string>,
): Business[] {
  const rows = applySuppression(
    groupForBilling(market.businesses).map((g) => g.lead),
    suppressed as Set<string>,
  );
  return rows.filter((b) => overallVerdict(b, criteria) === "match");
}

/**
 * The band this market earned, from what it actually delivered.
 *
 * There is no separate quote to honour on an already-read market: the confirm
 * screen quotes a band before a scan, and everything here is an unlock of a
 * market that has been read. `settleBand`, inside `chargeMatch`, takes the
 * cheaper of the quote and the delivered band, so passing the delivered band
 * cannot overcharge.
 */
export function bandForMarket(
  market: Market,
  criteria: Criterion[],
  suppressed: ReadonlySet<string> = new Set(),
) {
  const judged = market.businesses.filter((b) => {
    const v = overallVerdict(b, criteria) as VerdictKind;
    return v !== "unread" && v !== "needs_model";
  }).length;
  const matched = matchedIn(market, criteria, suppressed);
  const deliveredRate = judged > 0 ? matched.length / judged : 0;
  return {
    judged,
    matched,
    deliveredRate,
    credits: bandFor(deliveredRate).credits,
    label: bandFor(deliveredRate).label,
  };
}

/**
 * Which of these rows this workspace may see in full.
 *
 * `unlocked` is what the ledger says has been paid for — permanently, for twelve
 * months, whoever is looking. The preview is on top of it and is positional: the
 * first `FREE_PREVIEW` rows of the list, whichever they are. Positional rather
 * than a stored set on purpose, so that a visitor cannot walk the whole market
 * three rows at a time by changing the criterion and coming back.
 */
export function visibleIds(
  ordered: Business[],
  unlocked: ReadonlySet<string>,
  preview = FREE_PREVIEW,
): Set<string> {
  const out = new Set<string>();
  ordered.slice(0, preview).forEach((b) => out.add(b.id));
  for (const b of ordered) if (unlocked.has(b.id)) out.add(b.id);
  return out;
}

/** The rows a workspace would be charged for if it unlocked this list now. */
export const lockedIn = (ordered: Business[], visible: ReadonlySet<string>) =>
  ordered.filter((b) => !visible.has(b.id));
