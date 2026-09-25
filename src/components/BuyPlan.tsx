"use client";

import { useState } from "react";

/** The buy button (S1-08).
 *
 *  It posts a plan id and nothing else. The workspace comes from the signed-in
 *  session on the server, because a client that can name the account is a
 *  client that can attach a card to somebody else's workspace.
 *
 *  Every refusal is shown in the words the server used. A payment button that
 *  says "something went wrong" is where a customer stops, and the two most
 *  likely refusals here — not signed in, no workspace yet — both have an
 *  obvious next step that the customer can take themselves. */
export default function BuyPlan({ planId, name }: { planId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ reason: string; signIn?: string } | null>(null);

  async function buy() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        reason?: string;
        signIn?: string;
      };
      if (data.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setProblem({ reason: data.reason ?? "Checkout could not start.", signIn: data.signIn });
    } catch {
      setProblem({
        reason:
          "That did not reach us — the request failed before it arrived. " +
          "Nothing was charged.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        onClick={buy}
        disabled={busy}
        className="w-full rounded-full bg-[var(--lure)] px-4 py-2.5 text-[13px] font-semibold text-[var(--ink)] disabled:opacity-40"
      >
        {busy ? "Opening…" : `Choose ${name}`}
      </button>
      {problem && (
        <p className="mt-3 text-[12px] leading-snug text-[var(--ink-2)]">
          {problem.reason}{" "}
          {problem.signIn && (
            <a href={problem.signIn} className="underline underline-offset-2">
              Sign in
            </a>
          )}
        </p>
      )}
    </div>
  );
}
