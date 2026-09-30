import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  accountForUser,
  balanceOf,
  contactedIds,
  isComped,
  unlockedIds,
} from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import LeadList from "@/components/LeadList";
import RecordRun from "@/components/RecordRun";
import QueueRead from "@/components/QueueRead";
import SearchBox from "@/components/SearchBox";
import { suppressedIds } from "@/lib/db";
import { buildLeads, marketFor, type Contacts } from "@/lib/leads";
import { splitQuery } from "@/lib/query";
import { readsFor, resolveRegion, type Places } from "@/lib/region";
import type { Market, MarketIndex } from "@/lib/types";

/**
 * The product, on one screen.
 *
 * ## What this replaced
 *
 * Three screens and about nine clicks: a dashboard of credit counters, a
 * confirm page quoting "1,000 websites, about $16.80 of reading", and a map
 * with radius buttons, a market dropdown, six verdict filter chips and a
 * footnote about Overture listings and the absence-proof rule. All of it was
 * true and most of it was ours to worry about, not the user's. Somebody came to
 * find dentists to call and had to operate a measurement rig first.
 *
 * Now: type a sentence, get the businesses. The engine is unchanged — this is
 * the same data, the same verdicts, the same refusals — but the page leads with
 * the answer and keeps the method one click behind it.
 *
 * ## Why the results render here rather than on `/app/search`
 *
 * A second route is a second page load and a second thing to look at. The box
 * submits to `/app?q=…`, which is this page, so the answer appears under the
 * box that asked for it. `/app/search` still resolves — old links and the
 * saved-run history point at it — and redirects here.
 *
 * ## Server component, on purpose
 *
 * The market files are megabytes and the browser needs forty rows. Everything
 * is assembled in `buildLeads` before a byte is sent, which is also why there
 * is no loading state: the list is in the HTML.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Find businesses — Small Fish" };

/**
 * The workspace's credits and unlocks, or the signed-out equivalent.
 *
 * Every failure mode lands on the same answer: not signed in, nothing unlocked,
 * no balance. That is the safe direction — the page withholds — and it is the
 * only way this screen survives a deployment without accounts, which is how it
 * runs locally and in every test.
 */
async function walletFor(businessIds: string[]) {
  const none = {
    signedIn: false,
    unlocked: new Set<string>(),
    contacted: [] as string[],
    balance: 0,
    comped: false,
  };
  if (!CLERK_ENABLED) return none;
  try {
    const { userId } = await auth();
    if (!userId) return none;
    const account = await accountForUser(userId);
    if (!account) return { ...none, signedIn: true };
    const [unlocked, balance, contacted] = await Promise.all([
      unlockedIds(account.id, businessIds),
      balanceOf(account.id),
      // Already reached out to. Never fails the page — an empty set shows
      // unticked boxes, which is wrong in the direction somebody can correct.
      contactedIds(account.id, businessIds).catch(() => new Set<string>()),
    ]);
    return {
      signedIn: true,
      unlocked,
      contacted: [...contacted],
      balance,
      comped: isComped(account),
    };
  } catch {
    return none;
  }
}

async function json<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", name), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

const LABEL: Record<string, string> = {
  med_spa: "Med spas",
  dental: "Dental practices",
  hvac: "HVAC companies",
  veterinary: "Vet clinics",
};

/** The searches that return something today, as sentences somebody would type
 *  rather than a list of market ids. */
function suggestions(index: MarketIndex | null) {
  if (!index) return [];
  const out: { q: string; n: number }[] = [];
  for (const m of index.markets) {
    for (const c of m.criteria) {
      const n = m.tallies?.[c.id]?.match ?? 0;
      if (n > 0) {
        const niche = (LABEL[m.niche] ?? m.niche.replace(/_/g, " ")).toLowerCase();
        const city = m.metro.split(",")[0].trim();
        out.push({ q: `${niche} in ${city} that ${c.text}`, n });
      }
    }
  }
  return out.sort((a, b) => b.n - a.n);
}

export default async function App({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const [index, places] = await Promise.all([
    json<MarketIndex>("index.json"),
    json<Places>("places-us.json"),
  ]);

  const split = splitQuery(query);
  const hit = query ? marketFor(index, split.what, split.where) : null;

  let result = null;
  let wallet = { signedIn: false, balance: 0, comped: false };
  let contacted: string[] = [];
  if (hit) {
    const [market, contacts, sup] = await Promise.all([
      json<Market>(`${hit.market.id}.json`),
      json<Contacts & { contacts?: Contacts }>(`contacts-${hit.market.id}.json`),
      suppressedIds(
        (p) => readFile(p, "utf8"),
        path.join(process.cwd(), "public", "data"),
      ).catch(() => ({ ids: new Set<string>(), whyDegraded: null })),
    ]);
    if (market) {
      // What this workspace has already paid for.
      //
      // **Nothing here may fail the page.** A signed-out visitor, a deployment
      // with no Clerk, a database that is briefly unreachable — all three end up
      // at "nothing unlocked", which withholds rather than reveals and still
      // shows the count, the evidence and the free preview. The alternative is a
      // 500 on the one screen the product is.
      const w = await walletFor(market.businesses.map((b) => b.id));
      wallet = { signedIn: w.signedIn, balance: w.balance, comped: w.comped };
      contacted = w.contacted;
      result = buildLeads({
        query,
        index,
        market,
        contacts: (contacts?.contacts ?? {}) as Contacts,
        suppressed: sup.ids,
        unlocked: w.unlocked,
      });
    }
  }

  // Somewhere real, but not read yet. Different sentence from "we don't know
  // where that is", and the difference is the whole product.
  const region = !hit && places && split.where ? resolveRegion(places, split.where) : null;
  const picks = suggestions(index);

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-10 sm:px-10">
      {!query && (
        <>
          <h1 className="sf-h1">Who do you want to find?</h1>
          <p className="sf-body mt-3 max-w-[58ch] text-[var(--ink-2)]">
            A trade, a place, and the one thing that makes a business worth your
            call. You get their number and a line to open with.{" "}
            <Link href="/app/upload" className="underline underline-offset-2">
              Or check a list you already have
            </Link>
            .
          </p>
        </>
      )}

      <div className={query ? "" : "mt-8"}>
        <SearchBox initial={query} />
      </div>

      {/* ------------------------------------------------------- the answer -- */}
      {result && result.leads.length > 0 && (
        <>
          <LeadList result={result} wallet={wallet} contactedIds={contacted} />
          {/* Kept beside the results, never in front of them: the history write
              must not be able to delay or break what the person came for. */}
          <RecordRun market={result.marketId} criterion={result.criterionId} />
        </>
      )}

      {/* A search we understood, in a place we know, that nobody has read yet. */}
      {query && !result && (
        <div className="sf-card mt-8 p-6">
          <p className="sf-h2">
            We haven&rsquo;t been through {split.what || "those"}
            {region ? ` in ${region.label}` : split.where ? ` in ${split.where}` : ""} yet.
          </p>
          <p className="sf-body mt-3 max-w-[64ch] text-[var(--ink-2)]">
            {split.where && !region ? (
              <>
                We couldn&rsquo;t place <strong>{split.where}</strong>. A US city
                or state works — try the city on its own.
              </>
            ) : (
              <>
                Nothing about your search is unusual; these are just the places
                we have finished. Tell us and we will put it next in the queue.
              </>
            )}
          </p>

          {/* A place we can put a number on: offer to read it, with the real
              cost in time. `readsFor` is the same region maths the API uses to
              size the job, so this button does not promise a different wait
              from the one the row records. */}
          {region && <QueueRead query={query} sites={readsFor(region)} />}

          {/* The one route that works for any city today, offered at the exact
              moment somebody discovers we have not read theirs. Reading a market
              cold needs candidates we extract; an uploaded list brings its own,
              so this is not a consolation — it is the faster path for anybody
              who already has a list. */}
          <p className="sf-small mt-4 text-[var(--muted)]">
            Already have a list of them?{" "}
            <Link href="/app/upload" className="underline underline-offset-2">
              Upload it and we will read every site on it
            </Link>{" "}
            — any city, starting now.
          </p>

          {picks.length > 0 && (
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <p className="sf-label">Ready right now</p>
              <div className="mt-3 flex flex-col gap-2">
                {picks.slice(0, 4).map((p) => (
                  <Link
                    key={p.q}
                    href={`/app?q=${encodeURIComponent(p.q)}`}
                    className="sf-small flex items-baseline justify-between gap-4 rounded-md border border-[var(--line)] px-3 py-2.5 hover:border-[var(--line-strong)]"
                  >
                    <span className="text-[var(--ink)]">{p.q}</span>
                    <span className="sf-data shrink-0 text-[var(--accent)]">{p.n}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------- the empty state -- */}
      {!query && picks.length > 0 && (
        <div className="mt-12">
          <p className="sf-label">Ready right now</p>
          <div className="mt-3 flex flex-col gap-2">
            {picks.map((p) => (
              <Link
                key={p.q}
                href={`/app?q=${encodeURIComponent(p.q)}`}
                className="sf-card flex items-baseline justify-between gap-4 p-4 hover:border-[var(--line-strong)]"
              >
                <span className="sf-body text-[var(--ink)]">{p.q}</span>
                <span className="sf-data shrink-0 text-[var(--accent)]">{p.n} to call</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
