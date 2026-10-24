/**
 * The scheduled outreach sweeps, off Vercel (GTM, 2026-10-24).
 *
 *     node --conditions=react-server --import tsx scripts/gtm-runner.ts <counts|credits|prospects> [city]
 *
 * Run by `.github/workflows/gtm-sweeps.yml`. The work is in `src/lib/gtmjobs.ts`,
 * shared with the by-hand routes, so the crawl rules are one implementation.
 * `--conditions=react-server` is what lets `import "server-only"` resolve
 * outside Next.
 *
 * Needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
 * `SUPABASE_SERVICE_ROLE_KEY`; the R2
 * snapshot keys are optional (without them it reads Overture directly).
 *
 * **The repository is public, so this log is public.** It prints what the
 * routes always answered — counts, a city, a trade — and never a name, a domain
 * or an address. Those stay in the tables.
 */

import { publicError, runCounts, runCredits, runProspects } from "@/lib/gtmjobs";

const MIN = 60_000;

// Budgets: real minutes, because nothing here is bound by a function's 60s.
// The workflow's timeout-minutes sits above each one.
const jobs: Record<string, (arg?: string) => Promise<{ ok: boolean }>> = {
  counts: () => runCounts(12 * MIN),
  credits: () => runCredits({ scanMs: 10 * MIN, totalMs: 15 * MIN }),
  prospects: (city) => runProspects({ budgetMs: 15 * MIN, max: 120, city }),
};

async function main() {
  const [name, arg] = process.argv.slice(2);
  const job = jobs[name];
  if (!job) {
    console.error(`usage: gtm-runner.ts <${Object.keys(jobs).join("|")}> [city]`);
    process.exit(2);
  }
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[k]) {
      console.error(`${k} is not set. Add it as a repository secret.`);
      process.exit(2);
    }
  }
  const started = Date.now();
  const result = await job(arg);
  // `counted` is a list of page slugs (trade-in-city), not businesses.
  console.log(JSON.stringify({ job: name, seconds: Math.round((Date.now() - started) / 1000), ...result }));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`[gtm-runner] ${publicError(err)}`);
  process.exit(1);
});
