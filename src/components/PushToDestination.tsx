"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Send the matches somewhere, from the screen that shows them (S2-02).
 *
 * The push itself happens server-side: `/api/integrations` re-derives the rows
 * from the market on disk rather than trusting anything this component sends.
 * That is not defensiveness for its own sake — a client that could name the
 * rows to push could push rows it had not unlocked, which is the one hole the
 * whole entitlement gate exists to close. All this sends is which market, which
 * criterion, and which destination.
 *
 * **It reports what did not go.** A push that announces its successes and stays
 * quiet about the rest is the CRM version of an export that silently drops
 * rows: 26 matched, 4 sent, and no explanation is how somebody stops trusting
 * the number on the previous screen. The summary line comes back from the
 * server with a count and a reason for every refusal.
 *
 * ## The empty case used to render nothing, and that closed a loop
 *
 * With no destination configured this returned `null`. The only screen that
 * configures one is `/app/destinations`, and the only link to it was an entry
 * in `AppNav.tsx` — the pre-App-v2 sidebar, which nothing has rendered since.
 * So: you needed a destination to see the push, and you could not reach the
 * page that adds one. The CRM push has been built, charged for through
 * `charging.ts`, and unusable.
 *
 * `test_reachable.mjs` could not see it either. Its `linkedFrom` asked whether
 * any file under `src/` carries the href, and a dead component's href counted.
 * That is now fixed there as well — a door in a file nothing imports is not a
 * door — which is what turned this up when `AppNav.tsx` was finally deleted on
 * 2026-10-15.
 *
 * So the empty case is the door. It is also the honest empty state: the reason
 * there is no push button is that there is nowhere to push to yet, and the
 * sentence says so and offers the fix.
 */

type Destination = { id: string; kind: string; name: string; secret_hint: string };

export default function PushToDestination({
  market,
  criterion,
  cost = 0,
}: {
  market: string;
  criterion: string;
  /** Credits this push will spend on rows the workspace does not already hold.
   *  On the button, before it is pressed — a push is a charging surface exactly
   *  as the download is, and it was not one until P0.4. */
  cost?: number;
}) {
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((b) => {
        if (!live) return;
        // A deployment with no database, or a signed-out visitor, is not an
        // error here — there is simply nothing to push to, and the export
        // button beside this one still works.
        setDestinations(b.ok ? (b.destinations ?? []) : []);
        if (b.ok && b.destinations?.length) setChosen(b.destinations[0].id);
      })
      .catch(() => live && setDestinations([]));
    return () => {
      live = false;
    };
  }, []);

  // Still asking. Nothing, rather than an empty state that flashes and is
  // replaced a moment later by a select.
  if (destinations === null) return null;

  if (destinations.length === 0) {
    return (
      <div className="border-b border-[var(--line)] px-4 py-2">
        <p className="text-[11px] leading-snug text-[var(--muted)]">
          Nowhere to send these yet.{" "}
          <Link href="/app/destinations" className="underline underline-offset-2">
            Add a CRM, a sequencer or a webhook
          </Link>{" "}
          and this becomes a button.
        </p>
      </div>
    );
  }

  async function push() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationId: chosen, market, criterion }),
      });
      const body = await res.json();
      setFailed(!body.ok);
      // What landed, and what it cost, in that order. A push that quietly spent
      // forty credits is the complaint this line exists to prevent — the route
      // returns `charged` for exactly this.
      setResult(
        body.ok
          ? [body.summary, body.charged].filter(Boolean).join(" ")
          : (body.error ?? body.reason ?? "That did not go."),
      );
    } catch {
      setFailed(true);
      setResult("Could not reach the server. Nothing was sent.");
    }
    setBusy(false);
  }

  return (
    <div className="border-b border-[var(--line)] px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-[11px]"
        >
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name || d.kind}
            </option>
          ))}
        </select>
        <button
          onClick={push}
          disabled={busy || !chosen}
          className="rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--accent-soft)] disabled:opacity-40"
        >
          {busy
            ? "Sending…"
            : cost > 0
              ? `Push with proof · ${cost} credit${cost === 1 ? "" : "s"}`
              : "Push matches with proof"}
        </button>
      </div>
      {result && (
        <p
          className={`mt-2 text-[11px] leading-snug ${
            failed ? "text-[var(--unsure)]" : "text-[var(--muted)]"
          }`}
        >
          {result}
        </p>
      )}
    </div>
  );
}
