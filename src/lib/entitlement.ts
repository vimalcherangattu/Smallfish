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
 * **It is `false`, and that is a statement about the build rather than a
 * decision about the product.**
 *
 * The ledger is finished. `charge_for_match` holds the row lock, refuses a
 * double charge by primary key, and is append-only by trigger;
 * `pricing.ts` settles the band; `stage0/tests/test_ledger.mjs` and
 * `test_pricing.mjs` cover both. None of it has ever been called by a customer
 * action, because the app runs on measured static data and the CSV button
 * builds its file in the browser. So today **both surfaces hand over matched
 * rows without spending a credit**, and pushing rows to a CRM must not quietly
 * become the one surface that charges — a product where the export is free and
 * the integration is not has no pricing story anybody can say out loud.
 *
 * What flipping this to `true` requires is small and known: the CSV download
 * moves behind a route that calls `chargeMatch` for each matched row not
 * already unlocked, and the push route does the same. What it *changes* is not
 * small, and is not mine to decide — the free plan is 25 matches and the live
 * demo shows hundreds, so the day this flips, the site's front door behaves
 * differently.
 *
 * Until then the gate is one constant in one file, read by every surface, so
 * that it is wired once when the decision is made rather than three times.
 */
export const UNLOCKS_ENFORCED = false;

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
