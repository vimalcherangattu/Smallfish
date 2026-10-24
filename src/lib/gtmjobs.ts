/**
 * The three heavy outreach sweeps, as functions (GTM, 2026-10-24).
 *
 * ## Why they are not route bodies any more
 *
 * They were the bodies of `/api/outreach/{counts,credits,prospects}`, called
 * around the clock by pg_cron, and on 2026-10-24 they used 100% of the Vercel
 * team's Hobby allowance of 4 hours/month of Fluid Active CPU. That limit is
 * team-wide: going over pauses all twelve projects. The owner's rule since: **no
 * DuckDB scan and no multi-site crawl runs inside a Vercel function on a
 * schedule.**
 *
 * So the work lives here, and two callers share it:
 *
 * - `scripts/gtm-runner.ts`, run by `.github/workflows/gtm-sweeps.yml` on
 *   GitHub's runners. This is the scheduled path, and it is not bound by a
 *   function's 60 seconds, so it gets real budgets.
 * - The routes, kept for a by-hand call behind the scheduler secret, with the
 *   old budgets. Nothing schedules them (migration 0032).
 *
 * One implementation, so the crawl rules cannot fork between the two:
 * robots.txt, per-domain throttling and the honest user agent all live in
 * `read.ts` and `seller.ts`, and both callers go through them.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getState, setState } from "@/lib/contactpipe";
import { creditsIn, prospectable } from "@/lib/credits";
import { slugFor, TRADES } from "@/lib/howmany";
import { logEvent, prospectCounts, readAgency, rest, sweep, upsertProspects, type SweepResult } from "@/lib/prospecting";
import { NICHES, domainOf } from "@/lib/prospects";
import { findCandidates, readable } from "@/lib/providers";
import { resolveRegion, type Places } from "@/lib/region";
import { robotsAllows, safeUrl } from "@/lib/seller";
import { RELEASE } from "@/lib/supply";
import { matchTrade, type Taxonomy } from "@/lib/trades";

const dir = path.join(process.cwd(), "public", "data");
const json = async <T,>(n: string) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as T;
const data = () => Promise.all([json<Taxonomy>("trades.json"), json<Places>("places-us.json")]);

const CITIES = 50;
const bigCities = (p: Places) => [...p.cities].sort((a, b) => b.pop - a.pop).slice(0, CITIES);

/* ------------------------------------------------------------- counts -- */

const STALE_MS = 30 * 86_400_000;

/**
 * Fill the /how-many pages: count the next trade and city pairs that have no
 * row yet, or whose row is older than a month, until the budget runs out. One
 * count is one open-data query, no model call.
 */
export async function runCounts(budgetMs: number) {
  const started = Date.now();
  const [taxo, places] = await data();
  const have = new Map(
    (((await rest("gtm_counts?select=slug,computed_at&limit=5000")) as Array<{ slug: string; computed_at: string }>) ?? []).map(
      (r) => [r.slug, Date.parse(r.computed_at)],
    ),
  );
  // Biggest cities first, every trade, so the most-asked pages land first.
  const todo = bigCities(places)
    .flatMap((c) => TRADES.map((t) => ({ t, c, slug: slugFor(t.id, c.name, c.state.replace(/^US-/, "")) })))
    .filter((x) => !have.has(x.slug) || Date.now() - (have.get(x.slug) ?? 0) > STALE_MS);

  const counted: string[] = [];
  for (const { t, c, slug } of todo) {
    if (Date.now() - started > budgetMs) break;
    const st = c.state.replace(/^US-/, "");
    const trade = matchTrade(taxo, t.query).best;
    const region = resolveRegion(places, `${c.name}, ${st}`);
    if (!trade || !region) continue;
    const s = await findCandidates({ categories: trade.categories, trade: t.query, region, rows: false }).catch(() => null);
    if (!s) continue;
    await rest("gtm_counts?on_conflict=slug", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        slug, trade: t.id, label: t.label, city: c.name, state: st, pop: c.pop,
        listings: s.listings, with_site: s.withSite, release: RELEASE, computed_at: new Date().toISOString(),
      }),
    });
    counted.push(slug);
  }
  return { ok: true, counted, remaining: todo.length - counted.length };
}

/* ------------------------------------------------------------ credits -- */

const UA = "SmallFishBot/0.1 (+https://www.getsmallfish.com/bot; business listing verification)";
const MIN_SITES = 2;
const niches = NICHES.filter((n) => !n.leadOnly);

async function homePage(site: string): Promise<string | null> {
  const u = safeUrl(site);
  if (!u || !(await robotsAllows(u))) return null;
  const res = await fetch(u.toString(), {
    headers: { "user-agent": UA, accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
  return (await res.text()).slice(0, 600_000);
}

type CreditRow = { site_domain: string; agency_domain: string | null; agency_name: string | null; phrase: string | null; trade: string; city: string; state: string };

/**
 * "Website by X" mining. Takes the next trade and city (every agency niche
 * across the fifty largest cities, in turn), reads the home page of local
 * businesses not read before, keeps the footer credit if there is one. One page
 * per business, robots.txt honoured, the honest user agent, no model call.
 *
 * Then promotes: an agency credited on two or more sites is read like any other
 * prospect, and when its own site names no trade, the credits do.
 */
export async function runCredits(opts: { scanMs: number; totalMs: number }) {
  const started = Date.now();
  const [taxo, places] = await data();
  const pairs = bigCities(places).flatMap((c) => niches.map((n) => ({ n, c })));
  const cursor = ((await getState<{ i: number }>("credits_cursor"))?.i ?? 0) % pairs.length;
  const { n, c } = pairs[cursor];
  const st = c.state.replace(/^US-/, "");

  /* -- scan: the next trade and city ---------------------------------- */
  let scanned = 0;
  let credited = 0;
  let left = 0;
  const trade = matchTrade(taxo, n.trade).best;
  const region = resolveRegion(places, `${c.name}, ${st}`);
  if (trade && region) {
    const supply = await findCandidates({ categories: trade.categories, trade: n.trade, region, rows: true, limit: 300 }).catch(() => null);
    const sites = readable(supply?.rows ?? [])
      .map((r) => ({ site: r.site, domain: domainOf(r.site) }))
      .filter((r): r is { site: string; domain: string } => Boolean(r.domain));
    const done = new Set<string>();
    for (let i = 0; i < sites.length; i += 150) {
      const chunk = sites.slice(i, i + 150).map((s) => encodeURIComponent(`"${s.domain}"`)).join(",");
      const have = (await rest(`gtm_credits?select=site_domain&site_domain=in.(${chunk})`)) as Array<{ site_domain: string }>;
      for (const h of have ?? []) done.add(h.site_domain);
    }
    // One business listed twice is read once.
    const queue = sites.filter((s) => !done.has(s.domain) && Boolean(done.add(s.domain)));
    const rows: CreditRow[] = [];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (queue.length && Date.now() - started < opts.scanMs) {
          const s = queue.shift()!;
          const base = { site_domain: s.domain, trade: n.id, city: c.name, state: st };
          try {
            const html = await homePage(s.site);
            const first = html ? creditsIn(html, s.site)[0] : undefined;
            rows.push({ ...base, agency_domain: first?.agency ?? null, agency_name: first?.name ?? null, phrase: html ? first?.phrase ?? null : "unread" });
          } catch {
            // Our network or theirs, we cannot tell which; marked so it is not
            // read again this month, and never counted as anything about them.
            rows.push({ ...base, agency_domain: null, agency_name: null, phrase: "unread" });
          }
        }
      }),
    );
    if (rows.length) {
      await rest("gtm_credits?on_conflict=site_domain", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
    }
    scanned = rows.length;
    credited = rows.filter((r) => r.agency_domain).length;
    left = queue.length;
  }
  if (!left) await setState("credits_cursor", { i: cursor + 1 });

  /* -- promote: agencies credited on two or more sites ---------------- */
  const all = ((await rest("gtm_credits?select=agency_domain,agency_name,trade,city,state&agency_domain=not.is.null&limit=50000")) ??
    []) as Array<{ agency_domain: string; agency_name: string | null; trade: string; city: string; state: string }>;
  const by = new Map<string, typeof all>();
  for (const r of all) if (prospectable(r.agency_domain)) by.set(r.agency_domain, [...(by.get(r.agency_domain) ?? []), r]);
  const known = new Set(
    (((await rest("gtm_prospects?select=domain&limit=20000")) ?? []) as Array<{ domain: string }>).map((r) => r.domain),
  );
  const ready = [...by.entries()]
    .filter(([d, rs]) => rs.length >= MIN_SITES && !known.has(d))
    .sort((a, b) => b[1].length - a[1].length);

  const promoted: string[] = [];
  for (const [domain, rs] of ready) {
    if (Date.now() - started > opts.totalMs - 8000) break;
    // The trade and city it builds for most.
    const top = <K extends "trade" | "city">(k: K) => {
      const n = new Map<string, number>();
      for (const r of rs) n.set(r[k], (n.get(r[k]) ?? 0) + 1);
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };
    const tradeId = top("trade");
    const city = top("city");
    const state = rs.find((r) => r.city === city)!.state;
    const sites = rs.filter((r) => r.trade === tradeId).length;
    const row = await readAgency({ name: rs[0].agency_name, site: `https://${domain}`, phone: null }, { city, state }, "credits").catch(() => null);
    if (!row) continue;
    if (row.outcome === "ok" && !row.niche) {
      const label = NICHES.find((x) => x.id === tradeId)?.label ?? tradeId;
      row.niche = tradeId;
      row.niche_quote = `credited on ${sites} ${label} sites in ${city}`;
      row.audience = "agency";
      row.status = row.email ? "found" : "no_email";
    }
    await upsertProspects([row]);
    await logEvent("credit_promoted", { domain }, { sites: rs.length, trade: tradeId, city, status: row.status });
    promoted.push(domain);
  }

  return { ok: true, pair: `${n.id} in ${c.name}, ${st}`, scanned, credited, left, agencies: by.size, waiting: ready.length - promoted.length, promoted: promoted.length };
}

/* ---------------------------------------------------------- prospects -- */

/** Today's city: the fifty largest, in turn. */
export function cityForDay(p: Places, day = Math.floor(Date.now() / 86_400_000)): string {
  const top = bigCities(p);
  const c = top[day % top.length];
  return `${c.name}, ${c.state.replace(/^US-/, "")}`;
}

/**
 * The prospect finder: agencies in today's city (or a named one), each one's
 * own site read once. `max` caps the sites read; every run after the first
 * on the same day picks up the agencies the earlier ones did not reach.
 */
export async function runProspects(opts: { budgetMs: number; max?: number; city?: string }):
  Promise<(SweepResult & { totals: Record<string, number> | null }) | { ok: false; reason: string }> {
  const [, places] = await data();
  // A blank city means today's: the workflow passes "" when its input is left empty.
  const where = opts.city?.trim() || cityForDay(places);
  const region = resolveRegion(places, where);
  if (!region || region.scope !== "city") return { ok: false, reason: `"${where}" is not a US city we can place.` };
  const result = await sweep(region, { budgetMs: opts.budgetMs, max: opts.max });
  const totals = result.ok ? await prospectCounts().catch(() => null) : null;
  return { ...result, totals };
}

/* ------------------------------------------------------------ logging -- */

/**
 * What a failure may say in a public log. A PostgREST error echoes the failing
 * row in `details` (a business's name, domain and phone), and on 2026-10-24 one
 * did, in run 40089668827, whose log was deleted. So: the request line, the
 * error code and the message, never the details or the hint.
 */
export function publicError(err: unknown): string {
  const s = String(err);
  const head = s.split(" {")[0].slice(0, 200);
  const code = s.match(/"code":"([^"]*)"/)?.[1];
  const msg = s.match(/"message":"([^"]*)"/)?.[1]?.slice(0, 200);
  return [head, code && `code ${code}`, msg].filter(Boolean).join(" | ");
}
