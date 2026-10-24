import { runProspects } from "@/lib/gtmjobs";
import { schedulerAuthorised } from "@/lib/outreachauth";

/**
 * The prospect finder, one sweep per call (GTM, outreach A1).
 *
 * **Not scheduled.** The scheduled run is `scripts/gtm-runner.ts prospects` on
 * GitHub Actions (`.github/workflows/gtm-sweeps.yml`). A sweep is a DuckDB
 * scan plus up to sixty agency sites read, and on 2026-10-24 sweeps like it on
 * a pg_cron timer, with the other two, used the Vercel team's whole CPU
 * allowance. Inside 60 seconds it could not even finish: New York's scan took
 * 45s and left no time to read a single site.
 *
 * Kept for a by-hand call behind `CRON_SECRET`: `GET` sweeps today's city,
 * `POST {"city": "Austin, TX"}` a named one. The answer is counts. No names,
 * no addresses: those stay in the table. The work is `runProspects`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function answer(city?: string) {
  const result = await runProspects({ budgetMs: 42_000, city });
  const status = "reason" in result && !("region" in result) ? 400 : result.ok ? 200 : 503;
  return Response.json(result, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  return answer();
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
  return answer(city);
}
