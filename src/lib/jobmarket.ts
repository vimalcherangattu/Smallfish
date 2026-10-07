/**
 * A finished read, in the shape the results screen already knows how to render.
 *
 * ## Why a projection rather than a second results screen
 *
 * The product had two ways to produce matches and one way to show them. The
 * measured markets ship as files under `public/data` and `/app` renders those;
 * a job — a CSV upload, or any trade in any US city — writes its verdicts into
 * `job_sites` and had **no screen at all**. Somebody could search, spend
 * credits, watch the read finish, and land on a page offering to count the city
 * again, with the matches they had bought sitting in the database.
 *
 * Writing a second results screen would have meant a second implementation of
 * the free preview, the unlock, the ordering, the evidence box and the CSV —
 * and `unlock.ts` exists because those have to agree: *the rows on the invoice
 * have to be the rows on the screen*. So this projects the job into a `Market`
 * instead, and every one of those stays single.
 *
 * ## What is real here and what is absent
 *
 * Everything carried is something the worker actually recorded: the name, the
 * site, the phone, the verdict, the proof sentence and the page count. The
 * fields a `Market` has that a job does not are left **empty rather than
 * filled**, and that distinction is the whole discipline of this file:
 *
 *   - `addr` is empty, so the row shows no town. `job_sites` has no address
 *     column; `supply.ts` fetches one and drops it on the way in. A town
 *     inferred from the region label would be a guess printed next to a name.
 *   - `lat`/`lon` are zero and nothing reads them. The map is not on this path.
 *   - `read.booking`, `vendors`, `quote`, `chat`, `cms` are the detector's
 *     fields and a job does not store them. `composeEmail` uses them only for
 *     its optional third sentence, so a drafted email on this path is shorter
 *     rather than invented — which is the correct failure.
 *
 * ## The counts are the job's own
 *
 * `counts.read` and the tallies are recomputed from the rows rather than copied
 * off the job's counters, because the two can disagree while a read is still
 * running and the screen should describe what it is showing.
 */

import type { JobRow, JobSiteRow } from "@/lib/accounts";
import type { Business, Criterion, Market, VerdictKind } from "@/lib/types";

/** Verdicts the worker writes. Anything else is treated as unread, which is the
 *  safe direction: an unrecognised verdict must never read as a match. */
const KNOWN: ReadonlySet<string> = new Set<VerdictKind>([
  "match",
  "no_match",
  "couldnt_tell",
  "blocked",
  "needs_model",
  "unread",
]);

const verdictOf = (row: JobSiteRow): VerdictKind => {
  if (row.state !== "done" || !row.verdict) return "unread";
  return KNOWN.has(row.verdict) ? (row.verdict as VerdictKind) : "unread";
};

/**
 * One job site as a business.
 *
 * `read` is present only for a row we actually finished, because `composeEmail`
 * refuses on `outcome !== "ok"` and a half-read row must not produce a draft.
 */
export function businessFrom(row: JobSiteRow, criterion: Criterion): Business {
  const verdict = verdictOf(row);
  const done = row.state === "done";
  return {
    id: row.business_id,
    name: row.name ?? "",
    cat: "",
    lat: 0,
    lon: 0,
    // Deliberately empty — see the note at the top. `townOf("")` is null, and a
    // row with no town renders without one.
    addr: "",
    site: row.site,
    phone: row.phone,
    primary: true,
    read: done
      ? {
          outcome: row.read_outcome ?? "ok",
          pages: row.pages ?? 0,
          chars: 0,
          booking: false,
          vendors: [],
          quote: false,
          chat: false,
          cms: [],
        }
      : undefined,
    verdicts: {
      [criterion.id]: {
        verdict,
        // The reason is the screen's to phrase from the criterion and the
        // verdict — `appview.ts` does it for the measured path too. A string
        // invented here would be a second voice saying the same thing.
        reason: "",
        ...(row.proof ? { proof: row.proof } : {}),
      },
    },
  };
}

/**
 * The `job:` id scheme.
 *
 * A projected market is named `job:<uuid>` so that nothing can mistake it for a
 * file under `public/data` — every place that loads a market by id would have
 * read a path, and a colon is not a legal filename character in the guards
 * those places use. Kept here, beside the projection that mints it, and pure so
 * `test_jobmarket.mjs` can hold it: `marketsource.ts` needs a database and
 * cannot be unit-tested, and this is the part worth pinning.
 */
const JOB_ID = /^job:([0-9a-f-]{36})$/i;

/** The id a projected market carries. */
export const jobMarketId = (jobId: string) => `job:${jobId}`;

/** Whether an id names a workspace's own read rather than a shipped file. */
export const isJobMarket = (id: string) => JOB_ID.test(id);

/** The job behind a projected market id, or null if it is not one. */
export const jobIdOf = (id: string) => JOB_ID.exec(id)?.[1] ?? null;

/**
 * A job and its rows as a market.
 *
 * `id` is prefixed so nothing can mistake it for a file under `public/data`:
 * every place that loads a market by id would 404 on this, which is the right
 * outcome — this market exists only for the request that built it.
 */
export function marketFromJob(
  job: JobRow,
  rows: JobSiteRow[],
  criterion: Criterion,
): Market {
  const businesses = rows.map((r) => businessFrom(r, criterion));

  const tally: Record<string, number> = {};
  for (const b of businesses) {
    const v = b.verdicts[criterion.id]?.verdict ?? "unread";
    tally[v] = (tally[v] ?? 0) + 1;
  }

  return {
    id: jobMarketId(job.id),
    niche: "",
    metro: job.region_label ?? "",
    center: { lat: 0, lon: 0 },
    search: job.query,
    criteria: [criterion],
    checkPlanTargets: [],
    counts: {
      candidates: businesses.length,
      primary: businesses.length,
      // Every row on a job is a site we intended to read — `/api/jobs` and the
      // upload both filter to businesses with a readable website before the
      // job is created, so "candidates" and "with a website" are the same set.
      withSite: businesses.length,
      read: businesses.filter((b) => b.read).length,
    },
    tallies: { [criterion.id]: tally },
    businesses,
  };
}

/** How many of a job's rows have an answer yet. The results screen opens as
 *  soon as this is above zero rather than waiting for the whole read, because a
 *  partial list of real matches is worth more than a progress bar. */
export const settledCount = (rows: JobSiteRow[]) =>
  rows.filter((r) => r.state === "done").length;
