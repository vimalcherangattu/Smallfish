import Link from "next/link";

import { accountForUser, jobsFor, runsFor, type JobRow, type RunRow } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";

/**
 * Every search this workspace has run.
 *
 * The page a returning user goes to first, and the reason the product now has
 * a sense of state at all. Before this, closing the tab ended the relationship.
 *
 * **Empty states report what was checked, never just "no results"** — the rule
 * from `docs/design-system.md` §4, which matters more here than anywhere: an
 * empty history has four completely different causes (signed out, no workspace,
 * no database on this deployment, genuinely nothing run yet) and three of them
 * are not the user's fault. Telling all four "nothing here" would be the
 * product failing quietly and blaming the person for it.
 */

export const dynamic = "force-dynamic";
// One noun for this screen. The rail calls it "My lists", the heading said
// "Your runs." and the line under it said "the same market ... the row":
// three names for one thing and two of them ours. A list is what the
// customer leaves with, so that is the word everywhere.
export const metadata = { title: "Your lists | Small Fish" };

const NICHE: Record<string, string> = {
  "med-spa-dallas": "Med spas in Dallas",
  "dental-phoenix": "Dental practices in Phoenix",
  "hvac-tampa": "HVAC companies in Tampa",
  "vet-columbus": "Vet clinics in Columbus",
};
const title = (m: string) => NICHE[m] ?? m.replace(/-/g, " ");

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function Empty({ title: t, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sf-card mt-8 max-w-[64ch] p-7">
      <p className="sf-h2">{t}</p>
      <p className="sf-body mt-3 text-[var(--ink-2)]">{children}</p>
    </div>
  );
}

export default async function RunsPage() {
  if (!CLERK_ENABLED) {
    return (
      <Shell>
        <Empty title="Accounts are not switched on here.">
          This deployment has no sign-in configured, so there is nowhere to keep
          a history. Everything else works, {" "}
          <Link href="/app/search" className="underline">run a search</Link> and
          the results are the same.
        </Empty>
      </Shell>
    );
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return (
      <Shell>
        <Empty title="Sign in to keep your searches.">
          Runs are kept per workspace. You can search without an account, the
          count is free either way, but there is nowhere to put the history
          until there is a workspace to put it in.{" "}
          <Link href="/sign-in" className="underline">Sign in</Link>.
        </Empty>
      </Shell>
    );
  }

  let runs: RunRow[] = [];
  let jobs: JobRow[] = [];
  try {
    const account = await accountForUser(userId);
    if (!account) {
      return (
        <Shell>
          <Empty title="No workspace yet.">
            Open{" "}
            <Link href="/account" className="underline">your account</Link> once
            and one is made for you, then your searches start being kept.
          </Empty>
        </Shell>
      );
    }
    runs = await runsFor(account.id);
    // **Jobs were missing from "my lists" entirely.**
    //
    // A run is keyed by `market_id__criterion_id`, and a job created for a cold
    // city or a CSV upload has **no market id** — so every read this product
    // can now start was absent from the one screen whose job is to let somebody
    // find it again. The list was reachable from the browser's history and
    // nowhere else.
    jobs = await jobsFor(account.id).catch(() => []);
  } catch {
    return (
      <Shell>
        <Empty title="The database is not reachable from this deployment.">
          That is ours rather than yours. Searching still works; only the history
          is unavailable.
        </Empty>
      </Shell>
    );
  }

  if (runs.length === 0 && jobs.length === 0) {
    return (
      <Shell>
        <Empty title="Nothing run yet.">
          Every market you open is kept here, with what it found and when.{" "}
          <Link href="/app/search" className="underline">Run your first search</Link>.
        </Empty>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* The reads, newest first. A job is a list somebody asked for and paid
          for; it belongs above the saved market searches, not after them. */}
      {jobs.length > 0 && (
        <div className="mt-8 space-y-3">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/app/reads/${j.id}`}
              className="sf-card block p-5 hover:border-[var(--line-strong)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <span className="sf-h3">{j.query}</span>
                <span className="sf-data text-[var(--muted)]">{ago(j.created_at)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
                {j.state === "done" ? (
                  <span className="sf-data text-[var(--accent)]">{j.matched} fit</span>
                ) : j.state === "failed" ? (
                  <span className="sf-data text-[var(--muted)]">stopped early</span>
                ) : (
                  <span className="sf-data text-[var(--muted)]">
                    reading, {j.sites_read.toLocaleString()} of{" "}
                    {j.sites_total.toLocaleString()}
                  </span>
                )}
                {j.state === "done" && (
                  <span className="sf-data text-[var(--muted)]">
                    of {j.sites_judged.toLocaleString()} judged
                  </span>
                )}
                {j.region_label && (
                  <span className="sf-data text-[var(--muted)]">{j.region_label}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-3">
        {runs.map((r) => (
          <Link
            key={`${r.market_id}:${r.criterion_id}`}
            href={`/app/runs/${encodeURIComponent(r.market_id)}__${encodeURIComponent(r.criterion_id)}`}
            className="sf-card block p-5 hover:border-[var(--line-strong)]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <span className="sf-h3">{title(r.market_id)}</span>
              <span className="sf-data text-[var(--muted)]">{ago(r.last_run_at)}</span>
            </div>

            {/* The sentence they typed, when they arrived through the search
                box. It is what makes a list of markets read as a list of their
                own intentions. */}
            {r.query && (
              <p className="sf-small mt-1.5 text-[var(--muted)]">&ldquo;{r.query}&rdquo;</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="sf-data text-[var(--accent)]">{r.matched} matched</span>
              <span className="sf-data text-[var(--muted)]">of {r.judged} judged</span>
              {r.times > 1 && (
                <span className="sf-data text-[var(--muted)]">run {r.times} times</span>
              )}
              {r.region_label && r.scope !== "city" && (
                <span className="sf-data text-[var(--muted)]">{r.region_label}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-10 sm:px-10">
      <h1 className="sf-h1">Your lists.</h1>
      <p className="sf-body mt-3 max-w-[60ch] text-[var(--ink-2)]">
        Every search you have run, what it found, and when. Running the same
        one again updates it here rather than adding a second.
      </p>
      {children}
    </div>
  );
}
