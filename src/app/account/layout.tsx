import Shell from "@/components/app/Shell";
import { appWallet, FREE_GRANT } from "@/lib/wallet";

/**
 * `/account` is an app screen and now looks like one.
 *
 * It sits outside `/app` for historical reasons — the marketing pages link to
 * it and so do Stripe's return URLs — so it did not inherit the app shell and
 * rendered as a bare marketing-chrome page with a back link to nowhere in
 * particular. Someone pressing **Credits and plan** in the sidebar left the
 * product and arrived at a ledger.
 *
 * This is the same shell and the same wallet; `Shell.derive` already maps
 * `/account` to the Credits and plan item, so the rail marks itself.
 */

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const w = await appWallet();
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&family=Libre+Franklin:wght@400;500;600;700&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap"
        rel="stylesheet"
      />
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
