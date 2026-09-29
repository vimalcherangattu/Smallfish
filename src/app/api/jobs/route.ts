import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, jobFor, queueJob } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { estimateSeconds, worthLeaving } from "@/lib/jobs";
import { marketFor } from "@/lib/leads";
import { splitQuery } from "@/lib/query";
import { readsFor, resolveRegion, type Places } from "@/lib/region";
import type { MarketIndex } from "@/lib/types";

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
  let body: { query?: unknown; email?: unknown };
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

  // Already read? Then there is nothing to wait for, and saying so is the
  // honest answer even though a progress page would look more impressive.
  if (marketFor(index, split.what, split.where)) {
    return Response.json({
      ok: true,
      alreadyRead: true,
      reason: "We have already read this one — your list is ready now.",
      href: `/app?q=${encodeURIComponent(query)}`,
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

  const email = typeof body.email === "string" && body.email.includes("@")
    ? body.email.trim().slice(0, 200)
    : null;

  const id = await queueJob({
    accountId: acct.id,
    query,
    regionLabel: region.label,
    sites,
    estimateSeconds: seconds,
    notifyEmail: email,
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
