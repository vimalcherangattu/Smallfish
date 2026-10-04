import Link from "next/link";

import QueueRead from "@/components/QueueRead";
import { Arrow, Clock, Up } from "@/components/app/icons";

/**
 * A search we understood, in a place nobody has opened yet — `AppProgress` and
 * `AppEmpty` share this shape (§5.5, §5.6).
 *
 * ## Why this is not an error and is not styled as one
 *
 * §7: *"a site that times out, blocks us, or has no content is a per-business
 * outcome… It is not a toast and not a retry dialog."* The same holds a level
 * up: a city we have not read is work not done, not a failure. The screen says
 * what we have, what it would take, and the one route that works today.
 *
 * ## The one number on it is measured
 *
 * `sites` comes from `readsFor(region)` — the same region maths `/api/queue`
 * uses to size the job — so the wait quoted here is the wait the queued row
 * records. A different number in the two places is how a product starts lying
 * about its own backlog.
 *
 * §5.5: *"Do not show a fake percentage."* There is no bar here, because
 * nothing has started. The bar belongs on a job that is running, and this one
 * has not been asked for yet.
 */

export default function NotRead({
  what,
  where,
  label,
  sites,
  query,
  examples,
  note,
}: {
  what: string;
  where: string;
  /** The place as we resolved it, which can differ from what was typed. */
  label: string | null;
  /**
   * The **cap** on this read — how many sites we would open, not how many
   * exist. `readsFor` sums `perCity`, which is `CITY_CAP` for a city search.
   *
   * This said *"1,000 businesses there have a website"*, which is the project's
   * named failure mode wearing a different coat: the results screen once said
   * "we checked 2,800" about a number that was how many listings had a site at
   * all. A cap is a promise about our work, never a measurement of theirs.
   */
  sites: number | null;
  /** `resolveRegion`'s own sentence about the region, when it has one — an
   *  ambiguous city name, or a region bigger than one read can cover. */
  note: string | null;
  query: string;
  examples: Array<{ q: string; n: number }>;
}) {
  const placed = !!label;

  return (
    <div className="appbody">
      <div className="appmid">
        <div>
          <h1 className="t-h1">
            We haven&rsquo;t been through {what || "those"}
            {label ? ` in ${label}` : where ? ` in ${where}` : ""} yet.
          </h1>
          <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "58ch" }}>
            {placed ? (
              <>
                Nothing about your search is unusual — these are just the places we have
                finished reading. We can start on it now.
              </>
            ) : (
              <>
                We couldn&rsquo;t place <b style={{ color: "#0E1520" }}>{where || "that"}</b>. A
                US city or state works; try the city on its own.
              </>
            )}
          </p>
        </div>

        {placed && sites !== null && (
          <div className="card" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="between" style={{ gap: 16, flexWrap: "wrap" }}>
              <div>
                <p className="t-h2">What reading it involves</p>
                <p className="t-s" style={{ marginTop: 7, maxWidth: "60ch" }}>
                  We would open up to{" "}
                  <b className="mono" style={{ color: "#0E1520" }}>
                    {sites.toLocaleString()}
                  </b>{" "}
                  of their websites, politely and one at a time, and read what each one says.
                  You pay for the ones that fit and nothing else.
                </p>
                {note && (
                  <p className="t-s" style={{ marginTop: 7, maxWidth: "60ch" }}>
                    {note}
                  </p>
                )}
              </div>
            </div>
            <QueueRead query={query} sites={sites} />
            <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
              <Clock s={19} />
              <p className="t-s" style={{ flex: 1 }}>
                <b style={{ color: "#0E1520" }}>You can close this tab.</b> We will email you
                the moment it is done, and the list fills in as businesses come back — it is
                usable before it is finished.
              </p>
            </div>
          </div>
        )}

        {/* The route that works for any city today, offered at the exact moment
            somebody discovers theirs is not read. Not a consolation: an
            uploaded list brings its own candidates, so it is the faster path
            for anyone who already has one. */}
        <div className="ptiles">
          <Link className="ptile sug" href="/app/upload">
            <span className="ptile__tag">works today</span>
            <span className="ptile__back" aria-hidden="true" />
            <span className="ptile__front">
              <span className="ptile__ico">
                <Up s={17} />
              </span>
              <span className="ptile__txt">
                <b>Already have a list of them?</b>
                <em>
                  Upload it and we will read every site on it — any city, starting now.
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
              Finished, and ready right now
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

        <p className="t-s">Nothing was charged for this search. You still have your free 20.</p>
      </div>
    </div>
  );
}
