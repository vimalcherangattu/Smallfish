import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, balanceOf, everGivenIds } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { parseSearch } from "@/lib/search";
import { SIGNALS } from "@/lib/signals";
import { splitQuery } from "@/lib/query";
import { resolveRegion, type Places } from "@/lib/region";
import { choices, matchRates, perHundred, sizeAsk } from "@/lib/sizing";
import { supplyFor } from "@/lib/supply";
import { matchTrade, pretty, type Taxonomy } from "@/lib/trades";
import { FREE_GRANT, toCredits } from "@/lib/wallet";
import type { MarketIndex } from "@/lib/types";

/**
 * What is out there, for any trade in any US city.
 *
 * ## The question this answers, and why it has to be a request
 *
 * Somebody with 120 credits wants 120 dentists in Dallas. Before they commit
 * anything they need three numbers that are true: how many there are, how many
 * of those we can read, and what 120 of them will cost in time. None of it can
 * be pre-computed — the taxonomy has 1,644 categories and `places-us.json` has
 * 2,398 cities, and a country-sized Overture scan takes 133 seconds, so a table
 * of every pair is not a thing that can exist. A city-sized one takes about
 * nine, which fits in a request with a spinner.
 *
 * ## It never starts anything
 *
 * This route reads. `/api/jobs` is the one that queues work and spends money,
 * and the split is deliberate: a count has to be free and repeatable, because
 * the whole point is that somebody can look before they buy.
 */

export const dynamic = "force-dynamic";
/** Denver dentists measured 9.4s end to end — four categories, 2,048 listings,
 *  one scan of the release. The platform default is well under that. */
export const maxDuration = 60;

async function json<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", name), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

async function account() {
  if (!CLERK_ENABLED) return null;
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) return null;
    return await accountForUser(userId);
  } catch {
    return null;
  }
}

/** The checks the engine can actually settle, for the screen to offer when the
 *  question is missing or is one we cannot answer. Derived from the catalogue,
 *  never a second list — `signals.ts` is the one place that decides. */
const settleable = () =>
  SIGNALS.filter((s) => s.provable).flatMap((s) => [
    { check: `${s.id}:absence`, text: s.absenceText, label: s.label },
    { check: `${s.id}:presence`, text: s.presenceText, label: s.label },
  ]);

export async function POST(req: Request) {
  let body: { query?: unknown; categories?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Expected JSON." }, { status: 400 });
  }

  const query = String(body.query ?? "").trim().slice(0, 300);
  if (query.length < 3) {
    return Response.json({ ok: false, reason: "Tell us what to look for." }, { status: 400 });
  }

  const [places, taxo, index] = await Promise.all([
    json<Places>("places-us.json"),
    json<Taxonomy>("trades.json"),
    json<MarketIndex>("index.json"),
  ]);

  const split = splitQuery(query);
  const region = places && split.where ? resolveRegion(places, split.where) : null;
  if (!region) {
    return Response.json(
      {
        ok: false,
        reason: `We could not place "${split.where || query}". A US city or state works.`,
      },
      { status: 400 },
    );
  }

  const trade = matchTrade(taxo, split.what);
  if (!trade.best) {
    return Response.json(
      {
        ok: false,
        // Not "we do not cover that". We cover any city; what is missing is a
        // kind of business in the listings, which is a different sentence and a
        // different thing for the person to do about it.
        reason: `We don't have "${split.what || query}" as a kind of business in the listings.`,
        hint: "Try the trade on its own, plumbers, dentists, roofers.",
      },
      { status: 404 },
    );
  }

  // A caller may override the categories: the screen names the group it chose
  // and offers the near misses, and picking one comes back here. Only ids from
  // the group we just computed are honoured, so this cannot be used to scan an
  // arbitrary slice of the release.
  const offered = new Set([
    ...trade.best.categories,
    ...trade.near.flatMap((g) => g.categories),
  ]);
  const asked = Array.isArray(body.categories)
    ? (body.categories as unknown[]).map(String).filter((c) => offered.has(c))
    : [];
  const categories = asked.length ? asked : trade.best.categories;

  // --- the question ---------------------------------------------------------
  //
  // `parseSearch` owns this: it reads the criterion out of the sentence,
  // decides presence against absence by looking for the negation, declines what
  // we will not do, and marks what the catalogue cannot settle. Its `what` and
  // `where` are ignored here — those come from `matchTrade` and
  // `resolveRegion`, which know about every trade and every city rather than
  // the four measured markets.
  const parsed = parseSearch(query);
  const declined = parsed.declined[0] ?? null;
  const criterion = parsed.criteria.find((c) => c.signalId && c.provable) ?? null;
  const unprovable = !criterion ? (parsed.criteria[0] ?? null) : null;

  const acct = await account();
  const [supply, balance, given] = await Promise.all([
    supplyFor(categories, region),
    acct ? balanceOf(acct.id) : Promise.resolve(0),
    acct && criterion
      ? everGivenIds(acct.id, { criterionId: `${criterion.signalId}:${criterion.type}` })
      : Promise.resolve(new Set<string>()),
  ]);

  // Signed out, size against what signing up grants rather than against zero.
  //
  // The first version used the balance unconditionally, so a visitor with no
  // account saw "0 credits", a single chip reading "1", and a button saying
  // **"Read for 0"** — on the screen whose whole job is to show them what they
  // would get. The free grant is the number that is true for them, and the
  // button beside it is the sign-up door.
  const credits = acct ? toCredits(balance) : FREE_GRANT;
  const rates = matchRates(index);

  // Businesses this workspace has already been given come off what is left to
  // find, so the number on screen is the number of *new* names — which is the
  // only number that means anything to somebody on their second search.
  const fresh = Math.max(0, supply.withSite - given.size);

  const sized = rates ? sizeAsk({ want: credits, withSite: fresh, rates }) : null;

  return Response.json({
    ok: true,
    query,
    trade: {
      typed: split.what,
      categories: categories.map((id) => ({ id, label: pretty(id) })),
      near: trade.near.map((g) => ({
        anchor: g.anchor,
        label: pretty(g.anchor),
        categories: g.categories,
        listings: g.n,
      })),
      how: trade.best.how,
    },
    region: { label: region.label, scope: region.scope, note: region.note },
    found: {
      listings: supply.listings,
      withSite: supply.withSite,
      /** Already given to this workspace, and therefore not offered again. */
      alreadyYours: given.size,
      fresh,
      ms: supply.ms,
    },
    question: criterion
      ? {
          check: `${criterion.signalId}:${criterion.type}`,
          text: criterion.text,
          how: criterion.how,
          type: criterion.type,
        }
      : null,
    /** Set when the sentence named something we will not or cannot settle. The
     *  screen says so instead of offering a button that cannot be honoured. */
    refused: declined
      ? { why: declined.why, source: declined.source }
      : unprovable
        ? {
            why: `We can't settle "${unprovable.text}" from a website today.`,
            source: unprovable.source,
          }
        : null,
    /** What the engine can settle, for when there is no question yet. */
    canCheck: criterion ? [] : settleable(),
    rates: rates
      ? { ...perHundred(rates), markets: rates.from.length, zeroes: rates.zeroes.length }
      : null,
    signedIn: !!acct,
    sizing: sized
      ? {
          ...sized,
          credits,
          choices: choices(credits, sized.ceiling.high),
        }
      : null,
  });
}
