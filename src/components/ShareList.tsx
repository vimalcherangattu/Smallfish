"use client";

import { useState } from "react";

/**
 * Share this list.
 *
 * ## What it hands over, and what it does not
 *
 * A link to three of the businesses, by name, with the evidence — the same
 * three a signed-out visitor sees. **Not the paid rows.** That is enforced by
 * the page the link opens, which calls `buildLeads` with no unlocks, so this
 * button cannot be the thing that gets it wrong.
 *
 * The line above the button says so before it is pressed, because a customer
 * about to send a client a list needs to know exactly what the client will see.
 * Finding out afterwards is the version of this feature nobody uses twice.
 *
 * ## Revoke is beside it, not buried
 *
 * A link you cannot take back is a link you do not send.
 */
export default function ShareList({
  market,
  criterion,
  label,
}: {
  market: string;
  criterion: string;
  label?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="mt-6 border-t border-[var(--line)] pt-5">
      {!url ? (
        <>
          <p className="sf-small text-[var(--muted)]">
            Send this list to somebody. They see the count, the evidence and
            three of the businesses by name, never the ones you paid to unlock.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setNote(null);
              try {
                const res = await fetch("/api/share", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ market, criterion, label }),
                });
                const b = (await res.json()) as {
                  ok?: boolean;
                  url?: string;
                  token?: string;
                  reason?: string;
                };
                if (b.ok && b.url) {
                  setUrl(b.url);
                  setToken(b.token ?? null);
                } else setNote(b.reason ?? "That did not work.");
              } catch {
                setNote("Could not reach the server.");
              } finally {
                setBusy(false);
              }
            }}
            className="sf-btn mt-3"
          >
            {busy ? "Making a link…" : "Share this list"}
          </button>
          {note && <p className="sf-small mt-2 text-[var(--ink-2)]">{note}</p>}
        </>
      ) : (
        <>
          <p className="sf-small text-[var(--muted)]">
            Anyone with this link can open it. It shows three businesses by name.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="sf-small min-w-0 flex-1 break-all rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
              {url}
            </code>
            <button
              type="button"
              className="sf-btn shrink-0"
              onClick={() => {
                navigator.clipboard?.writeText(url).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  },
                  () => undefined,
                );
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <button
            type="button"
            className="sf-small mt-3 text-[var(--muted)] underline underline-offset-2"
            onClick={async () => {
              if (!token) return;
              const res = await fetch(`/api/share?token=${encodeURIComponent(token)}`, {
                method: "DELETE",
              }).catch(() => null);
              const b = res ? ((await res.json()) as { note?: string }) : null;
              setUrl(null);
              setToken(null);
              setNote(b?.note ?? "That link no longer opens.");
            }}
          >
            Stop this link working
          </button>
        </>
      )}
    </div>
  );
}
