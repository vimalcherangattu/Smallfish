import Shell from "@/components/app/Shell";
import { appWallet, FREE_GRANT } from "@/lib/wallet";

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
 * and every other route keeps the rail.
 *
 * ## The wallet is not computed here
 *
 * `lib/wallet.ts` owns it, because `/account` renders the same shell and the
 * two reading the balance separately is how one of them came to show
 * milli-credits as credits.
 */

export const metadata = { title: "Small Fish" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const w = await appWallet();
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&family=Libre+Franklin:wght@400;500;600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap"
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
