"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import IcpBuilder from "@/components/IcpBuilder";
import Results, { VerdictDot } from "@/components/Results";
import SearchConfirm from "@/components/SearchConfirm";
import type { Candidate } from "@/lib/icp";
import { bboxOf, contains, areaSqMiles, type Region } from "@/lib/geo";
import { COST, compact, estimateCost, money } from "@/lib/cost";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`data/${marketId}.json`)
      .then((r) => r.json())
      .then((m: Market) => {
        if (cancelled) return;
        setMarket(m);
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

  const inRegion = useMemo(() => {
    if (!market || !region) return [];
    const box = bboxOf(region);
    return market.businesses.filter((b) =>
      contains(region, { lon: b.lon, lat: b.lat }, box),
    );
  }, [market, region]);

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

  function toggle(kind: VerdictKind) {
    setShow((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const matches = tally.match ?? 0;

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
                    of {compact(inRegion.length)} candidates ·{" "}
                    {compact(readCount)} read so far
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
                {compact(visible.length)} row{visible.length === 1 ? "" : "s"}{" "}
                shown
              </span>
              <button
                onClick={() => {
                  const csv = toCsv(visible, market.criteria);
                  downloadCsv(`smallfish-${market.id}.csv`, csv);
                }}
                disabled={!visible.length}
                className="rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] font-medium hover:bg-[var(--accent-soft)] disabled:opacity-40"
              >
                Export CSV with proof
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
              <Results
                businesses={visible.slice(0, 300)}
                criteria={market.criteria}
                primaryCriterionId={criterionId}
              />
              {visible.length > 300 && (
                <p className="px-4 py-3 text-center text-[11px] text-[var(--muted)]">
                  Showing the first 300 of {compact(visible.length)}.
                </p>
              )}
            </div>

            <footer className="border-t border-[var(--line)] px-4 py-2.5 text-[10px] leading-snug text-[var(--muted)]">
              Real businesses from Overture Maps; verdicts from technology
              detection and the absence-proof rule. Only{" "}
              <strong>{compact(market.counts.read)}</strong> of{" "}
              {compact(market.counts.candidates)} in this market have been read,
              so most show <em>not read yet</em> — that is the cold-market state,
              not a gap in the data. Nothing here is generated: no model has run.
            </footer>
          </>
        )}
      </section>
    </main>
  );
}
