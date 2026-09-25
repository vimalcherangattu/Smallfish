"use client";

import { useState } from "react";

/** The removal form (S1-09).
 *
 *  One field, because an owner arriving here is annoyed and every extra box is
 *  a reason to give up and stay listed. The website or the phone is enough to
 *  find every listing we hold for them, including a chain's other branches.
 *
 *  The result deliberately leads with what has **not** happened. A form that
 *  says "request received" and nothing else leaves people believing they are
 *  removed, and the next thing they see is their business in someone's cold
 *  email. */

type Result = {
  ok: boolean;
  matched?: number;
  reason: string;
  removeBy?: string;
  listings?: Array<{ name: string; addr: string }>;
};

export default function OptOutForm() {
  const [claim, setClaim] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/opt-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim }),
      });
      setResult((await res.json()) as Result);
    } catch {
      setResult({
        ok: false,
        reason:
          "That did not reach us — the request failed before it arrived. Try " +
          "again, or email us, which does not depend on this form working.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <form onSubmit={submit} className="flex flex-wrap gap-3">
        <input
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          placeholder="yourpractice.com, or the phone on your listing"
          aria-label="Your website or the phone number on your listing"
          className="min-w-[260px] flex-1 rounded-full border border-[var(--line)] bg-[var(--paper)] px-5 py-3 text-[15px] outline-none focus:border-[var(--ink-3)]"
        />
        <button
          type="submit"
          disabled={busy || claim.trim().length < 4}
          className="rounded-full bg-[var(--lure)] px-6 py-3 text-[14px] font-semibold text-[var(--ink)] disabled:opacity-40"
        >
          {busy ? "Looking…" : "Find my listing"}
        </button>
      </form>

      {result && (
        <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-6 py-5">
          {result.ok && (
            <p className="mono text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
              filed · not yet removed
            </p>
          )}
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-2)]">
            {result.reason.split("**").map((part, i) =>
              i % 2 === 1 ? (
                <strong key={i} className="font-semibold text-[var(--ink)]">
                  {part}
                </strong>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>

          {result.listings && result.listings.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-[var(--line)] pt-4">
              {result.listings.map((l) => (
                <li key={`${l.name}-${l.addr}`} className="text-[14px] leading-snug">
                  {l.name}
                  <span className="text-[var(--ink-3)]"> · {l.addr}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
