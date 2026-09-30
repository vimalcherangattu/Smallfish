/**
 * One slice of a queued read (P0.1).
 *
 * ## The shape, and why it is this shape
 *
 * A serverless function gets tens of seconds, not hours. Reading every dental
 * practice in Phoenix that has a website is 2,778 sites and about half an hour
 * of polite crawling. So nothing here tries to finish a job: a tick claims the
 * oldest job with work left, reads as much as fits in its budget, writes what it
 * learned, and hands the job back. The next tick continues. **The queue is
 * emptied by arithmetic, not by one long-running thing** — which also means no
 * process to keep alive, and no state anywhere but the database.
 *
 * ## Every decision here is about what happens when a tick dies
 *
 * It will. A deploy lands mid-slice, a platform reclaims the container, a fetch
 * hangs past the budget. So:
 *
 *   - Sites go `pending → taken → done`, and a `taken` row older than the sweep
 *     window returns to `pending`. The failure mode is **a site read twice,
 *     never a site silently skipped** — reading twice costs a crawl, skipping
 *     silently costs the customer a business that was there.
 *   - Results are written **before** the budget is spent, in batches, not at the
 *     end. A tick that dies with fifty judgments in memory has thrown away fifty
 *     model calls we paid for.
 *   - The job's counters are recomputed from the rows rather than incremented,
 *     so replaying a batch cannot inflate them.
 *
 * ## What it refuses to do
 *
 * Crawl without an engine. With no `ANTHROPIC_API_KEY`, `judge` answers
 * `needs_model` for everything that technology detection cannot settle — which
 * is every absence criterion, i.e. most of them. A tick that reads four hundred
 * sites and settles none of them has spent the crawl budget, annoyed four
 * hundred web servers and produced nothing. It stops instead and says so on the
 * job, where the person waiting can read it.
 */

import "server-only";

import {
  claimJob,
  claimThisJob,
  jobFor,
  recordSites,
  releaseJob,
  sweepStrandedSites,
  takeSites,
  type JobRow,
  type JobSiteRow,
} from "@/lib/accounts";
import { CONCURRENCY } from "@/lib/jobs";
import { send } from "@/lib/notify";
import { judge, readSite } from "@/lib/read";
import type { Criterion } from "@/lib/types";

/** Where links in the finished-read note point. */
const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://getsmallfish.com";

/**
 * How long a tick may work for.
 *
 * Under the platform's own limit by enough to write the last batch and release
 * the job. A tick killed mid-write leaves a lease that has to expire before
 * anything else can touch the job, which is the one failure that actually
 * stalls a queue rather than merely slowing it.
 */
export const SLICE_MS = 45_000;

/** Read and judge this many sites before writing. Small enough that a death
 *  costs a few model calls, large enough that writing is not the bottleneck. */
export const BATCH = CONCURRENCY;

/** How long the job is held. Comfortably longer than a slice, so a tick that
 *  overruns slightly does not hand its job to a second worker mid-read. */
export const LEASE_SECONDS = 180;

/** A `taken` row older than this was left by a worker that is not coming back. */
export const STRANDED_SECONDS = 600;

export interface SliceReport {
  /** Null when there was nothing to do, which is the ordinary answer. */
  jobId: string | null;
  read: number;
  matched: number;
  unclear: number;
  /** What the job is now: reading, done, failed — or "idle" when none was claimed. */
  state: string;
  note?: string;
  ms: number;
}

/** Enough time left to read one more site and still write what we have. */
const roomFor = (startedAt: number, budgetMs: number) =>
  Date.now() - startedAt < budgetMs;

/**
 * The criterion a job is about.
 *
 * A job stores the criterion's id and the market it came from; the text and the
 * explanation live in the market file, which the route reads and passes in. When
 * a job carries neither — a CSV upload against a typed question — the caller
 * supplies the criterion directly, which is why this takes one rather than
 * looking it up.
 */
export interface SliceInput {
  job: JobRow;
  criterion: Criterion;
  budgetMs?: number;
}

/**
 * Read and judge one batch, in parallel, and never let one site take the tick
 * down with it.
 *
 * `readSite` already handles robots.txt, the per-host delay and the identifying
 * user agent. A site that throws anyway is our failure and is recorded as ours —
 * `couldnt_tell` with the outcome, never `no_match`, which is the absence rule.
 */
async function readBatch(sites: JobSiteRow[], criterion: Criterion) {
  return Promise.all(
    sites.map(async (s) => {
      try {
        const read = await readSite(s.site, criterion);
        const v = await judge(read, criterion);
        return {
          business_id: s.business_id,
          verdict: v.verdict,
          proof: v.proof ?? null,
          pages: read.result.pages ?? 0,
          outcome: read.result.outcome ?? "ok",
        };
      } catch {
        // Never blame the environment on the business.
        return {
          business_id: s.business_id,
          verdict: "couldnt_tell",
          proof: null,
          pages: 0,
          outcome: "error",
        };
      }
    }),
  );
}

/** Work one claimed job for as long as the budget allows. */
export async function runJobSlice({
  job,
  criterion,
  budgetMs = SLICE_MS,
}: SliceInput): Promise<SliceReport> {
  const started = Date.now();
  let read = 0;
  let matched = 0;
  let unclear = 0;

  while (roomFor(started, budgetMs)) {
    const sites = await takeSites(job.id, BATCH);
    if (!sites.length) break;

    const results = await readBatch(sites, criterion);

    // Written now, not at the end. See the note at the top of the file.
    await recordSites(job.id, results);

    read += results.length;
    matched += results.filter((r) => r.verdict === "match").length;
    unclear += results.filter((r) =>
      ["couldnt_tell", "blocked", "needs_model"].includes(r.verdict),
    ).length;

    // `needs_model` means exactly one thing: `judge` found no model key. It is
    // not what a model outage looks like — that comes back `couldnt_tell`, our
    // failure recorded as ours — so **a single one is proof the engine is not
    // there**, and reading another four hundred sites would cost the same and
    // learn the same.
    //
    // The first version of this guard stopped only when a batch settled
    // *nothing*, which was measurably too weak: probing six real dental Phoenix
    // sites, two carry a Zocdoc script, and technology detection settles those
    // for free with no key at all. One such site in a batch of twelve would have
    // read "something was settled, carry on" and crawled the whole market to
    // produce eleven-twelfths nothing.
    const noEngine = results.some((r) => r.verdict === "needs_model");
    if (noEngine) {
      const state = await releaseJob(
        job.id,
        "Paused: the reading engine is not answering, so the rest of these sites " +
          "are left alone rather than crawled for no answer. This picks up again " +
          "by itself.",
      );
      return {
        jobId: job.id,
        read,
        matched,
        unclear,
        state,
        note: "no model key, so nothing past technology detection can be settled",
        ms: Date.now() - started,
      };
    }
  }

  const state = await releaseJob(job.id);

  // The note the person was promised when they left. Written here because this
  // is the only place that knows the job just finished — `release_job` is the
  // transition, and a separate sweep looking for freshly-done jobs would be a
  // second thing to keep running and a second thing to get wrong.
  //
  // Best-effort, and deliberately after the release: `notify.send` claims the
  // note in the database before sending, so this cannot write twice, and a
  // provider that is down must not leave the job un-released.
  // Re-read rather than patched from what this tick happened to do. The job we
  // are holding was fetched before the work; its counters are whatever they were
  // then, and the note quotes them ("42 of the 200 we could settle fit"). A
  // finished-read email is the one place a stale number is read by a person who
  // has no way to check it.
  let note: string | undefined;
  if (state === "done") {
    const fresh = (await jobFor(job.account_id, job.id).catch(() => null)) ?? job;
    const sent = await send(fresh, siteUrl()).catch(() => ({
      sent: false,
      why: "the note could not be sent",
    }));
    if (!sent.sent) note = sent.why;
  }

  return { jobId: job.id, read, matched, unclear, state, note, ms: Date.now() - started };
}

/**
 * One tick: sweep, claim, work, release.
 *
 * `findCriterion` is passed in rather than imported so this stays testable and
 * so the route owns reading the market files — this module should not know
 * where a criterion is stored.
 */
export async function tick(args: {
  holder: string;
  findCriterion: (job: JobRow) => Promise<Criterion | null>;
  budgetMs?: number;
  /**
   * Work this job rather than the oldest.
   *
   * For a person advancing their own read while no scheduler exists. The caller
   * has already established that it is theirs; this only decides which row the
   * lease is taken on, and takes it exactly the same way.
   */
  jobId?: string;
}): Promise<SliceReport> {
  const started = Date.now();

  // First, because a stranded row is work that looks done and is not. Cheap: one
  // indexed update over rows nobody holds.
  await sweepStrandedSites(STRANDED_SECONDS).catch(() => 0);

  const job = args.jobId
    ? await claimThisJob(args.jobId, args.holder, LEASE_SECONDS)
    : await claimJob(args.holder, LEASE_SECONDS);
  if (!job) {
    return { jobId: null, read: 0, matched: 0, unclear: 0, state: "idle", ms: Date.now() - started };
  }

  const criterion = await args.findCriterion(job);
  if (!criterion) {
    // The job asks a question we cannot turn into a check. That is ours to
    // admit, on the job, rather than leaving it circling the queue forever.
    const state = await releaseJob(
      job.id,
      null,
      "We could not turn this search into a check we know how to run. Nothing was charged.",
    );
    return {
      jobId: job.id,
      read: 0,
      matched: 0,
      unclear: 0,
      state,
      note: "no criterion",
      ms: Date.now() - started,
    };
  }

  return runJobSlice({
    job,
    criterion,
    budgetMs: (args.budgetMs ?? SLICE_MS) - (Date.now() - started),
  });
}
