"use client";

import { useState } from "react";

/**
 * Email, and the market you want read (S2-13).
 *
 * The document's sign-up page asks for "who you sell to, which city, and what
 * makes one of them a fit", and puts it on a second screen "so the form looks
 * like ten seconds of work". That instinct is right and the second screen is
 * not needed here: this form is two fields, and the second is optional, so it
 * already looks like ten seconds.
 *
 * The market field is the one that matters. An address tells us how many
 * people are waiting; a sentence tells us which market to read first, which is
 * the only thing that shortens the wait.
 */

export default function WaitlistForm({ source = "waitlist" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [market, setMarket] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, market, source }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string; reason?: string };
      if (body.ok) setDone(body.message ?? "You are on the list.");
      else setError(body.reason ?? "That did not save.");
    } catch {
      setError("Could not reach the server. Nothing was saved.");
    }
    setBusy(false);
  }

  if (done) {
    return (
      <div className="sf-card p-7" style={{ maxWidth: "52ch" }}>
        <p className="sf-h2">Thank you.</p>
        <p className="sf-body mt-3 text-[var(--ink-2)]">{done}</p>
        <p className="sf-small mt-4 text-[var(--muted)]">
          Nothing else was stored — no tracking, and your address is not shared
          with anybody.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" style={{ maxWidth: "52ch" }}>
      <label className="flex flex-col gap-2">
        <span className="sf-label">Your email</span>
        <input
          className="sf-input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@youragency.com"
          autoComplete="email"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="sf-label">What would you search for? (optional)</span>
        <input
          className="sf-input"
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          placeholder="roofers in Sacramento who don't show pricing"
        />
        <span className="sf-small text-[var(--muted)]">
          This is the useful half. It decides which market gets read next.
        </span>
      </label>

      {error && <p className="sf-small text-[var(--unsure)]">{error}</p>}

      <button type="submit" className="sf-btn-lure self-start" disabled={busy || !email}>
        {busy ? "Adding you…" : "Join the waitlist"}
      </button>
    </form>
  );
}
