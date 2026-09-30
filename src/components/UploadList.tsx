"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { parseUpload, type CheckOption, type ParsedUpload } from "@/lib/csvimport";
import { estimateSeconds, humanDuration } from "@/lib/jobs";

/**
 * Upload a list, pick what to look for, watch it get read.
 *
 * ## The file is parsed in the browser first, and that is the point
 *
 * The same `parseUpload` the route runs, on their machine, before anything is
 * sent. So the screen can say *"we found 412 websites in the `Company URL`
 * column, skipped 9 rows that had none, and dropped 3 duplicates"* while they
 * are still looking at the file picker — rather than accepting the upload, going
 * away for forty minutes and producing a number that does not match what they
 * expected.
 *
 * The server parses it again and does not trust this. Both run the same
 * function, so they cannot disagree about what the file said.
 *
 * ## The unprovable checks are shown, not hidden
 *
 * `signals.ts` carries signals we cannot settle today precisely so the product
 * can refuse them out loud. A picker that quietly listed only the four that work
 * would look tidier and would teach somebody nothing about what this engine can
 * see — and the first person to want "businesses with an outdated site" would
 * conclude we had never thought about it.
 */
export default function UploadList({ checks }: { checks: CheckOption[] }) {
  const [parsed, setParsed] = useState<ParsedUpload | null>(null);
  const [csv, setCsv] = useState("");
  const [label, setLabel] = useState("");
  const [check, setCheck] = useState(checks.find((c) => c.provable)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  const runnable = checks.filter((c) => c.provable);
  const refused = checks.filter((c) => !c.provable);
  // One row per signal for the refusals: a signal we cannot settle is not
  // settleable in either direction, so listing both would be the same sentence
  // twice.
  const refusedOnce = refused.filter((c) => c.type === "absence");

  async function take(file: File) {
    setNote(null);
    const text = await file.text();
    setCsv(text);
    setParsed(parseUpload(text));
    if (!label) setLabel(file.name.replace(/\.[a-z]+$/i, "").slice(0, 80));
  }

  return (
    <div className="mt-8">
      {/* ------------------------------------------------------- the file -- */}
      <label className="sf-card block cursor-pointer p-6 text-center hover:border-[var(--line-strong)]">
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void take(f);
          }}
        />
        <span className="sf-h3 block">
          {parsed ? "Choose a different file" : "Choose a CSV"}
        </span>
        <span className="sf-small mt-2 block text-[var(--muted)]">
          A website column is all this needs. A name and a phone number are used
          when they are there.
        </span>
      </label>

      {/* ------------------------------------------ what we found in it -- */}
      {parsed && (
        <div className="sf-card mt-4 p-5">
          {parsed.rows.length > 0 ? (
            <>
              <p className="sf-h3">
                {parsed.rows.length.toLocaleString()} websites to read.
              </p>
              <p className="sf-body mt-2 max-w-[62ch] text-[var(--ink-2)]">
                From the{" "}
                <strong>{parsed.matched.site}</strong> column
                {parsed.matched.name ? `, names from ${parsed.matched.name}` : ""}
                {parsed.matched.phone ? `, numbers from ${parsed.matched.phone}` : ""}.{" "}
                {humanDuration(estimateSeconds(parsed.rows.length))} of reading.
              </p>
            </>
          ) : (
            <p className="sf-h3">No website we could open in that file.</p>
          )}

          {/* Dropped rows are named. A file that quietly loses a third of
              itself is the failure that makes somebody stop trusting an
              import — and they are the one person who can fix it. */}
          {(parsed.skipped.length > 0 || parsed.duplicates > 0) && (
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <p className="sf-small text-[var(--muted)]">
                {parsed.skipped.length > 0 && (
                  <>
                    {parsed.skipped.length.toLocaleString()}{" "}
                    {parsed.skipped.length === 1 ? "row has" : "rows have"} no website
                    we can open, so {parsed.skipped.length === 1 ? "it is" : "they are"}{" "}
                    left out.{" "}
                  </>
                )}
                {parsed.duplicates > 0 && (
                  <>
                    {parsed.duplicates.toLocaleString()}{" "}
                    {parsed.duplicates === 1 ? "was" : "were"} the same website as an
                    earlier row and {parsed.duplicates === 1 ? "is" : "are"} read once.
                  </>
                )}
              </p>
              {parsed.skipped.length > 0 && (
                <ul className="sf-small mt-2 space-y-1 text-[var(--muted)]">
                  {parsed.skipped.slice(0, 3).map((s) => (
                    <li key={s.line}>
                      line {s.line}: {s.why}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ what to look for -- */}
      {parsed && parsed.rows.length > 0 && (
        <>
          <div className="mt-6">
            <p className="sf-label">What makes one worth your call?</p>
            <div className="mt-3 flex flex-col gap-2">
              {runnable.map((c) => (
                <label
                  key={c.id}
                  className={`sf-card flex cursor-pointer items-start gap-3 p-4 ${
                    check === c.id ? "border-[var(--line-strong)]" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="check"
                    value={c.id}
                    checked={check === c.id}
                    onChange={() => setCheck(c.id)}
                    className="mt-1 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="sf-body block text-[var(--ink)]">It {c.text}</span>
                    <span className="sf-small mt-1 block text-[var(--muted)]">{c.how}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {refusedOnce.length > 0 && (
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              {/* Counted, never written down. The first version of this line
                  said "Three things", which was wrong — the catalogue holds
                  four unprovable signals, because `reviews` was added after
                  the sentence was written. A number in prose beside a list
                  that generates itself is a number that goes stale silently,
                  and `PROJECT_PLAN.md`'s decision log had drifted the same
                  way. */}
              <p className="sf-small text-[var(--muted)]">
                {refusedOnce.length} things people ask for that we cannot settle
                from a website today, so they are not offered rather than guessed
                at:
              </p>
              <ul className="sf-small mt-2 space-y-1 text-[var(--muted)]">
                {refusedOnce.map((c) => (
                  <li key={c.id}>
                    <strong>{c.text}</strong>
                    {c.wouldTake ? ` — would take ${c.wouldTake}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name this list"
              className="sf-input min-w-0 flex-1"
            />
            <button
              type="button"
              disabled={busy || !check}
              onClick={async () => {
                setBusy(true);
                setNote(null);
                try {
                  const res = await fetch("/api/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ csv, check, label }),
                  });
                  const b = (await res.json()) as {
                    ok?: boolean;
                    href?: string;
                    reason?: string;
                    signIn?: string;
                  };
                  if (b.ok && b.href) router.push(b.href);
                  else {
                    setNote(b.reason ?? "That did not queue.");
                    if (b.signIn) router.push(`${b.signIn}?source=upload`);
                  }
                } catch {
                  setNote("Could not reach the server. Nothing was queued.");
                } finally {
                  setBusy(false);
                }
              }}
              className="sf-btn-lure shrink-0"
            >
              {busy ? "Queueing…" : `Read all ${parsed.rows.length.toLocaleString()}`}
            </button>
          </div>
          {note && <p className="sf-small mt-3 text-[var(--ink-2)]">{note}</p>}
        </>
      )}
    </div>
  );
}
