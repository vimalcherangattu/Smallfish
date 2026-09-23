"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import IcpBuilder from "@/components/IcpBuilder";
import Results, { VerdictDot } from "@/components/Results";
import SearchConfirm from "@/components/SearchConfirm";
import type { Candidate } from "@/lib/icp";
import { bboxOf, contains, areaSqMiles, type Region } from "@/lib/geo";
import { COST, compact, estimateCost, money } from "@/lib/cost";
import { groupForBilling } from "@/lib/billing";
import { freeCount } from "@/lib/count";
import { downloadCsv, overallVerdict, toCsv } from "@/lib/csv";
import { PLANS } from "@/lib/pricing";
import {
  BILLABLE,
  VERDICT_LABEL,
  type Market,
  type MarketIndex,
  type VerdictKind,
} from "@/lib/types";

const MapPicker = dynamic(() => import("@/components/MapPicker"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[var(--line)]/30" />,
});

const RADII = [5, 10, 25, 50];
const ORDER: VerdictKind[] = [
  "match",
  "couldnt_tell",
  "blocked",
  "needs_model",
  "no_match",
  "unread",
];

export default function Page() {
  const [index, setIndex] = useState<MarketIndex | null>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [marketId, setMarketId] = useState("med-spa-dallas");
  const [region, setRegion] = useState<Region | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [criterionId, setCriterionId] = useState<string>("");
  const [icpOpen, setIcpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Set when the ICP flow picks a market, so the criterion it chose survives
   *  the market load that would otherwise overwrite it with `mostDecided`. */
  const [pendingCriterion, setPendingCriterion] = useState<string | null>(null);
  const [show, setShow] = useState<Set<VerdictKind>>(
    new Set(["match", "couldnt_tell"]),
  );

  /** Which criterion to lead with: the one with the most decided verdicts. */
  function mostDecided(m: Market): string {
    const decided = (id: string) => {
      const t = m.tallies[id] ?? {};
      return (t.match ?? 0) + (t.no_match ?? 0) + (t.couldnt_tell ?? 0);
    };
    return [...m.criteria].sort((a, b) => decided(b.id) - decided(a.id))[0].id;
  }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("data/index.json")
      .then((r) => r.json())
      .then(setIndex)
      .catch(() => setIndex(null));
  }, []);

  // Markets already fetched, so the free count on the confirm screen can sample
  // a market the map is not currently showing without refetching megabytes.
  const [loaded, setLoaded] = useState<Record<string, Market>>({});
  const remember = (m: Market) =>
    setLoaded((prev) => (prev[m.id] ? prev : { ...prev, [m.id]: m }));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`data/${marketId}.json`)
      .then((r) => r.json())
      .then((m: Market) => {
        if (cancelled) return;
        setMarket(m);
        remember(m);
        setRegion({ kind: "radius", center: m.center, miles: 25 });
        // Lead with the criterion that actually has verdicts today. `needsModel`
        // is true for every absence criterion by design, so it cannot be used
        // to pick one — count the decided verdicts instead.
        setCriterionId(pendingCriterion ?? mostDecided(m));
        setPendingCriterion(null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [marketId]);

  /** Candidate *records* in the region — Overture's rows, duplicates included. */
  const recordsInRegion = useMemo(() => {
    if (!market || !region) return [];
    const box = bboxOf(region);
    return market.businesses.filter((b) =>
      contains(region, { lon: b.lon, lat: b.lat }, box),
    );
  }, [market, region]);

  /**
   * The same region as *businesses*, one per website.
   *
   * Deduplicated once, here, so that every number downstream counts the same
   * way the invoice does. Doing it only in the export was the bug: the chip
   * said 42 matches, the headline said 41 and the file wrote 41, and all three
   * were describing the same region. 830 of dental Phoenix's 2,778 records
   * with a website share a domain with another.
   */
  const inRegion = useMemo(
    () => groupForBilling(recordsInRegion).map((g) => g.lead),
    [recordsInRegion],
  );
  const duplicateRecords = recordsInRegion.length - inRegion.length;

  const tally = useMemo(() => {
    const t: Record<string, number> = {};
    for (const b of inRegion) {
      const v = b.verdicts[criterionId]?.verdict ?? "unread";
      t[v] = (t[v] ?? 0) + 1;
    }
    return t;
  }, [inRegion, criterionId]);

  const readCount = useMemo(
    () => inRegion.filter((b) => b.read).length,
    [inRegion],
  );
  const cost = estimateCost(inRegion.length, readCount);

  // Keep the filter honest: default to matches and couldn't-tell, but if this
  // criterion produced none of those, show what it did produce rather than an
  // empty list that looks like "no businesses here".
  useEffect(() => {
    const present = ORDER.filter((k) => (tally[k] ?? 0) > 0);
    if (!present.length) return;
    const preferred = present.filter((k) => k === "match" || k === "couldnt_tell");
    setShow(new Set(preferred.length ? preferred : present));
  }, [criterionId, market?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () =>
      inRegion.filter((b) =>
        show.has((b.verdicts[criterionId]?.verdict ?? "unread") as VerdictKind),
      ),
    [inRegion, criterionId, show],
  );

  /** Matches the user has called wrong. Refunded, and out of the export. */
  const [reported, setReported] = useState<Set<string>>(new Set());
  const report = useCallback((id: string, wrong: boolean) => {
    setReported((prev) => {
      const next = new Set(prev);
      if (wrong) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  // A refunded row leaves the export too. Keeping it would be the worse of
  // both: we do not charge for it, and the user still carries a row they have
  // told us is wrong into their outreach.
  const forExport = useMemo(
    () => visible.filter((b) => !reported.has(b.id)),
    [visible, reported],
  );

  // How many rows the CSV will carry: matched and not refunded. `forExport`
  // descends from `inRegion`, which is already one row per business.
  const exportable = useMemo(
    () =>
      market
        ? forExport.filter((b) => BILLABLE[overallVerdict(b, market.criteria)])
            .length
        : 0,
    [forExport, market],
  );

  function toggle(kind: VerdictKind) {
    setShow((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  // The headline count nets off refunds. A number that keeps counting rows the
  // user has told us are wrong is the number they will stop believing first.
  const refundedHere = useMemo(
    () =>
      inRegion.filter(
        (b) =>
          reported.has(b.id) &&
          b.verdicts[criterionId]?.verdict === "match",
      ).length,
    [inRegion, reported, criterionId],
  );
  // `inRegion` is already one row per business, so this is a plain count.
  const matches = Math.max(0, (tally.match ?? 0) - refundedHere);

  /** Both front doors land here: a typed search and a chosen ICP produce the
   *  same thing, an ordinary market plus criterion. Nothing downstream is told
   *  which door it came through. */
  function adopt(nextMarketId: string, nextCriterionId: string) {
    setIcpOpen(false);
    setSearchOpen(false);
    if (nextMarketId === marketId) {
      setCriterionId(nextCriterionId);
    } else {
      // The market load picks a lead criterion of its own; hand it ours.
      setPendingCriterion(nextCriterionId);
      setMarketId(nextMarketId);
    }
  }
  const adoptIcp = (c: Candidate) => adopt(c.marketId, c.criterionId);

  /** The free sample behind the count on the confirm screen (S1-02). */
  const countFor = useCallback(
    (mid: string, cid: string) => {
      const m = loaded[mid];
      if (!m) return null;
      const criteria = m.criteria.filter((c) => c.id === cid);
      if (!criteria.length) return null;
      return freeCount({
        businesses: m.businesses,
        criteria,
        // The seed is the search itself, so two identical searches get an
        // identical count — the same contract the confirm step already makes
        // about its wording.
        seed: `${mid}:${cid}`,
        remainingCredits: PLANS.find((p) => p.id === "free")!.credits,
      });
    },
    [loaded],
  );

  /** Fetch a market the confirm screen resolved to but the map has not loaded. */
  const needMarket = useCallback(
    (id: string) => {
      if (loaded[id]) return;
      fetch(`data/${id}.json`)
        .then((r) => r.json())
        .then((m: Market) => remember(m))
        .catch(() => {});
    },
    [loaded],
  );

  return (
    <main className="flex h-dvh flex-col lg:flex-row">
      {/* ---------------- Map ---------------- */}
      <section className="relative h-[42dvh] w-full shrink-0 lg:h-full lg:flex-1">
        {/* Explicit height, not h-auto: the only child is absolutely
            positioned, so the section would otherwise collapse to 0. */}
        {region && market && (
          <MapPicker
            businesses={inRegion}
            region={region}
            primaryCriterionId={criterionId}
            onRegionChange={setRegion}
            drawing={drawing}
            onDrawComplete={() => setDrawing(false)}
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 p-3">
          <div className="pointer-events-auto inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel)]/95 p-1.5 shadow-sm backdrop-blur">
            {RADII.map((mi) => {
              const active =
                region?.kind === "radius" && region.miles === mi;
              return (
                <button
                  key={mi}
                  onClick={() =>
                    market &&
                    setRegion({
                      kind: "radius",
                      center:
                        region?.kind === "radius" ? region.center : market.center,
                      miles: mi,
                    })
                  }
                  className={`rounded px-2 py-1 text-[11px] font-medium ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                  }`}
                >
                  {mi} mi
                </button>
              );
            })}
            <span className="mx-0.5 h-4 w-px bg-[var(--line)]" />
            <button
              onClick={() => setDrawing((d) => !d)}
              className={`rounded px-2 py-1 text-[11px] font-medium ${
                drawing
                  ? "bg-[var(--unsure)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--accent-soft)]"
              }`}
            >
              {drawing ? "Click points · Enter to close" : "Draw area"}
            </button>
          </div>
          {!drawing && region?.kind === "radius" && (
            <p className="pointer-events-none mt-1.5 text-[10px] text-[var(--muted)]">
              Click the map to move the centre.
            </p>
          )}
        </div>
      </section>

      {/* ---------------- Panel ---------------- */}
      <section className="relative flex min-h-0 flex-1 flex-col border-t border-[var(--line)] bg-[var(--panel)] lg:w-[460px] lg:flex-none lg:border-l lg:border-t-0">
        {icpOpen && (
          <IcpBuilder
            index={index}
            onPick={adoptIcp}
            onClose={() => setIcpOpen(false)}
          />
        )}
        {searchOpen && (
          <SearchConfirm
            index={index}
            onRun={adopt}
            onClose={() => setSearchOpen(false)}
            countFor={countFor}
            onNeedMarket={needMarket}
          />
        )}
        <header className="border-b border-[var(--line)] px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight">
              Small Fish
            </h1>
            <span className="text-[10px] text-[var(--muted)]">
              Stage 0 · measured data
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
            Find local businesses by what they actually do, and prove every match.
          </p>

          {/* The front door the product document specifies: one box. The
              market list below is the Stage 0 reality — four measured
              markets — and stays as a shortcut rather than a pretence that
              typing anything will find data. */}
          <button
            onClick={() => setSearchOpen(true)}
            className="mt-2.5 flex w-full items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-left text-[12px] text-[var(--muted)] hover:border-[var(--accent)]"
          >
            <span aria-hidden>⌕</span>
            Describe what you&rsquo;re looking for…
          </button>

          <select
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-[12px]"
          >
            {index?.markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.search}
              </option>
            ))}
          </select>

          {/* The second front door. The research persona cannot fill the box
              above — they are still looking for an ICP, not refining one. */}
          <button
            onClick={() => setIcpOpen(true)}
            className="mt-1.5 text-[11px] text-[var(--accent)] underline underline-offset-2"
          >
            Not sure who to target? Start from what you sell →
          </button>
        </header>

        {loading || !market ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
            Loading market…
          </p>
        ) : (
          <>
            {/* Criteria, and how each is checked */}
            <div className="space-y-1.5 border-b border-[var(--line)] px-4 py-3">
              {market.criteria.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCriterionId(c.id)}
                  className={`block w-full rounded-md border px-2.5 py-1.5 text-left ${
                    criterionId === c.id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--line)] hover:bg-[var(--bg)]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium">{c.text}</span>
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--muted)] ring-1 ring-[var(--line)]">
                      {c.type}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-[var(--muted)]">
                    {c.explain}
                  </span>
                </button>
              ))}
            </div>

            {/* The count, and what it would cost */}
            <div className="border-b border-[var(--line)] px-4 py-3">
              <div className="flex items-end justify-between">
                <div>
                  <div className="tabular text-2xl font-semibold leading-none">
                    {compact(matches)}
                    <span className="ml-1.5 text-[12px] font-normal text-[var(--muted)]">
                      match{matches === 1 ? "" : "es"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">
                    of {compact(inRegion.length)} businesses ·{" "}
                    {compact(readCount)} read so far
                    {duplicateRecords > 0 && (
                      <>
                        {" · "}
                        <span
                          title={
                            `Overture lists a row per listing, so one practice can appear ` +
                            `several times. ${duplicateRecords} were folded into the business ` +
                            `they belong to — you are never charged twice for one website.`
                          }
                          className="underline decoration-dotted underline-offset-2"
                        >
                          {compact(duplicateRecords)} duplicate listings folded
                        </span>
                      </>
                    )}
                    {refundedHere > 0 && (
                      <>
                        {" · "}
                        <span className="text-[var(--unsure)]">
                          {refundedHere} refunded
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right text-[11px] text-[var(--muted)]">
                  <div className="tabular">
                    ~{compact(Math.round(areaSqMiles(region!)))} sq mi
                  </div>
                  <div className="tabular">
                    {Math.round(cost.warmShare * 100)}% already read
                  </div>
                </div>
              </div>

              <div
                className={`mt-2.5 rounded-md px-2.5 py-2 text-[11px] leading-snug ${
                  cost.overBudget
                    ? "bg-[var(--unsure-soft)] text-[var(--unsure)]"
                    : "bg-[var(--bg)] text-[var(--muted)]"
                }`}
              >
                <span className="font-medium">
                  {money(cost.coldCost)} to scan this region
                </span>{" "}
                — {compact(cost.unread)} unread at ~
                {money(COST.coldPerBusiness)} each, {compact(cost.alreadyRead)}{" "}
                cached at ~{money(COST.warmPerBusiness)}. Once the market is
                warm: {money(cost.warmCost)}.
                {cost.overBudget && (
                  <>
                    {" "}
                    <strong>
                      That is above the {compact(COST.warnAboveCandidates)}
                      -candidate threshold
                    </strong>{" "}
                    — tighten the region, or unlock progressively with the
                    strongest matches first.
                  </>
                )}
                <span className="mt-1 block opacity-75">
                  Per-business figures are planning estimates until the cost
                  meter runs.
                </span>
              </div>
            </div>

            {/* Verdict filters, doubling as the tally */}
            <div className="flex flex-wrap gap-1.5 border-b border-[var(--line)] px-4 py-2.5">
              {ORDER.filter((k) => (tally[k] ?? 0) > 0).map((k) => (
                <button
                  key={k}
                  onClick={() => toggle(k)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] ${
                    show.has(k)
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--line)] text-[var(--muted)] opacity-60"
                  }`}
                >
                  <VerdictDot kind={k} />
                  {VERDICT_LABEL[k]}
                  <span className="tabular font-medium">
                    {compact(tally[k] ?? 0)}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2">
              <span className="text-[11px] text-[var(--muted)]">
                {compact(exportable)} unlocked ·{" "}
                {compact(visible.length - exportable)} as counts
              </span>
              <button
                onClick={() => {
                  const csv = toCsv(forExport, market.criteria);
                  downloadCsv(`smallfish-${market.id}.csv`, csv);
                }}
                disabled={!exportable}
                // The file carries matched rows only, so the button says how
                // many that is. A button that exports fewer rows than the table
                // shows, without saying so, is how people lose trust in a file
                // they are about to send to a client.
                title={
                  exportable < visible.length
                    ? `${visible.length - exportable} non-matches stay out of the file — ` +
                      `you did not unlock them, so their names are not yours to export. ` +
                      `Their reasons are in the summary above.`
                    : undefined
                }
                className="rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--accent-soft)] disabled:opacity-40"
              >
                Export {compact(exportable)} matched row
                {exportable === 1 ? "" : "s"} with proof
              </button>
            </div>

            {/* S1-26. A search that found almost nothing is where the product
                usually loses someone; the honest move is to say the region is
                thin and offer another way in, not to widen it silently. */}
            {matches === 0 && (
              <div className="border-b border-[var(--line)] bg-[var(--unsure-soft)] px-4 py-2.5 text-[11px] leading-snug text-[var(--unsure)]">
                No matches for this criterion in this region.{" "}
                <button
                  onClick={() => setIcpOpen(true)}
                  className="underline underline-offset-2"
                >
                  Work backwards from what you sell
                </button>{" "}
                to see which measured markets do have matches.
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* The whole set, not a slice: the locked summary has to count
                  every non-match, and slicing here would have silently made it
                  a count of the first 300. Results caps the rows it renders. */}
              <Results
                businesses={visible}
                criteria={market.criteria}
                primaryCriterionId={criterionId}
                reported={reported}
                onReport={report}
              />
            </div>

            <footer className="border-t border-[var(--line)] px-4 py-2.5 text-[10px] leading-snug text-[var(--muted)]">
              Real businesses from Overture Maps; verdicts from technology
              detection and the absence-proof rule. Only{" "}
              <strong>{compact(market.counts.read)}</strong> of{" "}
              {compact(market.counts.candidates)} listings in this market have
              been read, so most show <em>not read yet</em> — that is the
              cold-market state, not a gap in the data. Counts above are
              businesses rather than listings, which is why they are smaller.
              Nothing here is generated: no model has run.
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
