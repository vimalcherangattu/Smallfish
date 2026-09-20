"use client";

import { useState } from "react";
import { outreachFor } from "@/lib/outreach";
import {
  BILLABLE,
  VERDICT_LABEL,
  type Business,
  type Criterion,
  type VerdictKind,
} from "@/lib/types";

const DOT: Record<VerdictKind, string> = {
  match: "bg-[var(--match)]",
  no_match: "bg-[var(--no)]",
  couldnt_tell: "bg-[var(--unsure)]",
  blocked: "bg-rose-400",
  needs_model: "bg-indigo-400",
  unread: "bg-[var(--unread)]",
};

export function VerdictDot({ kind }: { kind: VerdictKind }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[kind]}`}
      aria-hidden
    />
  );
}

/** The outreach draft, with the evidence it rests on folded underneath.
 *
 *  The evidence is not decoration. A note that cannot be traced is the one
 *  thing the product exists to avoid shipping, so the basis list sits directly
 *  below the text a user is about to paste, and a withheld note says why rather
 *  than showing nothing. */
function OutreachBlock({
  business,
  criteria,
}: {
  business: Business;
  criteria: Criterion[];
}) {
  const o = outreachFor(business, criteria);
  const [copied, setCopied] = useState(false);

  if (o.withheld) {
    return (
      <div className="rounded-md border border-dashed border-[var(--line)] px-2.5 py-2 text-[var(--muted)]">
        <span className="font-medium">No outreach note.</span> {o.withheld}.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Outreach draft
        </span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(o.note ?? "").then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => undefined,
            );
          }}
          className="rounded border border-[var(--line)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--accent-soft)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-1 leading-relaxed">{o.icebreaker}</p>
      {o.painPoint && (
        <p className="mt-1 leading-relaxed text-[var(--muted)]">
          <span className="font-medium text-[var(--ink)]">Likely pain point · </span>
          {o.painPoint}
        </p>
      )}

      <details className="mt-1.5">
        <summary className="cursor-pointer text-[10px] text-[var(--muted)]">
          What this rests on ({o.basis.length})
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-[var(--muted)]">
          {o.basis.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] italic text-[var(--muted)] opacity-80">
          Written from observed evidence only — no model wrote this, and nothing
          in it is a claim the site did not support.
        </p>
      </details>
    </div>
  );
}

export default function Results({
  businesses,
  criteria,
  primaryCriterionId,
}: {
  businesses: Business[];
  criteria: Criterion[];
  primaryCriterionId: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (!businesses.length) {
    return (
      <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
        No businesses in this region. Widen it or move it.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--line)]">
      {businesses.map((b) => {
        const v = b.verdicts[primaryCriterionId];
        const kind = (v?.verdict ?? "unread") as VerdictKind;
        const isOpen = open === b.id;
        return (
          <li key={b.id}>
            <button
              onClick={() => setOpen(isOpen ? null : b.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[var(--accent-soft)]"
              aria-expanded={isOpen}
            >
              <span className="mt-[7px]">
                <VerdictDot kind={kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[13px] font-medium">
                    {b.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--muted)]">
                    {VERDICT_LABEL[kind]}
                    {BILLABLE[kind] ? "" : " · free"}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                  {v?.proof ?? v?.reason ?? "—"}
                </span>
              </span>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[11px]">
                <div className="space-y-1.5">
                  {criteria.map((c) => {
                    const cv = b.verdicts[c.id];
                    const ck = (cv?.verdict ?? "unread") as VerdictKind;
                    return (
                      <div key={c.id} className="flex items-start gap-2">
                        <span className="mt-[5px]">
                          <VerdictDot kind={ck} />
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium">
                            {c.text}
                            <span className="ml-1.5 font-normal text-[var(--muted)]">
                              {VERDICT_LABEL[ck]}
                            </span>
                          </div>
                          <div className="text-[var(--muted)]">
                            {cv?.proof ?? cv?.reason}
                          </div>
                          <div className="mt-0.5 italic text-[var(--muted)] opacity-80">
                            {c.explain}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <OutreachBlock business={b} criteria={criteria} />

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[var(--muted)]">
                  {b.addr && (
                    <>
                      <dt>Address</dt>
                      <dd className="text-[var(--ink)]">{b.addr}</dd>
                    </>
                  )}
                  {b.phone && (
                    <>
                      <dt>Phone</dt>
                      <dd className="text-[var(--ink)]">{b.phone}</dd>
                    </>
                  )}
                  {b.site && (
                    <>
                      <dt>Website</dt>
                      <dd className="truncate">
                        <a
                          href={
                            b.site.startsWith("http") ? b.site : `https://${b.site}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent)] underline underline-offset-2"
                        >
                          {b.site.replace(/^https?:\/\//, "")}
                        </a>
                      </dd>
                    </>
                  )}
                  <dt>Category</dt>
                  <dd className="text-[var(--ink)]">{b.cat}</dd>
                  {b.read ? (
                    <>
                      <dt>Site read</dt>
                      <dd className="text-[var(--ink)]">
                        {b.read.pages} page{b.read.pages === 1 ? "" : "s"} ·{" "}
                        {b.read.outcome}
                        {b.read.chars > 0 &&
                          ` · ${b.read.chars.toLocaleString()} chars`}
                      </dd>
                      {b.read.vendors.length > 0 && (
                        <>
                          <dt>Detected</dt>
                          <dd className="text-[var(--ink)]">
                            {b.read.vendors.join(", ")}
                          </dd>
                        </>
                      )}
                      {b.read.cms.length > 0 && (
                        <>
                          <dt>Platform</dt>
                          <dd className="text-[var(--ink)]">
                            {b.read.cms.join(", ")}
                          </dd>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <dt>Site read</dt>
                      <dd>not yet</dd>
                    </>
                  )}
                </dl>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
