/**
 * Where a market comes from, for the routes that charge and deliver.
 *
 * ## The hole this closes
 *
 * `/api/unlock` and `/api/export` both resolved a market by reading
 * `public/data/<id>.json`. That is correct for the four measured markets and
 * wrong for everything else this product can now produce: a job — a CSV upload,
 * or any trade in any US city — has no file, and its projected id is
 * `job:<uuid>`, which does not even pass their `^[a-z0-9-]+$` guard.
 *
 * So the delivery screen worked and the two buttons on it did not. A customer
 * could watch their read finish, see the matches, press **See 20 more** or
 * **Download** and be told *"Unknown market"*. The list was visible and
 * unbuyable, which is worse than not showing it.
 *
 * One resolver, used by both routes and by the read screen, so the thing being
 * charged for is the thing being shown. `unlock.ts` is explicit that the rows
 * on the invoice have to be the rows on the screen; this is the same rule one
 * level up, about which *market* those rows come from.
 *
 * ## A job market is scoped to its owner
 *
 * A file market is public — it is shipped in the bundle and `/app` renders it
 * to anybody. A job market is one workspace's own read, so it resolves only for
 * the account that owns the job. `jobFor` already scopes that way, and an id
 * from somebody else's workspace comes back null rather than as their data.
 */

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { jobFor, jobSiteRows } from "@/lib/accounts";
import { criterionForCheck } from "@/lib/csvimport";
import { jobIdOf, marketFromJob } from "@/lib/jobmarket";
import type { Criterion, Market } from "@/lib/types";

const FILE_ID = /^[a-z0-9-]+$/;

const fileMarket = async (id: string): Promise<Market | null> => {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", `${id}.json`), "utf8"),
    ) as Market;
  } catch {
    return null;
  }
};

/**
 * The criterion a job is asking about.
 *
 * The same two shapes the worker's own `findCriterion` resolves, and for the
 * same reason: a market job names a file and a criterion inside it; a job with
 * no market carries a `signals.ts` check id.
 */
export async function criterionForJob(job: {
  market_id: string | null;
  criterion_id: string | null;
}): Promise<Criterion | null> {
  if (!job.criterion_id) return null;
  if (!job.market_id) return criterionForCheck(job.criterion_id);
  if (!FILE_ID.test(job.market_id)) return null;
  const m = await fileMarket(job.market_id);
  return m?.criteria.find((c) => c.id === job.criterion_id) ?? null;
}

/**
 * A market by id, whether it is a shipped file or one workspace's own read.
 *
 * `accountId` is required for a job id and ignored for a file id. Returns null
 * rather than throwing for every failure — an unknown id, a job in another
 * workspace, a job whose question we can no longer turn into a check — because
 * the callers all answer the same way, and that answer must not distinguish
 * "does not exist" from "not yours".
 */
export async function marketById(
  id: string,
  accountId: string | null,
): Promise<{ market: Market; criterion: Criterion } | null> {
  const asJob = jobIdOf(id);
  if (asJob) {
    if (!accountId) return null;
    const job = await jobFor(accountId, asJob);
    if (!job) return null;
    const criterion = await criterionForJob(job);
    if (!criterion) return null;
    const rows = await jobSiteRows(accountId, job.id);
    return { market: marketFromJob(job, rows, criterion), criterion };
  }

  if (!FILE_ID.test(id)) return null;
  const market = await fileMarket(id);
  if (!market) return null;
  // A file market carries several criteria; the caller narrows by id as before.
  return { market, criterion: market.criteria[0] };
}

