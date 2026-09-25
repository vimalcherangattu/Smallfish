import { auth } from "@clerk/nextjs/server";
import { startCheckout } from "@/lib/checkout";
import { accountForUser, NotConfigured } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { SITE } from "@/lib/site";

/**
 * Begin a purchase (S1-08).
 *
 * The workspace id comes from the **signed-in session**, never from the request
 * body. If the client could name the account, anybody could post this endpoint
 * with somebody else's workspace id and attach their card to it — or, more
 * likely to happen by accident, a stale tab could upgrade the wrong workspace.
 *
 * It refuses rather than redirecting a signed-out visitor to a payment page.
 * A checkout that begins before we know whose it is has nowhere to deliver the
 * credits.
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
      {
        ok: false,
        reason: "Sign in first — a payment needs a workspace to deliver credits to.",
        signIn: "/sign-in",
      },
      { status: 401 },
    );
  }

  let planId = "";
  try {
    planId = String(((await request.json()) as { planId?: unknown }).planId ?? "");
  } catch {
    return Response.json({ ok: false, reason: "Send JSON with a `planId`." }, { status: 400 });
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

    const result = await startCheckout({
      planId,
      accountId: account.id,
      returnUrl: `${SITE}/account`,
    });

    return Response.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        reason:
          err instanceof NotConfigured
            ? err.message
            : `Could not start checkout: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}
