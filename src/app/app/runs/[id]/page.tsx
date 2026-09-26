import Link from "next/link";
import { notFound } from "next/navigation";

import { accountForUser, runFor, type RunRow } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { VERDICT_LABEL, type VerdictKind } from "@/lib/types";

/**
 * One run, as it was.
 *
 * The numbers come from the **snapshot taken when it ran**, not from the market
 * file as it stands now. Today those agree, because the markets are static —
 * but the whole point of keeping a history is that it says what was true then,
 * and a page that silently re-queries would start lying the first time a market
 * is re-read. The rows themselves are not snapshotted (see `0009`), so the link
 * through to them is labelled as going to the market rather than to a frozen
 * copy of it.
 *
 * The id in the URL is `market__criterion`. A composite key rather than a
 * surrogate one, because the run *is* the pair — there is no separate identity
 * to mint, and a uuid here would mean a lookup to answer "which search is
 * this".
 */

export const dynamic = "force-dynamic";

const NICHE: Record<string, string> = {
  "med-spa-dallas": "Med spas in Dallas",
  "dental-phoenix": "Dental practices in Phoenix",
  "hvac-tampa": "HVAC companies in Tampa",
  "vet-columbus": "Vet clinics in Columbus",
};
const title = (m: string) => NICHE[m] ?? m.replace(/-/g, " ");

const ORDER: VerdictKind[] = ["match", "no_match", "couldnt_tell", "blocked", "needs_model", "unread"];

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [marketId, criterionId] = decodeURIComponent(id).split("__");
  if (!marketId || !criterionId) notFound();

  if (!CLERK_ENABLED) notFound();
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) notFound();

  let run: RunRow | null = null;
  try {
    const account = await accountForUser(userId);
    if (account) run = await runFor(account.id, marketId, criterionId);
  } catch {
    run = null;
  }
  if (!run) notFound();

  const tallies = run.tallies ?? {};
  const shown = ORDER.filter((k) => (tallies[k] ?? 0) > 0);
  const total = shown.reduce((n, k) => n + (tallies[k] ?? 0), 0) || 1;

  return (
    <div className="mx-auto max-w-[900px] px-6 py-10 sm:px-10">
      <Link href="/app/runs" className="sf-small text-[var(--muted)]">
        ← All runs
      </Link>

      <h1 className="sf-h1 mt-4">{title(run.market_id)}</h1>
      {run.query && (
        <p className="sf-body mt-2 text-[var(--ink-2)]">&ldquo;{run.query}&rdquo;</p>
      )}
      <p className="sf-data mt-3 text-[var(--muted)]">
        first run {run.first_run_at.slice(0, 10)} · last run{" "}
        {run.last_run_at.slice(0, 10)} · {run.times} time{run.times === 1 ? "" : "s"}
        {run.region_label ? ` · ${run.region_label}` : ""}
      </p>

      <div className="sf-card mt-8 p-6">
        <p className="sf-label">What it found</p>
        <p className="sf-h1 mt-3">
          {run.matched} matched{" "}
          <span className="sf-body text-[var(--muted)]">of {run.judged} judged</span>
        </p>

        {/* The same proportions the home page shows, for this run. Matches
            first, because a reader who sees what we could not do before what
            we did has been told about our failures before their result. */}
        <div className="mt-6 flex h-[22px] gap-[2px] overflow-hidden">
          {shown.map((k) => (
            <span
              key={k}
              style={{
                width: `${(((tallies[k] ?? 0) / total) * 100).toFixed(1)}%`,
                background:
                  k === "match"
                    ? "var(--accent)"
                    : k === "no_match"
                      ? "var(--no)"
                      : k === "couldnt_tell" || k === "blocked"
                        ? "var(--unsure)"
                        : "var(--unread)",
              }}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {shown.map((k) => (
            <span key={k} className="sf-data text-[var(--ink-2)]">
              {tallies[k]} {VERDICT_LABEL[k].toLowerCase()}
              {k !== "match" && k !== "no_match" ? " · never billed" : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href={`/app/explore?market=${run.market_id}&criterion=${run.criterion_id}`}
          className="sf-btn-lure"
        >
          Open the matches, with proof →
        </Link>
      </div>

      <p className="sf-small mt-6 max-w-[62ch] text-[var(--muted)]">
        The counts above are what this search found when it ran. The rows
        themselves are not frozen — opening them reads the market as it stands
        now, which for these markets is the same data.
      </p>
    </div>
  );
}
