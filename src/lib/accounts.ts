/**
 * The account repository (S1-08) — server-side only.
 *
 * Every function here holds the service-role key, which bypasses every
 * row-level policy in the database. **Nothing in this file may ever be
 * imported by a client component.** The guard is not a convention: a
 * `"server-only"`-style throw is at the bottom of the file, because the day
 * someone imports `balanceOf` into a React component to save a round trip is
 * the day the service-role key ships to every browser.
 *
 * ## What is here and what is not
 *
 * The *rules* about money are not here. They are in `pricing.ts` and
 * `ledger.ts`, tested with no database and no network, and in four SQL
 * functions that hold the row lock. This file is the wire between them: it
 * computes an amount with the first, and asks the second whether it is allowed.
 *
 * That split is why `chargeMatch` below looks thin. It is meant to. Anything it
 * decided for itself would be a third opinion about a number that already has
 * two.
 */

import { settleBand } from "@/lib/pricing";
import { MILLI, type Entry, type EntryKind } from "@/lib/ledger";
import { canWrite, currentEnv } from "@/lib/db";
import type { MailKind } from "@/lib/mail";

export type AccountRow = {
  id: string;
  name: string;
  plan_id: string;
  reads_this_period: number;
  period_start: string;
  created_at: string;
  closed_at: string | null;
  /** While in the future, matches cost this workspace nothing — see 0008.
   *  Charges are still written to the ledger, at zero, so the history is a
   *  complete record of what was taken rather than a gap. */
  comped_until?: string | null;
  comped_read_budget?: number | null;
};

/** Is this workspace comped right now? Read from the row rather than computed
 *  anywhere else, because Postgres is what actually decides it in
 *  `charge_for_match` and a second opinion here would only ever be wrong. */
export const isComped = (a: Pick<AccountRow, "comped_until">) =>
  !!a.comped_until && new Date(a.comped_until).getTime() > Date.now();

export class NotConfigured extends Error {
  constructor() {
    super(
      "The database is not configured on this deployment. Set " +
        "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and " +
        "SUPABASE_SERVICE_ROLE_KEY, see docs/SETUP.md §1.",
    );
  }
}

function conn() {
  if (!canWrite()) throw new NotConfigured();
  const env = currentEnv();
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, ""),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, headers } = conn();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);

  // An empty body is not only a 204.
  //
  // `Prefer: return=minimal` makes PostgREST answer **201 Created with no
  // body**, and the first version of this guarded against 204 alone — so
  // `res.json()` threw on the member insert inside `ensureWorkspace`, which
  // died before it reached `renew_period`. The visible result was a customer
  // with a workspace, a membership row and **zero credits**: an account that
  // looked created and was not funded. The row is what proved it —
  // `period_start` was identical to `created_at` to the microsecond, and
  // `renew_period` sets `period_start = now()`, so it plainly never ran.
  //
  // Read the text first and parse only if there is something to parse. The
  // status code is not a reliable signal of whether a body exists.
  const body = await res.text();
  return (body ? (JSON.parse(body) as T) : (null as T));
}

/** Call one of the SQL functions. The atomic half of every money operation. */
const rpc = <T>(fn: string, args: Record<string, unknown>) =>
  rest<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

// ---------------------------------------------------------------- reading --

/** The workspace this Clerk user belongs to, or null if they have none yet. */
export async function accountForUser(clerkUserId: string): Promise<AccountRow | null> {
  const rows =
    (await rest<Array<{ accounts: AccountRow }> | null>(
      `account_members?user_id=eq.${encodeURIComponent(clerkUserId)}&select=accounts(*)&limit=1`,
    )) ?? [];
  return rows[0]?.accounts ?? null;
}

export async function balanceOf(accountId: string): Promise<number> {
  const rows =
    (await rest<Array<{ milli: number }> | null>(
      `account_balances?account_id=eq.${accountId}&select=milli`,
    )) ?? [];
  return rows[0]?.milli ?? 0;
}

export async function ledgerOf(accountId: string, limit = 100): Promise<Entry[]> {
  const rows =
    (await rest<Array<{
      kind: EntryKind;
      milli: number;
      at: string;
      business_id: string | null;
      why: string;
    }> | null>(
      `ledger_entries?account_id=eq.${accountId}&select=*&order=at.desc,id.desc&limit=${limit}`,
    )) ?? [];
  return rows.map((r) => ({
    kind: r.kind,
    milli: Number(r.milli),
    at: r.at,
    businessId: r.business_id ?? undefined,
    why: r.why,
  }));
}

/**
 * Which of these businesses this workspace has already paid for.
 *
 * Asked per screen, so it is asked about the forty rows on the page rather than
 * the whole table — a workspace that has been running for a year holds thousands
 * of unlocks and the page needs to know about the ones in front of it.
 *
 * Chunked because the filter travels in the URL. 200 ids is comfortably inside
 * every proxy's line limit and turns a forty-row screen into one request.
 *
 * **Never fails the page.** A screen that cannot reach the database should show
 * the free preview and say nothing is unlocked, not a 500 — the caller treats an
 * empty set as "nothing paid for yet", which is the safe direction: it withholds
 * rather than reveals.
 */
export async function unlockedIds(
  accountId: string,
  businessIds: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(businessIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const list = slice.map((id) => `"${id.replace(/"/g, '""')}"`).join(",");
    const rows =
      (await rest<Array<{ business_id: string }> | null>(
        `unlocks?account_id=eq.${accountId}&business_id=in.(${encodeURIComponent(list)})` +
          `&select=business_id`,
      )) ?? [];
    for (const r of rows) out.add(r.business_id);
  }
  return out;
}

// ---------------------------------------------------------------- writing --

/**
 * Create a workspace for a person who has just signed up, and grant the free
 * plan's credits.
 *
 * Idempotent, because a webhook is delivered at least once and Clerk retries a
 * delivery that timed out. A second `user.created` for the same person must not
 * produce a second workspace with a second free grant — that is a way to mint
 * credits by making a request fail slowly.
 */
export async function ensureWorkspace(args: {
  clerkUserId: string;
  name?: string;
  planId?: string;
  allowanceMilli: number;
  planName: string;
}): Promise<{ accountId: string; created: boolean }> {
  const existing = await accountForUser(args.clerkUserId);
  if (existing) return { accountId: existing.id, created: false };

  const [account] = await rest<AccountRow[]>("accounts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: args.name?.trim() || "My workspace",
      plan_id: args.planId ?? "free",
    }),
  });

  await rest("account_members", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify({ account_id: account.id, user_id: args.clerkUserId, role: "owner" }),
  });

  await rpc("renew_period", {
    p_account: account.id,
    p_allowance_milli: args.allowanceMilli,
    p_plan_name: args.planName,
  });

  return { accountId: account.id, created: true };
}

export type ChargeResult = { charged: boolean; reason: string | null; milli: number };

/**
 * Charge for a matched business.
 *
 * The band is settled here, by `pricing.ts`, and the settled cost is handed to
 * Postgres. The database does not know what a band is and must not learn: two
 * sources of truth about a price diverge on the first pricing change, and the
 * one in SQL is the one nobody remembers to update.
 */
export async function chargeMatch(args: {
  accountId: string;
  businessId: string;
  quotedBandCredits: number;
  deliveredRate: number;
}): Promise<ChargeResult> {
  const band = settleBand(args.quotedBandCredits, args.deliveredRate);
  const why =
    band < args.quotedBandCredits
      ? `Matched. Billed ${band} rather than the ${args.quotedBandCredits} quoted, because the scan matched more often than its sample did.`
      : `Matched. ${band} credit${band === 1 ? "" : "s"}, the rate shown before the scan.`;

  const [row] = await rpc<ChargeResult[]>("charge_for_match", {
    p_account: args.accountId,
    p_business: args.businessId,
    p_cost_milli: band * MILLI,
    p_why: why,
  });
  return { ...row, milli: Number(row.milli) };
}

export async function refund(accountId: string, businessId: string) {
  const [row] = await rpc<Array<{ refunded: boolean; reason: string | null; milli: number }>>(
    "refund_match",
    { p_account: accountId, p_business: businessId },
  );
  return { ...row, milli: Number(row.milli) };
}

/** Returns how many reads were actually permitted — never the number asked
 *  for. See `0003`'s comment: that distinction shipped wrong once. */
export async function spendReads(accountId: string, reads: number, allowance: number) {
  return Number(
    await rpc<number>("spend_reads", {
      p_account: accountId,
      p_reads: reads,
      p_allowance: allowance,
    }),
  );
}

/**
 * Apply a paid period, at most once for a given Stripe event.
 *
 * The idempotency is in the database, not here: `apply_paid_period` claims the
 * event id with a primary key inside the same transaction that grants the
 * credits. Doing it in TypeScript would be two round trips with a gap in the
 * middle, and Stripe's retries are fast enough to land inside that gap.
 */
export async function applyPaidPeriod(args: {
  eventId: string;
  kind: string;
  accountId: string;
  planId: string;
  allowanceMilli: number;
  planName: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  /**
   * Identifies the **billing period**, not the event. Two different Stripe
   * events describe one new subscription — `checkout.session.completed` and
   * `invoice.paid` — and the event id cannot tell that they are the same
   * purchase. Without this a single payment grants twice.
   */
  periodKey?: string | null;
}): Promise<{ applied: boolean; reason: string | null }> {
  const [row] = await rpc<Array<{ applied: boolean; reason: string | null }>>(
    "apply_paid_period",
    {
      p_event_id: args.eventId,
      p_kind: args.kind,
      p_account: args.accountId,
      p_plan_id: args.planId,
      p_allowance_milli: args.allowanceMilli,
      p_plan_name: args.planName,
      p_customer: args.customerId ?? null,
      p_subscription: args.subscriptionId ?? null,
      p_period_key: args.periodKey ?? null,
    },
  );
  return row;
}

// ----------------------------------------------------- destinations (S2-02) --
//
// These live here rather than in their own repository for one reason: `conn()`
// above holds the service-role key, and a second file building the same
// connection would be a second place that key is read, formatted and sent. One
// is enough.
//
// The credential itself never passes through these functions in the clear.
// `deliver.ts` seals it before it arrives and opens it after it leaves, so this
// module handles ciphertext and a four-character hint — which means a stack
// trace, a log line or an error message from here cannot carry a customer's
// CRM token.

export type DestinationRow = {
  id: string;
  account_id: string;
  kind: string;
  name: string;
  target: string | null;
  secret_hint: string;
  created_at: string;
  disabled_at: string | null;
};

export async function destinationsFor(accountId: string): Promise<DestinationRow[]> {
  return (
    (await rest<DestinationRow[] | null>(
      `destinations?account_id=eq.${accountId}&disabled_at=is.null&select=*&order=created_at.desc`,
    )) ?? []
  );
}

export async function createDestination(args: {
  accountId: string;
  kind: string;
  name: string;
  target?: string | null;
  /** Already sealed by `deliver.ts`. This function never sees a real token. */
  cipher: string;
  secretHint: string;
}): Promise<DestinationRow> {
  const [row] = await rest<DestinationRow[]>("destinations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      account_id: args.accountId,
      kind: args.kind,
      name: args.name,
      target: args.target ?? null,
      secret_hint: args.secretHint,
    }),
  });

  await rest("destination_secrets", {
    method: "POST",
    headers: { Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify({ destination_id: row.id, cipher: args.cipher }),
  });

  return row;
}

/**
 * A destination and its sealed credential, scoped to the account.
 *
 * `account_id=eq.` is in the query and not merely checked afterwards. The
 * service role bypasses every policy, so an id from a request body would
 * otherwise read another workspace's connection — the class of bug RLS exists
 * to prevent, reintroduced by the one client that is allowed past it.
 */
export async function destinationWithCipher(
  accountId: string,
  destinationId: string,
): Promise<{ destination: DestinationRow; cipher: string } | null> {
  const rows =
    (await rest<Array<DestinationRow & { destination_secrets: { cipher: string }[] }> | null>(
      `destinations?id=eq.${encodeURIComponent(destinationId)}` +
        `&account_id=eq.${accountId}&disabled_at=is.null` +
        `&select=*,destination_secrets(cipher)&limit=1`,
    )) ?? [];
  const row = rows[0];
  const cipher = row?.destination_secrets?.[0]?.cipher;
  if (!row || !cipher) return null;

  const { destination_secrets: _secrets, ...destination } = row;
  return { destination, cipher };
}

export async function recordPush(args: {
  accountId: string;
  destinationId: string;
  businessId: string;
  externalId?: string | null;
}): Promise<void> {
  await rpc("record_push", {
    p_account: args.accountId,
    p_destination: args.destinationId,
    p_business: args.businessId,
    p_external: args.externalId ?? null,
  });
}

/** Businesses this workspace pushed that have since asked to be removed.
 *
 *  `suppression.ts` tells an owner the truth — a row already exported cannot be
 *  recalled. A row already *pushed* is different, because we kept the record id
 *  the destination gave it, so the customer can be told exactly what to delete
 *  rather than being told it is too late. */
export async function pushedThenSuppressed(accountId: string) {
  return (
    (await rest<
      Array<{
        destination_id: string;
        destination_kind: string;
        destination_name: string;
        business_id: string;
        external_id: string | null;
        last_pushed_at: string;
        remove_by: string;
      }>
    >(`pushed_then_suppressed?account_id=eq.${accountId}&select=*&order=remove_by.asc`)) ?? []
  );
}

// ------------------------------------------------------------ runs (S2-12) --

export type RunRow = {
  account_id: string;
  market_id: string;
  criterion_id: string;
  query: string | null;
  scope: "city" | "state" | "country" | null;
  region_label: string | null;
  matched: number;
  judged: number;
  tallies: Record<string, number>;
  first_run_at: string;
  last_run_at: string;
  times: number;
};

/** Every search this workspace has run, most recent first. */
export async function runsFor(accountId: string, limit = 50): Promise<RunRow[]> {
  return (
    (await rest<RunRow[] | null>(
      `runs?account_id=eq.${accountId}&select=*&order=last_run_at.desc&limit=${limit}`,
    )) ?? []
  );
}

export async function runFor(
  accountId: string,
  marketId: string,
  criterionId: string,
): Promise<RunRow | null> {
  const rows =
    (await rest<RunRow[] | null>(
      `runs?account_id=eq.${accountId}` +
        `&market_id=eq.${encodeURIComponent(marketId)}` +
        `&criterion_id=eq.${encodeURIComponent(criterionId)}&select=*&limit=1`,
    )) ?? [];
  return rows[0] ?? null;
}

/** Record that a search was run. Upserts, so opening the same market twice is
 *  one row with `times = 2` rather than two identical entries. */
export async function recordRun(args: {
  accountId: string;
  marketId: string;
  criterionId: string;
  query?: string | null;
  scope?: string | null;
  regionLabel?: string | null;
  matched?: number;
  judged?: number;
  tallies?: Record<string, number>;
}): Promise<void> {
  await rpc("record_run", {
    p_account: args.accountId,
    p_market: args.marketId,
    p_criterion: args.criterionId,
    p_query: args.query ?? null,
    p_scope: args.scope ?? null,
    p_region: args.regionLabel ?? null,
    p_matched: args.matched ?? 0,
    p_judged: args.judged ?? 0,
    p_tallies: args.tallies ?? {},
  });
}

/**
 * A cancelled subscription returns the workspace to Free.
 *
 * The account is not closed and **the ledger is not touched**. Credits already
 * paid for stay until the period rolls, and the record of what someone was
 * charged is the one thing a billing dispute needs.
 */
export async function downgradeToFree(accountId: string): Promise<void> {
  await rest(`accounts?id=eq.${accountId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ plan_id: "free", stripe_subscription_id: null }),
  });
}

// The last line of defence on the service-role key. `window` is absent on the
// server and present in every browser; if this module is ever pulled into a
// client bundle, the page fails loudly at import rather than quietly shipping
// a key that bypasses every row-level policy in the database.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/accounts.ts is server-only, it holds the Supabase service-role key, " +
      "which bypasses every row-level security policy. Call it from a route " +
      "handler or a server component, never from a client component.",
  );
}

/* ======================================================= long reads (S1) ==
 *
 * A read that takes longer than a page load gets a row, so somebody can close
 * the tab and come back. See `src/lib/jobs.ts` for why the estimate is derived
 * from the crawler's real settings rather than padded.
 */

export interface JobRow {
  id: string;
  account_id: string;
  query: string;
  market_id: string | null;
  criterion_id: string | null;
  region_label: string | null;
  state: "queued" | "reading" | "judging" | "done" | "failed";
  sites_total: number;
  sites_read: number;
  sites_judged: number;
  matched: number;
  unclear: number;
  estimate_seconds: number;
  notify_email: string | null;
  notified_at: string | null;
  failure: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  /** While in the future, a worker holds this job (migration `0014`). */
  leased_until?: string | null;
  lease_holder?: string | null;
  /**
   * Why a tick declined to work on this job, in the person's terms. Distinct
   * from `failure`, which ends it: this is "not now", and the progress page
   * shows it so a paused read reads as paused rather than as stalled.
   */
  worker_note?: string | null;
}

export async function queueJob(args: {
  accountId: string;
  query: string;
  marketId?: string | null;
  criterionId?: string | null;
  regionLabel?: string | null;
  sites: number;
  estimateSeconds: number;
  notifyEmail?: string | null;
}): Promise<string> {
  return (await rpc("queue_job", {
    p_account: args.accountId,
    p_query: args.query,
    p_market: args.marketId ?? null,
    p_criterion: args.criterionId ?? null,
    p_region: args.regionLabel ?? null,
    p_sites: args.sites,
    p_estimate: args.estimateSeconds,
    p_email: args.notifyEmail ?? null,
  })) as unknown as string;
}

/**
 * Everything a finished job learned, so it can be shown to the person who paid
 * for it.
 *
 * ## Nothing read these rows back, and that was the hole in the product
 *
 * `job_sites` is where both of the job-shaped flows write their verdicts — the
 * CSV upload and, since P0.2, any trade in any US city. The worker filled them
 * in faithfully and **no screen in the product ever read them**. A customer
 * could search, spend credits, watch the read finish, and the "open the N that
 * fit" link took them to `/app?q=…`, which looks the query up against the four
 * measured market files, finds nothing, and offers to count the city again.
 * The matches they had just bought were in the database and on no screen.
 *
 * Paginated because a job can carry thousands of rows and PostgREST caps a
 * response; ordered by `ordinal` so the list is the reading order, which is the
 * order the estimate and the progress counters were about.
 */
export async function jobSiteRows(
  accountId: string,
  jobId: string,
  limit = 5_000,
): Promise<JobSiteRow[]> {
  // Scoped through the job, so a guessed id from another workspace reads as an
  // empty list rather than as somebody else's work.
  const job = await jobFor(accountId, jobId);
  if (!job) return [];

  const out: JobSiteRow[] = [];
  const page = 1_000;
  for (let from = 0; from < limit; from += page) {
    const rows =
      (await rest<JobSiteRow[] | null>(
        `job_sites?job_id=eq.${jobId}&select=*&order=ordinal.asc` +
          `&offset=${from}&limit=${Math.min(page, limit - from)}`,
      )) ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** One job, for the progress page. Scoped to the account so a guessed id from
 *  another workspace reads as missing rather than as somebody else's work. */
export async function jobFor(accountId: string, id: string): Promise<JobRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = (await rest<JobRow[] | null>(
    `jobs?id=eq.${id}&account_id=eq.${accountId}&select=*&limit=1`,
  )) ?? [];
  return rows[0] ?? null;
}

export async function jobsFor(accountId: string, limit = 20): Promise<JobRow[]> {
  return (
    (await rest<JobRow[] | null>(
      `jobs?account_id=eq.${accountId}&select=*&order=created_at.desc&limit=${limit}`,
    )) ?? []
  );
}

/** The worker's write. Counters only go up; see `advance_job`. */
export async function advanceJob(args: {
  id: string;
  state?: JobRow["state"];
  read?: number;
  judged?: number;
  matched?: number;
  unclear?: number;
  failure?: string | null;
}): Promise<void> {
  await rpc("advance_job", {
    p_job: args.id,
    p_state: args.state ?? null,
    p_read: args.read ?? null,
    p_judged: args.judged ?? null,
    p_matched: args.matched ?? null,
    p_unclear: args.unclear ?? null,
    p_failure: args.failure ?? null,
  });
}

/** True only for the caller that won the right to send the note. */
export async function claimJobNotification(id: string): Promise<boolean> {
  return Boolean(await rpc("mark_job_notified", { p_job: id }));
}

// ------------------------------------------------------- sharing a list --

export interface SharedList {
  token: string;
  account_id: string;
  market_id: string;
  criterion_id: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
  views: number;
}

/** Make a link for this list, or hand back the one that already exists.
 *  Idempotent per (account, market, criterion) — see migration `0019`. */
export async function shareList(args: {
  accountId: string;
  marketId: string;
  criterionId: string;
  label?: string | null;
}): Promise<SharedList> {
  return rpc<SharedList>("share_list", {
    p_account: args.accountId,
    p_market: args.marketId,
    p_criterion: args.criterionId,
    p_label: args.label ?? null,
  });
}

/**
 * Resolve a token and count the open, or null for an unknown or revoked one.
 *
 * Service role, never a client policy: a policy that let a client select by
 * token would let a client enumerate every token.
 */
export async function openSharedList(token: string): Promise<SharedList | null> {
  const row = await rpc<SharedList | null>("open_shared_list", { p_token: token });
  return row && row.token ? row : null;
}

/** Withdraw a link. The row stays, so the views it earned are not lost. */
export async function revokeSharedList(accountId: string, token: string): Promise<boolean> {
  return !!(await rpc<boolean>("revoke_shared_list", {
    p_account: accountId,
    p_token: token,
  }));
}

// ------------------------------------------- what the customer did with it --

/** Businesses this workspace has already reached out to, of the ones asked
 *  about. Same chunked shape and same never-fail contract as `unlockedIds`. */
export async function contactedIds(
  accountId: string,
  businessIds: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(businessIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const list = ids
      .slice(i, i + 200)
      .map((id) => `"${id.replace(/"/g, '""')}"`)
      .join(",");
    const rows =
      (await rest<Array<{ business_id: string }> | null>(
        `contacted?account_id=eq.${accountId}&business_id=in.(${encodeURIComponent(list)})` +
          `&select=business_id`,
      )) ?? [];
    for (const r of rows) out.add(r.business_id);
  }
  return out;
}

export interface ContactedRow {
  business_id: string;
  name: string | null;
  site: string | null;
  channel: string | null;
  at: string;
}

/**
 * Everything this workspace has reached out to, most recent first.
 *
 * The name travels with the row rather than being looked up — see migration
 * `0017`. A business from an upload exists in `job_sites` and nowhere else, so
 * resolving by id would have produced a screen of opaque ids for exactly the
 * customers upload was built for.
 */
export async function contactedRows(accountId: string, limit = 500): Promise<ContactedRow[]> {
  return (
    (await rest<ContactedRow[] | null>(
      `contacted?account_id=eq.${accountId}&select=business_id,name,site,channel,at` +
        `&order=at.desc&limit=${limit}`,
    )) ?? []
  );
}

export async function setContacted(args: {
  accountId: string;
  businessId: string;
  contacted: boolean;
  channel?: string | null;
  name?: string | null;
  site?: string | null;
}): Promise<void> {
  await rpc(args.contacted ? "mark_contacted" : "unmark_contacted", {
    p_account: args.accountId,
    p_business: args.businessId,
    ...(args.contacted
      ? {
          p_channel: args.channel ?? null,
          p_name: args.name ?? null,
          p_site: args.site ?? null,
        }
      : {}),
  });
}

/**
 * Why a match was wrong, in the customer's words.
 *
 * Recorded **after** the refund has already happened, never before — a refund
 * that waits on a form is not a refund on the spot. See migration `0016`: this
 * is also the hand-labelled precision data S0-16 needs and cannot automate.
 */
export async function recordFeedback(args: {
  accountId: string;
  businessId: string;
  marketId?: string | null;
  criterionId?: string | null;
  verdictWas?: string | null;
  kind?: string;
  reason?: string | null;
}): Promise<void> {
  await rpc("record_feedback", {
    p_account: args.accountId,
    p_business: args.businessId,
    p_market: args.marketId ?? null,
    p_criterion: args.criterionId ?? null,
    p_verdict: args.verdictWas ?? null,
    p_kind: args.kind ?? "not_a_fit",
    p_reason: args.reason ?? null,
  });
}

// ------------------------------------------------------------ the worker --

export interface JobSiteRow {
  job_id: string;
  business_id: string;
  name: string | null;
  site: string;
  phone: string | null;
  ordinal: number;
  state: "pending" | "taken" | "done";
  verdict: string | null;
  proof: string | null;
  pages: number;
  read_outcome: string | null;
}

/**
 * Every business this workspace has already been given, so a new read does not
 * hand back the same names.
 *
 * ## Two sources, and they mean different things
 *
 *   - **`unlocks`** — businesses they have paid for. Excluded from every search
 *     whatever its criterion. They already hold the name and the contact
 *     details; selling it a second time because it also answers a different
 *     question is charging twice for one thing.
 *   - **`job_sites` for jobs asking the same question** — businesses we have
 *     already read *for this criterion*. Reading them again costs a crawl and a
 *     model call to re-learn an answer we have. Scoped to the criterion on
 *     purpose: a practice with no online booking may well have no quote form,
 *     and dropping it from every future search would lose a real match.
 *
 * ## Why it is capped
 *
 * The result goes into a `NOT IN (…)` list in the Overture query, so it travels
 * as SQL text. `LIMIT` keeps that bounded; a workspace past it gets a few
 * repeats rather than a failed search, which is the right way round. 20,000 ids
 * is about 700 KB of SQL and far beyond any real workspace today.
 *
 * **Never fails the caller.** An unreachable database returns an empty set,
 * which means "nothing to exclude" — the search still runs and may repeat a
 * name. The alternative is refusing to search at all, which is worse.
 */
export async function everGivenIds(
  accountId: string,
  opts: { criterionId?: string | null; limit?: number } = {},
): Promise<Set<string>> {
  const limit = Math.max(1, Math.min(opts.limit ?? 20_000, 50_000));
  const out = new Set<string>();

  try {
    const unlocked =
      (await rest<Array<{ business_id: string }> | null>(
        `unlocks?account_id=eq.${accountId}&select=business_id&limit=${limit}`,
      )) ?? [];
    for (const r of unlocked) out.add(r.business_id);
  } catch {
    // Nothing to exclude. See the note above.
  }

  if (!opts.criterionId) return out;

  try {
    // Two round trips rather than a PostgREST embed: `job_sites` carries no
    // `account_id`, and relying on an implicit relationship name is a thing
    // that breaks on a schema rename with no test to catch it.
    const jobs =
      (await rest<Array<{ id: string }> | null>(
        `jobs?account_id=eq.${accountId}&criterion_id=eq.${encodeURIComponent(opts.criterionId)}` +
          `&select=id&limit=500`,
      )) ?? [];
    for (let i = 0; i < jobs.length; i += 50) {
      const list = jobs
        .slice(i, i + 50)
        .map((j) => `"${j.id}"`)
        .join(",");
      const rows =
        (await rest<Array<{ business_id: string }> | null>(
          `job_sites?job_id=in.(${encodeURIComponent(list)})&select=business_id&limit=${limit}`,
        )) ?? [];
      for (const r of rows) out.add(r.business_id);
      if (out.size >= limit) break;
    }
  } catch {
    // As above.
  }

  return out;
}

/** Put a job's work list in place. Idempotent — see migration `0014`. */
export async function addJobSites(
  jobId: string,
  rows: Array<{
    business_id: string;
    name?: string | null;
    site: string;
    phone?: string | null;
    ordinal?: number;
  }>,
): Promise<number> {
  return Number(await rpc<number>("add_job_sites", { p_job: jobId, p_rows: rows }));
}

/**
 * Take the oldest job with work left, and hold it for the length of a slice.
 *
 * Returns null when there is nothing to do, which is the ordinary answer most
 * of the time and is not an error. `claim_job` does the locking; this only
 * carries the result.
 */
export async function claimJob(holder: string, leaseSeconds = 120): Promise<JobRow | null> {
  const row = await rpc<JobRow | null>("claim_job", {
    p_holder: holder,
    p_lease_seconds: leaseSeconds,
  });
  return row && row.id ? row : null;
}

/**
 * Claim one named job, rather than whichever is oldest.
 *
 * For a person advancing their own read while no scheduler exists — see
 * migration `0018`. The caller must already have established that the job
 * belongs to their workspace; this only takes the lease.
 */
export async function claimThisJob(
  jobId: string,
  holder: string,
  leaseSeconds = 120,
): Promise<JobRow | null> {
  const row = await rpc<JobRow | null>("claim_this_job", {
    p_job: jobId,
    p_holder: holder,
    p_lease_seconds: leaseSeconds,
  });
  return row && row.id ? row : null;
}

/** The next few sites of this job, marked as in flight. */
export async function takeSites(jobId: string, n: number): Promise<JobSiteRow[]> {
  return (await rpc<JobSiteRow[] | null>("take_sites", { p_job: jobId, p_n: n })) ?? [];
}

/** Rows a dead worker left claimed, returned to the queue. */
export async function sweepStrandedSites(olderSeconds = 600): Promise<number> {
  return Number(await rpc<number>("sweep_stranded_sites", { p_older_seconds: olderSeconds }));
}

/** Write a slice of results. Counters are recomputed from them, not incremented,
 *  so a retried slice is harmless. */
export async function recordSites(
  jobId: string,
  rows: Array<{
    business_id: string;
    verdict: string;
    proof: string | null;
    pages: number;
    outcome: string;
  }>,
): Promise<void> {
  await rpc("record_sites", { p_job: jobId, p_rows: rows });
}

/** Hand the job back: finished, stopped, or simply out of time. */
export async function releaseJob(
  jobId: string,
  note?: string | null,
  failure?: string | null,
): Promise<string> {
  return String(
    await rpc<string>("release_job", {
      p_job: jobId,
      p_note: note ?? null,
      p_failure: failure ?? null,
    }),
  );
}

export interface NudgeCandidate {
  account_id: string;
  clerk_user: string | null;
  first_query: string | null;
  source: string | null;
  milli: number;
}

/**
 * Workspaces the two-day nudge is for.
 *
 * Six exclusions, and every one is a way of *not* sending it — see migration
 * `0021`. The address is not here: this product stores no customer email of its
 * own, deliberately, so the caller resolves `clerk_user` through Clerk.
 */
export async function nudgeCandidates(args?: {
  afterHours?: number;
  beforeHours?: number;
  limit?: number;
}): Promise<NudgeCandidate[]> {
  return (
    (await rpc<NudgeCandidate[] | null>("nudge_candidates", {
      p_after_hours: args?.afterHours ?? 48,
      p_before_hours: args?.beforeHours ?? 168,
      p_limit: args?.limit ?? 200,
    })) ?? []
  );
}

/**
 * Claim the right to send one message, or find that somebody already has.
 *
 * `claim_mail` is an insert with `on conflict do nothing … returning`, so
 * exactly one caller wins whatever else is running — see migration `0013`. The
 * claim is taken **before** the provider is called, which means a provider
 * failure costs a message rather than duplicating one. That is the right way
 * round: a missing email is visible in the app, a duplicate is only visible in
 * somebody's inbox.
 *
 * `period` is `''` for a once-ever message and an ISO week for the digest.
 */
export async function claimMail(
  accountId: string,
  kind: MailKind,
  period = "",
): Promise<boolean> {
  return !!(await rpc<boolean>("claim_mail", {
    p_account: accountId,
    p_kind: kind,
    p_period: period,
  }));
}

/** What became of a claimed message. `why` is kept so that "no mail provider is
 *  configured" is a fact somebody can query rather than a log line that rolled
 *  off. */
export async function recordMail(args: {
  accountId: string;
  kind: MailKind;
  period?: string;
  sent: boolean;
  why?: string | null;
}): Promise<void> {
  await rpc("record_mail", {
    p_account: args.accountId,
    p_kind: args.kind,
    p_period: args.period ?? "",
    p_sent: args.sent,
    p_why: args.why ?? null,
  });
}

/**
 * Record where a workspace came from — once.
 *
 * `record_attribution` uses `coalesce`, so the first door to write wins. A
 * customer who later arrives through a different link has already been
 * attributed, and overwriting would credit the last touch to a channel that did
 * not do the work.
 */
export async function recordAttribution(args: {
  accountId: string;
  source?: string | null;
  sells?: string | null;
  query?: string | null;
}): Promise<void> {
  await rpc("record_attribution", {
    p_account: args.accountId,
    p_source: args.source ?? null,
    p_sells: args.sells ?? null,
    p_query: args.query ?? null,
  });
}
