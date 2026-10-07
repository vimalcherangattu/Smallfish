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
import RecordRun from "@/components/RecordRun";
import Discover from "@/components/app/Discover";
import FirstRun from "@/components/app/FirstRun";
import NotRead from "@/components/app/NotRead";
import Nothing from "@/components/app/Nothing";
import Results from "@/components/app/Results";
import { evidenceFor, prettyDay } from "@/lib/appview";
import { PLANS } from "@/lib/pricing";
import { suppressedIds } from "@/lib/db";
import { buildLeads, composeEmail, marketFor, type Contacts } from "@/lib/leads";
import { splitQuery } from "@/lib/query";
import { nearestCity, resolveRegion, type Places } from "@/lib/region";
import type { Business, Criterion, Market, MarketIndex } from "@/lib/types";

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

/** What signing up grants, from the pricing table — the same source the appbar
 *  pill and `/pricing` read, so the three cannot disagree. */
const FREE_GRANT = PLANS.find((p) => p.id === "free")?.credits ?? 0;
export const metadata = { title: "Find businesses | Small Fish" };

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

/** Whether there is a workspace to queue a read against. Same never-fail
 *  contract as `walletFor`: every failure mode lands on "not signed in", which
 *  shows the sign-up door rather than a button that cannot work. */
async function isSignedIn(): Promise<boolean> {
  if (!CLERK_ENABLED) return false;
  try {
    const { userId } = await auth();
    return !!userId;
  } catch {
    return false;
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
  let signedIn = false;
  let byId = new Map<string, Business>();
  let criterionRow: Criterion | null = null;
  let readOn: string | null = null;
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
      signedIn = w.signedIn;
      byId = new Map(market.businesses.map((b) => [b.id, b]));
      criterionRow = market.criteria.find((c) => c.id === hit.criterion.id) ?? null;
      // The market's read date, if any read in it carries one. Absent for
      // everything probed before the stamp existed — the head then says what
      // was found and no date, rather than borrowing the Overture release date.
      // See `appview.ts`'s `sourceLine`.
      readOn = (() => {
        const at = market.businesses.find((b) => b.read?.at)?.read?.at;
        return at ? prettyDay(at) : null;
      })();
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
  // Two keystrokes from a real city is not the same as nowhere. "pheonix".
  const meant = !hit && !region && places && split.where ? nearestCity(places, split.where) : null;


  // Nothing typed yet: the one question (§5.1).
  if (!query) return <FirstRun />;

  // --------------------------------------------- a trade and city we can read
  //
  // Nothing measured here, so this goes to the listings themselves. `Discover`
  // counts what is there, says how many of those have a website, and asks how
  // many the person wants — see `src/lib/supply.ts`.
  //
  // This used to be `NotRead`: "we can't start that from a city name yet",
  // because nothing could supply candidates for a city we had not extracted by
  // hand. `NotRead` now covers only the case below it, a place we could not
  // place at all.
  if (!result && region) {
    return <Discover query={query} signedIn={await isSignedIn()} />;
  }

  // We could not place what they typed. Nothing to count and nothing to offer
  // but a better spelling.
  if (!result) {
    return (
      <NotRead
        what={split.what}
        where={split.where}
        label={null}
        didYouMean={
          meant
            ? {
                label: meant.label,
                query: `${split.what} in ${meant.city.name}${
                  split.criterion ? ` that ${split.criterion}` : ""
                }`,
              }
            : null
        }
      />
    );
  }

  // Read, and nothing answered the way they asked (§5.6).
  if (result.leads.length === 0) {
    return (
      <Nothing
        what={result.what}
        where={result.where}
        criterion={result.criterionText}
        read={result.read}
        didNotFit={result.didNotFit}
        unsure={result.unsure}
      />
    );
  }

  // The answer (§5.2). Everything the row needs is assembled here, on the
  // server, from the market file — which is megabytes, against the forty rows a
  // browser actually needs.
  const rows = result.leads.map((lead) => {
    const b = byId.get(lead.id);
    return {
      lead,
      evidence:
        b && criterionRow
          ? evidenceFor(b, criterionRow)
          : ({ kind: "missing", why: "We have no record of reading this one." } as const),
      email: b && !lead.locked ? composeEmail(b, criterionRow!, { sells: null }) : null,
    };
  });

  return (
    <>
      <Results
        what={result.what}
        where={result.where}
        criterion={result.criterionText}
        readOn={readOn}
        rows={rows}
        unsure={result.unsure}
        didNotFit={result.didNotFit}
        read={result.read}
        marketId={result.marketId}
        criterionId={result.criterionId}
        // No price for somebody with no balance to spend it from: a signed-out
        // visitor pressing Download gets the sign-up door with the free-plan
        // number in it, which is a better sentence than a credit count they
        // cannot act on.
        exportCost={signedIn ? result.locked * result.creditsEach : 0}
        cost={
          result.locked > 0
            ? {
                preview: result.leads.length - result.locked,
                locked: result.locked,
                creditsEach: result.creditsEach,
                // Signed out, the next rows are granted, not sold. Signed in,
                // they are sold. Two different sentences and two different
                // buttons — see `CostBar`.
                freeGrant: signedIn ? null : FREE_GRANT,
              }
            : null
        }
      />
      {/* Beside the results, never in front of them: the history write must not
          be able to delay or break what the person came for. */}
      <RecordRun market={result.marketId} criterion={result.criterionId} />
    </>
  );
}
