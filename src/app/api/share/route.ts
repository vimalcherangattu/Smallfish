import { auth } from "@clerk/nextjs/server";

import {
  accountForUser,
  NotConfigured,
  revokeSharedList,
  shareList,
} from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { SITE } from "@/lib/site";

/**
 * Make a shareable link to a list, or withdraw one.
 *
 * ## The link is the permission, so it is minted by the database
 *
 * `share_list` generates the token from `gen_random_bytes` — see migration
 * `0019`. Nothing here invents one, because an application that generates a
 * capability is an application that can generate a guessable one.
 *
 * ## Pressing Share twice gives you one link
 *
 * Idempotent per (account, market, criterion). Two links to the same list is a
 * customer wondering which of them they sent, and two view counts that each
 * tell half the story.
 *
 * ## Revoking is the reason anybody presses Share at all
 *
 * A link you cannot take back is a link you will not send. `DELETE` withdraws
 * it; the row survives so the views it earned are not lost, and pressing Share
 * again mints a **new** token rather than resurrecting the old one — otherwise
 * "revoke" would mean "until you forget".
 */

export const dynamic = "force-dynamic";

async function workspace() {
  if (!CLERK_ENABLED) {
    return {
      error: Response.json(
        { ok: false, reason: "Accounts are not switched on on this deployment." },
        { status: 503 },
      ),
    };
  }
  const { userId } = await auth();
  if (!userId) {
    return {
      error: Response.json(
        { ok: false, reason: "Sign in first.", signIn: "/sign-in" },
        { status: 401 },
      ),
    };
  }
  const account = await accountForUser(userId);
  if (!account) {
    return {
      error: Response.json(
        { ok: false, reason: "You have no workspace yet." },
        { status: 409 },
      ),
    };
  }
  return { accountId: account.id };
}

const linkFor = (token: string) => `${SITE.replace(/\/$/, "")}/list/${token}`;

export async function POST(request: Request) {
  const w = await workspace();
  if (w.error) return w.error;

  let body: { market?: unknown; criterion?: unknown; label?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const marketId = String(body.market ?? "");
  const criterionId = String(body.criterion ?? "");
  if (!/^[a-z0-9-]+$/.test(marketId) || !criterionId) {
    return Response.json({ ok: false, reason: "Which list?" }, { status: 400 });
  }

  try {
    const row = await shareList({
      accountId: w.accountId!,
      marketId,
      criterionId,
      label: typeof body.label === "string" ? body.label.slice(0, 80) : null,
    });
    return Response.json({ ok: true, token: row.token, url: linkFor(row.token), views: row.views });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}

export async function DELETE(request: Request) {
  const w = await workspace();
  if (w.error) return w.error;

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return Response.json({ ok: false, reason: "No such link." }, { status: 404 });
  }

  try {
    const done = await revokeSharedList(w.accountId!, token);
    return Response.json({
      ok: true,
      revoked: done,
      // The same sentence whether it was already revoked or belongs to somebody
      // else: a token cannot be probed for existence through this route.
      note: done ? "That link no longer opens." : "That link is not active.",
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}
