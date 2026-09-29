"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { estimateSeconds, humanDuration, worthLeaving } from "@/lib/jobs";

/**
 * "We haven't read that yet" — and the button that starts it.
 *
 * The estimate shown before anybody commits is the same function the server
 * uses when it queues the row, so the number on this button is the number
 * written to the database. It is derived from the crawler's real settings, and
 * it is not padded: see the note at the top of `src/lib/jobs.ts` for why a
 * wait invented to look like effort is the same defect as an invented match.
 *
 * The email field is optional and says what it is for. A read of a whole state
 * is a couple of hours, and asking somebody to keep a tab open for that is the
 * actual reason to collect it — not a way to harvest an address.
 */
export default function QueueRead({ query, sites }: { query: string; sites: number }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<string | null>(null);

  const seconds = estimateSeconds(sites);
  const long = worthLeaving(sites);

  async function go() {
    setBusy(true);
    setNote(null);
    setSignIn(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, email: email.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        href?: string;
        reason?: string;
        signIn?: string;
      };
      if (body.href) {
        router.push(body.href);
        return;
      }
      setNote(body.reason ?? "That did not start. Nothing was charged.");
      setSignIn(body.signIn ?? null);
    } catch {
      setNote("That did not start. Nothing was charged.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-6 border-t border-[var(--line)] pt-5">
      <p className="sf-label">Read it now</p>
      <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
        {sites.toLocaleString()} websites, fetched one at a time and judged
        against what you asked for. That takes{" "}
        <strong>{humanDuration(seconds)}</strong> — most of which is the 1.5
        seconds we wait between two requests to the same host.
      </p>

      {long && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="sf-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Where should we write when it's done? (optional)"
            aria-label="Email for the finished list"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}

      <button onClick={go} disabled={busy} className="sf-btn-lure mt-4">
        {busy ? "Starting…" : long ? `Start the read — ${humanDuration(seconds)}` : "Read them now"}
      </button>

      {note && (
        <p className="sf-small mt-3 text-[var(--muted)]">
          {note}{" "}
          {signIn && (
            <a href={signIn} className="underline underline-offset-2">
              Sign in
            </a>
          )}
        </p>
      )}
    </div>
  );
}
