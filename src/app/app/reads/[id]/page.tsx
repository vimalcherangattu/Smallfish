import Link from "next/link";

import ReadProgress from "@/components/ReadProgress";
import { accountForUser, jobFor } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { humanDuration } from "@/lib/jobs";

/**
 * One long read, while it happens.
 *
 * The brief for this page was to convey how much work goes on behind a search.
 * It does that by showing the work: websites fetched, verdicts settled, the
 * ones we could not call. Those are the job's own counters, written by the
 * worker as it goes, so the number on screen is the number in the database.
 *
 * Nothing here is on a timer. A bar that fills at a fixed rate while nothing
 * happens is the same claim as an invented wait, and this product's whole
 * argument is that it does not make claims it cannot show.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Reading | Small Fish" };

export default async function Read({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let job = null;
  if (CLERK_ENABLED) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) {
        const acct = await accountForUser(userId);
        if (acct) job = await jobFor(acct.id, id);
      }
    } catch {
      job = null;
    }
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 sm:px-10">
        <h1 className="sf-h1">We can&rsquo;t find that read.</h1>
        <p className="sf-body mt-3 text-[var(--ink-2)]">
          It may belong to another workspace, or it may never have existed.
        </p>
        <Link href="/app" className="sf-btn mt-6">
          Start a new one →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[860px] px-6 py-10 sm:px-10">
      <p className="sf-label">Reading</p>
      <h1 className="sf-h1 mt-2">{job.query}</h1>
      <p className="sf-body mt-3 max-w-[60ch] text-[var(--ink-2)]">
        {job.region_label
          ? `${job.sites_total.toLocaleString()} websites in ${job.region_label}, read one at a time. `
          : `${job.sites_total.toLocaleString()} websites, read one at a time. `}
        We said {humanDuration(job.estimate_seconds)} when this was queued.
      </p>

      {/* The counters, polled. Everything below this line is live. */}
      <ReadProgress id={job.id} initial={job} />

      <div className="sf-card mt-8 p-5">
        <p className="sf-label">What is actually happening</p>
        <ul className="sf-small mt-3 space-y-2 text-[var(--ink-2)]">
          <li>
            Each site is fetched politely, robots.txt honoured, a real user
            agent, and 1.5 seconds between two requests to the same host. That
            throttle is most of the wait, and it is not negotiable.
          </li>
          <li>
            Twelve sites are in flight at once. More would be faster and worse
            manners.
          </li>
          <li>
            Every page read is judged against what you asked for, and a site
            that cannot be settled is recorded as such rather than guessed at.
            You are never charged for those.
          </li>
        </ul>
      </div>

      <p className="sf-small mt-6 text-[var(--muted)]">
        You can close this tab.{" "}
        {job.notify_email
          ? `We will write to ${job.notify_email} when it is done.`
          : "The finished list will be waiting under Saved searches."}
      </p>
    </div>
  );
}
