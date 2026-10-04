import "server-only";

import { accountForUser, balanceOf } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { MILLI } from "@/lib/ledger";
import { PLANS } from "@/lib/pricing";

/**
 * What the shell's credit pill says, for whichever screen is rendering it.
 *
 * ## The bug this exists to stop happening twice
 *
 * `balanceOf` returns **milli-credits**. `ledger.ts` stores money in thousandths
 * so that a quarter-credit unlock is an integer, and `/account` has always
 * divided by `MILLI` before showing a number. The App v2 shell did not, so a
 * workspace holding 2 credits read **"2000 of 2000 credits left"** — in the
 * appbar and again in the sidebar meter.
 *
 * The conversion now lives in one place that both layouts call, because the
 * only reliable way to stop a unit error recurring is to have one conversion.
 *
 * ## Every failure ends at the free offer
 *
 * No Clerk, no session, no account, a database briefly away: all of them land
 * on "not signed in, here is what signing up grants". That is the safe
 * direction — it understates what someone has rather than overstating it, and
 * a counter that is wrong about money is worse than no counter.
 */

export interface Wallet {
  /** Credits, not milli-credits. */
  left: number;
  /** The denominator the pill shows. */
  of: number;
  signedIn: boolean;
}

/** What signing up grants, from the pricing table rather than a literal. The
 *  first-run footnote promises this number and `/pricing` sells it. */
export const FREE_GRANT = PLANS.find((p) => p.id === "free")?.credits ?? 0;

/** Milli-credits to credits, rounded down: a balance of 1,999 milli buys one
 *  match, not two, and the pill must never promise the one it cannot. */
export const toCredits = (milli: number) => Math.floor(milli / MILLI);

export async function appWallet(): Promise<Wallet> {
  const out: Wallet = { left: 0, of: FREE_GRANT, signedIn: false };
  if (!CLERK_ENABLED) return out;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return out;
    const account = await accountForUser(userId);
    if (!account) return { ...out, signedIn: true };
    const left = toCredits(await balanceOf(account.id));
    return { left, of: Math.max(left, FREE_GRANT), signedIn: true };
  } catch {
    return out;
  }
}
