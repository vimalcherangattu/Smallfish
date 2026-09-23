"use client";

import { compact } from "@/lib/cost";
import { rangeWidth, type FreeCount } from "@/lib/count";
import { READS_PER_CREDIT, SAMPLE_SIZE } from "@/lib/pricing";

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
  count,
  onUnlock,
}: {
  count: FreeCount;
  onUnlock: () => void;
}) {
  const wide = rangeWidth(count) >= 2;
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
        <div className="tabular mt-0.5 text-[19px] font-semibold leading-none">
          {compact(count.projected.lo)}–{compact(count.projected.hi)}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
          From a free sample of {count.sampled}, projected onto the{" "}
          <span className="tabular">{compact(count.eligible)}</span> businesses
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
        <dd className="tabular text-right">{count.sampled}</dd>
        <dt className="text-[var(--muted)]">Matched every criterion</dt>
        <dd className="tabular text-right text-[var(--match)]">{count.matched}</dd>
        {count.unsettled > 0 && (
          <>
            <dt className="text-[var(--muted)]">Read, but could not be settled</dt>
            <dd className="tabular text-right text-[var(--unsure)]">
              {count.unsettled}
            </dd>
          </>
        )}
      </dl>

      {count.unsettled > 0 && (
        <p className="text-[11px] leading-snug text-[var(--muted)]">
          The {count.unsettled} we could not settle count <em>against</em> the
          rate above, not out of it — they cost reading and deliver you nothing,
          so pretending they do not exist would quote you a price the scan
          cannot honour.
          {count.decidedRate > count.deliveredRate && (
            <>
              {" "}
              If every site here could be read, the rate would be{" "}
              <span className="tabular">{pct(count.decidedRate)}</span> rather
              than <span className="tabular">{pct(count.deliveredRate)}</span>.
            </>
          )}
        </p>
      )}

      {count.frameLimited && (
        <p className="border-t border-[var(--line)] pt-2 text-[11px] leading-snug text-[var(--unsure)]">
          Sampled from the{" "}
          <span className="tabular">{compact(count.frame)}</span> businesses
          read here so far, not from all{" "}
          <span className="tabular">{compact(count.eligible)}</span>. Those were
          picked by the crawler rather than at random, so the range above is
          only as representative as that ordering was — treat it as a reading of
          this market, not a measurement of it.
        </p>
      )}

      {/* --- three proofs, free --- */}
      {count.proofs.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--line)] pt-2">
          <div className="text-[11px] text-[var(--muted)]">
            Three of them, with the evidence, free:
          </div>
          {count.proofs.map((p) => (
            <div key={p.name} className="text-[11px] leading-snug">
              <div className="font-medium">{p.name}</div>
              <div className="italic text-[var(--muted)]">&ldquo;{p.line}&rdquo;</div>
            </div>
          ))}
        </div>
      )}

      {/* --- the price, before anything is spent --- */}
      <div className="border-t border-[var(--line)] pt-2">
        {count.scan.start ? (
          <>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="text-[var(--muted)]">
                {count.band.label} — {count.band.credits} credit
                {count.band.credits === 1 ? "" : "s"} per match
              </span>
              <span className="tabular text-[var(--muted)]">
                {pct(count.deliveredRate)} matched
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">
              {count.band.credits > count.bandIfObserved.credits ? (
                <>
                  Priced from the cautious end of a {count.sampled}-business
                  sample, not its midpoint — {count.matched} matches out of{" "}
                  {count.sampled} could mean a market much thinner than it
                  looks, and we would rather quote high and bill low than quote
                  low and stop your scan. If the full run matches as often as
                  the sample did, this drops to {count.bandIfObserved.credits}{" "}
                  credit
                  {count.bandIfObserved.credits === 1 ? "" : "s"}.
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
              Unlock matches at {count.band.credits} credit
              {count.band.credits === 1 ? "" : "s"} each
            </button>
            <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
              This search may read up to{" "}
              <span className="tabular">{compact(count.scan.budgetReads)}</span>{" "}
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
              {count.scan.reason}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
