import Link from "next/link";

import { Arrow } from "@/components/app/icons";
import type { UnsureGroup } from "@/lib/unsure";

/**
 * Nothing fit — `AppEmpty`, §5.6.
 *
 * *"An empty state that only apologises is a dead end. Every empty state in
 * this product ends in a next action."*
 *
 * ## The widenings are derived, not written
 *
 * The artboard offers "drop the review condition · 52 would fit", which only
 * works because its numbers are made up. A real widening has to be a count we
 * have: the businesses we checked and that did not fit, and the ones we could
 * not tell about. So this screen reports the **account of what happened to the
 * ones we read** — which is a number per outcome — and then the widenings that
 * do not need a count to be honest: a nearby market we have finished, and
 * asking for something else.
 *
 * Offering "47 would fit if you dropped X" would mean re-running the search
 * with each criterion removed. That is a real feature and it is not this one;
 * inventing the number instead is what the artboard's placeholder does.
 */

export default function Nothing({
  what,
  where,
  criterion,
  read,
  didNotFit,
  unsure,
  examples,
}: {
  what: string;
  where: string;
  criterion: string;
  read: number;
  didNotFit: number;
  unsure: UnsureGroup[];
  examples: Array<{ q: string; n: number }>;
}) {
  const unsureTotal = unsure.reduce((a, g) => a + g.count, 0);

  return (
    <div className="appbody">
      <div className="appmid">
        <div>
          <h1 className="t-h1">
            None of the{" "}
            <span className="mono" style={{ fontWeight: 500 }}>
              {read.toLocaleString()}
            </span>{" "}
            we read fit.
          </h1>
          <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "58ch" }}>
            {/* The criterion is quoted, not inlined. `agree` pluralises a verb
                it recognises, and vet Columbus's `independent` is the bare
                predicate "not part of a group" — no verb to agree, so inlining
                it gave "vet clinics in Columbus that not part of a group".
                Quoting the ask back is grammatical for any criterion text,
                including ones nobody has written yet. Same fix as the evidence
                box in `BizRow`. */}
            You asked for {what} in {where}, checked against &ldquo;{criterion}&rdquo;. We opened
            their websites and none of them answered that way.
          </p>
        </div>

        <div className="card" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 2 }}>
          <p className="t-h3" style={{ marginBottom: 10, color: "#5B6470" }}>
            What happened to the {read.toLocaleString()}
          </p>
          {didNotFit > 0 && (
            <div className="arrive">
              <span className="dotv" style={{ background: "#B9BFB6" }} />
              <span className="t-b" style={{ gridColumn: "2/4" }}>
                Checked, and the answer was no
              </span>
              <span className="t-d m" style={{ textAlign: "right" }}>
                {didNotFit}
              </span>
            </div>
          )}
          {unsure.map((g, i) => (
            <div className="arrive" key={g.id} style={i === unsure.length - 1 ? { borderBottom: 0 } : undefined}>
              <span className="dotv" style={{ border: "1.5px dashed #8A929B" }} />
              <span className="t-b" style={{ gridColumn: "2/4" }}>
                {g.headline} — free, never guessed
              </span>
              <span className="t-d m" style={{ textAlign: "right" }}>
                {g.count}
              </span>
            </div>
          ))}
        </div>

        <div className="col" style={{ gap: 12 }}>
          <p className="t-h3">Try one of these</p>
          <div className="nextstep">
            <Link className="btn" href="/app">
              Ask for something else
              <Arrow s={17} />
            </Link>
            <Link className="qbtn" href="/templates">
              See what we can prove
            </Link>
            <Link className="qbtn" href="/app/upload">
              Check a list you already have
            </Link>
          </div>
          <p className="t-s">
            Nothing was charged for this search, because it found nothing.
            {unsureTotal > 0 &&
              ` The ${unsureTotal} we couldn't tell about were free too — they always are.`}
          </p>
        </div>

        {examples.length > 0 && (
          <div style={{ borderTop: "1px solid #D5D9D2", paddingTop: 18 }}>
            <p className="t-h3" style={{ color: "#5B6470" }}>
              Searches that return something today
            </p>
            <div className="col" style={{ gap: 2, marginTop: 10 }}>
              {examples.slice(0, 4).map((e) => (
                <Link
                  className="arrive"
                  href={`/app?q=${encodeURIComponent(e.q)}`}
                  key={e.q}
                  // `prefetch={false}`: each of these is a force-dynamic route
                  // that reads a multi-megabyte market file and runs
                  // `buildLeads` over it. Next prefetches links as they enter
                  // the viewport, so landing here fired three full searches
                  // nobody had asked for — three serverless invocations and
                  // seconds of CPU per visit, and `networkidle` never fired
                  // because two were always still running.
                  prefetch={false}
                >
                  <span className="dotv" style={{ background: "#C8F03C" }} />
                  <span className="t-b" style={{ gridColumn: "2/4" }}>
                    {e.q}
                  </span>
                  <span className="t-d m" style={{ color: "#4A6508", textAlign: "right" }}>
                    {e.n} fit
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
