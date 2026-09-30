import { readFile } from "node:fs/promises";
import path from "node:path";

import { NotConfigured, type JobRow } from "@/lib/accounts";
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

async function run(req: Request) {
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

  try {
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
