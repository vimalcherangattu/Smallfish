import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { openSharedList } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { suppressedIds } from "@/lib/db";
import { handoffParams } from "@/lib/handoff";
import { buildLeads, type Contacts } from "@/lib/leads";
import type { Market, MarketIndex } from "@/lib/types";

/**
 * A list somebody shared with you.
 *
 * ## The flow document's shared view and the GTM plan's referral loop are one page
 *
 * A customer sends a list they are pleased with to somebody who would also want
 * it. The recipient sees the count, the reasoning and **three of the businesses
 * in full**, by name, with the sentence off their own site. Then they sign up
 * for the rest, carrying the sharer's token so the referral can be credited.
 * `docs/LAUNCH.md` had these as two separate missing things; building either
 * one builds the other.
 *
 * ## It shows what every other unpaid surface shows, and no more
 *
 * Three matches. **Not the sharer's paid list.** The rows they unlocked are
 * theirs, not theirs to redistribute, and a link that handed over forty paid
 * businesses would make the paywall a formality for anybody with one friend.
 *
 * That is not a special rule invented here: this page calls `buildLeads` with no
 * unlocks, which is exactly what a signed-out visitor to `/app` gets. A shared
 * list therefore cannot drift from the product, because it *is* the product with
 * an empty wallet.
 *
 * ## An unknown token and a revoked one look the same
 *
 * Both are `notFound`. Telling a stranger "this link was revoked" confirms it
 * once existed, and the person revoking it wanted it to stop meaning anything.
 */

export const dynamic = "force-dynamic";
export const metadata = {
  title: "A list shared with you | Small Fish",
  // A share link is passed between people, not indexed. It carries three real
  // businesses' names, and they did not agree to appear in a search result.
  robots: { index: false, follow: false },
};

async function json<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", name), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

const NICHE: Record<string, string> = {
  med_spa: "med spas",
  dental: "dental practices",
  hvac: "HVAC companies",
  veterinary: "vet clinics",
};

export default async function SharedListPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!CLERK_ENABLED || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();

  const shared = await openSharedList(token).catch(() => null);
  if (!shared) notFound();

  const [market, index, contacts, sup] = await Promise.all([
    json<Market>(`${shared.market_id}.json`),
    json<MarketIndex>("index.json"),
    json<{ contacts?: Contacts }>(`contacts-${shared.market_id}.json`),
    suppressedIds(
      (p) => readFile(p, "utf8"),
      path.join(process.cwd(), "public", "data"),
    ).catch(() => ({ ids: new Set<string>(), whyDegraded: null })),
  ]);
  if (!market) notFound();

  const criterion = market.criteria.find((c) => c.id === shared.criterion_id);
  if (!criterion) notFound();

  const niche = NICHE[market.niche] ?? market.niche.replace(/_/g, " ");
  const city = market.metro.split(",")[0].trim();
  const query = `${niche} in ${city} that ${criterion.text}`;

  // No unlocks: this is the product with an empty wallet, which is exactly what
  // a shared list is allowed to be.
  const result = buildLeads({
    query,
    index,
    market,
    contacts: contacts?.contacts ?? {},
    suppressed: sup.ids,
  });
  if (!result) notFound();

  const open = result.leads.filter((l) => !l.locked);
  const signUp = `/sign-up?${handoffParams({
    q: query,
    market: shared.market_id,
    criterion: shared.criterion_id,
    // Carries the token, so whoever shared it can be credited.
    source: `share/${token}`,
    sells: null,
  })}`;

  return (
    <div className="mx-auto max-w-[820px] px-6 py-12 sm:px-10">
      <p className="sf-label">
        {shared.label ? `Shared with you · ${shared.label}` : "Shared with you"}
      </p>
      <h1 className="sf-h1 mt-2">
        {result.leads.length.toLocaleString()} {niche} in {city} to call.
      </h1>
      <p className="sf-body mt-3 max-w-[62ch] text-[var(--ink-2)]">
        Every one of them {criterion.text.replace(/^has /, "has ")}, checked by
        reading their website, not by guessing. We read{" "}
        {result.read.toLocaleString()} of them to find these.
      </p>

      <p className="sf-small mt-3 max-w-[62ch] text-[var(--muted)]">
        {open.length} are below in full, by name. The rest are counted but not
        named: the person who shared this paid for their copy, and their copy is
        not theirs to hand on.
      </p>

      <ul className="mt-7 space-y-3">
        {open.map((l) => (
          <li key={l.id} className="sf-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="sf-h3">{l.name}</h2>
              {l.phone && (
                <span className="sf-small shrink-0 text-[var(--muted)]">{l.phone}</span>
              )}
            </div>
            <p className="sf-small mt-1.5 max-w-[62ch] text-[var(--ink-2)]">{l.why}</p>
            {l.message && (
              <p className="sf-small mt-3 whitespace-pre-line rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 leading-relaxed text-[var(--ink)]">
                {l.message}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="sf-card mt-7 p-6">
        <p className="sf-h3">
          {Math.max(0, result.leads.length - open.length).toLocaleString()} more,
          with names and numbers.
        </p>
        <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
          The free plan covers twenty of them. You are only charged for a
          business that matches, the ones that do not fit, and the ones we could
          not read well enough to say either way, cost nothing and are still
          reported.
        </p>
        <Link href={signUp} className="sf-btn sf-btn-primary mt-4 inline-block">
          Get your own list
        </Link>
      </div>

      {(result.unclear > 0 || result.didNotFit > 0) && (
        <p className="sf-small mt-6 text-[var(--muted)]">
          {result.didNotFit > 0 && (
            <>{result.didNotFit.toLocaleString()} were checked and didn&rsquo;t fit. </>
          )}
          {result.unclear > 0 && (
            <>
              {result.unclear.toLocaleString()} we couldn&rsquo;t read well enough
              to say either way, so they are left off rather than guessed at.
            </>
          )}
        </p>
      )}
    </div>
  );
}
