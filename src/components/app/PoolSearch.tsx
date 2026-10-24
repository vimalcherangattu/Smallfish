"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Arrow } from "@/components/app/icons";

/**
 * Two fields, then a real number (PRD v2, steps 1 and 2).
 *
 * ## What this replaces, and why the order changed
 *
 * `FirstRun` asks **what you sell** — "I sell [online booking] to [dentists] in
 * [Phoenix]" — and infers the criterion from it. That inversion is the
 * product's insight, and PRD v2 moves it *later* for a reason worth keeping:
 * asking a stranger to describe their offer before anything has appeared is
 * friction in front of an empty screen. Here the first question is the one
 * anybody can answer without thinking — a kind of business, and a place — and
 * what you sell moves to the skippable intake once the market is on screen.
 *
 * ## Two requests, because honesty and speed pull apart
 *
 * The PRD wants a count inside five seconds. A city-sized Overture scan takes
 * about nine. It also wants the number never invented. Both at once is not
 * available, so:
 *
 * 1. **resolve** comes back in well under a second with no number at all — what
 *    we understood, and the other readings we could have taken. That is the
 *    question a stranger actually has after typing "plumers in dallas".
 * 2. **count** comes back with the truth.
 *
 * In between this says "counting", not a number. A rising "1,240+" would be a
 * guess dressed as a measurement, which the PRD forbids two sentences after
 * asking for it; `pool.ts` carries the full reasoning.
 *
 * ## Nothing here spends anything
 *
 * No account, no credit, no job. `/api/pool` reads. That is what makes this the
 * top of the funnel rather than a paywall in front of a claim nobody can check.
 */

/** PRD: rotating examples under the fields. Real trades, real places, and
 *  every one of them resolvable — an example that returns "we could not place
 *  that" on the first screen is worse than no example. */
const EXAMPLES: Array<[string, string]> = [
  ["Dentists", "Dallas, TX"],
  ["Hair salons", "Austin, TX"],
  ["Plumbers", "Phoenix, AZ"],
  ["Gyms", "Denver, CO"],
  ["Restaurants", "Tampa, FL"],
  ["Roofers", "Columbus, OH"],
];

interface Near {
  trade: string;
  anchor: string;
  categories: string[];
  listings: number;
}

interface Understood {
  trade: string;
  how: string;
  categories: string[];
  near: Near[];
  where: string;
  scope: string;
  note: string | null;
  sampled: boolean;
}

interface Sample {
  name: string;
  town: string | null;
  rating: number | null;
  reviews: number | null;
  hasSite: boolean;
}

interface Counted {
  listings: number;
  withSite: number;
  claim: string;
  thin: string | null;
  samples: Sample[];
  source: string;
  degraded: string | null;
  ms: number;
  measuredAt?: string;
  cached?: boolean;
}

type Problem = { field?: string; reason: string; hint?: string; suggest?: string | null };

export default function PoolSearch() {
  const router = useRouter();
  const [trade, setTrade] = useState("");
  const [where, setWhere] = useState("");
  const [understood, setUnderstood] = useState<Understood | null>(null);
  const [counted, setCounted] = useState<Counted | null>(null);
  const [counting, setCounting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [example, setExample] = useState(0);

  // The count can outlive the question that asked for it: somebody edits a
  // field while nine seconds of scan are in flight. Without this the old
  // answer lands on the new question, which is the "dentists in Dallas showing
  // Phoenix" defect in a different costume.
  const run = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3600);
    return () => clearInterval(t);
  }, []);

  const ready = trade.trim().length > 1 && where.trim().length > 1;

  const ask = useCallback(
    async (categories?: string[]) => {
      if (!ready) return;
      const mine = ++run.current;
      setProblem(null);
      setCounted(null);
      setUnderstood(null);
      setCounting(true);

      const post = (stage: "resolve" | "count") =>
        fetch("/api/pool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trade, where, stage, categories }),
        }).then((r) => r.json());

      try {
        const first = await post("resolve");
        if (mine !== run.current) return;
        if (!first?.ok) {
          setProblem({
            field: first?.field,
            reason: first?.reason ?? "That did not work.",
            hint: first?.hint,
            suggest: first?.suggest ?? null,
          });
          setCounting(false);
          return;
        }
        setUnderstood(first.understood as Understood);

        const full = await post("count");
        if (mine !== run.current) return;
        if (!full?.ok) {
          setProblem({ reason: full?.reason ?? "We could not count that one.", hint: full?.hint });
        } else {
          setCounted(full as Counted);
        }
      } catch {
        if (mine === run.current) {
          // Ours, said as ours. Never "this market is empty".
          setProblem({ reason: "Our end failed, not theirs. Try that again." });
        }
      } finally {
        if (mine === run.current) setCounting(false);
      }
    },
    [ready, trade, where],
  );

  /** Step 3 is the intake and is not built yet, so the one button hands over to
   *  the flow that does work today, with both fields carried. Said plainly on
   *  the screen rather than dressed as the finished thing. */
  const onward = () => {
    const q = `${trade.trim()} in ${where.trim()}`;
    router.push(`/app?q=${encodeURIComponent(q)}`);
  };

  const [exTrade, exWhere] = EXAMPLES[example] ?? EXAMPLES[0]!;

  return (
    <div className="appbody">
      <div className="appmid">
        <h1 className="t-h1" style={{ fontSize: 36, lineHeight: "44px" }}>
          Which businesses, and where?
        </h1>
        <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "56ch" }}>
          Free, and no account needed.
        </p>

        <form
          className="bigq"
          style={{ marginTop: 26 }}
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <span>Find</span>
          <Field
            label="What kind of business?"
            value={trade}
            onChange={setTrade}
            placeholder={exTrade}
            invalid={problem?.field === "trade"}
          />
          <span>in</span>
          <Field
            label="Where?"
            value={where}
            onChange={setWhere}
            placeholder={exWhere}
            invalid={problem?.field === "where"}
            wide
          />
          <button
            className="btn"
            type="submit"
            disabled={!ready || counting}
            style={{ marginLeft: 4 }}
          >
            {counting ? "Counting…" : "Count them"}
          </button>
        </form>

        <p className="t-s" style={{ marginTop: 10 }}>
          A US city, county or state.
        </p>

        {problem && (
          <div className="evbox" style={{ borderLeftColor: "#C2410C" }}>
            <p className="t-b">{problem.reason}</p>
            {/* A typo is the commonest reason to be here. Offered as a question
                and pressed, never applied behind their back — searching
                plumbing for somebody who typed "plumers" would spend nine
                seconds and a pool count on a trade they did not ask for. */}
            {problem.suggest && (
              <p className="t-b" style={{ marginTop: 2 }}>
                Did you mean{" "}
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() => {
                    setTrade(problem.suggest!);
                    setProblem(null);
                  }}
                >
                  {problem.suggest}
                </button>
                ?
              </p>
            )}
            {problem.hint && <p className="t-s">{problem.hint}</p>}
          </div>
        )}

        {understood && (
          <section style={{ marginTop: 26 }}>
            {/* The instant half: what we understood, before any number. */}
            <h2 className="t-h2">
              {understood.trade} in {understood.where}
            </h2>

            {understood.note && (
              <p className="t-s" style={{ marginTop: 6 }}>
                {understood.note}
              </p>
            )}

            {understood.near.length > 0 && (
              <p className="t-s" style={{ marginTop: 8 }}>
                Or did you mean{" "}
                {understood.near.map((n, i) => (
                  <span key={n.anchor}>
                    {i > 0 && ", "}
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={() => void ask(n.categories)}
                      style={{ verticalAlign: "middle" }}
                    >
                      {n.trade}
                    </button>
                  </span>
                ))}
                ?
              </p>
            )}

            {/* The slow half. "Counting", never a number we do not have. */}
            {/* What the wait is for, in one line, about them.
                It used to read "we read the release live rather than quoting a
                cached guess", which is our data layer explained to somebody who
                wants plumbers. Whether we keep a cache is our problem. */}
            {!counted && counting && (
              <p className="t-b" style={{ marginTop: 16, color: "#5B6470" }}>
                Counting every one of them. Ten seconds or so.
              </p>
            )}

            {counted && (
              <>
                <p className="t-h1" style={{ marginTop: 18, fontSize: 30, lineHeight: "38px" }}>
                  {counted.listings.toLocaleString("en-US")}
                </p>
                <p className="t-b" style={{ marginTop: 4 }}>
                  {counted.claim}
                </p>

                {counted.thin && (
                  <div className="evbox" style={{ marginTop: 14 }}>
                    <p className="t-b">{counted.thin}</p>
                  </div>
                )}

                {counted.degraded && (
                  <p className="t-s" style={{ marginTop: 8 }}>
                    {counted.degraded}
                  </p>
                )}
                {/* A cached count is a measured one with its date, not a guess. */}
                {counted.cached && counted.measuredAt && (
                  <p className="t-s" style={{ marginTop: 8 }}>
                    Counted from the open business listings on{" "}
                    {new Date(counted.measuredAt).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                    .
                  </p>
                )}

                {counted.samples.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <h3 className="t-h3" style={{ color: "#5B6470" }}>
                      Five of them
                    </h3>
                    <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
                      {counted.samples.map((s) => (
                        <li
                          key={s.name}
                          className="row"
                          style={{
                            justifyContent: "space-between",
                            gap: 16,
                            padding: "9px 0",
                            borderTop: "1px solid #E6E8E3",
                          }}
                        >
                          <span className="t-b">
                            {s.name}
                            {s.town && (
                              <span className="t-s" style={{ marginLeft: 8 }}>
                                {s.town}
                              </span>
                            )}
                          </span>
                          <span className="t-s" style={{ whiteSpace: "nowrap" }}>
                            {s.rating !== null && `${s.rating}`}
                            {s.reviews !== null && ` · ${s.reviews.toLocaleString("en-US")}`}
                            {!s.hasSite && " · no website"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {counted.withSite > 0 && (
                  <div className="col" style={{ marginTop: 24, gap: 10, alignItems: "flex-start" }}>
                    <button className="btn big" type="button" onClick={onward}>
                      Get specific <Arrow />
                    </button>
                    {/* What happens next, said once. The previous version
                        apologised here for the next screen being the older one,
                        which is build status rather than anything a customer
                        needs: it belongs in a note to the owner, not on a page
                        a stranger reads. */}
                    <p className="t-s" style={{ maxWidth: "62ch" }}>
                      Tell us what you sell, and we read these sites to find the ones
                      worth calling.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** A slot in the sentence. Labelled for a screen reader, unlabelled on screen —
 *  §5.1: a form that does not look like a form, because the form is two facts. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  invalid,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  invalid?: boolean;
  wide?: boolean;
}) {
  const id = useMemo(() => `f-${label.replace(/\W+/g, "")}`, [label]);
  return (
    <>
      <label className="t-s" htmlFor={id} style={{ position: "absolute", left: -9999 }}>
        {label}
      </label>
      <input
        id={id}
        className={`slot${value ? "" : " ph"}`}
        style={{
          minWidth: wide ? 200 : 160,
          ...(invalid ? { borderColor: "#C2410C" } : null),
        }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </>
  );
}
