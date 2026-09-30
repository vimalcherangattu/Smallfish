/**
 * A read that takes long enough to leave: queue it, show what it is doing,
 * write when it is done.
 *
 * ## The estimate is derived, not decorative
 *
 * Asked for a "this will take hours, we'll email you" flow to convey the size
 * of the work. The flow is right and this builds it. The padding is not, and
 * it is not here: this whole product's argument is that it does not overclaim,
 * and a wait inflated to look impressive is that same lie moved somewhere
 * users cannot check — except with a stopwatch, which is exactly who would
 * check.
 *
 * It needs no padding. The numbers below are the crawler's real settings, read
 * out of `stage0/src/coverage/site_probe.py`:
 *
 *   - `GLOBAL_CONCURRENCY = 12` — twelve sites in flight
 *   - `PER_DOMAIN_DELAY = 1.5` — seconds between two requests to one host
 *   - 2 to 4 pages per site, measured across the three finished markets
 *
 * A site therefore costs about `pages × 1.5s` of wall clock on its own host,
 * and twelve of them run at once. Reading every dental practice in Phoenix
 * that has a website — 2,778 of them — is a little over half an hour of
 * crawling before a model has judged anything. That is a real wait, and saying
 * so plainly is more impressive than inventing one, because it comes with the
 * arithmetic.
 */

/**
 * ## Measured against the worker, 2026-09-30 — and the estimate is optimistic
 *
 * 48 unread dental Phoenix sites, distinct hosts, through `read.ts` in batches
 * of twelve: **795 ms per site**, against the 525 ms this file's arithmetic
 * predicts. Two things in that number are worth separating:
 *
 *   - The first batch took 20.1 s and the next three took 7.1, 4.0 and 7.0.
 *     Cold DNS and TLS, once. Steady state is ~500 ms per site, which is what
 *     the model says.
 *   - Pages per site came out at **1.31, not 3.4**. The 3.4 was measured across
 *     the three *finished* markets — sites chosen, in part, because they read
 *     well. The unread remainder is thinner, more often blocked, and more often
 *     one page.
 *
 * So the structure of the estimate is wrong in two directions that partly
 * cancel: fewer pages than assumed, more network latency than assumed. For
 * dental Phoenix's 2,578 unread sites it predicts 23 minutes and the measured
 * rate gives 34.
 *
 * **The constants are deliberately left alone.** Lowering `PAGES_PER_SITE` to
 * the measured 1.31 would make the promise *shorter* — the wrong direction for
 * a number this file says must "come in early" — and 48 sites with one cold
 * start is not a sample worth re-planning on. What is recorded here is the
 * discrepancy and its size, so the next person meets a known gap rather than
 * rediscovering it.
 */

/** Twelve sites in flight. `GLOBAL_CONCURRENCY` in the probe. */
export const CONCURRENCY = 12;
/** Seconds between two requests to the same host. `PER_DOMAIN_DELAY`. */
export const PER_DOMAIN_DELAY = 1.5;
/** Pages fetched per site, measured across dental Phoenix, med spa Dallas and
 *  HVAC Tampa: 2, 3 or 4, and 4 on most. */
export const PAGES_PER_SITE = 3.4;
/** Seconds a model judgment adds per site, including the wait for the call. */
export const JUDGE_SECONDS = 1.2;

export type JobState = "queued" | "reading" | "judging" | "done" | "failed";

export interface JobProgress {
  /** Sites we intend to read. */
  total: number;
  /** Sites fetched so far. */
  read: number;
  /** Sites a verdict has been reached on. `runs` calls this `judged`, so
   *  this does too — one word per idea across the schema. */
  judged: number;
  /** Sites that matched. */
  matched: number;
  /** Sites that refused to be read, or that we could not settle. */
  unclear: number;
}

export interface Job {
  id: string;
  state: JobState;
  /** What the person typed. */
  query: string;
  market: string;
  criterion: string;
  progress: JobProgress;
  createdAt: string;
  finishedAt: string | null;
  /** Where the "it's done" note goes, when a sender is configured. */
  notifyEmail: string | null;
}

/**
 * How long reading `sites` will actually take, in seconds.
 *
 * Deliberately a floor rather than a guess dressed up as one. It counts the
 * politeness delay and the model call and nothing else: no allowance for slow
 * hosts, retries or backoff, all of which only make it longer. Presented to a
 * person it is rounded up and hedged in the same direction — an estimate that
 * comes in early is a pleasant surprise, and one that overruns is a broken
 * promise.
 */
export function estimateSeconds(sites: number): number {
  if (sites <= 0) return 0;
  const perSite = PAGES_PER_SITE * PER_DOMAIN_DELAY + JUDGE_SECONDS;
  return Math.ceil((sites * perSite) / CONCURRENCY);
}

/** The estimate as somebody would say it out loud. */
export function humanDuration(seconds: number): string {
  if (seconds < 90) return "under two minutes";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `about ${mins} minutes`;
  const hours = seconds / 3600;
  if (hours < 1.6) return "about an hour";
  if (hours < 10) return `about ${Math.round(hours * 2) / 2} hours`;
  return `about ${Math.round(hours)} hours`;
}

/**
 * Whether a read is worth leaving. Below this it finishes while somebody is
 * still looking at the screen, and a "we'll email you" page for a
 * ninety-second job is theatre.
 */
export const LEAVE_IT_THRESHOLD_SECONDS = 180;

export const worthLeaving = (sites: number) =>
  estimateSeconds(sites) >= LEAVE_IT_THRESHOLD_SECONDS;

/** What the progress page says right now — plain, and never a fake percentage
 *  while the total is still unknown. */
export function describe(job: Job): string {
  const p = job.progress;
  switch (job.state) {
    case "queued":
      return `Queued. ${p.total.toLocaleString()} websites to read.`;
    case "reading":
      return `Reading ${p.read.toLocaleString()} of ${p.total.toLocaleString()} websites.`;
    case "judging":
      return `Read ${p.read.toLocaleString()}. Settling the last ${(p.read - p.judged).toLocaleString()}.`;
    case "done":
      return `${p.matched.toLocaleString()} fit, out of ${p.judged.toLocaleString()} we could settle.`;
    case "failed":
      return "This stopped before it finished. Nothing was charged.";
  }
}

/** Percentage complete, or null while there is nothing honest to show. */
export function percent(job: Job): number | null {
  if (job.state === "done") return 100;
  if (!job.progress.total) return null;
  const done = job.progress.read + job.progress.judged;
  return Math.min(99, Math.floor((done / (job.progress.total * 2)) * 100));
}
