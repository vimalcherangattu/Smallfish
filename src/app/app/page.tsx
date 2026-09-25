import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, balanceOf, destinationsFor, isComped } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { credits } from "@/lib/ledger";
import type { MarketIndex } from "@/lib/types";
import SearchBox from "@/components/SearchBox";

/**
 * The overview.
 *
 * It answers three questions in the order somebody actually asks them: what can
 * I do right now, what did I do last time, and what is this costing me. The
 * search box is first because the answer to the first question is always "run a
 * search" — a dashboard whose primary action is buried under its own statistics
 * has the priorities of the person who built it, not the person using it.
 *
 * **What is shown is what is true.** There is no placeholder card for a feature
 * that does not exist; where something is not built, the space it would take is
 * simply not there. A dashboard padded with empty widgets is how a product
 * feels unfinished even when it works.
 *
 * Server component: the account reads hold the service-role key.
 */

export const dynamic = "force-dynamic";

async function marketIndex(): Promise<MarketIndex | null> {
  try {
    const file = path.join(process.cwd(), "public", "data", "index.json");
    return JSON.parse(await readFile(file, "utf8")) as MarketIndex;
  } catch {
    return null;
  }
}

/** The markets with a criterion something actually settled. A market whose
 *  every verdict is `needs_model` has been listed, not read, and offering it
 *  hands somebody an empty result that looks like a bug. */
function readable(index: MarketIndex | null) {
  if (!index) return [];
  const out: { id: string; niche: string; metro: string; criterionId: string; text: string; matches: number }[] = [];
  for (const m of index.markets) {
    for (const c of m.criteria) {
      const matches = m.tallies?.[c.id]?.match ?? 0;
      if (matches > 0) {
        out.push({ id: m.id, niche: m.niche, metro: m.metro, criterionId: c.id, text: c.text, matches });
      }
    }
  }
  return out.sort((a, b) => b.matches - a.matches);
}

const LABEL: Record<string, string> = {
  med_spa: "Med spas",
  dental: "Dental practices",
  hvac: "HVAC companies",
  veterinary: "Vet clinics",
};
const label = (n: string) => LABEL[n] ?? n.replace(/_/g, " ");

export default async function Overview() {
  const index = await marketIndex();
  const markets = readable(index);

  let account: Awaited<ReturnType<typeof accountForUser>> = null;
  let milli = 0;
  let destinations = 0;
  if (CLERK_ENABLED) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) {
        account = await accountForUser(userId);
        if (account) {
          [milli, destinations] = await Promise.all([
            balanceOf(account.id),
            destinationsFor(account.id).then((d) => d.length),
          ]);
        }
      }
    } catch {
      // A database that is not configured on this deployment must not take the
      // page down — the search below needs none of it.
      account = null;
    }
  }

  const comped = account ? isComped(account) : false;

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10 sm:px-10">
      <h1 className="sf-h1">Find the businesses worth calling.</h1>
      <p className="sf-body mt-3 max-w-[60ch] text-[var(--ink-2)]">
        Say what you sell, where, and the one thing that decides whether a
        business is a fit. We read their websites and hand back only the ones
        that match, each with the sentence that proves it.
      </p>

      <div className="mt-8">
        <SearchBox />
      </div>

      {/* --------------------------------------------------- the workspace -- */}
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        <div className="sf-card p-5">
          <p className="sf-label">Credits</p>
          <p className="sf-h1 mt-2">{account ? credits(milli) : "—"}</p>
          <p className="sf-small mt-2 text-[var(--muted)]">
            {comped
              ? "Comped — matches cost this workspace nothing"
              : account
                ? "Only a proven match costs one"
                : CLERK_ENABLED
                  ? "Sign in to see your balance"
                  : "Accounts are not switched on here"}
          </p>
          {account && (
            <Link href="/account" className="sf-small mt-3 inline-block text-[var(--lure-text)]">
              Every line →
            </Link>
          )}
        </div>

        <div className="sf-card p-5">
          <p className="sf-label">Markets read</p>
          <p className="sf-h1 mt-2">{new Set(markets.map((m) => m.id)).size}</p>
          <p className="sf-small mt-2 text-[var(--muted)]">
            read in full, with every verdict on the page it came from
          </p>
          <Link href="/app/explore" className="sf-small mt-3 inline-block text-[var(--lure-text)]">
            Open one →
          </Link>
        </div>

        <div className="sf-card p-5">
          <p className="sf-label">Destinations</p>
          <p className="sf-h1 mt-2">{account ? destinations : "—"}</p>
          <p className="sf-small mt-2 text-[var(--muted)]">
            where matched rows go — HubSpot, a sequencer, or a webhook
          </p>
          <Link href="/app/destinations" className="sf-small mt-3 inline-block text-[var(--lure-text)]">
            {destinations ? "Manage" : "Connect one"} →
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------- already read ----- */}
      {markets.length > 0 && (
        <section className="mt-14">
          <h2 className="sf-h2">Read in full, right now</h2>
          <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
            These have been read end to end, so they open instantly and every
            verdict carries its evidence. Any other market works the same way —
            the thing you are looking for is read on the page, so nothing has to
            be built for a new one.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {markets.map((m) => (
              <Link
                key={`${m.id}:${m.criterionId}`}
                href={`/app/explore?market=${m.id}&criterion=${m.criterionId}`}
                className="sf-card flex items-baseline justify-between gap-4 p-5 hover:border-[var(--line-strong)]"
              >
                <span>
                  <span className="sf-h3">
                    {label(m.niche)} in {m.metro}
                  </span>
                  <span className="sf-small mt-1 block text-[var(--muted)]">{m.text}</span>
                </span>
                <span className="sf-data shrink-0 text-[var(--accent)]">{m.matches} matched</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
