import { auth } from "@clerk/nextjs/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, NotConfigured, recordRun } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import type { Market, VerdictKind } from "@/lib/types";

/**
 * Record that a search was run (S2-12).
 *
 * The counts are **recomputed here from the market on disk**, not taken from
 * the request. A client that could post its own tallies could write "412
 * matched" into its own history, and a history you can edit is not a record of
 * anything. What the body carries is which market, which criterion, and the
 * sentence the person typed to get there — three things only the client knows.
 *
 * Signing in is what buys history. An anonymous visitor still gets the whole
 * product, including the free count; they just have nowhere to keep it, which
 * is the ordinary bargain and not worth pretending otherwise with local
 * storage that vanishes on their next device.
 *
 * It answers 200 with `{ ok: false }` for every reason it did not record,
 * because the caller is a page that has already rendered and must not have its
 * results thrown away by a failure to write a history row. Nothing the user
 * came for depends on this succeeding.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!CLERK_ENABLED) {
    return Response.json({ ok: false, reason: "no accounts on this deployment" });
  }

  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return Response.json({ ok: false, reason: "not signed in" });
  }
  if (!userId) return Response.json({ ok: false, reason: "not signed in" });

  let body: {
    market?: unknown;
    criterion?: unknown;
    query?: unknown;
    scope?: unknown;
    regionLabel?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "send JSON" }, { status: 400 });
  }

  const marketId = String(body.market ?? "");
  const criterionId = String(body.criterion ?? "");
  if (!/^[a-z0-9-]+$/.test(marketId) || !/^[a-z0-9_-]+$/.test(criterionId)) {
    return Response.json({ ok: false, reason: "unknown market" }, { status: 400 });
  }

  let market: Market;
  try {
    market = JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", `${marketId}.json`), "utf8"),
    ) as Market;
  } catch {
    return Response.json({ ok: false, reason: "no such market" }, { status: 404 });
  }
  if (!market.criteria.some((c) => c.id === criterionId)) {
    return Response.json({ ok: false, reason: "no such criterion" }, { status: 404 });
  }

  // From the file, never from the body.
  const tallies = (market.tallies?.[criterionId] ?? {}) as Record<string, number>;
  const matched = tallies.match ?? 0;
  const judged = (["match", "no_match", "couldnt_tell", "blocked"] as VerdictKind[]).reduce(
    (n, k) => n + (tallies[k] ?? 0),
    0,
  );

  const scope = ["city", "state", "country"].includes(String(body.scope ?? ""))
    ? String(body.scope)
    : null;

  try {
    const account = await accountForUser(userId);
    if (!account) return Response.json({ ok: false, reason: "no workspace yet" });

    await recordRun({
      accountId: account.id,
      marketId,
      criterionId,
      // Trimmed and bounded: this is free text from a stranger that will be
      // rendered back onto their own history page.
      query: body.query ? String(body.query).slice(0, 300) : null,
      scope,
      regionLabel: body.regionLabel ? String(body.regionLabel).slice(0, 120) : null,
      matched,
      judged,
      tallies,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: "database not configured" });
    }
    throw err;
  }
}
