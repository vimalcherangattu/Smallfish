import { readFile } from "node:fs/promises";
import path from "node:path";

import { getState, setState } from "@/lib/contactpipe";
import { creditsIn, prospectable } from "@/lib/credits";
import { schedulerAuthorised } from "@/lib/outreachauth";
import { logEvent, readAgency, rest, upsertProspects } from "@/lib/prospecting";
import { NICHES, domainOf } from "@/lib/prospects";
import { findCandidates, readable } from "@/lib/providers";
import { resolveRegion, type Places } from "@/lib/region";
import { robotsAllows, safeUrl } from "@/lib/seller";
import { matchTrade, type Taxonomy } from "@/lib/trades";

/**
 * "Website by X" mining (GTM, agency prospects from footer credits).
 *
 * pg_cron calls this once an hour. Each call takes the next trade and city
 * (every agency niche across the fifty largest cities, in turn), reads the
 * home page of local businesses not read before, and keeps the footer credit
 * if there is one. One page per business, robots.txt honoured, the honest
 * user agent, no model call.
 *
 * Then it promotes: an agency credited on two or more sites is read like any
 * other prospect, and when its own site names no trade, the credits do. The
 * answer is counts, as every outreach route's is.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const dir = path.join(process.cwd(), "public", "data");
const json = async <T,>(n: string) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as T;

const UA = "SmallFishBot/0.1 (+https://www.getsmallfish.com/bot; business listing verification)";
const SCAN_BUDGET_MS = 32_000;
const TOTAL_BUDGET_MS = 50_000;
const CITIES = 50;
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

type Row = { site_domain: string; agency_domain: string | null; agency_name: string | null; phrase: string | null; trade: string; city: string; state: string };

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  const started = Date.now();
  const [taxo, places] = await Promise.all([json<Taxonomy>("trades.json"), json<Places>("places-us.json")]);
  const cities = [...places.cities].sort((a, b) => b.pop - a.pop).slice(0, CITIES);
  const pairs = cities.flatMap((c) => niches.map((n) => ({ n, c })));
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
    const rows: Row[] = [];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (queue.length && Date.now() - started < SCAN_BUDGET_MS) {
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
    if (Date.now() - started > TOTAL_BUDGET_MS - 8000) break;
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

  return Response.json(
    { ok: true, pair: `${n.id} in ${c.name}, ${st}`, scanned, credited, left, agencies: by.size, waiting: ready.length - promoted.length, promoted: promoted.length },
    { headers: { "cache-control": "no-store" } },
  );
}
