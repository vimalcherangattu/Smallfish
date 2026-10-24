/**
 * Counts are measured once a week, not once a visitor.
 *
 * ## Why this exists
 *
 * The Vercel team (Hobby, twelve projects) hit 100% of its monthly Active CPU
 * on 2026-10-24, and going over pauses every project on it. Each free count —
 * `/api/pool`, `/api/supply`, the MCP count — ran a DuckDB scan inside the
 * function, and nothing stopped the next visitor asking for Denver plumbers
 * from paying for the same scan again.
 *
 * So a count is cached per (provider, categories, region, radius) for
 * `TTL_DAYS`, in `supply_counts` (migration `0033`). **A hit never opens
 * DuckDB.** The number is still a measured one, and it travels with the date it
 * was measured, which the screen says.
 *
 * ## And a fresh scan is rationed per address
 *
 * `take_scan` lets one anonymous address cause `PER_HOUR` / `PER_DAY` fresh
 * scans. Cache hits are not rationed, because they cost nothing. The address is
 * stored as a salted hash and never in the clear.
 *
 * ## Both fail open, deliberately
 *
 * Without the database — unconfigured, or the migration not applied — a lookup
 * is a miss and the ration allows. A search that works and costs CPU beats a
 * search that is down; the CPU budget is protected by the cache working, not by
 * search failing when it does not.
 */

import "server-only";

import { createHash } from "node:crypto";

import { currentEnv } from "@/lib/db";
import type { Resolution } from "@/lib/region";

export const TTL_DAYS = 7;
export const PER_HOUR = 10;
export const PER_DAY = 30;

export interface CachedCount {
  listings: number;
  withSite: number;
  samples: unknown[] | null;
  release: string | null;
  ms: number | null;
  /** ISO timestamp of the scan this number came from. */
  measuredAt: string;
}

function conn() {
  const env = currentEnv();
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return {
    url: `${url.replace(/\/$/, "")}/rest/v1`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}

/**
 * The cache key. Region by its label, scope and the centres actually searched,
 * so "Denver" and "Colorado" never share a row; categories sorted, so the same
 * group asked in a different order is one row.
 */
export function countKey(
  provider: string,
  categories: string[],
  region: Pick<Resolution, "label" | "scope" | "sample" | "city">,
  radiusMiles: number,
): string {
  const centres = (region.sample?.length ? region.sample : region.city ? [region.city] : [])
    .map((c) => c.center.map((v) => v.toFixed(3)).join(","))
    .join(";");
  return [provider, [...categories].sort().join(","), region.scope, region.label, centres, radiusMiles].join("|");
}

export async function readCount(key: string, needSamples = false): Promise<CachedCount | null> {
  const c = conn();
  if (!c) return null;
  const since = new Date(Date.now() - TTL_DAYS * 86_400_000).toISOString();
  try {
    const res = await fetch(
      `${c.url}/supply_counts?key=eq.${encodeURIComponent(key)}&computed_at=gt.${encodeURIComponent(since)}&select=*`,
      { headers: c.headers, cache: "no-store", signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) return null;
    const [row] = (await res.json()) as Array<Record<string, unknown>>;
    if (!row) return null;
    if (needSamples && !Array.isArray(row.samples)) return null;
    return {
      listings: Number(row.listings),
      withSite: Number(row.with_site),
      samples: Array.isArray(row.samples) ? row.samples : null,
      release: (row.release as string) ?? null,
      ms: row.ms == null ? null : Number(row.ms),
      measuredAt: String(row.computed_at),
    };
  } catch {
    return null;
  }
}

/** Never throws: a cache write that fails must not fail the search it follows. */
export async function writeCount(
  key: string,
  provider: string,
  v: { listings: number; withSite: number; samples?: unknown[] | null; release?: string | null; ms?: number },
): Promise<void> {
  const c = conn();
  if (!c) return;
  try {
    await fetch(`${c.url}/supply_counts?on_conflict=key`, {
      method: "POST",
      headers: { ...c.headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        key,
        provider,
        release: v.release ?? null,
        listings: v.listings,
        with_site: v.withSite,
        samples: v.samples ?? null,
        ms: v.ms ?? null,
        computed_at: new Date().toISOString(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    // Logged by the platform as a failed fetch; nothing for the visitor to see.
  }
}

/** The caller's address, hashed. Vercel sets `x-forwarded-for`; the first
 *  entry is the client. */
export function addressOf(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const salt = currentEnv().SUPABASE_SERVICE_ROLE_KEY?.slice(-16) ?? "smallfish";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** May this address cause one more fresh scan? Fails open, see above. */
export async function takeScan(req: Request): Promise<boolean> {
  const c = conn();
  if (!c) return true;
  try {
    const res = await fetch(`${c.url}/rpc/take_scan`, {
      method: "POST",
      headers: c.headers,
      body: JSON.stringify({ p_ip: addressOf(req), p_per_hour: PER_HOUR, p_per_day: PER_DAY }),
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return true;
    return (await res.json()) !== false;
  } catch {
    return true;
  }
}

/** What a rationed visitor is told. Says what still works: cached counts do. */
export const RATIONED = {
  ok: false as const,
  reason: "That is a lot of fresh counts from here today.",
  hint:
    "Counts somebody has already asked for still answer instantly. A new one opens again " +
    "within the hour, or sign in and it is not rationed.",
};

/** "24 Oct" — the date a cached number was measured, as the screen says it. */
export const measuredOn = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
