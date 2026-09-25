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

export type AccountRow = {
  id: string;
  name: string;
  plan_id: string;
  reads_this_period: number;
  period_start: string;
  created_at: string;
  closed_at: string | null;
};

export class NotConfigured extends Error {
  constructor() {
    super(
      "The database is not configured on this deployment. Set " +
        "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and " +
        "SUPABASE_SERVICE_ROLE_KEY — see docs/SETUP.md §1.",
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
    "lib/accounts.ts is server-only — it holds the Supabase service-role key, " +
      "which bypasses every row-level security policy. Call it from a route " +
      "handler or a server component, never from a client component.",
  );
}
