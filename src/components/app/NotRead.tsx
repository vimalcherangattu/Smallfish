import Link from "next/link";

import { Arrow } from "@/components/app/icons";

/**
 * A place we could not place.
 *
 * ## This screen used to be two screens, and the other one was a dead end
 *
 * It also covered "a city we understood but cannot serve from a name alone" —
 * *"We can't start plumbers in Denver from a city name yet"* — because nothing
 * supplied candidates for a city we had not extracted by hand. That branch is
 * gone: `src/lib/supply.ts` counts any US city from the listings, so a place we
 * recognise goes to `Discover` and gets an answer. What is left here is the one
 * honest case — we do not know where they mean.
 *
 * ## And usually we do know
 *
 * The owner typed **"pheonix"**. Two keystrokes from the fourth-largest city in
 * the country, and the screen said "We couldn't place that" and stopped.
 * `nearestCity` finds it; this offers it as a question and never substitutes
 * it, because reading Phoenix for somebody who typed Pheonix is the same class
 * of mistake as answering Dallas with Phoenix data.
 *
 * ## No list of our previous runs
 *
 * This screen used to end with four searches we had already run. The owner,
 * twice: *"the runs we already made has nothing to do with customers"*. They
 * are our queue depth, and a person who has just mistyped a city name has no
 * use for them.
 */

export default function NotRead({
  what,
  where,
  didYouMean,
}: {
  what: string;
  where: string;
  /** Kept so the prop shape is stable for callers; this screen no longer has a
   *  branch for a place we did resolve. */
  label?: string | null;
  didYouMean: { label: string; query: string } | null;
}) {
  const trade = what || "businesses";

  return (
    <div className="appbody">
      <div className="appmid">
        <div>
          <h1 className="t-h1">
            We couldn&rsquo;t place {where ? `“${where}”` : "that"}.
          </h1>
          <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "58ch" }}>
            {didYouMean ? (
              <>
                Any US city or state works, we think you meant a real one and typed it
                slightly differently.
              </>
            ) : (
              <>Any US city or state works. Try the city on its own, without the state.</>
            )}
          </p>
        </div>

        {didYouMean && (
          <div className="col" style={{ gap: 12, alignItems: "flex-start" }}>
            <Link className="btn big" href={`/app?q=${encodeURIComponent(didYouMean.query)}`}>
              {trade} in {didYouMean.label}
              <Arrow s={17} />
            </Link>
            <p className="t-s">
              We will not assume it. Press it and we will count that city.
            </p>
          </div>
        )}

        <div className="ptiles">
          <Link className={`ptile${didYouMean ? "" : " sug"}`} href="/app">
            {!didYouMean && <span className="ptile__tag">start here</span>}
            <span className="ptile__back" aria-hidden="true" />
            <span className="ptile__front">
              <span className="ptile__ico">
                <Arrow s={17} />
              </span>
              <span className="ptile__txt">
                <b>Type it again</b>
                <em>A city, a state, or the whole US. Spelling is the only thing we need.</em>
              </span>
            </span>
          </Link>
          {/* "Bring your own list" came out on 2026-10-15. It was the biggest
              of the three CSV doors — a full tile, with copy good enough that
              it read as a second product rather than a fallback, which is
              exactly the problem. The owner's mandate is one thing done well,
              and a mistyped city is a spelling problem, not a reason to be
              sold a different way of working. `/app/upload` still works. */}
        </div>

        <p className="t-s">Nothing was charged for this.</p>
      </div>
    </div>
  );
}
