import { auth } from "@clerk/nextjs/server";

import {
  accountForUser,
  balanceOf,
  NotConfigured,
  recordFeedback,
  refund,
} from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { credits } from "@/lib/ledger";

/**
 * Not a fit — refunded on the spot (P1).
 *
 * ## Why this is the trust move and not a nicety
 *
 * This product charges per matched business and argues that every match is
 * backed by a sentence off the company's own site. A customer who finds one
 * that is wrong has, at that moment, exactly one question: *does the evidence
 * mean anything, or is it decoration?* A product that makes them write in to
 * ask for 2 credits back has answered it.
 *
 * `refund_match` has done the money half since migration `0003` and **nothing
 * has ever called it**, because until 2026-09-30 nothing charged. Shipping the
 * paywall without this was the real gap.
 *
 * ## It refunds first and asks afterwards
 *
 * The reason is optional, sent in a second request, and cannot delay or block
 * the money. That ordering is the whole point: a refund that waits on a form is
 * not a refund on the spot.
 *
 * The reason is worth collecting anyway, and not as a satisfaction metric.
 * `PROJECT_PLAN.md` says hand-labelling for S0-16 "is human work and cannot be
 * automated away" — and a customer writing *"they do have booking, it is behind
 * the Patients menu"* is that label, from the person best placed to produce it,
 * at the moment they care most.
 *
 * ## What it does not do
 *
 * Refund twice, or refund something never charged. Both are `refund_match`'s
 * answers, under the account row lock, and this passes them through in the
 * customer's words rather than forming a second opinion.
 */

export const dynamic = "force-dynamic";

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
      { ok: false, reason: "Sign in first.", signIn: "/sign-in" },
      { status: 401 },
    );
  }

  let body: {
    business?: unknown;
    market?: unknown;
    criterion?: unknown;
    verdict?: unknown;
    kind?: unknown;
    reason?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const businessId = String(body.business ?? "").trim().slice(0, 120);
  if (!businessId) {
    return Response.json({ ok: false, reason: "Which business?" }, { status: 400 });
  }

  try {
    const account = await accountForUser(userId);
    if (!account) {
      return Response.json(
        { ok: false, reason: "You have no workspace yet." },
        { status: 409 },
      );
    }

    // The money first. Everything below is bookkeeping and may fail without
    // costing the customer anything.
    const result = await refund(account.id, businessId);

    // The label, if they gave one. Recorded whether or not the refund went
    // through: "already refunded" still means they are telling us this row is
    // wrong, and that is the half worth keeping.
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    const kind = String(body.kind ?? "not_a_fit").slice(0, 40);
    if (reason || result.refunded) {
      await recordFeedback({
        accountId: account.id,
        businessId,
        marketId: body.market == null ? null : String(body.market).slice(0, 80),
        criterionId: body.criterion == null ? null : String(body.criterion).slice(0, 80),
        verdictWas: body.verdict == null ? null : String(body.verdict).slice(0, 40),
        kind,
        reason: reason || null,
      }).catch(() => undefined);
    }

    const left = await balanceOf(account.id).catch(() => 0);

    return Response.json({
      ok: true,
      refunded: result.refunded,
      balance: left,
      note: result.refunded
        ? `Refunded ${credits(result.milli)} credits. It is off your list, and ` +
          `you can take it again later if you change your mind.`
        : // `refund_match`'s own words, in the customer's terms.
          result.reason === "Already refunded."
          ? "This one was already refunded."
          : result.reason === "Nothing was charged for this."
            ? "Nothing was charged for this one, so there is nothing to refund, it is off your list."
            : (result.reason ?? "That did not go through."),
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}
