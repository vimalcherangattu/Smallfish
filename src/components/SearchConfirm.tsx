"use client";

import { useEffect, useMemo, useState } from "react";
import FreeCountPanel from "@/components/FreeCount";
import { compact } from "@/lib/cost";
import type { FreeCount } from "@/lib/count";
import {
  MAX_CRITERIA,
  RARE_MATCH_RATE,
  parseSearch,
  resolveSearch,
  type ParsedCriterion,
} from "@/lib/search";
import type { MarketIndex } from "@/lib/types";

/** Search box and confirm step (S1-01).
 *
 *  Everything here happens before a count is run or anything is charged,
 *  which is the point: a criterion the engine cannot settle is cheapest to
 *  refuse while the user is still typing. Seven of the eight things this
 *  screen can say are some form of "no", and they are all shown rather than
 *  quietly resolved. */
export default function SearchConfirm({
  index,
  onRun,
  onClose,
  countFor,
  coldMarketFor,
  onNeedMarket,
}: {
  index: MarketIndex | null;
  onRun: (marketId: string, criterionId: string) => void;
  onClose: () => void;
  /** The free sample for a resolved search, once its market data is loaded. */
  countFor?: (
    marketId: string,
    criterionId: string,
    sampleSize?: number,
  ) => FreeCount | null;
  /** How much of a market has been read at all, for the cold-market state. */
  coldMarketFor?: (marketId: string) => { read: number; total: number } | null;
  /** Ask for a market's data when the search resolves to one not yet loaded. */
  onNeedMarket?: (marketId: string) => void;
}) {
  const [text, setText] = useState("");
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [answered, setAnswered] = useState<Record<string, string>>({});

  const parsed = useMemo(() => parseSearch(text), [text]);
  const resolved = useMemo(() => resolveSearch(parsed, index), [parsed, index]);
  const count = useMemo(
    () =>
      countFor && resolved.marketId && resolved.criterionId
        ? countFor(resolved.marketId, resolved.criterionId)
        : null,
    [countFor, resolved.marketId, resolved.criterionId],
  );

  useEffect(() => {
    if (resolved.marketId && !count) onNeedMarket?.(resolved.marketId);
  }, [resolved.marketId, count, onNeedMarket]);

  const kept = parsed.criteria.filter((c) => !dropped.has(c.id));
  const asked = text.trim().length > 0;
  // Nothing is counted while the search declines to make sense. A declined
  // term is refused outright; a contradiction would return the empty
  // intersection, and offering to run it anyway is a worse answer than saying
  // so — the user has a "drop" button on each chip.
  const blocked =
    parsed.declined.some((d) => d.kind !== "unprovable") ||
    parsed.conflicts.some(
      (c) => !dropped.has(c.a.id) && !dropped.has(c.b.id),
    );

  function toggle(c: ParsedCriterion) {
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-[var(--panel)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold">Search</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
            One box. Everything we cannot check gets said before anything is
            counted.
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded border border-[var(--line)] px-2 py-1 text-[11px] hover:bg-[var(--accent-soft)]"
        >
          Close
        </button>
      </header>

      <div className="border-b border-[var(--line)] px-4 py-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Med spas in Dallas that offer Botox and don't have online booking"
          className="w-full resize-none rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-[12px] leading-snug"
        />
      </div>

      {asked && (
        <div className="space-y-3 px-4 py-3">
          {/* --- what we read out of it --- */}
          <dl className="grid grid-cols-[76px_1fr] gap-x-3 gap-y-1.5 text-[11px]">
            <dt className="text-[var(--muted)]">Where</dt>
            <dd>
              {parsed.where ? (
                parsed.where.text
              ) : (
                <span className="text-[var(--muted)]">not named</span>
              )}
            </dd>
            <dt className="text-[var(--muted)]">What</dt>
            <dd>
              {parsed.what ? (
                <>
                  {parsed.what.text}
                  <span className="ml-1 text-[var(--muted)]">
                    · related: {parsed.what.related.join(", ")}
                  </span>
                </>
              ) : (
                <span className="text-[var(--muted)]">not recognised</span>
              )}
            </dd>
          </dl>

          {/* --- criteria as editable chips, each with how it is checked --- */}
          {parsed.criteria.length > 0 && (
            <div className="space-y-1.5">
              {parsed.criteria.map((c) => {
                const off = dropped.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={`rounded-md border px-2.5 py-2 text-[11px] leading-snug ${
                      off
                        ? "border-dashed border-[var(--line)] opacity-50"
                        : "border-[var(--line)]"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        <span className="mr-1.5 rounded bg-[var(--bg)] px-1 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)]">
                          {c.type === "absence" ? "must not have" : "must have"}
                        </span>
                        {c.text}
                      </span>
                      <button
                        onClick={() => toggle(c)}
                        className="shrink-0 text-[10px] text-[var(--muted)] underline underline-offset-2"
                      >
                        {off ? "restore" : "drop"}
                      </button>
                    </div>
                    <div className="mt-0.5 text-[var(--muted)]">{c.how}</div>
                    {!c.provable && (
                      <div className="mt-0.5 text-[var(--unsure)]">
                        Not settleable today — this one will come back as
                        &ldquo;not yet judged&rdquo; until a model runs.
                      </div>
                    )}
                    {c.type === "absence" && c.provable && (
                      <div className="mt-0.5 italic text-[var(--muted)] opacity-80">
                        Absence needs positive proof: the relevant pages must be
                        read and nothing found. Otherwise it is
                        &ldquo;couldn&rsquo;t tell&rdquo;, never &ldquo;no&rdquo;.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {parsed.overLimit && (
            <p className="rounded-md bg-[var(--unsure-soft)] px-2.5 py-2 text-[11px] leading-snug text-[var(--unsure)]">
              {parsed.criteria.length} criteria — the limit is {MAX_CRITERIA}.
              More criteria lower the match rate and raise the cost of every
              scan. Drop one.
            </p>
          )}

          {/* --- contradictions --- */}
          {parsed.conflicts.map((c) => (
            <p
              key={`${c.a.id}:${c.b.id}`}
              className="rounded-md bg-[var(--unsure-soft)] px-2.5 py-2 text-[11px] leading-snug text-[var(--unsure)]"
            >
              {c.why}
            </p>
          ))}

          {/* --- one multiple-choice question per vague word --- */}
          {parsed.clarifications.map((q) => (
            <div
              key={q.source}
              className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2 text-[11px] leading-snug"
            >
              <div className="font-medium">{q.question}</div>
              <div className="mt-1 space-y-1">
                {q.options.map((o) => (
                  <label key={o.label} className="flex items-start gap-1.5">
                    <input
                      type="radio"
                      name={q.source}
                      checked={answered[q.source] === o.label}
                      onChange={() =>
                        setAnswered((p) => ({ ...p, [q.source]: o.label }))
                      }
                      className="mt-[3px]"
                    />
                    <span className="text-[var(--muted)]">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* --- refusals --- */}
          {parsed.declined.map((d) => (
            <div
              key={d.source}
              className="rounded-md border border-dashed border-[var(--no)]/40 bg-[var(--bg)] px-2.5 py-2 text-[11px] leading-snug"
            >
              <div className="font-medium">
                Not searchable: &ldquo;{d.source}&rdquo;
              </div>
              <div className="mt-0.5 text-[var(--muted)]">{d.why}</div>
              {d.proxy && (
                <div className="mt-0.5 text-[var(--muted)]">
                  Closest provable version:{" "}
                  <strong className="text-[var(--ink)]">{d.proxy.text}</strong>
                  {!d.proxy.provableToday &&
                    " — which we also cannot check today, so it is on the roadmap rather than in this search."}
                </div>
              )}
            </div>
          ))}

          {/* --- what we could not place --- */}
          {parsed.unrecognised.length > 0 && (
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              Could not work out{" "}
              <strong className="text-[var(--ink)]">
                {parsed.unrecognised.join(" or ")}
              </strong>{" "}
              from that. No model is reading this query yet, so the parser only
              recognises what it has a rule for — say it more plainly, or use
              the ICP flow.
              {index && (
                <>
                  {" "}
                  Measured so far:{" "}
                  {index.markets
                    .map((m) => `${m.niche.replace(/_/g, " ")} in ${m.metro}`)
                    .join("; ")}
                  .
                </>
              )}
            </p>
          )}

          {/* --- the count, and the rarity warning --- */}
          {resolved.note && (
            <p className="rounded-md bg-[var(--bg)] px-2.5 py-2 text-[11px] leading-snug text-[var(--muted)]">
              {resolved.note}
            </p>
          )}

          {resolved.marketId && resolved.criterionId && !blocked && (
            <>
              {count ? (
                // The sample is the count. It replaces the bare "measured
                // matches" number that used to sit here — that number was the
                // whole judged set, which is not what a visitor who has paid
                // nothing is entitled to, and stating it as a single figure
                // claimed a precision 25 reads cannot support.
                <FreeCountPanel
                  count={count}
                  countAt={(size) =>
                    countFor!(resolved.marketId!, resolved.criterionId!, size)
                  }
                  coldMarket={coldMarketFor?.(resolved.marketId!) ?? undefined}
                  onUnlock={() =>
                    onRun(resolved.marketId!, resolved.criterionId!)
                  }
                />
              ) : (
                <div className="rounded-md border border-[var(--line)] px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-[var(--muted)]">
                      Measured matches
                    </span>
                    <span className="tabular text-[15px] font-semibold">
                      {compact(resolved.matches)}
                    </span>
                  </div>
                  {resolved.rare && (
                    <p className="mt-1 text-[11px] leading-snug text-[var(--unsure)]">
                      That is under {Math.round(RARE_MATCH_RATE * 100)}% of the{" "}
                      {compact(resolved.judged)} judged so far — a rare search.
                      Widen the area or loosen a criterion before unlocking.
                    </p>
                  )}
                  <button
                    onClick={() =>
                      onRun(resolved.marketId!, resolved.criterionId!)
                    }
                    disabled={!kept.length && !parsed.criteria.length}
                    className="mt-2 w-full rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
                  >
                    Show these on the map
                  </button>
                </div>
              )}
            </>
          )}

          {blocked && (
            <p className="text-[11px] leading-snug text-[var(--muted)]">
              Nothing is counted while the search declines to make sense —
              resolve the note above first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
