import { readFile } from "node:fs/promises";
import path from "node:path";

import { slugFor, TRADES } from "@/lib/howmany";
import { schedulerAuthorised } from "@/lib/outreachauth";
import { rest } from "@/lib/prospecting";
import { findCandidates } from "@/lib/providers";
import { resolveRegion, type Places } from "@/lib/region";
import { RELEASE } from "@/lib/supply";
import { matchTrade, type Taxonomy } from "@/lib/trades";

/**
 * Fill the /how-many pages, a few at a time (GTM, automated SEO/AEO).
 *
 * pg_cron calls this every ten minutes. Each call counts the next few
 * trade and city pairs that have no row yet, or whose row is older than a
 * month, and stops before the function's time runs out. One count is one
 * open-data query, about ten seconds, no model call, no cost.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const dir = path.join(process.cwd(), "public", "data");
const json = async <T,>(n: string) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as T;

const CITIES = 50;
const BUDGET_MS = 42_000;
const STALE_MS = 30 * 86_400_000;

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  const started = Date.now();
  const [taxo, places] = await Promise.all([json<Taxonomy>("trades.json"), json<Places>("places-us.json")]);
  const cities = [...places.cities].sort((a, b) => b.pop - a.pop).slice(0, CITIES);

  const have = new Map(
    (((await rest("gtm_counts?select=slug,computed_at&limit=5000")) as Array<{ slug: string; computed_at: string }>) ?? []).map(
      (r) => [r.slug, Date.parse(r.computed_at)],
    ),
  );
  // Biggest cities first, every trade, so the most-asked pages land first.
  const todo = cities.flatMap((c) => TRADES.map((t) => ({ t, c, slug: slugFor(t.id, c.name, c.state.replace(/^US-/, "")) })))
    .filter((x) => !have.has(x.slug) || Date.now() - (have.get(x.slug) ?? 0) > STALE_MS);

  const done: string[] = [];
  for (const { t, c, slug } of todo) {
    if (Date.now() - started > BUDGET_MS) break;
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
    done.push(slug);
  }
  return Response.json({ ok: true, counted: done, remaining: todo.length - done.length }, { headers: { "cache-control": "no-store" } });
}
