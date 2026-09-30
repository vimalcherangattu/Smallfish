"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { humanDuration, estimateSeconds } from "@/lib/jobs";

/**
 * The offer that makes the coverage number honest.
 *
 * The results screen has always said *"we read 200 dental practices in Phoenix
 * to find them"*, which is true and, on its own, misleading: 2,778 of them have
 * a website. The list is a fifth of a market, presented as a market.
 *
 * Saying the remainder out loud costs nothing — it is the number we already
 * hold — and it turns the shortfall into the product's main capability rather
 * than something a customer works out later. It is also the only work the queue
 * can do today that needs no candidate extraction and no upload: the other 2,578
 * are already in the market file.
 *
 * The wait is the arithmetic, not a number chosen to look impressive. See
 * `jobs.ts` — twelve sites in flight, 1.5 seconds between requests to one host,
 * 3.4 pages a site. About forty minutes for dental Phoenix, and saying so is
 * better than rounding it up.
 */
export default function ReadTheRest({
  query,
  unread,
  read,
}: {
  query: string;
  /** Businesses here with a website nobody has read. */
  unread: number;
  /** Websites actually read so far. */
  read: number;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  if (unread <= 0) return null;

  return (
    <div className="mt-6 border-t border-[var(--line)] pt-5">
      <p className="sf-small text-[var(--muted)]">
        We have read {read.toLocaleString()} of these. Another{" "}
        {unread.toLocaleString()} have a website nobody has been through yet —{" "}
        {humanDuration(estimateSeconds(unread))} of reading.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNote(null);
            try {
              const res = await fetch("/api/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query, deepen: true }),
              });
              const body = (await res.json()) as {
                ok?: boolean;
                href?: string;
                reason?: string;
                signIn?: string;
              };
              if (body.ok && body.href) router.push(body.href);
              else setNote(body.reason ?? "That did not queue.");
            } catch {
              setNote("Could not reach the server. Nothing was queued.");
            } finally {
              setBusy(false);
            }
          }}
          className="sf-btn"
        >
          {busy ? "Queueing…" : `Read the other ${unread.toLocaleString()}`}
        </button>
        {note && <span className="sf-small text-[var(--muted)]">{note}</span>}
      </div>
    </div>
  );
}
