"use client";

import { useEffect, useState } from "react";

import { compact } from "@/lib/cost";
import { rangeWidth, type FreeCount } from "@/lib/count";
import { READS_PER_CREDIT, SAMPLE_SIZE } from "@/lib/pricing";

/** Sample sizes the count is revealed at (S1-03).
 *
 *  Each step is a **real** recomputation at that sample size, not an animation
 *  over a number already known: five businesses genuinely support a wider
 *  interval than twenty-five do, and watching it narrow is the clearest way to
 *  show that reading is what buys certainty.
 *
 *  What this deliberately is not is a fake progress bar. The data in this demo
 *  has already been read, so dressing the reveal as live crawling would be
 *  claiming a latency that is not happening. The label says which sample each
 *  figure came from, and the steps are quick. */
const STEPS = [5, 10, 25] as const;

/** The free match count, before anything is unlocked (S1-02).
 *
 *  Design system P1 — "a score shown alone is a bug". The number here is a
 *  range, and the sample it came from is on screen beside it: how many were
 *  read, how many matched, how many could not be settled. P3 — everything
 *  computed is mono and says plainly that no credits were used.
 *
 *  The hardest thing on this screen is the width of the range. The instinct is
 *  to hide it behind a midpoint, and the instinct is wrong: 9 matches in 25
 *  really does mean "somewhere between a fifth and a half of this market", and
 *  a customer deciding whether to spend $29 deserves that rather than a
 *  confident "about 780". So the width is stated in words when it is wide, with
 *  the one thing that narrows it — more reading. */
export default function FreeCountPanel({
  count: full,
  countAt,
  onUnlock,
  coldMarket,
}: {
  count: FreeCount;
  /** Recompute at a smaller sample, for the reveal. */
  countAt?: (sampleSize: number) => FreeCount | null;
  onUnlock: () => void;
  /** How much of this market has been read at all. */
  coldMarket?: { read: number; total: number };
}) {
  const [step, setStep] = useState(countAt ? 0 : STEPS.length - 1);

  useEffect(() => {
    if (!countAt) return;
    setStep(0);
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setStep(i), i * 420),
    );
    return () => timers.forEach(clearTimeout);
  }, [countAt, full.eligible, full.frame]);

  const settling = countAt ? step < STEPS.length - 1 : false;
  // What is on screen is the count at the current step, which for the last
  // step is the full sample the caller passed in.
  const shown = (countAt && countAt(STEPS[step])) ?? full;

  const wide = rangeWidth(shown) >= 2;
  const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

  return (
    <div className="space-y-2.5 rounded-md border border-[var(--line)] px-2.5 py-2.5">
      {/* --- the count, as a range --- */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-[var(--muted)]">
            Matches in this market
          </span>
          <span className="text-[10px] text-[var(--accent)]">no credits used</span>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="tabular mt-0.5 text-[19px] font-semibold leading-none">
            {compact(shown.projected.lo)}–{compact(shown.projected.hi)}
          </div>
          {settling && (
            <span className="text-[10px] text-[var(--muted)]">
              narrowing as more is read…
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
          From a free sample of {shown.sampled}, projected onto the{" "}
          <span className="tabular">{compact(shown.eligible)}</span> businesses
          here with a website.{" "}
          {wide && (
            <>
              That is a wide range because {SAMPLE_SIZE} is a small sample — it
              narrows as more of the market is read, and reading is what a
              credit buys.
            </>
          )}
        </p>
      </div>

      {/* --- P1: the number decomposes into what was actually seen --- */}
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-[var(--line)] pt-2 text-[11px]">
        <dt className="text-[var(--muted)]">Read</dt>
        <dd className="tabular text-right">{shown.sampled}</dd>
        <dt className="text-[var(--muted)]">Matched every criterion</dt>
        <dd className="tabular text-right text-[var(--match)]">{shown.matched}</dd>
        {shown.unsettled > 0 && (
          <>
            <dt className="text-[var(--muted)]">Read, but could not be settled</dt>
            <dd className="tabular text-right text-[var(--unsure)]">
              {shown.unsettled}
            </dd>
          </>
        )}
      </dl>

      {shown.unsettled > 0 && (
        <p className="text-[11px] leading-snug text-[var(--muted)]">
          The {shown.unsettled} we could not settle count <em>against</em> the
          rate above, not out of it — they cost reading and deliver you nothing,
          so pretending they do not exist would quote you a price the scan
          cannot honour.
          {shown.decidedRate > shown.deliveredRate && (
            <>
              {" "}
              If every site here could be read, the rate would be{" "}
              <span className="tabular">{pct(shown.decidedRate)}</span> rather
              than <span className="tabular">{pct(shown.deliveredRate)}</span>.
            </>
          )}
        </p>
      )}

      {coldMarket && coldMarket.read < coldMarket.total * 0.5 && (
        <p className="rounded-md bg-[var(--bg)] px-2.5 py-2 text-[11px] leading-snug text-[var(--muted)]">
          <span className="font-medium text-[var(--ink)]">
            This market is cold.
          </span>{" "}
          We have read{" "}
          <span className="tabular">{compact(coldMarket.read)}</span> of its{" "}
          <span className="tabular">{compact(coldMarket.total)}</span>{" "}
          businesses. Reading the rest is what narrows the range above, and it
          takes a while — start the scan and we will email you when it is done
          rather than hold you on this screen.
        </p>
      )}

      {shown.frameLimited && (
        <p className="border-t border-[var(--line)] pt-2 text-[11px] leading-snug text-[var(--unsure)]">
          Sampled from the{" "}
          <span className="tabular">{compact(shown.frame)}</span> businesses
          read here so far, not from all{" "}
          <span className="tabular">{compact(shown.eligible)}</span>. Those were
          picked by the crawler rather than at random, so the range above is
          only as representative as that ordering was — treat it as a reading of
          this market, not a measurement of it.
        </p>
      )}

      {/* --- three proofs, free --- */}
      {shown.proofs.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--line)] pt-2">
          <div className="text-[11px] text-[var(--muted)]">
            Three of them, with the evidence, free:
          </div>
          {shown.proofs.map((p) => (
            <div key={p.name} className="text-[11px] leading-snug">
              <div className="font-medium">{p.name}</div>
              <div className="italic text-[var(--muted)]">&ldquo;{p.line}&rdquo;</div>
            </div>
          ))}
        </div>
      )}

      {/* --- the price, before anything is spent --- */}
      <div className="border-t border-[var(--line)] pt-2">
        {shown.scan.start ? (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-[var(--muted)]">
                {shown.band.label} — {shown.band.credits} credit
                {shown.band.credits === 1 ? "" : "s"} per match
              </span>
              <span className="tabular text-[var(--muted)]">
                {pct(shown.deliveredRate)} matched
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
              {shown.band.credits > shown.bandIfObserved.credits ? (
                <>
                  Priced from the cautious end of a {shown.sampled}-business
                  sample, not its midpoint — {shown.matched} matches out of{" "}
                  {shown.sampled} could mean a market much thinner than it
                  looks, and we would rather quote high and bill low than quote
                  low and stop your scan. If the full run matches as often as
                  the sample did, this drops to {shown.bandIfObserved.credits}{" "}
                  credit
                  {shown.bandIfObserved.credits === 1 ? "" : "s"}.
                </>
              ) : (
                <>
                  Priced from this sample and shown before you spend anything. If
                  the full scan matches more often than the sample did, you are
                  billed the cheaper band.
                </>
              )}{" "}
              The rate above can only go down. Non-matches stay free.
            </p>
            <button
              onClick={onUnlock}
              className="mt-2 w-full rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-[11px] font-medium text-white"
            >
              Unlock matches at {shown.band.credits} credit
              {shown.band.credits === 1 ? "" : "s"} each
            </button>
            <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
              This search may read up to{" "}
              <span className="tabular">{compact(shown.scan.budgetReads)}</span>{" "}
              businesses — {READS_PER_CREDIT} for every credit on your balance.
              It stops early, and says why, if matches dry up.
            </p>
          </>
        ) : (
          <>
            <div className="text-[11px] font-medium text-[var(--unsure)]">
              Not worth running
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
              {shown.scan.reason}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
