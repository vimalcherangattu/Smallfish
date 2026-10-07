"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
 *
 * ## It also drives the read, because nothing else does
 *
 * The queue moves on a Vercel Cron entry, and Hobby caps crons at **once a
 * day** — a faster expression does not throttle, it fails the build, which
 * froze production for three days. One tick reads about as much as fits in 45
 * seconds. So a four-hundred-site read, on the scheduler alone, finishes
 * **next week**, and that was true of every read this product can start.
 *
 * There was a button here that ran one slice per press. It worked, and asking
 * somebody to press a button eight times is not a product.
 *
 * So this chains the slices itself while the tab is open: run one, take the
 * counters the database gives back, run the next. It is the same authorised
 * endpoint the button used — the caller's own job, their own crawl and model
 * budget, and the same lease, so a browser racing a cron tick cannot read a
 * site twice. A read of four hundred sites finishes in about six minutes of
 * the tab being open instead of a week of it being closed.
 *
 * ## When it finishes, it says so to the page as well as to itself
 *
 * This component polls and the page around it does not. So a finished read
 * left the **server-rendered** half of the screen exactly as it was rendered
 * on arrival: the kicker still read "Reading", the line under it still said
 * the read pauses when you close the page, and the panel at the bottom still
 * explained, in the present tense, that twelve sites were in flight. Under all
 * of that sat the counters, at 12 of 12 and 100%.
 *
 * Worse than stale: the page's honest endings live in that server half. A read
 * that finds nothing has a screen that says so and offers somewhere to go, and
 * a read that finds something renders the list itself. Neither could ever
 * appear, because `running` is computed from the state the server saw. So
 * every finished read looked like a running one, and the only thing offering
 * to show the results was a button here that said "Open the 0 that fit".
 *
 * `router.refresh()` re-renders the server component against the real state.
 *
 * It stops on its own for the three reasons that are not "still working":
 * the job finished, the engine is unavailable (one `needs_model` is proof, and
 * crawling on would spend the budget to learn nothing), or a slice read
 * **nothing** — which means something is wrong and retrying in a loop would
 * turn one failure into a thousand requests.
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
  const router = useRouter();
  const [row, setRow] = useState<Row>(initial);
  const [ranNote, setRanNote] = useState<string | null>(null);
  /** Driving the read, as opposed to merely watching it. */
  const [driving, setDriving] = useState(true);
  const [slice, setSlice] = useState(false);
  /** Read inside the loop, which must see a pause the moment it happens rather
   *  than on the next render. */
  const live = useRef(true);

  /**
   * Hand the page back to the server the moment this job stops.
   *
   * Once, hence the ref: `router.refresh()` re-renders the server component,
   * which re-renders this one with a fresh `initial`, which would call it
   * again. The finished screen is the server's to draw, and it cannot know to
   * draw it until something tells it.
   */
  const handedOver = useRef(false);
  useEffect(() => {
    if (row.state !== "done" && row.state !== "failed") return;
    if (handedOver.current) return;
    handedOver.current = true;
    router.refresh();
  }, [row.state, router]);

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

  // The loop. One at a time, never overlapping: a second slice while the first
  // holds the lease would be refused anyway, and would read as an error.
  useEffect(() => {
    live.current = driving;
    if (!driving) return;
    if (row.state === "done" || row.state === "failed") return;

    let cancelled = false;
    (async () => {
      while (!cancelled && live.current) {
        setSlice(true);
        let read = 0;
        try {
          const res = await fetch("/api/worker", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job: id }),
          });
          const b = (await res.json()) as {
            ok?: boolean; read?: number; matched?: number; state?: string;
            note?: string; reason?: string;
          };
          if (!b.ok) {
            setRanNote(b.reason ?? "That did not run.");
            setDriving(false);
            break;
          }
          read = b.read ?? 0;
          if (b.note) {
            // The engine is unavailable, or the job asks something we cannot
            // check. Either way the next slice learns the same thing.
            setRanNote(b.note);
            setDriving(false);
          }
        } catch {
          setRanNote("Lost the connection. Press continue to pick it up.");
          setDriving(false);
          break;
        } finally {
          setSlice(false);
        }

        const fresh = await fetch(`/api/jobs?id=${encodeURIComponent(id)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (cancelled) break;
        if (fresh?.job) setRow(fresh.job);

        const state = fresh?.job?.state;
        if (state === "done" || state === "failed") break;
        // A slice that read nothing has not made progress, and the next one
        // would not either. Better to stop and say so than to spin.
        if (read === 0) {
          setRanNote((n) => n ?? "That slice read nothing. Press continue to try again.");
          setDriving(false);
          break;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, driving, row.state]);

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

      {/* Drive it, or stop driving it.

          This replaced a button that ran exactly one 45-second slice per press.
          The slice is the same; what changed is that the page now asks for the
          next one itself. The control is here because a person who only wanted
          to look should be able to stop spending their crawl budget, and
          because "continue" is what you want after a dropped connection. */}
      {row.state !== "done" && row.state !== "failed" && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setRanNote(null);
              setDriving((d) => !d);
            }}
            className={driving ? "sf-btn" : "sf-btn-lure"}
          >
            {driving ? (slice ? "Reading… (pause)" : "Pause") : "Continue reading"}
          </button>
          <span className="sf-small text-[var(--ink-2)]">
            {ranNote ??
              (driving
                ? "Reading while this tab is open."
                : "Paused. Nothing is being read.")}
          </span>
        </div>
      )}

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

      {/* **No "Open the N that fit" button here.**
          It rendered for every finished job, so a read that matched nothing
          offered, as the brightest thing on the screen, to open zero
          businesses. It also pointed at `/app?q=…`, which is the counting
          screen and not the list, so even when N was right it went to the
          wrong place. The list is now drawn on this page by the server once
          the refresh above lands, and a read that found nothing gets the
          screen that says so. Neither needs a button. */}
    </div>
  );
}
