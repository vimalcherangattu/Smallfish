import { auth } from "@clerk/nextjs/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, NotConfigured, recordRun, unlockedIds } from "@/lib/accounts";
import { chargeLeads } from "@/lib/charging";
import { CLERK_ENABLED } from "@/lib/clerk";
import { suppressedIds } from "@/lib/db";
import { bandForMarket, FREE_PREVIEW, matchedIn, visibleIds } from "@/lib/unlock";
import type { Market } from "@/lib/types";

/**
 * Take the rest of the list (P0.4).
 *
 * ## Why an action and not a page load
 *
 * Revealing rows as somebody scrolls would spend their credits by browsing,
 * which is the version of metered pricing everybody hates and nobody can
 * predict. The screen shows the count, the evidence and the first three matches
 * for nothing; this route is the one place a credit is spent on a name, and it
 * is spent because the person pressed a button that said how many and how much.
 *
 * ## It charges for the rows that were on the screen
 *
 * `matchedIn` and `visibleIds` are the same functions `buildLeads` used to draw
 * the page, called in the same order with the same suppression list, so "the 39
 * locked rows" here and "the 39 locked rows" there are the same 39 businesses.
 * That is the whole reason those functions are shared rather than copied.
 *
 * ## Partial is a success, not an error
 *
 * Eighteen credits against thirty-nine locked rows unlocks eighteen and says so.
 * `charge_for_match` refuses a charge it cannot cover, one row at a time, so
 * this needs no balance arithmetic of its own — the database is what decides,
 * under a row lock, and a second opinion here could only ever be wrong.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!CLERK_ENABLED) {
    return Response.json(
      { ok: false, reason: "Accounts are not switched on on this deployment." },
      { status: 503 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      {
        ok: false,
        reason:
          "Sign up to take the rest. The count, the evidence and the first " +
          `${FREE_PREVIEW} are free and need no account.`,
        signIn: "/sign-up",
      },
      { status: 401 },
    );
  }

  let body: { market?: unknown; criterion?: unknown; limit?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const marketId = String(body.market ?? "");
  if (!/^[a-z0-9-]+$/.test(marketId)) {
    return Response.json({ ok: false, reason: "Unknown market." }, { status: 400 });
  }

  let market: Market;
  try {
    market = JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", `${marketId}.json`), "utf8"),
    ) as Market;
  } catch {
    return Response.json({ ok: false, reason: `No market "${marketId}".` }, { status: 404 });
  }

  const criterionId = String(body.criterion ?? "");
  const criteria = market.criteria.filter((c) => !criterionId || c.id === criterionId);
  if (!criteria.length) {
    return Response.json({ ok: false, reason: "No such criterion." }, { status: 404 });
  }

  // How many of the locked rows to take. Absent means all of them; a number
  // bounded to the list so a made-up figure cannot ask for more than exists.
  const asked = Number(body.limit);
  const cap = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : Infinity;

  try {
    const account = await accountForUser(userId);
    if (!account) {
      return Response.json(
        {
          ok: false,
          reason:
            "You have no workspace yet. Open your account page once and it will " +
            "make one, then try again.",
        },
        { status: 409 },
      );
    }

    const { ids: suppressed } = await suppressedIds(
      (f) => readFile(f, "utf8"),
      path.join(process.cwd(), "public", "data"),
    );

    const matched = matchedIn(market, criteria, suppressed);
    const held = await unlockedIds(
      account.id,
      matched.map((b) => b.id),
    );
    // The free preview counts as visible here too. Charging for the three rows
    // the page already showed in full would be billing for something already
    // given away.
    const visible = visibleIds(matched, held);
    const locked = matched.filter((b) => !visible.has(b.id));
    const rows = Number.isFinite(cap) ? locked.slice(0, cap) : locked;

    if (!rows.length) {
      return Response.json({
        ok: true,
        unlocked: 0,
        unpaid: 0,
        note: "Nothing left to unlock — this list is already yours.",
      });
    }

    const charge = await chargeLeads({
      account,
      market,
      criteria,
      rows,
      suppressed,
    });

    if (charge.paid.length > 0) {
      await recordRun({
        accountId: account.id,
        marketId,
        criterionId: criteria[0].id,
        matched: matched.length,
        judged: bandForMarket(market, criteria, suppressed).judged,
      }).catch(() => undefined);
    }

    return Response.json({
      ok: true,
      unlocked: charge.paid.length,
      unpaid: charge.unpaid,
      band: charge.band,
      balance: charge.balance,
      note: charge.note,
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}
