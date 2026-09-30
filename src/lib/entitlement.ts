/**
 * Which rows may leave the product, in one place (S1-06, S1-09, S2-02).
 *
 * There are now two ways a business's name and contact details get out of Small
 * Fish — a CSV the customer downloads, and a push into their CRM or sending
 * tool. There will be more: an API is S3-01. Every one of them has to answer the
 * same three questions, and answering them separately is how the third surface
 * ships with the second one's bug.
 *
 *   1. **Did it match?** Only matched rows carry identities. A criterion nothing
 *      satisfies would otherwise hand over a whole market's names for free,
 *      which is the one attack the pricing has no answer to. `csv.ts` explains
 *      this at length; the rule lives here now and `csv.ts` calls it.
 *   2. **Did this business ask to be left out?** S1-09's list is checked here,
 *      not at the end of each exporter, because an exporter that forgets is a
 *      broken promise with a seven-day deadline attached to it.
 *   3. **Has the workspace paid for it?** See `UNLOCKS_ENFORCED` below, which is
 *      the uncomfortable part.
 *
 * Every refusal comes back with a code and a sentence. Nothing is dropped
 * silently: a file or a push that contains fewer rows than the screen showed,
 * without saying why, is how people stop trusting an export.
 */

import { BILLABLE, type Business, type Criterion, type VerdictKind } from "@/lib/types";

/**
 * Whether a row must be paid for before it can leave.
 *
 * **`true` since 2026-09-30.** The ledger had been finished for weeks and had
 * never been called by a customer action: the app runs on measured static data
 * and the CSV button built its file in the browser, so every matched row left
 * for nothing. A paid plan that changes nothing about what you can do is not a
 * pricing model, it is a pricing page.
 *
 * ## Flipping the constant was the smallest part of the change
 *
 * The comment this replaces said the flip was "small and known". It was wrong
 * in both directions, and the audit that flipped it is worth keeping:
 *
 *   - **The push route would have broken silently.** `toPushRows` calls
 *     `entitled()` with no `unlocked` set, so on the day of the flip every row
 *     would have been refused `not_unlocked` and every HubSpot push would have
 *     sent zero rows with a cheerful summary. Charging was wired into the
 *     export route only. It is now in `charging.ts`, which both call.
 *   - **The gate was decorative.** `/app` rendered the name, phone, email and
 *     drafted opener of every match. Gating the download while the screen shows
 *     everything is not billing; it is an inconvenience with a price on it. The
 *     screen withholds the same rows the file does — see `unlock.ts`.
 *   - **The screen and the file disagreed about which rows there were.** Two
 *     orderings, both plausible, invisible while nothing was charged. `matchedIn`
 *     is now the only one.
 *
 * What it changes about the product is deliberate: the count, the reasons and
 * the first three matches stay free and need no account, because a claim nobody
 * can check is worth nothing. Names and contact details are what a credit buys.
 * The free plan's 20 credits are the sample.
 */
export const UNLOCKS_ENFORCED = true;

export type RefusalCode =
  | "not_matched"
  | "suppressed"
  | "not_unlocked"
  | "duplicate_location";

export interface Refusal {
  businessId: string;
  code: RefusalCode;
  reason: string;
}

export interface Entitlement {
  /** Businesses this workspace has paid for. Consulted only when
   *  `UNLOCKS_ENFORCED`. */
  unlocked?: ReadonlySet<string>;
  /** Businesses that asked to be left out (S1-09). Always consulted. */
  suppressed?: ReadonlySet<string>;
}

/** The weakest verdict across the criteria asked for: a match needs all of them.
 *
 *  Lives here rather than in `csv.ts` because it is the first half of the
 *  question this module exists to answer, and two copies of it would drift. */
export function overallVerdict(b: Business, criteria: Criterion[]): VerdictKind {
  const kinds = criteria.map(
    (c) => (b.verdicts[c.id]?.verdict ?? "unread") as VerdictKind,
  );
  return kinds.includes("no_match")
    ? "no_match"
    : kinds.every((k) => k === "match")
      ? "match"
      : kinds.includes("blocked")
        ? "blocked"
        : kinds.includes("couldnt_tell")
          ? "couldnt_tell"
          : kinds.includes("needs_model")
            ? "needs_model"
            : "unread";
}

/** Why this row may not leave, or null if it may. */
export function refusalFor(
  b: Business,
  criteria: Criterion[],
  ent: Entitlement = {},
): Refusal | null {
  // Suppression is checked first, and the order matters. A business that asked
  // to be left out is left out whatever its verdict — checking the match first
  // would make the refusal reason depend on the criteria, and an owner asking
  // why they still appear deserves the same answer every time.
  if (ent.suppressed?.has(b.id)) {
    return {
      businessId: b.id,
      code: "suppressed",
      reason: "This business asked not to be listed, so it is left out of everything.",
    };
  }

  if (!BILLABLE[overallVerdict(b, criteria)]) {
    return {
      businessId: b.id,
      code: "not_matched",
      reason:
        "Not a match on the evidence, so its name is not yours to take. " +
        "The reason is in the counts.",
    };
  }

  if (UNLOCKS_ENFORCED && !ent.unlocked?.has(b.id)) {
    return {
      businessId: b.id,
      code: "not_unlocked",
      reason: "Not enough credits left to unlock this match.",
    };
  }

  return null;
}

/** Split a market into what may leave and why the rest may not. */
export function entitled(
  businesses: Business[],
  criteria: Criterion[],
  ent: Entitlement = {},
): { rows: Business[]; refused: Refusal[] } {
  const rows: Business[] = [];
  const refused: Refusal[] = [];
  for (const b of businesses) {
    const no = refusalFor(b, criteria, ent);
    if (no) refused.push(no);
    else rows.push(b);
  }
  return { rows, refused };
}

/** Refusals as counts by reason, which is what a customer is shown.
 *
 *  Counts, never identities — the same split `csv.ts`'s `nonMatchSummary`
 *  makes. "41 sites block automated reading" is useful and costs nobody their
 *  privacy; the 41 names behind it were not paid for. */
export function refusalSummary(refused: Refusal[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of refused) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
