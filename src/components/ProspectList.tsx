"use client";

import { useEffect, useState } from "react";

type Row = { name: string; site: string; phone: string | null; proof: string };
type State =
  | { kind: "loading" }
  | { kind: "rows"; rows: Row[] }
  | { kind: "none"; reason: string };

/**
 * The three businesses on a prospect's page. Built on the first visit, so the
 * first visitor waits about half a minute and is told so; everyone after that
 * gets the stored rows at once.
 */
export default function ProspectList({ token, initial, gap }: { token: string; initial: Row[] | null; gap: string }) {
  const [s, set] = useState<State>(initial?.length ? { kind: "rows", rows: initial } : { kind: "loading" });

  useEffect(() => {
    if (s.kind !== "loading") return;
    fetch(`/api/outreach/list/${token}`, { method: "POST" })
      .then((r) => r.json())
      .then((r) => {
        if (r.ok) set({ kind: "rows", rows: r.rows });
        else if (r.reason === "capped") set({ kind: "none", reason: "We've read as much as we can for today. Come back tomorrow and your list will be here." });
        else set({ kind: "none", reason: `We didn't find any without ${gap} in the first sites we read. The full search reads further.` });
      })
      .catch(() => set({ kind: "none", reason: "Something went wrong on our side. Refresh to try again." }));
  }, [s.kind, token, gap]);

  if (s.kind === "loading") {
    return (
      <div className="mt-10 rounded-xl border border-[var(--line)] p-7 text-[15px] text-[var(--ink-2)]">
        Reading their websites now. This takes about half a minute, once.
      </div>
    );
  }
  if (s.kind === "none") {
    return <div className="mt-10 rounded-xl border border-[var(--line)] p-7 text-[15px] text-[var(--ink-2)]">{s.reason}</div>;
  }
  return (
    <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)]">
      {s.rows.map((r) => (
        <li key={r.site} className="bg-[var(--paper)] p-6">
          <div className="text-[17px] font-semibold text-[var(--ink)]">{r.name}</div>
          <div className="mono mt-1 text-[13px] text-[var(--ink-3)]">
            {r.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            {r.phone ? `  ·  ${r.phone}` : ""}
          </div>
          {/* PRD v2: a row answers "who, how to reach them, why now". The pages
              we read stay in the row's data, not on screen. */}
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
            Why them: no {gap.replace(/^(a|an) /i, "")} on their website.
          </p>
        </li>
      ))}
    </ol>
  );
}
