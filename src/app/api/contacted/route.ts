import { auth } from "@clerk/nextjs/server";

import { accountForUser, NotConfigured, setContacted } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";

/**
 * Mark a business as reached out to — or unmark it (P1).
 *
 * The flow document's Contacted tab, and the failure it prevents is small and
 * corrosive: a practice that gets the same evidence-backed opener from the same
 * agency twice concludes nobody is paying attention, which is precisely the
 * opposite of what the evidence is for.
 *
 * Scoped to the **workspace**, not the person. Two people sharing an account are
 * working one list, and the second one to open it needs to see what the first
 * has already sent.
 *
 * Reversible on purpose. Somebody presses the wrong row, and a state they cannot
 * leave is worse than one they can set.
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

  let body: { business?: unknown; contacted?: unknown; channel?: unknown };
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

    const contacted = body.contacted !== false;
    await setContacted({
      accountId: account.id,
      businessId,
      contacted,
      channel: typeof body.channel === "string" ? body.channel.slice(0, 20) : null,
    });

    return Response.json({ ok: true, contacted });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}
