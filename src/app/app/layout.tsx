import Link from "next/link";

import AppNav from "@/components/AppNav";
import { CLERK_ENABLED } from "@/lib/clerk";

/**
 * The app shell.
 *
 * Until 2026-09-25 the product was one screen: a full-bleed map with a table
 * hanging off it and no way to get anywhere else. That is not a missing
 * dashboard, it is a missing product — there was nowhere to see what you had
 * run, nothing to come back to, and no sense that the thing had state.
 *
 * The shell is a sidebar and a content column, which is unremarkable on
 * purpose. `docs/design-system.md` §P6 — *twelve read well beats six hundred
 * listed* — is about the content, and content is easier to read when the
 * chrome around it is not competing.
 *
 * Signed out is not gated here. The free count is anonymous by design (see
 * `lib/clerk.ts`'s `PROTECTED`, which deliberately omits `/app`), so a stranger
 * gets the whole shell, runs a search, and is asked for an account only at the
 * point where something is unlocked.
 */

export const metadata = { title: "Small Fish" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <aside className="hidden w-[232px] shrink-0 border-r border-[var(--line)] bg-[var(--raised)] lg:block">
        <div className="sticky top-0 h-screen">
          <AppNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The small-screen bar. The sidebar is hidden below `lg` rather than
            turned into a drawer: a drawer is a component to maintain and a
            phone is not where anyone works a lead list. The links that matter
            are here. */}
        <div className="flex items-center gap-4 border-b border-[var(--line)] bg-[var(--raised)] px-4 py-3 lg:hidden">
          <Link href="/app" className="sf-h3">
            small fish
          </Link>
          <div className="sf-small ml-auto flex gap-4">
            <Link href="/app/search" className="text-[var(--ink-2)]">Search</Link>
            <Link href="/app/runs" className="text-[var(--ink-2)]">Runs</Link>
            <Link href="/account" className="text-[var(--ink-2)]">
              {CLERK_ENABLED ? "Account" : "Credits"}
            </Link>
          </div>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
