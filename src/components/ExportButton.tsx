"use client";

import { useState } from "react";

import { track } from "@/lib/events";

/**
 * Download the matched rows, and pay for them.
 *
 * The file is built on the server now (`/api/export`), because building it is
 * what spends a credit — see that route for why. What is left here is the part
 * that has to be right for the person holding the mouse:
 *
 *   - **It says what it cost, afterwards.** The route answers with a note in a
 *     header; this shows it. A charge that happens silently is a charge
 *     somebody finds on their statement.
 *   - **A partial export is explained, not hidden.** Eighteen of forty-two rows
 *     arrive with a line saying so and why. The alternative — a file that is
 *     quietly short — is the failure `csv.ts` spends four paragraphs avoiding
 *     in the other direction.
 *   - **Being signed out is a prompt, not an error.** It links to sign-in and
 *     says what the free part is, because the count and the three examples
 *     genuinely are free and the page should not imply otherwise.
 */

export default function ExportButton({
  market,
  criterion,
  rows,
  withheld,
  cost = 0,
  variant = "inline",
  className,
}: {
  market: string;
  criterion: string;
  /** Matched rows on screen, for the label. The server decides what is in the
   *  file; this is only what the button promises. */
  rows: number;
  withheld: number;
  /**
   * Credits this download will spend, for rows the workspace does not already
   * hold. **The button says it before it is pressed.**
   *
   * Downloading is a charging surface — it always was, and `entitlement.ts` now
   * enforces it. A button labelled "Download all 42" that quietly spends 39
   * credits is the charge somebody finds on their statement, which is exactly
   * what the note-afterwards was meant to prevent and cannot: by the time the
   * note appears, the money is gone. A price on the button costs one extra word
   * and removes the surprise, and it keeps the list one click from the file
   * rather than making people unlock first.
   */
  cost?: number;
  /**
   * `inline` is the original: a strip inside the map panel, 11px, with the
   * unlocked/withheld tally beside it. `primary` is the one on the results
   * screen, where this is the main thing a person does with a finished list and
   * so looks like it — and where "Export 42 matched rows with proof" was three
   * pieces of our vocabulary in a six-word button.
   */
  variant?: "inline" | "primary";
  /**
   * Overrides the button's own class. Used by the App v2 result header, where
   * `sf-btn-lure` would be the screen's **second** lure-filled element — the
   * first is Copy email inside the open row, and `PRODUCT-HANDOFF.md` §12 is
   * "exactly one lure-filled element per screen. Grep for the token and count
   * per route." The artboard makes the same choice: its header action is
   * `.btn.ink`, ink-filled with lure text, precisely so the one lure stays on
   * the row.
   */
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setNote(null);
    setSignIn(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, criterion }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          reason?: string;
          signIn?: string;
        };
        setNote(body.reason ?? "That did not run. Nothing was charged.");
        setSignIn(body.signIn ?? null);
        setBusy(false);
        return;
      }

      const csv = await res.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smallfish-${market}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setNote(res.headers.get("X-Smallfish-Note"));
      track("export_downloaded", {
        rows: Number(res.headers.get("X-Smallfish-Rows") ?? 0),
        withheld,
        market,
      });
    } catch {
      setNote("Could not reach the server. Nothing was charged.");
    }
    setBusy(false);
  }

  if (variant === "primary") {
    return (
      <div className="text-right">
        <button onClick={run} disabled={busy || !rows} className={className ?? "sf-btn-lure disabled:opacity-40"}>
          {busy
            ? "Preparing…"
            : cost > 0
              ? `Download all ${rows} · ${cost} credit${cost === 1 ? "" : "s"}`
              : `Download all ${rows}`}
        </button>
        {note && (
          <p className="sf-small mt-2 max-w-[38ch] text-[var(--muted)]">
            {note}{" "}
            {signIn && (
              <a href={signIn} className="underline underline-offset-2">
                Sign up free
              </a>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--line)] px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--muted)]">
          {rows} unlocked · {withheld} as counts
        </span>
        <button
          onClick={run}
          disabled={busy || !rows}
          // A button that exports fewer rows than the table shows, without
          // saying so, is how people stop trusting a file they are about to
          // send to a client.
          title={
            withheld > 0
              ? `${withheld} non-matches stay out of the file, their names are not ` +
                `yours to export. Their reasons are in the summary above.`
              : undefined
          }
          // `sf-tap` grows this to 44px on a phone. Measured at 208x29 by
          // `check_mobile.mjs`, which on a touch screen is a control a thumb
          // cannot reliably hit — and it is the one that spends credits.
          className="sf-tap rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--accent-soft)] disabled:opacity-40"
        >
          {busy ? "Preparing…" : `Export ${rows} matched row${rows === 1 ? "" : "s"} with proof`}
        </button>
      </div>

      {note && (
        <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
          {note}{" "}
          {signIn && (
            <a href={signIn} className="underline underline-offset-2">
              Sign up free
            </a>
          )}
        </p>
      )}
    </div>
  );
}
