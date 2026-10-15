/**
 * One sweep of the prospect finder (GTM, outreach A1).
 *
 * Small Fish finding its own customers with its own engine: the agencies in a
 * city from Overture, each one's site read with `readSite` (robots, throttle,
 * the honest user agent, exactly as a customer's job reads), and
 * `prospects.ts` deciding what trade it serves and whom to write to.
 *
 * Sliced like the worker: a sweep reads what fits in its budget, writes every
 * row it read, and stops. Domains already in `gtm_prospects` are excluded up
 * front, so the next sweep of the same city carries on rather than starting
 * over, and nothing is read twice.
 *
 * Nothing here sends anything. A row reaching `found` means it is ready to be
 * drafted; drafting, review and sending are later steps, and each is its own
 * gate.
 */

import { canWrite, currentEnv } from "@/lib/db";
import { findCandidates, readable } from "@/lib/providers";
import {
  AGENCY_CATEGORIES,
  domainOf,
  nichesIn,
  pickEmail,
  primaryNiche,
} from "@/lib/prospects";
import { readSite } from "@/lib/read";
import type { Resolution } from "@/lib/region";
import type { Criterion } from "@/lib/types";

/** What we read an agency's site for. Not a catalogue signal, so `pagesFor`
 *  falls back to about/services/contact, which is where agencies say who they
 *  serve and how to reach them. */
const CRITERION: Criterion = {
  id: "agency-niches",
  type: "presence",
  text: "names the industries it serves",
  explain: "We read the agency's about and services pages for the trades it names.",
  needsModel: false,
};

export interface ProspectRow {
  domain: string;
  name: string | null;
  site: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  email_page: string | null;
  niches: unknown;
  niche: string | null;
  niche_quote: string | null;
  outcome: string;
  pages: number;
  status: string;
  source: string;
  read_at: string;
}

function conn() {
  const env = currentEnv();
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    url: `${env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/rest/v1`,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  };
}

async function rest(path: string, init?: RequestInit): Promise<unknown> {
  const { url, headers } = conn();
  const res = await fetch(`${url}/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

/** Every domain already stored. A few thousand short strings at most. */
async function knownDomains(): Promise<Set<string>> {
  const rows = (await rest("gtm_prospects?select=domain&limit=20000")) as Array<{ domain: string }> | null;
  return new Set((rows ?? []).map((r) => r.domain));
}

async function upsert(rows: ProspectRow[]): Promise<void> {
  if (!rows.length) return;
  await rest("gtm_prospects?on_conflict=domain", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }))),
  });
}

/** Counts by status, for the status route and the daily control email. */
export async function prospectCounts(): Promise<Record<string, number>> {
  const rows = (await rest("gtm_prospects?select=status&limit=20000")) as Array<{ status: string }> | null;
  const out: Record<string, number> = {};
  for (const r of rows ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
  return out;
}

/** Read one agency and decide what it is. Exported for the test's shape check
 *  and for a by-hand re-read of a single domain. */
export async function readAgency(
  c: { name: string | null; site: string; phone: string | null; addr?: string | null },
  where: { city: string | null; state: string | null },
  source: string,
): Promise<ProspectRow | null> {
  const domain = domainOf(c.site);
  if (!domain) return null;
  const read = await readSite(c.site, CRITERION, { name: c.name, phone: c.phone, addr: c.addr ?? null });
  const base = {
    domain,
    name: c.name,
    site: c.site,
    city: where.city,
    state: where.state,
    phone: c.phone,
    pages: read.result.pages,
    outcome: read.result.outcome,
    source,
    read_at: new Date().toISOString(),
  };
  if (read.result.outcome !== "ok") {
    return { ...base, email: null, email_page: null, niches: [], niche: null, niche_quote: null, status: "unread" };
  }

  // The first stretch of the home page stands in for its title and headline:
  // `readSite` keeps text, not markup, and the opening words are where an
  // agency says what it is.
  const hits = nichesIn(read.text, read.text.slice(0, 200));
  const primary = primaryNiche(hits);

  // Contacts are withheld when the page cannot be tied to the business. For a
  // prospect that is the right call too: an address we cannot attribute is
  // somebody else's.
  const published = read.result.contacts?.withheld ? [] : read.result.contacts?.emails ?? [];
  const email = pickEmail(published.map((e) => e.value), domain);
  const page = published.find((e) => e.value.toLowerCase() === email)?.page ?? null;

  return {
    ...base,
    email,
    email_page: page,
    niches: hits.slice(0, 6),
    niche: primary?.id ?? null,
    niche_quote: primary?.quote ?? null,
    status: !primary ? "no_niche" : !email ? "no_email" : "found",
  };
}

export interface SweepResult {
  ok: boolean;
  reason?: string;
  region: string;
  listings: number;
  fresh: number;
  read: number;
  found: number;
  byStatus: Record<string, number>;
  ms: number;
}

/**
 * Sweep one region until the budget runs out.
 *
 * Reads run a few at a time across different domains; `readSite` throttles
 * per domain, so concurrency here never means hammering one site.
 */
export async function sweep(
  region: Resolution,
  opts: { budgetMs?: number; max?: number; concurrency?: number } = {},
): Promise<SweepResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const label = region.label;
  if (!canWrite()) {
    return { ok: false, reason: "The database is not configured.", region: label, listings: 0, fresh: 0, read: 0, found: 0, byStatus: {}, ms: 0 };
  }

  const known = await knownDomains();
  const supply = await findCandidates({
    categories: [...AGENCY_CATEGORIES],
    trade: "marketing agency",
    region,
    rows: true,
    limit: 400,
  });
  const fresh = readable(supply.rows ?? []).filter((c) => {
    const d = domainOf(c.site);
    if (!d || known.has(d)) return false;
    known.add(d); // one agency listed twice is read once
    return true;
  });

  const where = {
    city: region.city?.name ?? null,
    state: (region.city?.state ?? region.state?.code ?? "").replace(/^US-/, "") || null,
  };
  const queue = fresh.slice(0, opts.max ?? 60);
  const rows: ProspectRow[] = [];
  const workers = Array.from({ length: opts.concurrency ?? 6 }, async () => {
    while (queue.length && Date.now() - started < budget) {
      const c = queue.shift()!;
      try {
        const row = await readAgency(
          { name: c.name, site: c.site, phone: c.phone ?? null, addr: c.addr ?? null },
          where,
          supply.source,
        );
        if (row) rows.push(row);
      } catch {
        /* one site failing does not fail the sweep; it is retried next time */
      }
    }
  });
  await Promise.all(workers);
  await upsert(rows);

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return {
    ok: true,
    region: label,
    listings: supply.listings,
    fresh: fresh.length,
    read: rows.length,
    found: byStatus.found ?? 0,
    byStatus,
    ms: Date.now() - started,
  };
}
