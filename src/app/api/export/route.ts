import { auth } from "@clerk/nextjs/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, NotConfigured, recordRun } from "@/lib/accounts";
import { chargeLeads } from "@/lib/charging";
import { CLERK_ENABLED } from "@/lib/clerk";
import { suppressedIds } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { UNLOCKS_ENFORCED } from "@/lib/entitlement";
import { bandForMarket, matchedIn } from "@/lib/unlock";
import type { Market } from "@/lib/types";

/**
 * The export, with the charge attached (S1-06 × S1-08).
 *
 * ## Why this route exists at all
 *
 * Until now the CSV was built in the browser from data the page already had, so
 * it cost nothing and touched no ledger. Every part of the billing system was
 * finished — `charge_for_match` holds the row lock, the ledger is append-only
 * by trigger, `pricing.ts` settles the band — and **none of it had ever been
 * called by a customer action.** A product whose paid plan changes nothing
 * about what you can do is not a product with a pricing model; it is a pricing
 * page.
 *
 * So the file is built here, and building it is what spends a credit.
 *
 * ## What it charges for, and what it does not
 *
 *   - **Matched rows only.** Non-matches were never billable and still are not;
 *     they leave as counts with reasons.
 *   - **Once per business, ever.** `charge_for_match` refuses a second charge by
 *     primary key, so re-exporting a market you already paid for is free. That
 *     is the 12-month unlock promise, enforced in the database rather than
 *     remembered by this route.
 *   - **One row per business, not per listing.** `groupForBilling` folds
 *     branches sharing a domain, so a chain is one credit and one row.
 *   - **Nothing, for a comped workspace.** The ledger still records the line at
 *     zero — see `0008`.
 *
 * ## When the balance runs out
 *
 * It exports what it could pay for and **says what it could not**, rather than
 * refusing the whole file. Somebody with eighteen credits looking at forty-two
 * matches wants the eighteen; handing them an error instead, having already
 * shown them the forty-two, would be the product taking offence at its own
 * pricing. The response carries the counts so the screen can say it plainly.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { market?: unknown; criterion?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const marketId = String(body.market ?? "");
  const criterionId = String(body.criterion ?? "");
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

  const criteria = market.criteria.filter((c) => !criterionId || c.id === criterionId);
  if (!criteria.length) {
    return Response.json({ ok: false, reason: "No such criterion." }, { status: 404 });
  }

  // One reader for both surfaces, and it reads the database as well as the
  // committed file — see `suppressedIds`. Hand-rolling this here read only the
  // file, so anyone who opted out since the last deploy would still have gone
  // out in an export.
  const { ids: suppressed } = await suppressedIds(
    (f) => readFile(f, "utf8"),
    path.join(process.cwd(), "public", "data"),
  );

  // Matched, not suppressed, one row per business — by `matchedIn`, which is the
  // same function the screen uses.
  //
  // This route used to filter to matches and *then* group. The screen grouped
  // and then filtered. Those are different sets, because `groupForBilling`
  // chooses a group's representative by evidence and filtering first removes
  // most of what it would have chosen from. It never mattered while the file was
  // free. It matters the moment a credit is spent, because the rows on the
  // invoice have to be the rows the customer was looking at.
  const leads = matchedIn(market, criteria, suppressed);

  // ---------------------------------------------------------- the free path --
  //
  // While unlocks are not enforced the file is the same one the browser used to
  // build, and nothing is spent. The flag lives in `entitlement.ts` with the
  // reasoning; this route is written so that flipping it is the only change
  // needed, rather than a rewrite under time pressure.
  if (!UNLOCKS_ENFORCED) {
    return csvResponse({
      market,
      criteria,
      rows: leads,
      // What is in the file, not what was billed for it. The header is read by
      // the analytics event, and reporting zero rows for a file with forty-two
      // in it would make every export look like a failure.
      charged: leads.length,
      unpaid: 0,
      milliSpent: 0,
      note: null,
    });
  }

  // ---------------------------------------------------------- the paid path --
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
          "Sign up to take the rows. The count, the evidence and the first three " +
          "matches are free and need no account; names and contact details are " +
          "what a credit buys, and the free plan covers twenty of them.",
        // Sign **up**, not sign in. A visitor who has reached the download
        // button on their first list does not have an account to sign in to,
        // and sign-up is the CTA everywhere else in the product.
        signIn: "/sign-up",
      },
      { status: 401 },
    );
  }

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

    // One charging loop for every surface — see `charging.ts`. The band it
    // settles is the delivered one, and `settleBand` inside `chargeMatch` takes
    // the cheaper of that and any quote, so this cannot overcharge.
    const charge = await chargeLeads({
      account,
      market,
      criteria,
      rows: leads,
      suppressed,
    });

    if (charge.paid.length > 0) {
      await recordRun({
        accountId: account.id,
        marketId,
        criterionId: criteria[0].id,
        matched: leads.length,
        judged: bandForMarket(market, criteria, suppressed).judged,
      }).catch(() => undefined);
    }

    return csvResponse({
      market,
      criteria,
      rows: charge.paid,
      charged: charge.paid.length,
      unpaid: charge.unpaid,
      milliSpent: charge.milliSpent,
      note: charge.note,
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}

function csvResponse(args: {
  market: Market;
  criteria: Market["criteria"];
  rows: Market["businesses"];
  /** Rows in the file. */
  charged: number;
  unpaid: number;
  milliSpent: number;
  note: string | null;
}) {
  const csv = toCsv(args.rows, args.criteria);
  // The counts travel in headers rather than the body, because the body is the
  // file the browser is about to save and must stay a valid CSV.
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="smallfish-${args.market.id}.csv"`,
      "X-Smallfish-Rows": String(args.charged),
      "X-Smallfish-Unpaid": String(args.unpaid),
      "X-Smallfish-Spent-Milli": String(args.milliSpent),
      ...(args.note ? { "X-Smallfish-Note": args.note } : {}),
    },
  });
}
