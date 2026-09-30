/**
 * Spending credits on a list of matched businesses — server-side only.
 *
 * ## Why this is not in the export route any more
 *
 * It was, and it was the only place it existed. `/api/export` charged; the push
 * route did not, and on the day `UNLOCKS_ENFORCED` went true the push route
 * would have refused every row as `not_unlocked` and reported a successful
 * delivery of nothing. That is the bug this file exists to make impossible: the
 * next surface — an API key, S3-01 — gets the charge by calling one function
 * rather than by somebody remembering.
 *
 * ## What it promises
 *
 *   - **Matched rows only**, and only ones this workspace does not already hold.
 *     Non-matches were never billable; `entitlement.ts` refuses them upstream.
 *   - **Once per business, ever.** `charge_for_match` refuses a second charge by
 *     primary key, so the twelve-month unlock is enforced in the database rather
 *     than remembered here. A row already unlocked comes back as paid and free.
 *   - **Partial, never all-or-nothing.** Somebody with eighteen credits looking
 *     at forty-two matches wants the eighteen. It charges what it can and says
 *     what it could not, rather than taking offence at its own pricing.
 *   - **Nothing, for a comped workspace** — the ledger still records the line at
 *     zero, see migration `0008`.
 */

import "server-only";

import { balanceOf, chargeMatch, isComped, type AccountRow } from "@/lib/accounts";
import { credits } from "@/lib/ledger";
import { bandForMarket } from "@/lib/unlock";
import type { Business, Criterion, Market } from "@/lib/types";

export interface ChargeOutcome {
  /** Rows the workspace now holds: newly charged, plus ones it already had. */
  paid: Business[];
  /** Rows it could not afford. Nothing was charged for these. */
  unpaid: number;
  /** Spent on this call, in ledger milli-credits. Zero for a comped workspace. */
  milliSpent: number;
  /** Credits per match on this market. */
  band: number;
  /** Balance after the call, in milli-credits. */
  balance: number;
  /** One sentence, in the user's terms. */
  note: string;
}

/**
 * Charge for as many of `rows` as the balance allows.
 *
 * Sequential on purpose. Each charge takes a row lock on the account, so firing
 * forty at once would serialise in the database anyway, while holding forty
 * connections to do it.
 */
export async function chargeLeads(args: {
  account: AccountRow;
  market: Market;
  criteria: Criterion[];
  /** The rows to charge for, already ordered by `matchedIn`. */
  rows: Business[];
  suppressed?: ReadonlySet<string>;
}): Promise<ChargeOutcome> {
  const { account, market, criteria, rows } = args;
  const { credits: band, deliveredRate } = bandForMarket(
    market,
    criteria,
    args.suppressed ?? new Set(),
  );

  const paid: Business[] = [];
  let unpaid = 0;
  let milliSpent = 0;

  for (const b of rows) {
    const result = await chargeMatch({
      accountId: account.id,
      businessId: b.id,
      quotedBandCredits: band,
      deliveredRate,
    });
    if (result.charged) {
      paid.push(b);
      milliSpent += result.milli;
    } else if (result.reason === "Already unlocked by this workspace.") {
      // Paid for before, inside the twelve-month window. Free, and included.
      paid.push(b);
    } else {
      unpaid += 1;
    }
  }

  const balance = await balanceOf(account.id).catch(() => 0);
  const comped = isComped(account);

  return {
    paid,
    unpaid,
    milliSpent,
    band,
    balance,
    note:
      unpaid > 0
        ? `${paid.length} of ${rows.length} are yours. The other ${unpaid} need ` +
          `${unpaid * band} more credit${unpaid * band === 1 ? "" : "s"} — you have ` +
          `${credits(balance)} left. Nothing was charged for them.`
        : comped
          ? `${paid.length} rows. This workspace is comped, so they cost nothing — ` +
            `the ledger records what they would have cost.`
          : `${paid.length} rows, ${credits(milliSpent)} credits. ${credits(balance)} left.`,
  };
}
