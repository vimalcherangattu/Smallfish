import { readFile } from "node:fs/promises";
import path from "node:path";

import { schedulerAuthorised } from "@/lib/outreachauth";
import { prospectCounts, sweep } from "@/lib/prospecting";
import { resolveRegion, type Places } from "@/lib/region";

/**
 * The prospect finder, one sweep per call (GTM, outreach A1).
 *
 * `GET` is what Vercel Cron sends: it sweeps the next of the fifty largest US
 * cities, one a day, so a month covers them all and a second pass picks up
 * what the first ran out of time for. `POST {"city": "Austin, TX"}` sweeps a
 * named one, for a by-hand run.
 *
 * Behind `CRON_SECRET`, as `/api/worker` is, and for the same reason: every
 * call reads up to sixty strangers' websites, and an open endpoint is anybody's
 * crawler. Refuses when the secret is not configured, rather than defaulting
 * to open.
 *
 * The answer is counts. No names, no addresses: those stay in the table.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function places(): Promise<Places | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", "places-us.json"), "utf8"),
    ) as Places;
  } catch {
    return null;
  }
}

/** Today's city: the fifty largest, in turn. */
function cityForDay(p: Places, day = Math.floor(Date.now() / 86_400_000)): string {
  const top = [...p.cities].sort((a, b) => b.pop - a.pop).slice(0, 50);
  const c = top[day % top.length];
  return `${c.name}, ${c.state.replace(/^US-/, "")}`;
}

async function run(where: string) {
  const p = await places();
  const region = p ? resolveRegion(p, where) : null;
  if (!region || region.scope !== "city") {
    return Response.json({ ok: false, reason: `"${where}" is not a US city we can place.` }, { status: 400 });
  }
  const result = await sweep(region, { budgetMs: 42_000 });
  const totals = result.ok ? await prospectCounts().catch(() => null) : null;
  return Response.json({ ...result, totals }, { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  const p = await places();
  if (!p) return Response.json({ ok: false, reason: "places-us.json missing" }, { status: 500 });
  return run(cityForDay(p));
}

export async function POST(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  let body: { city?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Expected JSON." }, { status: 400 });
  }
  const city = String(body.city ?? "").trim().slice(0, 80);
  if (city.length < 3) return Response.json({ ok: false, reason: "Name a city." }, { status: 400 });
  return run(city);
}
