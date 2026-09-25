"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MarketIndex } from "@/lib/types";

/**
 * The hero search: a stranger types their own niche and city, and gets a real
 * count (S1-10 over HTTP, on the home page).
 *
 * ## What this can and cannot do, said here rather than discovered
 *
 * The brief for this section asks for a cold custom read — type any niche in
 * any city, watch a counter climb, see matches appear in about a minute. That
 * needs three things this build does not have: a polite fetcher as a pipeline
 * component (S0-08), profile extraction (S0-11) and criteria judgment (S0-12),
 * the last of which needs an Anthropic key that is not present in any
 * environment. Until those exist there is no honest way to read a market nobody
 * has read.
 *
 * So the input is real and the count behind it is real — it is the same
 * `freeCount` the product runs, through `/api/count`, over measured data — and
 * a market we have not read says exactly that instead of spinning. A fake
 * progress bar over a market nobody has read would be the one thing this
 * product cannot ship: a number with nothing behind it, on the page that
 * argues for evidence.
 *
 * The four chips are instant for the same reason: they resolve to markets whose
 * verdicts are already on disk.
 *
 * ## Only settled criteria are offered
 *
 * Four markets are read; **three of them have a criterion that was actually
 * settled**. `hvac-tampa`'s "does commercial work" and `vet-columbus`'s
 * "independent" are `needs_model` and `couldnt_tell` across the board — nothing
 * judged them. Offering those as examples would put a search in front of a
 * stranger that returns nothing and looks like a broken product, when what it
 * actually is is an unbuilt one.
 */

type Row = {
  id: string;
  niche: string;
  metro: string;
  criterionId: string;
  criterionText: string;
  matches: number;
};

type CountResult = {
  market: string;
  criterion: string;
  matches: { low: number; high: number };
  sample: { read: number; matched: number; couldNotSettle: number; frameLimited: boolean };
  band: { credits: number; label: string };
  proofs: { name: string; line: string }[];
};

/**
 * What to call a niche on screen.
 *
 * The measured data carries `med_spa`, `hvac`, `dental`, `veterinary` — slugs,
 * because they are keys into the probe's output and renaming them would rename
 * a measurement. Slugs are not copy, though: "184–1,000 med_spa in Dallas" is
 * on a page whose whole argument is that it speaks the buyer's language.
 *
 * So this maps the four read markets and falls back to the slug with its
 * underscores opened out. It is presentation and nothing else — no count, no
 * verdict and no price is derived from it, so a missing entry costs a plural
 * rather than a wrong number.
 */
const NICHE_LABEL: Record<string, string> = {
  med_spa: "med spas",
  dental: "dental practices",
  hvac: "HVAC companies",
  veterinary: "vet clinics",
};
const label = (niche: string) =>
  NICHE_LABEL[niche] ?? niche.replace(/_/g, " ");

const PLACEHOLDERS = [
  { sell: "med spas", city: "Dallas, TX", that: "don't take bookings online" },
  { sell: "HVAC companies", city: "Tampa, FL", that: "have no online quote form" },
  { sell: "dental practices", city: "Phoenix, AZ", that: "don't take bookings online" },
];

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Does what they typed name a market we have actually read?
 *
 *  Deliberately forgiving on the niche and the city and strict about nothing:
 *  a near miss should open the market we have, not refuse on spelling. What it
 *  will not do is stretch — "roofers in Tampa" is not the HVAC read, and
 *  pretending otherwise would hand somebody a list of the wrong businesses. */
function resolve(rows: Row[], sell: string, city: string): Row | null {
  const s = norm(sell);
  const c = norm(city);
  if (!s || !c) return null;

  const words = (t: string) => new Set(norm(t).split(" ").filter((w) => w.length > 2));
  const overlap = (a: string, b: string) => {
    const A = words(a);
    const B = words(b);
    let n = 0;
    for (const w of A) if (B.has(w)) n += 1;
    return n;
  };

  for (const r of rows) {
    const cityHit = overlap(c, r.metro) > 0 || norm(r.metro).includes(c) || c.includes(norm(r.metro));
    // Both the slug and the label the chips fill in, because a visitor who
    // clicked "med spas" and then edited the city must still resolve.
    const niches = [r.niche, label(r.niche)];
    const nicheHit = niches.some(
      (n) => overlap(s, n) > 0 || norm(n).includes(s) || s.includes(norm(n)),
    );
    if (cityHit && nicheHit) return r;
  }
  return null;
}

export default function HeroSearch() {
  const [rows, setRows] = useState<Row[]>([]);
  const [sell, setSell] = useState("");
  const [city, setCity] = useState("");
  const [that, setThat] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done" | "unread">("idle");
  const [result, setResult] = useState<{ row: Row; count: CountResult } | null>(null);
  const [tried, setTried] = useState<{ sell: string; city: string } | null>(null);
  const [tick, setTick] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  // The index carries every market's criteria and tallies in about 4 KB, which
  // is why the chips can be built from measured data rather than hard-coded
  // beside it and left to drift.
  useEffect(() => {
    let live = true;
    fetch("/data/index.json")
      .then((r) => r.json() as Promise<MarketIndex>)
      .then((idx) => {
        if (!live) return;
        const out: Row[] = [];
        for (const m of idx.markets) {
          for (const c of m.criteria) {
            const matches = m.tallies?.[c.id]?.match ?? 0;
            // A criterion nothing settled is not an example, it is a gap.
            if (matches > 0) {
              out.push({
                id: m.id,
                niche: m.niche,
                metro: m.metro,
                criterionId: c.id,
                criterionText: c.text,
                matches,
              });
            }
          }
        }
        setRows(out);
      })
      .catch(() => setRows([]));
    return () => {
      live = false;
    };
  }, []);

  // Cycling placeholders, paused the moment anybody types — a field whose
  // ghost text keeps moving while you are reading it is a nuisance.
  const typing = !!(sell || city || that);
  useEffect(() => {
    if (typing) return;
    const t = setInterval(() => setTick((n) => n + 1), 3800);
    return () => clearInterval(t);
  }, [typing]);
  const ph = PLACEHOLDERS[tick % PLACEHOLDERS.length];

  const chips = useMemo(() => rows.slice(0, 4), [rows]);

  async function run(row: Row | null, typedSell: string, typedCity: string) {
    setTried({ sell: typedSell, city: typedCity });
    if (!row) {
      setResult(null);
      setState("unread");
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
      return;
    }
    setState("running");
    try {
      const res = await fetch(
        `/api/count?market=${encodeURIComponent(row.id)}&criterion=${encodeURIComponent(row.criterionId)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      const count = (await res.json()) as CountResult;
      setResult({ row, count });
      setState("done");
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch {
      setResult(null);
      setState("unread");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(resolve(rows, sell, city), sell, city);
  }

  return (
    <div>
      <form onSubmit={submit} className="hs-row mt-10">
        <label className="hs-field">
          <span className="lab" style={{ color: "#5B6470" }}>I sell to</span>
          <input
            value={sell}
            onChange={(e) => setSell(e.target.value)}
            placeholder={ph.sell}
            aria-label="The kind of business you sell to"
            list="hs-niches"
          />
        </label>
        <label className="hs-field">
          <span className="lab" style={{ color: "#5B6470" }}>in</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={ph.city}
            aria-label="City"
            list="hs-cities"
          />
        </label>
        <label className="hs-field">
          <span className="lab" style={{ color: "#5B6470" }}>that</span>
          <input
            value={that}
            onChange={(e) => setThat(e.target.value)}
            placeholder={ph.that}
            aria-label="What decides whether a business fits"
            list="hs-criteria"
          />
        </label>
        <button type="submit" className="hs-go" disabled={state === "running"}>
          {state === "running" ? "Reading…" : "See how many →"}
        </button>

        <datalist id="hs-niches">
          {[...new Set(rows.map((r) => label(r.niche)))].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="hs-cities">
          {[...new Set(rows.map((r) => r.metro))].map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <datalist id="hs-criteria">
          {[...new Set(rows.map((r) => r.criterionText))].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </form>

      <p className="mono mt-4 text-[13px]" style={{ color: "#5B6470" }}>
        Free · no sign-up · no card · the count comes from a real read
      </p>

      {chips.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="lab" style={{ color: "#5B6470" }}>Or try one:</span>
          {chips.map((r) => (
            <button
              key={`${r.id}:${r.criterionId}`}
              type="button"
              className="hs-chip"
              onClick={() => {
                setSell(label(r.niche));
                setCity(r.metro);
                setThat(r.criterionText);
                run(r, r.niche, r.metro);
              }}
            >
              {label(r.niche)} in {r.metro} · {r.criterionText}
            </button>
          ))}
        </div>
      )}

      <div ref={resultRef} aria-live="polite">
        {state === "done" && result && <Result {...result} />}
        {state === "unread" && <NotRead sell={tried?.sell ?? ""} city={tried?.city ?? ""} rows={rows} />}
      </div>
    </div>
  );
}

/**
 * The count, win first.
 *
 * The number in the headline is the number of matches. What could not be read
 * is on the line below it, with the billing consequence attached — not because
 * it matters less, but because a stranger who reads "73 we couldn't judge"
 * before they read "42 you can call" has been told what we failed at before
 * they know what they get.
 *
 * It is a **range**, and that is `count.ts`'s decision, not a hedge: a sample
 * of 25 cannot carry a point estimate, and printing one would be the kind of
 * false precision this product spends the rest of the page arguing against.
 */
function Result({ row, count }: { row: Row; count: CountResult }) {
  const { sample } = count;
  return (
    <div className="mt-10 rounded-2xl border border-[#26303C] bg-[#131C29] p-6 sm:p-8">
      <span className="lab" style={{ color: "#5B6470" }}>
        A real read · {label(row.niche)} · {row.metro}
      </span>
      {/* `mt-7`, not `mt-4`. The `.lure` highlight carries padding and a
          box-shadow that bleed above its line box, so at `mt-4` the lime block
          printed over the eyebrow above it. */}
      <p className="dsp mt-9" style={{ fontSize: "clamp(28px,4vw,46px)" }}>
        About{" "}
        <span className="lure">
          {count.matches.low.toLocaleString()}–{count.matches.high.toLocaleString()}
        </span>{" "}
        {label(row.niche)} in {row.metro}.
      </p>
      {/* The criterion is a tag rather than the tail of the sentence. The
          measured texts are third-person singular — "has no online booking" —
          so "med spas in Dallas has no online booking" is what a sentence
          built from them reads like. Conjugating them here would be a second
          opinion about what the engine checked, for grammar. */}
      <p className="cite mt-6 text-[15px]" style={{ color: "#EEF0EC" }}>
        Looking for: <span className="mark">{row.criterionText}</span>
      </p>
      <p className="mono mt-4 text-[13px]" style={{ color: "#B9BFB6" }}>
        From {sample.read} read: {sample.matched} matched, {sample.couldNotSettle} we
        couldn&rsquo;t read well enough to say — and you&rsquo;re not billed for those.
        {" "}Each match here costs {count.band.credits} credit
        {count.band.credits === 1 ? "" : "s"} ({count.band.label.toLowerCase()}), shown
        before anything is spent.
      </p>

      {count.proofs.length > 0 && (
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {count.proofs.map((p) => (
            <div key={p.name} className="rounded-xl border border-[#26303C] bg-[#0E1520] p-5">
              <p className="dsp" style={{ fontSize: 20 }}>{p.name}</p>
              <p className="cite mt-3 text-[14px]" style={{ color: "#EEF0EC" }}>
                <span className="mark">{p.line}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Link
          href={`/app?market=${row.id}&criterion=${row.criterionId}`}
          className="inline-flex h-12 items-center rounded-full bg-[#C8F03C] px-6 text-[14px] font-semibold text-[#0E1520]"
        >
          See all of them, with the proof →
        </Link>
        <span className="mono text-[12px]" style={{ color: "#5B6470" }}>
          {sample.frameLimited
            ? "A wide range because only part of this market has been read — it narrows as more of it is."
            : "A range, not a point: 25 reads cannot carry a single number honestly."}
        </span>
      </div>
    </div>
  );
}

/** A market nobody has read, said plainly.
 *
 *  This is the state the brief did not plan for, because the brief assumed a
 *  cold custom read works. It does not yet. Saying "we have not read that"
 *  costs a visitor five seconds; a spinner that resolves into nothing costs
 *  them their belief in everything else on the page. */
function NotRead({ sell, city, rows }: { sell: string; city: string; rows: Row[] }) {
  const named = sell && city ? `${sell} in ${city}` : "that market";
  return (
    <div className="mt-10 rounded-2xl border border-[#26303C] bg-[#131C29] p-6 sm:p-8">
      <span className="lab" style={{ color: "#5B6470" }}>Not read yet</span>
      <p className="dsp mt-4 max-w-[22ch]" style={{ fontSize: "clamp(26px,3.4vw,40px)" }}>
        We haven&rsquo;t read {named}.
      </p>
      <p className="lede mt-5 max-w-[52ch]" style={{ color: "#B9BFB6" }}>
        Reading a market cold — opening every business&rsquo;s own site and
        judging it against what you asked for — is the part we are still
        building. We would rather say that than show you a number with nothing
        behind it. These are read in full today, and they are the same engine
        yours will run on:
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {rows.map((r) => (
          <Link
            key={`${r.id}:${r.criterionId}`}
            href={`/app?market=${r.id}&criterion=${r.criterionId}`}
            className="hs-chip"
          >
            {label(r.niche)} in {r.metro} · {r.criterionText}
          </Link>
        ))}
      </div>
    </div>
  );
}
