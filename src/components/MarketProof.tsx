"use client";

import { useState } from "react";

/**
 * Pick a market, see a real row from it (S2-11).
 *
 * ## Every word in here came out of `public/data`
 *
 * The composed design fills this section with four businesses and four quotes.
 * Three of the four businesses do not exist, and the quotes are written to
 * sound like what a clinic's contact page might say. On any other marketing
 * site that is a mockup. On this one it is the product's central claim, staged:
 * the whole argument is that a row carries the sentence that proves it, and
 * proving it with an invented sentence is the one thing that cannot be
 * forgiven.
 *
 * So the props are assembled on the server from the measured market files and
 * this component only renders them. A business here is a business that was
 * read, and the line under its name is the line the engine recorded.
 *
 * ## Why the evidence is not in quotation marks
 *
 * The design wraps it in quotes, as a sentence lifted from the business's own
 * page. For an **absence** criterion there is no such sentence — the evidence
 * that a booking route is missing is our own record of having looked, and
 * setting that in quote marks would attribute our words to them. It keeps the
 * marker and the serif face, because it is still the evidence; it loses the
 * quotes, and the label above it says whose words they are.
 */

export interface MarketCard {
  key: string;
  niche: string;
  metro: string;
  /** Businesses judged either way in this market. */
  judged: number;
  /** The criterion, in the words the engine holds. */
  question: string;
  /** How it is checked. */
  explain: string;
  match: {
    name: string;
    evidence: string;
    source: string;
    pages: number;
  };
  /** A business that did not match, and the recorded reason. */
  miss: {
    name: string;
    verdict: string;
    /** The engine's own words, shown as the record. */
    reason: string;
    /** The same fact in plain words — ours, and set in our face so that it
     *  cannot be mistaken for something the business or the engine said. */
    plain: string;
    source: string;
    pages: number;
  };
}

export default function MarketProof({ markets }: { markets: MarketCard[] }) {
  const [active, setActive] = useState(markets[0]?.key ?? "");
  const m = markets.find((x) => x.key === active) ?? markets[0];
  if (!m) return null;

  return (
    <>
      <div
        className="wrap flex flex-wrap gap-3"
        style={{ marginTop: 40 }}
        role="group"
        aria-label="Markets we have read"
      >
        {markets.map((x) => (
          <button
            key={x.key}
            type="button"
            className="pick"
            aria-pressed={x.key === active}
            onClick={() => setActive(x.key)}
          >
            <span className="pk-n">{x.niche}</span>
            <span className="pk-c">
              {x.metro} · {x.judged} judged
            </span>
          </button>
        ))}
      </div>

      <p
        className="wrap dsp"
        style={{ marginTop: 40, fontSize: 32, lineHeight: 1.25, maxWidth: 1060 }}
      >
        Asked for:{" "}
        <span className="hilite" style={{ transform: "rotate(-.5deg)" }}>
          {m.question}
        </span>
      </p>

      <div className="wrap g12" style={{ marginTop: 48, alignItems: "start" }}>
        <div style={{ gridColumn: "1 / span 7", position: "relative" }}>
          {/* `key` on the wrapper restarts the entrance animation when the
              market changes — without it React reuses the node and the card
              swaps its contents with no sign that anything happened. */}
          <div key={`${m.key}-match`} className="panel tilt-l lift rise">
            <div className="flex items-center justify-between">
              <span className="chip c-fit">
                <span className="dot" />
                Match
              </span>
              <span className="lab" style={{ color: "var(--ink-3)" }}>
                {m.match.pages} pages read
              </span>
            </div>
            <span className="dsp" style={{ fontSize: 30 }}>
              {m.match.name}
            </span>
            <p className="lab" style={{ color: "var(--ink-3)" }}>
              What we found
            </p>
            <p className="cite">
              <span className="mark">{m.match.evidence}</span>
            </p>
            <span className="src">{m.match.source}</span>
            <p className="small" style={{ color: "var(--ink-2)" }}>
              {m.explain}
            </p>
          </div>

          <div
            key={`${m.key}-miss`}
            className="panel dark tilt-r lift rise"
            style={{ margin: "22px 0 0 132px", width: "88%" }}
          >
            <div className="flex items-center justify-between">
              <span className="chip c-pend">
                <span className="dot" />
                {m.miss.verdict}
              </span>
              <span className="lab" style={{ color: "#8A929B" }}>
                {m.miss.pages} pages read
              </span>
            </div>
            <span className="dsp" style={{ fontSize: 24, color: "#EEF0EC" }}>
              {m.miss.name}
            </span>
            {/* Our sentence, in our face, then the line the engine actually
                recorded, in mono. `positive signal found, so the absence claim
                fails` is exactly right and completely opaque to somebody who
                has never read the codebase; dropping it and keeping only the
                gloss would hide the record, and keeping only the record makes
                the page unreadable. Both, in the voices that say which is
                which. */}
            <p className="cite" style={{ color: "#EEF0EC" }}>
              {m.miss.plain}
            </p>
            <span className="src" style={{ color: "#8A929B" }}>
              recorded as: {m.miss.reason}
            </span>
            <span className="src" style={{ color: "#8A929B" }}>
              {m.miss.source} · never billed
            </span>
          </div>
        </div>

        <div style={{ gridColumn: "9 / span 4" }}>
          <Proof n="41" top>
            matches called back by hand, on dental in Phoenix
          </Proof>
          <Proof n="0" colour="#1F6B45">
            false positives found among them
          </Proof>
          <Proof n="11 of 11">
            model verdicts whose quote was found verbatim on the page it came from
          </Proof>
          <p className="small" style={{ color: "var(--ink-2)", marginTop: 20 }}>
            Precision 100%, lower bound 91.4% — measured on one niche of three.
            The benchmark page says so too.
          </p>
          <a
            className="lab"
            href="/benchmark"
            style={{
              display: "inline-flex",
              gap: 8,
              marginTop: 18,
              color: "var(--lure-text)",
              textDecoration: "none",
              borderBottom: "1px solid var(--lure)",
              paddingBottom: 4,
            }}
          >
            How we check ourselves →
          </a>
        </div>
      </div>
    </>
  );
}

function Proof({
  n,
  children,
  colour,
  top,
}: {
  n: string;
  children: React.ReactNode;
  colour?: string;
  top?: boolean;
}) {
  return (
    <div className="proof" style={top ? { borderTop: "2px solid var(--ink)" } : undefined}>
      <b style={colour ? { color: colour } : undefined}>{n}</b>
      <span className="small" style={{ color: "var(--ink-2)" }}>
        {children}
      </span>
    </div>
  );
}
