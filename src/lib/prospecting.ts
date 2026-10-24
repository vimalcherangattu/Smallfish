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
  GAP,
  NICHES,
  domainOf,
  listQuery,
  nichesIn,
  pickEmail,
  primaryNiche,
  token,
} from "@/lib/prospects";
import { judge, readSite } from "@/lib/read";
import { resolveRegion, type Places, type Resolution } from "@/lib/region";
import { SIGNAL_BY_ID } from "@/lib/signals";
import { matchTrade, type Taxonomy } from "@/lib/trades";
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
  audience?: string | null;
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

export async function rest(path: string, init?: RequestInit): Promise<unknown> {
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

/** One line in the outreach log. Never throws: a tracking write that fails
 *  must not stop a send or a reply. */
export async function logEvent(
  kind: string,
  who: { domain?: string | null; email?: string | null },
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await rest("gtm_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ kind, domain: who.domain ?? null, email: who.email?.toLowerCase() ?? null, detail }),
    });
  } catch {
    /* logged nowhere, on purpose: see above */
  }
}

/** Addresses and domains that asked us to stop. */
export async function suppressedOutreach(): Promise<{ emails: Set<string>; domains: Set<string> }> {
  const rows = ((await rest("gtm_suppressed?select=value&limit=50000")) as Array<{ value: string }> | null) ?? [];
  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const r of rows) (r.value.includes("@") ? emails : domains).add(r.value.toLowerCase());
  return { emails, domains };
}

export async function suppressOutreach(value: string, why: string): Promise<void> {
  await rest("gtm_suppressed?on_conflict=value", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ value: value.toLowerCase(), why }),
  });
}

/** Every domain already stored. A few thousand short strings at most. */
async function knownDomains(): Promise<Set<string>> {
  const rows = (await rest("gtm_prospects?select=domain&limit=20000")) as Array<{ domain: string }> | null;
  return new Set((rows ?? []).map((r) => r.domain));
}

/** The NOT NULL columns of `gtm_prospects` and their database defaults. An
 *  explicit null is not the default, so a missing key is filled from here. */
const PROSPECT_DEFAULTS: Record<string, unknown> = { audience: "agency", niches: [], pages: 0, status: "found", source: "overture" };

/** PostgREST takes a bulk insert only when every object has the same keys
 *  (PGRST102). Fill any key one row lacks with the column's default, or null
 *  where the column allows it, so a new optional field cannot sink a batch. */
export function sameKeys<T extends object>(rows: T[]): Array<Record<string, unknown>> {
  const keys = new Set(rows.flatMap((r) => Object.keys(r)));
  return rows.map((r) =>
    Object.fromEntries([...keys].map((k) => [k, (r as Record<string, unknown>)[k] ?? PROSPECT_DEFAULTS[k] ?? null])),
  );
}

export async function upsertProspects(rows: ProspectRow[]): Promise<void> {
  if (!rows.length) return;
  await rest("gtm_prospects?on_conflict=domain", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(sameKeys(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })))),
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
    // Every row in one upsert must carry the same keys, or PostgREST refuses the
    // whole batch ("All object keys must match", PGRST102): an unread row without
    // `audience` threw away every found prospect beside it, 2026-10-17 to 10-19.
    // And not null: the column is NOT NULL with default 'agency', and an explicit
    // null is not the default (23502, first Actions run, 2026-10-24).
    return { ...base, email: null, email_page: null, niches: [], niche: null, niche_quote: null, status: "unread", audience: "agency" };
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
    // An agency that serves no one trade but publishes a person's address is
    // still worth writing to: it gets the widget campaign, which needs no niche.
    status: !email ? (primary ? "no_email" : "no_niche") : "found",
    audience: primary ? "agency" : "widget",
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
  await upsertProspects(rows);

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

/* ------------------------------------------------- the free list (A2) -- */

/**
 * What `/hi/[token]` shows. Everything but `rows` is set when the email is
 * drafted, because it is free: one count query. `rows` is built on the first
 * visit, because it is not: about 10 to 20 model reads, $0.09 to $0.21 at the
 * measured cost per match. Building it only for the agencies that click is the
 * difference between a few dollars per thousand emails and a hundred and fifty.
 */
export interface ProspectList {
  token: string;
  domain: string;
  name: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  list_query: string | null;
  list_listings: number | null;
  list_readable: number | null;
  list_read: number | null;
  list_rows: ListRow[] | null;
  list_at: string | null;
}

export interface ListRow {
  name: string;
  site: string;
  phone: string | null;
  proof: string;
}

/** Lists built per UTC day, at most. A bot that follows every link in every
 *  email would otherwise spend the model budget for us. */
export const DAILY_LIST_CAP = 20;
/** Stop reading once this many fit: the page shows three. */
const WANT = 3;
/** And never read more than this many for one list. */
const MAX_READS = 40;

const pick =
  "list_token,domain,name,niche,city,state,list_query,list_listings,list_readable,list_read,list_rows,list_at";

export async function listByToken(t: string): Promise<ProspectList | null> {
  if (!/^[A-Za-z0-9]{10}$/.test(t) || !canWrite()) return null;
  const rows = (await rest(`gtm_prospects?list_token=eq.${t}&select=${pick}&limit=1`)) as
    | Array<Omit<ProspectList, "token"> & { list_token: string }>
    | null;
  const r = rows?.[0];
  return r ? { ...r, token: r.list_token } : null;
}

async function listsBuiltToday(): Promise<number> {
  const since = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const rows = (await rest(
    `gtm_prospects?list_at=gte.${since}&list_rows=not.is.null&select=id&limit=${DAILY_LIST_CAP + 1}`,
  )) as unknown[] | null;
  return rows?.length ?? 0;
}

const where = (p: { city: string | null; state: string | null }) =>
  [p.city, p.state].filter(Boolean).join(", ");

/** The search the free list runs, and its criterion. Null when the niche has
 *  no gap, which `test_prospects.mjs` says cannot happen. */
export function listCriterion(nicheId: string | null): { criterion: Criterion; label: string } | null {
  const n = NICHES.find((x) => x.id === nicheId);
  const g = n ? SIGNAL_BY_ID[GAP[n.id]] : null;
  if (!n || !g) return null;
  return {
    label: g.label,
    criterion: { id: `${g.id}:absence`, type: "absence", text: g.absenceText, explain: g.how, needsModel: true },
  };
}

/**
 * The free half, run when a prospect is drafted: a token, the search in words,
 * and how many of that trade the city has. One count query, no reads.
 */
export async function prepareList(
  p: { domain: string; niche: string | null; city: string | null; state: string | null; list_token?: string | null },
  data: { taxo: Taxonomy; places: Places },
  rand: (n: number) => Uint8Array,
): Promise<{ token: string; query: string; listings: number; readable: number } | null> {
  const n = NICHES.find((x) => x.id === p.niche);
  const c = listCriterion(p.niche);
  const region = resolveRegion(data.places, where(p));
  const trade = n ? matchTrade(data.taxo, n.trade).best : null;
  if (!n || !c || !region || !trade) return null;
  const s = await findCandidates({ categories: trade.categories, trade: n.trade, region, rows: false });
  const out = {
    token: p.list_token || token(rand),
    query: listQuery(n, where(p), c.criterion.text),
    listings: s.listings,
    readable: s.withSite,
  };
  if (canWrite()) {
    await rest(`gtm_prospects?domain=eq.${encodeURIComponent(p.domain)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        list_token: out.token,
        list_query: out.query,
        list_listings: out.listings,
        list_readable: out.readable,
        updated_at: new Date().toISOString(),
      }),
    });
  }
  return out;
}

export type BuildResult =
  | { ok: true; rows: ListRow[]; read: number }
  | { ok: false; reason: "unknown" | "capped" | "no_niche" | "nothing_found"; read?: number };

/**
 * The paid half, run on the first visit. Reads the niche in the agency's city
 * with exactly the read and judge a customer's job uses, stops at three that
 * fit, and keeps our verdict and the proof, nothing else.
 *
 * Suppressed businesses are skipped before they are read: a business that
 * asked to be left out does not turn up in our own marketing either.
 */
export async function buildList(
  t: string,
  data: { taxo: Taxonomy; places: Places; suppressed: Set<string> },
  budgetMs = 45_000,
): Promise<BuildResult> {
  const started = Date.now();
  const p = await listByToken(t);
  if (!p) return { ok: false, reason: "unknown" };
  if (p.list_rows?.length) return { ok: true, rows: p.list_rows, read: p.list_read ?? 0 };
  // Tried and found nothing: say so again rather than paying to find nothing
  // twice. A week later the sites may have changed, so it may try once more.
  if (p.list_at && p.list_rows && Date.now() - new Date(p.list_at).getTime() < 7 * 86_400_000) {
    return { ok: false, reason: "nothing_found", read: p.list_read ?? 0 };
  }
  if ((await listsBuiltToday()) >= DAILY_LIST_CAP) return { ok: false, reason: "capped" };

  const n = NICHES.find((x) => x.id === p.niche);
  const c = listCriterion(p.niche);
  const region = resolveRegion(data.places, where(p));
  const trade = n ? matchTrade(data.taxo, n.trade).best : null;
  if (!n || !c || !region || !trade) return { ok: false, reason: "no_niche" };

  const s = await findCandidates({ categories: trade.categories, trade: n.trade, region, rows: true, limit: 200 });
  const queue = readable(s.rows ?? []).filter((r) => !data.suppressed.has(r.id)).slice(0, MAX_READS);
  const rows: ListRow[] = [];
  let read = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length && rows.length < WANT && Date.now() - started < budgetMs) {
        const b = queue.shift()!;
        read += 1;
        try {
          const r = await readSite(b.site, c.criterion, { name: b.name, phone: b.phone ?? null, addr: b.addr ?? null });
          const v = await judge(r, c.criterion);
          if (v.verdict === "match" && rows.length < WANT) {
            rows.push({ name: b.name ?? domainOf(b.site) ?? b.site, site: b.site, phone: b.phone ?? null, proof: v.proof ?? v.reason });
          }
        } catch {
          /* one site failing does not fail the list */
        }
      }
    }),
  );

  // Keep a partial list rather than throw away what it cost. A visit that
  // found two shows two, and says it stopped looking.
  await rest(`gtm_prospects?list_token=eq.${t}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ list_rows: rows, list_read: read, list_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  });
  await logEvent("list_built", { domain: p.domain }, { found: rows.length, read });
  return rows.length ? { ok: true, rows, read } : { ok: false, reason: "nothing_found", read };
}
