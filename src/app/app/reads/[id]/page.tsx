import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import ReadProgress from "@/components/ReadProgress";
import Results from "@/components/app/Results";
import RecordRun from "@/components/RecordRun";
import {
  accountForUser,
  balanceOf,
  contactedIds,
  isComped,
  jobFor,
  jobSiteRows,
  unlockedIds,
  type JobRow,
  type JobSiteRow,
} from "@/lib/accounts";
import { agree, evidenceFor, prettyDay } from "@/lib/appview";
import { CLERK_ENABLED } from "@/lib/clerk";
import { criterionForCheck } from "@/lib/csvimport";
import { humanDuration } from "@/lib/jobs";
import { marketFromJob, settledCount } from "@/lib/jobmarket";
import { buildLeads, composeEmail, type Contacts } from "@/lib/leads";
import { PLANS } from "@/lib/pricing";
import { suppressedIds } from "@/lib/db";
import { toCredits } from "@/lib/wallet";
import type { Criterion, Market } from "@/lib/types";

/**
 * One read: while it happens, and — now — what it found.
 *
 * ## This page used to end at the progress bar
 *
 * Its "open the N that fit" link went to `/app?q=<the query>`, which resolves
 * the query against the four measured market files. A job is created precisely
 * when there is no such file — a cold city, or a CSV somebody uploaded — so the
 * link landed on the screen that offers to **count the city again**. The
 * matches were in `job_sites`, the credits were spent, and nothing in the
 * product could show them. That was the end of the line for every read this
 * product can now start.
 *
 * So the finished read renders here, through the same `Results` component the
 * measured path uses, over a `Market` projected from the job (`jobmarket.ts`).
 * One results screen, one free preview, one unlock, one ordering — which is
 * what `unlock.ts` means by *the rows on the invoice have to be the rows on the
 * screen*.
 *
 * ## It opens as soon as there is anything to open
 *
 * Not on `state === "done"`. A read of four hundred sites settles the first
 * dozen in its first slice, and a person watching a progress bar with eleven
 * real matches behind it is being made to wait for no reason. The list appears
 * under the progress, grows as the read runs, and the progress disappears when
 * the read does.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Your list | Small Fish" };

const FREE_GRANT = PLANS.find((p) => p.id === "free")?.credits ?? 0;

/** The question this job was asking.
 *
 *  Two shapes, exactly as the worker's own `findCriterion` resolves them: a
 *  market job names a file and a criterion inside it; a job with no market —
 *  an upload, or any trade in any US city — carries a `signals.ts` check. */
async function criterionFor(job: JobRow): Promise<Criterion | null> {
  if (!job.criterion_id) return null;
  if (!job.market_id) return criterionForCheck(job.criterion_id);
  try {
    if (!/^[a-z0-9-]+$/.test(job.market_id)) return null;
    const m = JSON.parse(
      await readFile(
        path.join(process.cwd(), "public", "data", `${job.market_id}.json`),
        "utf8",
      ),
    ) as Market;
    return m.criteria.find((c) => c.id === job.criterion_id) ?? null;
  } catch {
    return null;
  }
}

export default async function Read({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let job: JobRow | null = null;
  let accountId: string | null = null;
  if (CLERK_ENABLED) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) {
        const acct = await accountForUser(userId);
        if (acct) {
          accountId = acct.id;
          job = await jobFor(acct.id, id);
        }
      }
    } catch {
      job = null;
    }
  }

  if (!job) {
    return (
      <div className="appbody">
        <div className="appmid">
          <h1 className="t-h1">We can&rsquo;t find that read.</h1>
          <p className="t-b" style={{ color: "#36404C" }}>
            It may belong to another workspace, or it may never have existed.
          </p>
          <Link className="btn" href="/app">
            Start a new one
          </Link>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------- what it found --
  const criterion = await criterionFor(job);
  const rows: JobSiteRow[] = criterion ? await jobSiteRows(accountId!, job.id) : [];
  const settled = settledCount(rows);

  let result = null;
  let byId = new Map<string, ReturnType<typeof marketFromJob>["businesses"][number]>();
  let readOn: string | null = null;
  let balance = 0;

  if (criterion && settled > 0) {
    const market = marketFromJob(job, rows, criterion);
    const [unlocked, bal, sup] = await Promise.all([
      unlockedIds(accountId!, market.businesses.map((b) => b.id)),
      balanceOf(accountId!),
      suppressedIds(
        (p) => readFile(p, "utf8"),
        path.join(process.cwd(), "public", "data"),
      ).catch(() => ({ ids: new Set<string>(), whyDegraded: null })),
    ]);
    balance = bal;
    byId = new Map(market.businesses.map((b) => [b.id, b]));
    readOn = job.finished_at ? prettyDay(job.finished_at) : prettyDay(job.created_at);
    result = buildLeads({
      query: job.query,
      index: null,
      market,
      // A job has no published-contacts file: `supply.ts` stores the listed
      // phone and nothing else, and inventing an address from a domain is the
      // thing this product refuses to do. The row falls back to `b.phone`.
      contacts: {} as Contacts,
      suppressed: sup.ids,
      unlocked,
      only: criterion,
    });
  }

  const running = job.state !== "done" && job.state !== "failed";

  return (
    <div className="appbody">
      <div className="appmid">
        {/* ------------------------------------------------- still reading -- */}
        {running && (
          <div>
            <p className="kick">Reading</p>
            <h1 className="t-h1" style={{ marginTop: 8 }}>
              {job.query}
            </h1>
            <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "60ch" }}>
              {job.region_label
                ? `${job.sites_total.toLocaleString()} websites in ${job.region_label}, read one at a time. `
                : `${job.sites_total.toLocaleString()} websites, read one at a time. `}
              We said {humanDuration(job.estimate_seconds)} when this was queued.
            </p>
            <ReadProgress id={job.id} initial={job} />
            {/* The honest version of "you can close this tab", which is what
                this page used to say. The read advances because this page asks
                for the next slice; close it and the read stops where it is.
                It is still here when you come back, and it picks up from the
                site it stopped on rather than starting again. */}
            <p className="t-s" style={{ marginTop: 14, maxWidth: "60ch" }}>
              This runs while the page is open. Close it and the read pauses
              where it is. Come back to this address and it carries on from the
              same site.
              {job.notify_email ? ` We will write to ${job.notify_email} when it finishes.` : ""}
            </p>
          </div>
        )}

        {/* ----------------------------------------------------- the list --- */}
        {result && result.leads.length > 0 ? (
          <>
            {running && (
              <p className="t-h3" style={{ color: "#5B6470", marginTop: 8 }}>
                What it has found so far
              </p>
            )}
            <Results
              what={result.what}
              where={result.where}
              criterion={result.criterionText}
              readOn={readOn}
              rows={result.leads.map((lead) => {
                const b = byId.get(lead.id);
                return {
                  lead,
                  evidence:
                    b && criterion
                      ? evidenceFor(b, criterion)
                      : ({ kind: "missing", why: "We have no record of reading this one." } as const),
                  email: b && !lead.locked ? composeEmail(b, criterion!, { sells: null }) : null,
                };
              })}
              unsure={result.unsure}
              didNotFit={result.didNotFit}
              read={result.read}
              marketId={result.marketId}
              criterionId={result.criterionId}
              exportCost={result.locked * result.creditsEach}
              cost={
                result.locked > 0
                  ? {
                      preview: result.leads.length - result.locked,
                      locked: result.locked,
                      creditsEach: result.creditsEach,
                      freeGrant: toCredits(balance) > 0 ? null : FREE_GRANT,
                    }
                  : null
              }
            />
            <RecordRun market={result.marketId} criterion={result.criterionId} />
          </>
        ) : (
          !running && (
            <div>
              <p className="kick">Finished</p>
              <h1 className="t-h1" style={{ marginTop: 8 }}>
                {job.state === "failed"
                  ? "This stopped before it finished."
                  : `Nothing fit, out of the ${settled.toLocaleString()} we settled.`}
              </h1>
              <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "58ch" }}>
                {job.state === "failed"
                  ? (job.failure ?? "It stopped early.")
                  : `We opened ${job.sites_read.toLocaleString()} websites and checked each against ` +
                    `“${criterion ? agree(criterion.text) : job.query}”.`}{" "}
                Nothing was charged.
              </p>
              <div className="nextstep">
                <Link className="btn" href="/app">
                  Ask for something else
                </Link>
                <Link className="qbtn" href="/app/runs">
                  Your other reads
                </Link>
              </div>
            </div>
          )
        )}

        {/* The method, once, under the list rather than instead of it. */}
        {running && (
          <div className="card" style={{ padding: "20px 22px" }}>
            <p className="t-h3" style={{ color: "#5B6470" }}>
              What is actually happening
            </p>
            <ul className="col" style={{ gap: 8, marginTop: 10 }}>
              <li className="t-s">
                Each site is fetched politely: robots.txt honoured, a real user agent, and
                1.5 seconds between two requests to the same host. That throttle is most of
                the wait, and it is not negotiable.
              </li>
              <li className="t-s">
                Twelve sites are in flight at once. More would be faster and worse manners.
              </li>
              <li className="t-s">
                A site we cannot settle is recorded as such rather than guessed at. You are
                never charged for those.
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
