import { runCounts } from "@/lib/gtmjobs";
import { schedulerAuthorised } from "@/lib/outreachauth";

/**
 * Fill the /how-many pages, a few at a time (GTM, automated SEO/AEO).
 *
 * **Not scheduled.** The scheduled run is `scripts/gtm-runner.ts counts` on
 * GitHub Actions (`.github/workflows/gtm-sweeps.yml`): each count is a DuckDB
 * scan, and on 2026-10-24 scans like it on a pg_cron timer used the Vercel
 * team's whole CPU allowance. This stays for a by-hand call behind the
 * scheduler secret. The work is `runCounts` in `gtmjobs.ts`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
  return Response.json(await runCounts(42_000), { headers: { "cache-control": "no-store" } });
}
