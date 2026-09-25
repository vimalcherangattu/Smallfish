import { Webhook } from "svix";
import { PLANS } from "@/lib/pricing";
import { MILLI } from "@/lib/ledger";
import { ensureWorkspace, NotConfigured } from "@/lib/accounts";
import { currentEnv } from "@/lib/db";

/**
 * Clerk tells us somebody signed up (S1-08).
 *
 * This is the only way a workspace comes into existence, so it is also the only
 * thing standing between "a person exists" and "a person has credits". Two
 * properties matter more than the happy path.
 *
 * **The signature is verified before anything is read.** This is a public URL
 * that creates accounts and grants a free balance. Without verification,
 * anybody who finds it can mint workspaces by posting JSON at it, and the free
 * plan's credits are real money spent on real reads. `svix` is Clerk's own
 * signing scheme; the check also rejects a replayed old delivery, which a
 * hand-rolled HMAC comparison usually forgets.
 *
 * **It is idempotent.** A webhook is delivered *at least* once — Clerk retries
 * anything that times out or 5xxs. A second `user.created` for the same person
 * must not produce a second workspace with a second free grant, or a slow
 * request becomes a way to mint credits. `ensureWorkspace` looks for an
 * existing membership first, and the `(account_id, user_id)` primary key is the
 * backstop underneath that.
 *
 * **What happens on `user.deleted`:** the membership goes, the account does
 * not. `ledger_entries` is `ON DELETE RESTRICT` and the ledger is append-only,
 * deliberately — a deletion request is answered by closing the account and
 * removing what identifies the person, never by destroying the record of what
 * they were charged, which is the one thing a billing dispute needs.
 */

export const dynamic = "force-dynamic";

type ClerkEvent = {
  type: string;
  data: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email_addresses?: Array<{ email_address: string }>;
  };
};

const free = () => PLANS.find((p) => p.id === "free") ?? PLANS[0];

export async function POST(request: Request) {
  const secret = currentEnv().CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    // 500, not 200. A 200 tells Clerk the event was handled and it stops
    // retrying, so a missing secret would silently drop every signup that
    // happened before it was set.
    return Response.json(
      {
        ok: false,
        reason:
          "CLERK_WEBHOOK_SIGNING_SECRET is not set, so this request cannot be " +
          "verified and nothing was created. See docs/SETUP.md §2.3.",
      },
      { status: 500 },
    );
  }

  const body = await request.text();
  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(body, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    }) as unknown as ClerkEvent;
  } catch {
    // Deliberately unspecific. A caller probing this endpoint learns only that
    // it did not work, not which part of the signature was wrong.
    return Response.json({ ok: false, reason: "Bad signature." }, { status: 400 });
  }

  try {
    if (event.type === "user.created") {
      const plan = free();
      const person =
        [event.data.first_name, event.data.last_name].filter(Boolean).join(" ").trim() ||
        event.data.email_addresses?.[0]?.email_address?.split("@")[0];

      const { accountId, created } = await ensureWorkspace({
        clerkUserId: event.data.id,
        name: person ? `${person}'s workspace` : undefined,
        planId: plan.id,
        allowanceMilli: plan.credits * MILLI,
        planName: plan.name,
      });
      return Response.json({ ok: true, accountId, created });
    }

    if (event.type === "user.deleted") {
      // The membership only. See the note at the top of this file.
      const env = currentEnv();
      const key = env.SUPABASE_SERVICE_ROLE_KEY;
      if (key && env.NEXT_PUBLIC_SUPABASE_URL) {
        await fetch(
          `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/account_members` +
            `?user_id=eq.${encodeURIComponent(event.data.id)}`,
          {
            method: "DELETE",
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          },
        );
      }
      return Response.json({ ok: true, removed: "membership" });
    }

    return Response.json({ ok: true, ignored: event.type });
  } catch (err) {
    const missing = err instanceof NotConfigured;
    // 500 either way, so Clerk retries. A signup that arrives before the
    // database is configured should land once it is, not be lost.
    return Response.json(
      { ok: false, reason: err instanceof Error ? err.message : String(err), missing },
      { status: 500 },
    );
  }
}
