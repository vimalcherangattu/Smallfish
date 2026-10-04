import { auth } from "@clerk/nextjs/server";

import Shell from "@/components/app/Shell";
import { accountForUser, balanceOf } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { PLANS } from "@/lib/pricing";

/**
 * The app shell — `PRODUCT-HANDOFF.md` §4.
 *
 * ## What this replaced
 *
 * A Tailwind sidebar of eight items, two of which were views of the same list
 * and one of which ("Reads") was the measurement rig showing through. §4 is
 * blunt about the count: *"Five items. Every time someone proposes a sixth, the
 * answer is that the product does one thing."*
 *
 * ## Why the chrome is here and the bare case is not a second layout
 *
 * §4 also has first run carry **no sidebar** — *"a navigation rail to five
 * empty destinations is worse than none"* — and a layout cannot opt out of
 * itself. `Shell` resolves it instead: it reads the path on the client and
 * takes `signedIn` from here, so `/app` with no account gets the appbar alone
 * and every other route keeps the rail. The alternative was eight pages each
 * re-declaring the chrome, which is eight places for it to drift.
 *
 * ## The credit pill is the real balance or it is absent
 *
 * Never a guess and never a placeholder: a counter that is wrong about money is
 * worse than no counter. Every failure here — no Clerk, no account, a database
 * that is briefly away — ends at the free allowance, which is what a signed-out
 * visitor actually has.
 */

export const metadata = { title: "Small Fish" };

/** The free plan's grant, from the pricing table rather than a literal — the
 *  footnote on the first-run screen promises this number and `/pricing` sells
 *  it, so three copies of "20" is three places for it to drift. */
const FREE_GRANT = PLANS.find((p) => p.id === "free")?.credits ?? 0;

async function wallet() {
  // Signed out: the pill is an offer, not a balance. It used to read
  // "3 of 3 free left", which was `FREE_PREVIEW` — the rows a stranger can see
  // without an account — wearing the free plan's clothes, on a screen whose own
  // footnote promises twenty. Two different numbers for two different things,
  // and the smaller one was being shown as the allowance.
  const out = { left: 0, of: FREE_GRANT, signedIn: false };
  if (!CLERK_ENABLED) return out;
  try {
    const { userId } = await auth();
    if (!userId) return out;
    const account = await accountForUser(userId);
    if (!account) return { ...out, signedIn: true };
    const balance = await balanceOf(account.id);
    return { left: balance, of: Math.max(balance, FREE_GRANT), signedIn: true };
  } catch {
    return out;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const w = await wallet();
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,300..700,0..100;1,9..144,300..700,0..100&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      {/* The designer's App v2 stylesheet. Its resets are scoped to `.sf`, so
          the screens still written in the Tailwind vocabulary are untouched. */}
      <link href="/app/kit.css" rel="stylesheet" />
      <Shell
        signedIn={w.signedIn}
        credits={w.signedIn ? { left: w.left, of: w.of } : null}
        freeGrant={FREE_GRANT}
      >
        {children}
      </Shell>
    </>
  );
}
