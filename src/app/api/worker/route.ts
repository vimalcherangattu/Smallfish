import { readFile } from "node:fs/promises";
import path from "node:path";

import { accountForUser, jobFor, NotConfigured, type JobRow } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { criterionForCheck } from "@/lib/csvimport";
import { SLICE_MS, tick } from "@/lib/worker";
import type { Criterion, Market } from "@/lib/types";

/**
 * One tick of the queue (P0.1).
 *
 * Vercel Cron calls this on a schedule; it claims the oldest job with work
 * left, reads what fits in its budget, and exits. See `worker.ts` for why the
 * work is sliced rather than run to completion.
 *
 * ## Why it is authorised, and how
 *
 * This route spends money — every site it reads costs a crawl and most cost a
 * model call — so an open endpoint is a bill anybody can run up by holding down
 * a key. Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron
 * invocation; this checks it, in constant time, and **refuses when the secret is
 * not configured at all** rather than defaulting to open. A deployment that has
 * not set it has a worker that does nothing, which is visible, instead of one
 * anybody can drive, which is not.
 *
 * ## Why the criterion is looked up here
 *
 * `worker.ts` should not know where a criterion is stored. Today it is in the
 * market file this route already has on disk; when CSV upload lands, the
 * question will be on the job itself. That is one function to change, here.
 */

export const dynamic = "force-dynamic";
/** The platform's ceiling for this function. `SLICE_MS` sits under it by enough
 *  to write the last batch and release the lease. */
export const maxDuration = 60;

/** Constant-time compare. A timing oracle on a shared secret is a small hole,
 *  and `===` on a secret is the sort of thing that is free to get right. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return same(header, `Bearer ${secret}`);
}

async function marketFile(id: string): Promise<Market | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", `${id}.json`), "utf8"),
    ) as Market;
  } catch {
    return null;
  }
}

/**
 * The question this job is asking, as a check the engine can run.
 *
 * Two shapes, and the worker knows about neither:
 *
 *   - A **market** job names a market file and a criterion inside it.
 *   - An **upload** job has no market — the customer brought the sites — so its
 *     criterion id is a `signals.ts` check like `booking:absence`, and
 *     `criterionForCheck` rebuilds it from the catalogue. That is also where an
 *     unprovable check is refused, so a job can never be created for a question
 *     the engine cannot settle and then quietly read a thousand sites anyway.
 */
async function findCriterion(job: JobRow): Promise<Criterion | null> {
  if (!job.criterion_id) return null;
  if (!job.market_id) return criterionForCheck(job.criterion_id);
  const market = await marketFile(job.market_id);
  return market?.criteria.find((c) => c.id === job.criterion_id) ?? null;
}

/**
 * The second door: a person advancing their own read.
 *
 * The queue moves on a Vercel Cron entry, which needs `CRON_SECRET` — not
 * fixable from inside this repository — and which **now ticks once a day**,
 * not once a minute.
 *
 * That is a forced retreat, not a design. `vercel.json` asked for
 * `* * * * *` from 2026-09-30, and Hobby caps crons at once per day: the
 * expression did not throttle, it failed the build. Thirteen commits were
 * pushed to `main` over three days, every one failed to deploy, and the live
 * site stayed on the last good commit while the repository looked healthy.
 * Dropped to daily on 2026-10-03 so everything else could ship.
 *
 * At one tick a day a queued read of any size never finishes in a useful time,
 * so this door — a person advancing their own job — is now the only one that
 * works, rather than a convenience beside a working scheduler. Restoring
 * minute-level ticking needs a Pro plan or a runner outside Vercel.
 *
 * So a member of the workspace that owns a job may advance **that job**, one
 * slice per press. Three things make that safe to offer:
 *
 *   - `jobFor` scopes the lookup to the caller's own account, so a job id from a
 *     stranger's URL finds nothing.
 *   - It is their own crawl and model budget, spent on work they asked for.
 *   - The lease is the same lease. Two presses, or a press racing a cron tick,
 *     cannot read the same sites twice.
 *
 * It cannot be used to drain the queue generally: without a job id this path
 * does nothing, because "whichever is oldest" is the scheduler's question and
 * the oldest job may belong to somebody else.
 */
async function mine(req: Request, jobId: string) {
  if (!CLERK_ENABLED) {
    return Response.json(
      { ok: false, reason: "Accounts are not switched on on this deployment." },
      { status: 503 },
    );
  }
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { ok: false, reason: "Sign in first.", signIn: "/sign-in" },
      { status: 401 },
    );
  }

  const account = await accountForUser(userId);
  // The same answer for "no such job" and "not yours", so a job id cannot be
  // probed for existence.
  const job = account ? await jobFor(account.id, jobId) : null;
  if (!job) {
    return Response.json({ ok: false, reason: "No such read." }, { status: 404 });
  }

  const report = await tick({
    holder: `by-hand-${account!.id.slice(0, 8)}-${Date.now()}`,
    findCriterion,
    budgetMs: SLICE_MS,
    jobId: job.id,
  });

  return Response.json({
    ok: true,
    ...report,
    // A press that claimed nothing is the ordinary answer when a cron tick, or
    // another press, is already working it. Saying "0 read" without saying why
    // reads as a failure.
    note:
      report.jobId === null
        ? "Something else is already reading this one. It will keep going."
        : report.note,
  });
}

async function run(req: Request) {
  // A job id means "advance mine", which is a different question with a
  // different authorisation. Read before the secret check, because a person
  // pressing a button has no secret and should not be told they are forbidden.
  let jobId = "";
  if (req.method === "POST") {
    try {
      const body = (await req.clone().json()) as { job?: unknown };
      jobId = String(body.job ?? "").trim();
    } catch {
      jobId = "";
    }
  }

  try {
    if (jobId) {
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
        return Response.json({ ok: false, reason: "No such read." }, { status: 404 });
      }
      return await mine(req, jobId);
    }

    if (!authorised(req)) {
      return Response.json(
        {
          ok: false,
          reason: process.env.CRON_SECRET
            ? "Not for you."
            : "This deployment has no CRON_SECRET, so the worker refuses to run " +
              "rather than letting anybody spend its crawl and model budget.",
        },
        { status: 401 },
      );
    }

    const report = await tick({
      // Which tick did what, when two overlap. Not a secret and not an id
      // anybody depends on — it exists to make a stuck lease legible.
      holder: `vercel-${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}-${Date.now()}`,
      findCriterion,
      budgetMs: SLICE_MS,
    });
    return Response.json({ ok: true, ...report });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return Response.json({ ok: false, reason: err.message }, { status: 503 });
    }
    throw err;
  }
}

/** Vercel Cron issues a GET. POST is here for driving a tick by hand while
 *  watching a job — same authorisation, same work. */
export const GET = run;
export const POST = run;
