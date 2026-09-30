import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, addJobSites, jobFor, queueJob } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { estimateSeconds, worthLeaving } from "@/lib/jobs";
import { marketFor, unreadIn } from "@/lib/leads";
import { splitQuery } from "@/lib/query";
import { readsFor, resolveRegion, type Places } from "@/lib/region";
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
  let body: { query?: unknown; email?: unknown; deepen?: unknown };
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
      { ok: false, reason: "Sign in first — a read is queued against your workspace.", signIn: "/sign-in" },
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
        reason: rest.length
          ? `We have read ${(market?.counts?.read ?? 0).toLocaleString()} of these — ` +
            `your list is ready now, and there are ${rest.length.toLocaleString()} more to read.`
          : "We have already read this one — your list is ready now.",
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

  // How many sites this actually reads, from the same region maths the search
  // screen quotes. The estimate is derived from it, never rounded upward for
  // effect.
  const sites = readsFor(region);
  const seconds = estimateSeconds(sites);

  const id = await queueJob({
    accountId: acct.id,
    query,
    regionLabel: region.label,
    sites,
    estimateSeconds: seconds,
    notifyEmail: email(body),
  });

  return Response.json({
    ok: true,
    id,
    sites,
    seconds,
    worthLeaving: worthLeaving(sites),
    href: `/app/reads/${id}`,
  });
}
