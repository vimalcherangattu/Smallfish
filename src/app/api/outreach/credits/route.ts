import { runCredits } from "@/lib/gtmjobs";
import { schedulerAuthorised } from "@/lib/outreachauth";

/**
 * "Website by X" mining (GTM, agency prospects from footer credits).
 *
 * **Not scheduled.** The scheduled run is `scripts/gtm-runner.ts credits` on
 * GitHub Actions (`.github/workflows/gtm-sweeps.yml`): it is a DuckDB scan
 * plus up to hundreds of home-page reads, and on 2026-10-24 work like it on a
 * pg_cron timer used the Vercel team's whole CPU allowance. This stays for a
 * by-hand call behind the scheduler secret. The work, and the crawl rules, are
 * `runCredits` in `gtmjobs.ts`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  return Response.json(await runCredits({ scanMs: 32_000, totalMs: 50_000 }), { headers: { "cache-control": "no-store" } });
}
