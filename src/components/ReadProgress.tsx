"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { describe, percent, type Job, type JobState } from "@/lib/jobs";

/**
 * The live half of the progress page.
 *
 * ## It polls rather than animates
 *
 * Every number here came back from the database on the last poll. There is no
 * easing, no fake increment between polls, and no bar that creeps forward while
 * nothing is happening — which is the thing that would make this page a lie
 * rather than a window. When the worker is slow, the number sits still, and
 * that is the truthful rendering of a worker being slow.
 *
 * ## It stops
 *
 * Polling ends the moment the job is done or failed. A page left open
 * overnight against a finished job is a request every four seconds, for ever,
 * from a tab nobody is looking at.
 */

interface Row {
  id: string;
  state: JobState;
  sites_total: number;
  sites_read: number;
  sites_judged: number;
  matched: number;
  unclear: number;
  query: string;
  failure: string | null;
  /** Why a tick declined to work on this, in the person's terms. Not a failure:
   *  the job is still queued and picks up again by itself. */
  worker_note?: string | null;
}

const toJob = (r: Row): Job => ({
  id: r.id,
  state: r.state,
  query: r.query,
  market: "",
  criterion: "",
  progress: {
    total: r.sites_total,
    read: r.sites_read,
    judged: r.sites_judged,
    matched: r.matched,
    unclear: r.unclear,
  },
  createdAt: "",
  finishedAt: null,
  notifyEmail: null,
});

export default function ReadProgress({ id, initial }: { id: string; initial: Row }) {
  const [row, setRow] = useState<Row>(initial);

  useEffect(() => {
    if (row.state === "done" || row.state === "failed") return;
    const t = setInterval(() => {
      fetch(`/api/jobs?id=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.job && setRow(d.job))
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [id, row.state]);

  const job = toJob(row);
  const pct = percent(job);

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="sf-h2">{describe(job)}</p>
        {pct !== null && <p className="sf-data text-[var(--muted)]">{pct}%</p>}
      </div>

      {/* The bar is a rendering of the counters, not a timer. */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--fill)]">
        <div
          className="h-full rounded-full bg-[var(--lure)] transition-[width] duration-700 ease-out"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          ["Websites read", row.sites_read, row.sites_total],
          ["Judged", row.sites_judged, null],
          ["A fit so far", row.matched, null],
          ["Couldn’t tell", row.unclear, null],
        ].map(([label, value, of]) => (
          <div key={String(label)} className="sf-card p-4">
            <p className="sf-label">{label}</p>
            <p className="sf-h2 mt-1.5">
              {Number(value).toLocaleString()}
              {of ? (
                <span className="sf-small ml-1 font-normal text-[var(--muted)]">
                  of {Number(of).toLocaleString()}
                </span>
              ) : null}
            </p>
          </div>
        ))}
      </div>

      {row.state === "failed" && (
        <p className="sf-body mt-6 text-[var(--ink-2)]">
          {row.failure ?? "This stopped before it finished."} Nothing was charged.
        </p>
      )}

      {/* Paused is not stopped, and the difference is the whole reason this line
          exists. A read whose engine is briefly unavailable leaves its sites
          unread rather than crawling them for no answer, and says so — a
          progress bar that simply stops moving reads as broken, and the person
          watching has no way to tell which it is. */}
      {row.state !== "failed" && row.state !== "done" && row.worker_note && (
        <p className="sf-small mt-6 text-[var(--muted)]">{row.worker_note}</p>
      )}

      {row.state === "done" && (
        <Link href={`/app?q=${encodeURIComponent(row.query)}`} className="sf-btn-lure mt-6">
          Open the {row.matched.toLocaleString()} that fit →
        </Link>
      )}
    </div>
  );
}
