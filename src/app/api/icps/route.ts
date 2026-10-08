import { auth } from "@clerk/nextjs/server";

import { accountForUser, archiveIcp, icpsFor, saveIcp, NotConfigured } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";

/**
 * Saved ICPs (S1-27).
 *
 * ## What is stored and what is not
 *
 * The **edited plan**, as the customer left it, plus the description it came
 * from. Not a re-derivable seed: `icpplan.ts` turns a description into checks
 * against the signal catalogue, and that catalogue grows — it went from three
 * provable signals to six in one day. An ICP that silently gained a check
 * nobody chose is a search that costs more than the one they saved, so the plan
 * is data and the description is kept beside it for showing and for re-deriving
 * **on request**.
 *
 * ## It degrades rather than failing
 *
 * Migration `0022` is applied by hand. Until it is, the readers in
 * `accounts.ts` answer emptily instead of throwing, and this route answers
 * `ready: false` so the screen can say so plainly. A half-deployed feature
 * should look unfinished, not broken.
 */

export const dynamic = "force-dynamic";

const offline = () =>
  Response.json(
    { ok: false, reason: "Accounts are not switched on on this deployment." },
    { status: 503 },
  );

async function workspace() {
  const { userId } = await auth();
  if (!userId) return { error: Response.json({ ok: false, reason: "Sign in first.", signIn: "/sign-in" }, { status: 401 }) };
  const account = await accountForUser(userId);
  if (!account) {
    return {
      error: Response.json(
        {
          ok: false,
          reason: "You have no workspace yet. Open your account page once and it will make one.",
        },
        { status: 409 },
      ),
    };
  }
  return { account };
}

export async function GET() {
  if (!CLERK_ENABLED) return offline();
  try {
    const w = await workspace();
    if (w.error) return w.error;
    const icps = await icpsFor(w.account.id);
    // `ready` is about the table, not about having any. An empty list and a
    // missing table look identical from here and mean opposite things to
    // somebody deciding whether to type anything in.
    return Response.json({ ok: true, ready: true, icps });
  } catch (err) {
    if (err instanceof NotConfigured) return Response.json({ ok: false, reason: err.message }, { status: 503 });
    throw err;
  }
}

export async function POST(request: Request) {
  if (!CLERK_ENABLED) return offline();

  let body: { id?: unknown; name?: unknown; offer?: unknown; plan?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    return Response.json(
      { ok: false, reason: "Give it a name, so you can tell it from the next one." },
      { status: 400 },
    );
  }

  try {
    const w = await workspace();
    if (w.error) return w.error;
    const saved = await saveIcp({
      accountId: w.account.id,
      id: typeof body.id === "string" ? body.id : null,
      name,
      offer: String(body.offer ?? ""),
      plan: body.plan ?? {},
    });
    if (!saved) {
      return Response.json(
        {
          ok: false,
          ready: false,
          reason:
            "Saved ICPs are not switched on on this deployment yet. The plan on " +
            "screen still works, it just will not be here when you come back.",
        },
        { status: 503 },
      );
    }
    return Response.json({ ok: true, icp: saved });
  } catch (err) {
    if (err instanceof NotConfigured) return Response.json({ ok: false, reason: err.message }, { status: 503 });
    throw err;
  }
}

export async function DELETE(request: Request) {
  if (!CLERK_ENABLED) return offline();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    const w = await workspace();
    if (w.error) return w.error;
    // Archived, not deleted: a read that names an ICP keeps something to name.
    const done = await archiveIcp(w.account.id, id);
    return Response.json({ ok: done });
  } catch (err) {
    if (err instanceof NotConfigured) return Response.json({ ok: false, reason: err.message }, { status: 503 });
    throw err;
  }
}
