import Link from "next/link";

import { Arrow, Up } from "@/components/app/icons";

/**
 * A search we understood, for a trade and city we cannot serve from a name
 * alone.
 *
 * ## What this screen used to be, and why it changed
 *
 * It led with **"We haven't been through plumbers in Denver yet"** and offered
 * a button to start the read.
 *
 * Both were wrong. How much of the country we have got through is our queue
 * depth, and a customer has no use for it — every request is new to them, and
 * opening with what we have and have not already done reframes their question
 * as our backlog. And the button could not work: `/api/jobs` created the job
 * and never attached any sites to it, because nothing extracts candidates for a
 * cold city yet (P0.2). The progress screen then read 0 of 1,000 for ever.
 * Somebody sat and watched it.
 *
 * So the screen leads with the route that works today — a list they already
 * have, which brings its own candidates — and says plainly that the city route
 * is not ready, once, without an account of our reading history.
 *
 * It does **not** offer to queue anything. An offer that cannot be honoured is
 * worse than no offer, and `/api/jobs` now refuses this case rather than
 * accepting work it will drop.
 */

export default function NotRead({
  what,
  where,
  label,
  examples,
}: {
  what: string;
  where: string;
  /** The place as we resolved it, which can differ from what was typed. */
  label: string | null;
  examples: Array<{ q: string; n: number }>;
}) {
  const placed = !!label;
  const trade = what || "those";

  return (
    <div className="appbody">
      <div className="appmid">
        <div>
          <h1 className="t-h1">
            {placed ? (
              <>
                We can&rsquo;t start {trade} in {label} from a city name yet.
              </>
            ) : (
              <>
                We couldn&rsquo;t place {where ? `“${where}”` : "that"}.
              </>
            )}
          </h1>
          <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "58ch" }}>
            {placed ? (
              <>
                Give us the businesses and we will read every one of their websites and tell
                you which fit — that works for any city, starting now.
              </>
            ) : (
              <>A US city or state works. Try the city on its own.</>
            )}
          </p>
        </div>

        <div className="ptiles">
          <Link className="ptile sug" href="/app/upload">
            <span className="ptile__tag">works today</span>
            <span className="ptile__back" aria-hidden="true" />
            <span className="ptile__front">
              <span className="ptile__ico">
                <Up s={17} />
              </span>
              <span className="ptile__txt">
                <b>Bring your own list</b>
                <em>
                  A CSV with a website column is all it needs. We open each one and tell you
                  which fit, with the sentence off their page that says so.
                </em>
              </span>
            </span>
          </Link>
          <Link className="ptile" href="/templates">
            <span className="ptile__back" aria-hidden="true" />
            <span className="ptile__front">
              <span className="ptile__ico">
                <Arrow s={17} />
              </span>
              <span className="ptile__txt">
                <b>See what we can prove</b>
                <em>The asks the engine can settle today, and the ones it cannot.</em>
              </span>
            </span>
          </Link>
        </div>

        {examples.length > 0 && (
          <div style={{ borderTop: "1px solid #D5D9D2", paddingTop: 18 }}>
            <p className="t-h3" style={{ color: "#5B6470" }}>
              Or start from one of these
            </p>
            <div className="col" style={{ gap: 2, marginTop: 10 }}>
              {examples.slice(0, 4).map((e) => (
                <Link
                  className="arrive"
                  href={`/app?q=${encodeURIComponent(e.q)}`}
                  key={e.q}
                  // Each of these is a force-dynamic route that reads a
                  // multi-megabyte market file. Next prefetches links entering
                  // the viewport, so this would fire four full searches nobody
                  // asked for.
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

        <p className="t-s">Nothing was charged for this.</p>
      </div>
    </div>
  );
}
