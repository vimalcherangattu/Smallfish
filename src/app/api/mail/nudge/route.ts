import {
  claimMail,
  nudgeCandidates,
  recordMail,
  NotConfigured,
} from "@/lib/accounts";
import { mailConfigured, nudgeEmail, sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";

/**
 * The two-day nudge (P0.5).
 *
 * Runs on the same schedule as the worker and behind the same secret, because
 * it is the same kind of thing: a job nobody is watching that costs money if
 * anybody can drive it.
 *
 * ## Almost all of the work is not sending it
 *
 * `nudge_candidates` (migration `0021`) excludes six ways this email could be
 * wrong — too new, too old, already spent, already nudged, closed, comped — and
 * the reason is one sentence: **a nudge that arrives after the person already
 * did the thing is the clearest possible signal that nobody is reading their
 * account.** That is the failure this whole feature risks, and every condition
 * is a defence against it.
 *
 * ## The claim comes before the send, and the provider check before both
 *
 * Exactly as `notify.ts` does it, for the reason recorded there: claiming first
 * on a deployment with no key would mark every waiting note as spoken for, so
 * the day the key arrives none of them goes out.
 *
 * ## One pass, bounded
 *
 * It sends what it can inside a function's time budget and leaves the rest for
 * the next run, which is safe because the candidate query is idempotent — a
 * workspace it did not reach is still a candidate tomorrow, and one it did
 * reach is excluded by its own `mail_sends` row.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Seconds of work per run. Under the platform's limit by enough to finish the
 *  send in flight and answer. */
const BUDGET_MS = 45_000;

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return same(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

async function run(req: Request) {
  if (!authorised(req)) {
    return Response.json(
      {
        ok: false,
        reason: process.env.CRON_SECRET
          ? "Not for you."
          : "This deployment has no CRON_SECRET, so scheduled mail refuses to run.",
      },
      { status: 401 },
    );
  }

  // Before anything is claimed. See the note above.
  if (!mailConfigured()) {
    return Response.json({
      ok: true,
      sent: 0,
      considered: 0,
      note:
        "No mail provider is configured (RESEND_API_KEY is not set), so nothing " +
        "was claimed. Every candidate is still a candidate on the next run.",
    });
  }

  const started = Date.now();
  try {
    const candidates = await nudgeCandidates();
    let sent = 0;
    let skipped = 0;

    const { clerkClient } = await import("@clerk/nextjs/server");
    const clerk = await clerkClient();

    for (const c of candidates) {
      if (Date.now() - started > BUDGET_MS) break;

      // Claim first: two overlapping runs must not both write to one person.
      if (!(await claimMail(c.account_id, "nudge"))) {
        skipped += 1;
        continue;
      }

      let email = "";
      try {
        if (c.clerk_user) {
          const user = await clerk.users.getUser(c.clerk_user);
          email = user.primaryEmailAddress?.emailAddress ?? "";
        }
      } catch {
        email = "";
      }

      if (!email) {
        await recordMail({
          accountId: c.account_id,
          kind: "nudge",
          sent: false,
          why: "No address on the account.",
        }).catch(() => undefined);
        continue;
      }

      const result = await sendMail(
        email,
        nudgeEmail({
          email,
          siteUrl: SITE,
          credits: Math.floor(c.milli / 1000),
          query: c.first_query,
          // What is waiting is not known without re-running their search, and
          // re-running forty searches to write forty emails is a cost nobody
          // asked for. The message handles a null by naming the credits
          // instead — see `nudgeEmail`.
          waiting: null,
        }),
      );
      await recordMail({
        accountId: c.account_id,
        kind: "nudge",
        sent: result.sent,
        why: result.why ?? null,
      }).catch(() => undefined);
      if (result.sent) sent += 1;
    }

    return Response.json({
      ok: true,
      considered: candidates.length,
      sent,
      skipped,
      ms: Date.now() - started,
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}

export const GET = run;
export const POST = run;
