"use client";

import { useMemo, useState } from "react";
import {
  NAMED_OFFERS,
  candidatesFor,
  inferFromOffer,
  type Candidate,
} from "@/lib/icp";
import { compact } from "@/lib/cost";
import type { MarketIndex } from "@/lib/types";

/** The second front door: start from what you sell, not from who you target.
 *
 *  `docs/icp-discovery.md`: the product document assumes a user who can already
 *  name their vertical, geography and gap; the research describes a buyer who
 *  cannot — "scrapes 2,000 clinics, opens websites one by one, gives up after
 *  40". This is that buyer's entry point.
 *
 *  Three things this screen refuses to do, all of them tempting:
 *  it does not hide the criteria it cannot prove, it does not widen the region
 *  until the count looks respectable, and it does not present a floor as a
 *  total. The counts are the argument, so they have to be real. */
export default function IcpBuilder({
  index,
  onPick,
  onClose,
}: {
  index: MarketIndex | null;
  onPick: (c: Candidate) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");

  const inference = useMemo(() => inferFromOffer(text), [text]);

  const [siteUrl, setSiteUrl] = useState("");
  const [reading, setReading] = useState(false);
  const [siteNote, setSiteNote] = useState<string | null>(null);
  /** Shown because the product's rule is that a claim carries the sentence it
   *  came from. An extracted offer is a claim about the customer's own
   *  business, and they are the one person who can tell instantly whether we
   *  read it right. */
  const [quotes, setQuotes] = useState<Array<{ field: string; quote: string }>>([]);

  async function readMySite() {
    setReading(true);
    setSiteNote(null);
    setQuotes([]);
    try {
      const res = await fetch("/api/read-seller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: siteUrl }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSiteNote(data.reason);
        return;
      }
      setText(data.description);
      const p = data.profile;
      setQuotes(
        (["sells", "problem", "serves", "geography"] as const)
          .filter((f) => p[f])
          .map((f) => ({ field: f, quote: p[f].quote })),
      );
      const missing = (["sells", "problem", "serves", "geography"] as const).filter(
        (f) => !p[f],
      );
      setSiteNote(
        `Read ${p.pagesRead.length} page${p.pagesRead.length === 1 ? "" : "s"}.` +
          (missing.length
            ? ` The site does not say: ${missing.join(", ")}. That is what it says, not what we failed to find — add it above if it matters.`
            : "") +
          (p.dropped.length
            ? ` ${p.dropped.length} claim${p.dropped.length === 1 ? " was" : "s were"} dropped for having no supporting sentence on the page.`
            : ""),
      );
    } catch {
      setSiteNote("That did not reach us. Type what you sell instead.");
    } finally {
      setReading(false);
    }
  }
  const candidates = useMemo(
    () => candidatesFor(inference, index),
    [inference, index],
  );
  const asked = text.trim().length > 0;

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-[var(--panel)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold">Start from what you sell</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
            Describe your offer. We work out what has to be observably true on a
            business&rsquo;s website for it to be needed there, then count them.
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded border border-[var(--line)] px-2 py-1 text-[11px] hover:bg-[var(--accent-soft)]"
        >
          Close
        </button>
      </header>

      {/* 1 — the offer */}
      <div className="border-b border-[var(--line)] px-4 py-3">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          1 · What do you sell?
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. We answer calls 24/7 so clinics stop losing after-hours bookings."
          className="mt-1.5 w-full resize-none rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-[12px] leading-snug"
        />
        {/* S1-22: read it from their own site instead of asking them to
            describe it. The whole reason this flow exists is a buyer who
            cannot name their vertical and gap — asking them to type a precise
            description of their own offer asks for the thing they came here
            unable to do. */}
        <div className="mt-2 flex gap-1.5">
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="or paste your website and we will read it"
            className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--bg)] px-2 py-1.5 text-[11px]"
          />
          <button
            onClick={readMySite}
            disabled={reading || siteUrl.trim().length < 4}
            className="shrink-0 rounded-md border border-[var(--line)] px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-40"
          >
            {reading ? "Reading…" : "Read it"}
          </button>
        </div>
        {siteNote && (
          <p className="mt-1.5 text-[10px] leading-snug text-[var(--muted)]">{siteNote}</p>
        )}
        {quotes.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {quotes.map((q) => (
              <li key={q.field} className="text-[10px] leading-snug text-[var(--muted)]">
                <span className="font-semibold">{q.field}</span> — &ldquo;{q.quote}&rdquo;
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {NAMED_OFFERS.map((o) => (
            <button
              key={o.id}
              onClick={() => setText(o.describes)}
              className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--accent-soft)]"
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {asked && (
        <>
          {/* 2 — the reasoning, shown rather than assumed */}
          <div className="space-y-2 border-b border-[var(--line)] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              2 · What has to be true on their site
            </div>

            {inference.nothingObservable && (
              <p className="rounded-md bg-[var(--unsure-soft)] px-2.5 py-2 text-[11px] leading-snug text-[var(--unsure)]">
                Nothing in that description maps to something a website can
                show. That is a real answer, not a failure to parse: an offer
                whose need leaves no trace on a site cannot be targeted by
                reading sites. Try naming the thing a prospect&rsquo;s site
                would be missing &mdash; booking, a quote route, chat.
              </p>
            )}

            {inference.propose.map((p) => (
              <div
                key={p.signal.id}
                className="rounded-md border border-[var(--line)] px-2.5 py-2 text-[11px] leading-snug"
              >
                <div className="font-medium">{p.signal.question}</div>
                <div className="mt-0.5 text-[var(--muted)]">
                  → we look for a business that{" "}
                  <strong className="text-[var(--ink)]">{p.criterionText}</strong>.{" "}
                  {p.signal.how}
                </div>
              </div>
            ))}

            {inference.refused.map((r) => (
              <div
                key={r.signal.id}
                className="rounded-md border border-dashed border-[var(--line)] px-2.5 py-2 text-[11px] leading-snug text-[var(--muted)]"
              >
                <div className="font-medium text-[var(--ink)]">
                  Not offered: {r.signal.absenceText}
                </div>
                <div className="mt-0.5">
                  Your offer implies it, but we cannot prove it today, so we
                  will not propose it.
                </div>
                <div className="mt-0.5">
                  <span className="font-medium">What it would take:</span>{" "}
                  {r.wouldTake}
                </div>
              </div>
            ))}
          </div>

          {/* 3 — the counts, which are the whole argument */}
          <div className="px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              3 · How many of each we have measured
            </div>

            {!candidates.length ? (
              <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
                {inference.propose.length
                  ? "None of the four measured markets carries that criterion yet. Stage 0 measured med spas, dental, HVAC and veterinary; the rest of the country is unmeasured, not empty."
                  : "Nothing to count until there is a provable criterion above."}
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {candidates.map((c) => (
                  <li key={`${c.marketId}:${c.criterionId}`}>
                    <button
                      onClick={() => onPick(c)}
                      className="w-full rounded-md border border-[var(--line)] px-2.5 py-2 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium capitalize">
                          {c.niche.replace(/_/g, " ")} · {c.metro}
                        </span>
                        <span className="tabular shrink-0 text-[13px] font-semibold">
                          {compact(c.matches)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] leading-snug text-[var(--muted)]">
                        {c.why}
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--muted)] opacity-80">
                        {compact(c.matches)} confirmed from the{" "}
                        {compact(c.read)} sites read so far, out of{" "}
                        {compact(c.candidates)} candidates. A floor, not a
                        total &mdash; the unread rest is unknown, not absent.
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {candidates.length > 0 && (
              <p className="mt-2.5 text-[10px] leading-snug text-[var(--muted)]">
                Pick one and it becomes an ordinary search &mdash; same map,
                same criteria, same proof. Nothing downstream knows this flow
                exists.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
