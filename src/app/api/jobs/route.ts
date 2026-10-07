import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  accountForUser,
  addJobSites,
  balanceOf,
  everGivenIds,
  jobFor,
  queueJob,
} from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { criterionForCheck } from "@/lib/csvimport";
import { estimateSeconds, worthLeaving } from "@/lib/jobs";
import { marketFor, unreadIn } from "@/lib/leads";
import { READS_PER_CREDIT } from "@/lib/pricing";
import { splitQuery } from "@/lib/query";
import { CITY_CAP, resolveRegion, type Places } from "@/lib/region";
import { parseSearch } from "@/lib/search";
import { matchRates, sizeAsk } from "@/lib/sizing";
import { supplyFor } from "@/lib/supply";
import { matchTrade, type Taxonomy } from "@/lib/trades";
import { toCredits } from "@/lib/wallet";
import type { Market, MarketIndex } from "@/lib/types";

const email = (body: { email?: unknown }) =>
  typeof body.email === "string" && body.email.includes("@")
    ? body.email.trim().slice(0, 200)
    : null;

/**
 * Queue a read, or ask after one.
 *
 * ## Why a job rather than a response
 *
 * Reading every dental practice in Phoenix that has a website is 2,778 sites.
 * At the crawler's real settings that is about twenty-four minutes before a
 * model has judged anything, and a state is a couple of hours. Nothing about
 * that fits in a request, so the work gets a row and the person gets a page.
 *
 * ## What this route will not do
 *
 * Queue a job for work that is already finished. Three markets are read; a
 * search that lands on one of them is answered on the spot by `/app`, and
 * putting it behind a progress bar would be inventing a wait — which is the
 * one thing this flow was explicitly built not to do.
 */

export const dynamic = "force-dynamic";
/** The cold-city branch scans the Overture release: Denver dentists measured
 *  9.4s. The platform default is well under that. */
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

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const acct = await account();
  if (!acct) return Response.json({ ok: false, reason: "Sign in to see this." }, { status: 401 });

  const job = await jobFor(acct.id, id);
  if (!job) return Response.json({ ok: false, reason: "No such read." }, { status: 404 });
  return Response.json({ ok: true, job });
}

export async function POST(req: Request) {
  let body: {
    query?: unknown;
    email?: unknown;
    deepen?: unknown;
    want?: unknown;
    categories?: unknown;
    check?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Expected JSON." }, { status: 400 });
  }

  const query = String(body.query ?? "").trim().slice(0, 300);
  if (query.length < 3) {
    return Response.json({ ok: false, reason: "Tell us what to look for." }, { status: 400 });
  }

  const acct = await account();
  if (!acct) {
    return Response.json(
      { ok: false, reason: "Sign in first. A read is queued against your workspace.", signIn: "/sign-in" },
      { status: 401 },
    );
  }

  const [index, places] = await Promise.all([
    json<MarketIndex>("index.json"),
    json<Places>("places-us.json"),
  ]);

  const split = splitQuery(query);

  // ------------------------------------------------- reading the rest of it --
  //
  // "Already read" was never the whole truth, and the number on the results
  // screen says so: we have read **200** dental practices in Phoenix, and 2,778
  // of them have a website. The list is real and the other 2,578 are sitting
  // there unread.
  //
  // So a search that lands on a read market gets its list now — that part was
  // right, and putting a finished answer behind a progress bar would be
  // inventing a wait. But it can also ask for the rest, and that is the work the
  // worker exists to do. It is the only source of sites that needs no Overture
  // extraction and no upload: the candidates are already in the market file.
  const hit = marketFor(index, split.what, split.where);
  if (hit) {
    const market = await json<Market>(`${hit.market.id}.json`);
    const rest = market ? unreadIn(market) : [];

    if (!body.deepen || !rest.length) {
      return Response.json({
        ok: true,
        alreadyRead: true,
        // Not "we have already read this one".
        //
        // How much of a market we have been through is our queue depth, not the
        // customer's business. Every request is new to them, and telling them
        // their answer came out of a drawer reframes a finished list as a
        // leftover. The sentence says what they get, which is the only part
        // they asked about.
        reason: "Your list is ready.",
        remaining: rest.length,
        href: `/app?q=${encodeURIComponent(query)}`,
      });
    }

    const seconds = estimateSeconds(rest.length);
    const id = await queueJob({
      accountId: acct.id,
      query,
      marketId: hit.market.id,
      criterionId: hit.criterion.id,
      regionLabel: hit.market.metro,
      sites: rest.length,
      estimateSeconds: seconds,
      notifyEmail: email(body),
    });
    await addJobSites(
      id,
      rest.map((b, i) => ({
        business_id: b.id,
        name: b.name,
        site: b.site!,
        phone: b.phone ?? null,
        ordinal: i + 1,
      })),
    );

    return Response.json({
      ok: true,
      id,
      sites: rest.length,
      seconds,
      worthLeaving: worthLeaving(rest.length),
      href: `/app/reads/${id}`,
    });
  }

  const region = places && split.where ? resolveRegion(places, split.where) : null;
  if (!region) {
    return Response.json(
      { ok: false, reason: `We could not place "${split.where || query}". A US city or state works.` },
      { status: 400 },
    );
  }

  // ------------------------------------------------- any trade, any US city --
  //
  // ## What this branch used to do
  //
  // It called `queueJob` with `sites: readsFor(region)` and **never called
  // `addJobSites`**, because nothing could supply candidates for a city we had
  // not extracted by hand. The result was a job promising a thousand websites
  // with zero rows behind it: `takeSites` returns empty, the worker breaks out
  // of its loop on the first tick, and the progress screen reads **0 of 1,000**
  // for ever with no reason on it. Somebody ran exactly that — psychiatrists in
  // Dallas — and sat watching a bar that could never move. It was then changed
  // to decline honestly, which was better and still a dead end.
  //
  // `supply.ts` is the missing half. It reads the Overture release directly, so
  // the candidates are real businesses with real websites and no pre-extraction
  // step exists to be behind.
  //
  // ## The job is the same shape as a CSV upload
  //
  // `market_id: null` and a `signals.ts` check as the criterion id, which is
  // exactly what an upload job looks like — so `findCriterion` in the worker
  // route already resolves it and **the worker needed no change at all**.
  const taxo = await json<Taxonomy>("trades.json");
  const trade = matchTrade(taxo, split.what);
  if (!trade.best) {
    return Response.json(
      {
        ok: false,
        reason: `We don't have "${split.what || query}" as a kind of business in the listings.`,
      },
      { status: 404 },
    );
  }

  // The check, from the catalogue. `criterionForCheck` refuses anything
  // `signals.ts` marks unprovable, so a job cannot be created for a question
  // the engine cannot settle and then quietly read a thousand sites anyway.
  const asked = String(body.check ?? "").trim();
  const fromSentence = parseSearch(query).criteria.find((c) => c.signalId && c.provable);
  const check = asked || (fromSentence ? `${fromSentence.signalId}:${fromSentence.type}` : "");
  const criterion = check ? criterionForCheck(check) : null;
  if (!criterion) {
    return Response.json(
      {
        ok: false,
        reason:
          "We could not turn that into a check we can settle off a website. " +
          "Ask for online booking, a quote form or live chat, present or absent.",
      },
      { status: 422 },
    );
  }

  // Only categories from the group this trade resolves to, so the request
  // cannot name an arbitrary slice of the release.
  const allowed = new Set([
    ...trade.best.categories,
    ...trade.near.flatMap((g) => g.categories),
  ]);
  const chosen = Array.isArray(body.categories)
    ? (body.categories as unknown[]).map(String).filter((c) => allowed.has(c))
    : [];
  const categories = chosen.length ? chosen : trade.best.categories;

  const rates = matchRates(index);
  if (!rates) {
    return Response.json(
      { ok: false, reason: "We have nothing measured to size this against yet." },
      { status: 503 },
    );
  }

  const credits = toCredits(await balanceOf(acct.id));
  if (credits <= 0) {
    return Response.json(
      { ok: false, reason: "No credits left on this plan.", topUp: "/account" },
      { status: 402 },
    );
  }

  const want = Math.max(1, Math.min(Number(body.want ?? credits) || credits, credits));

  // Businesses this workspace has already been given are excluded in the
  // query, not after it — see `everGivenIds`. A second search for Dallas
  // dentists gets the next ones, never a pool that is mostly already theirs.
  const given = await everGivenIds(acct.id, { criterionId: check });

  // How much reading this is allowed to do, and all three bounds matter:
  //
  //   - what we told them on the screen (`sizing`'s pessimistic end, so the
  //     promise and the job are the same number),
  //   - what the region holds,
  //   - and `READS_PER_CREDIT` — the existing, derived solvency guardrail.
  //     Charging only for matches means a criterion nothing satisfies never
  //     depletes a balance, so the balance alone is not a bound.
  const sized = sizeAsk({ want, withSite: 1_000_000, rates });
  const budget = Math.min(sized.reads.high, credits * READS_PER_CREDIT, CITY_CAP * 5);

  const supply = await supplyFor(categories, region, {
    rows: true,
    limit: budget,
    exclude: given,
  });
  const rows = supply.rows ?? [];

  if (!rows.length) {
    return Response.json(
      {
        ok: false,
        reason: given.size
          ? `We have already read every ${split.what || "business"} in ${region.label} we can ` +
            `for that question. Try another city, or a different thing to look for.`
          : `We found no ${split.what || "businesses"} with a website in ${region.label}.`,
      },
      { status: 409 },
    );
  }

  const seconds = estimateSeconds(rows.length);
  const id = await queueJob({
    accountId: acct.id,
    query,
    // No market file exists for a cold city, and inventing an id for one would
    // send `findCriterion` looking for a file that is not there.
    marketId: null,
    criterionId: check,
    regionLabel: region.label,
    sites: rows.length,
    estimateSeconds: seconds,
    notifyEmail: email(body),
  });
  await addJobSites(
    id,
    rows.map((r, i) => ({
      business_id: r.id,
      name: r.name,
      site: r.site,
      phone: r.phone,
      ordinal: i + 1,
    })),
  );

  return Response.json({
    ok: true,
    id,
    sites: rows.length,
    want,
    seconds,
    worthLeaving: worthLeaving(rows.length),
    excluded: given.size,
    href: `/app/reads/${id}`,
  });
}
