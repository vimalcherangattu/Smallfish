"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Arrow, Clock, Up } from "@/components/app/icons";
import { agree } from "@/lib/appview";
import { splitQuery } from "@/lib/query";

/**
 * Any trade, any US city: what is out there and how much of it you want.
 *
 * ## What this replaced
 *
 * A dead end. A search for a trade and city outside the four measured markets
 * reached `NotRead`, which said we could not start it from a city name and
 * offered a CSV upload instead. Before that it reached a progress bar that read
 * `0 of 1,000` for ever, because `/api/jobs` created a job and attached no
 * sites to it. Somebody watched that bar — psychiatrists in Dallas.
 *
 * ## The screen is three sentences and one decision
 *
 * How many there are. How many we can read. How many you want. Everything else
 * on it is subordinate to those, including the part the engine is proudest of:
 * the criterion sits under the count as one line, not as a rubric.
 *
 * ## Why the numbers are ranges
 *
 * We do not know which sites will answer the way somebody asked until we have
 * read them. `sizing.ts` derives the spread from the four measured markets —
 * 18 to 31 in every hundred, **and nothing at all in one of the four** — so the
 * reads and the wait are both a low and a high, and the zero is named. A single
 * confident number here would be the one lie the rest of the product exists to
 * avoid.
 *
 * ## It asks before it spends
 *
 * This screen starts nothing. `/api/supply` only counts, and the count is free
 * and repeatable; `/api/jobs` is the only thing that queues work. Somebody can
 * look at Boise, see that it holds about 21 to 37 plumbers with no quote form,
 * and walk away having spent nothing.
 */

interface Supply {
  ok: true;
  query: string;
  trade: {
    typed: string;
    categories: Array<{ id: string; label: string }>;
    near: Array<{ anchor: string; label: string; categories: string[]; listings: number }>;
    how: string;
  };
  region: { label: string; scope: string; note: string | null };
  found: {
    listings: number;
    withSite: number;
    alreadyYours: number;
    alreadyChecked: number;
    fresh: number;
    ms: number;
  };
  question: { check: string; text: string; how: string; type: string } | null;
  refused: { why: string; source?: string } | null;
  canCheck: Array<{ check: string; text: string; label: string }>;
  signedIn: boolean;
  rates: { low: number; high: number; markets: number; zeroes: number } | null;
  sizing: {
    reads: { low: number; high: number };
    seconds: { low: number; high: number };
    ceiling: { low: number; high: number };
    short: boolean;
    realistic: number;
    credits: number;
    choices: number[];
  } | null;
}

type Fail = { ok: false; reason: string; hint?: string };

const n = (x: number) => x.toLocaleString();

/** A wait as somebody would say it. Mirrors `jobs.ts`'s `humanDuration`, kept
 *  here because this one takes a low and a high and says one thing about both:
 *  "4 to 6 minutes" is a promise you can keep, "5 minutes" is not. */
function spell(lowSec: number, highSec: number): string {
  const mins = (s: number) => Math.max(1, Math.round(s / 60));
  const lo = mins(lowSec);
  const hi = mins(highSec);
  if (hi < 2) return "a minute or two";
  if (hi < 60) return lo === hi ? `about ${hi} minutes` : `${lo} to ${hi} minutes`;
  const hrs = (s: number) => Math.round(s / 360) / 10;
  return lo === hi ? `about ${hrs(highSec)} hours` : `${hrs(lowSec)} to ${hrs(highSec)} hours`;
}

export default function Discover({
  query,
  signedIn,
}: {
  query: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<Supply | null>(null);
  const [fail, setFail] = useState<Fail | null>(null);
  const [cats, setCats] = useState<string[] | null>(null);
  const [want, setWant] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One request per (query, categories). `useRef` rather than a dependency on
  // `data`, because setting state inside the effect would re-run it — and this
  // request costs a nine-second scan of a ten-gigabyte release.
  const asked = useRef("");

  useEffect(() => {
    const key = `${query}::${(cats ?? []).join(",")}`;
    if (asked.current === key) return;
    asked.current = key;
    let live = true;
    setData(null);
    setFail(null);
    (async () => {
      try {
        const res = await fetch("/api/supply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, categories: cats ?? undefined }),
        });
        const body = (await res.json()) as Supply | Fail;
        if (!live) return;
        if (body.ok) setData(body);
        else setFail(body);
      } catch {
        if (live) setFail({ ok: false, reason: "We could not reach the listings just now." });
      }
    })();
    return () => {
      live = false;
    };
  }, [query, cats]);

  const sizing = data?.sizing ?? null;
  const picked = useMemo(() => {
    if (want != null) return want;
    if (!sizing) return 0;
    // What the region can actually give, not the balance: on a small city those
    // differ, and defaulting to the balance pre-selects a number we have just
    // said is not available. Falling back to the largest offered choice keeps
    // the button from reading "Read for 0" when the ceiling rounds to nothing.
    return sizing.realistic || sizing.choices[sizing.choices.length - 1] || 0;
  }, [want, sizing]);

  const start = async () => {
    if (!data?.question || picked < 1) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          want: picked,
          categories: data.trade.categories.map((c) => c.id),
          check: data.question.check,
        }),
      });
      const body = (await res.json()) as { ok: boolean; href?: string; reason?: string; signIn?: string };
      if (body.ok && body.href) {
        router.push(body.href);
        return;
      }
      if (body.signIn) {
        router.push(body.signIn);
        return;
      }
      setError(body.reason ?? "That did not start. Nothing was charged.");
    } catch {
      setError("That did not start. Nothing was charged.");
    } finally {
      setStarting(false);
    }
  };

  // ---------------------------------------------------------------- waiting --
  if (!data && !fail) {
    // **What this screen said before, and why it was wrong.**
    //
    // "Looking through the listings. About ten seconds. We are counting the
    // listings themselves rather than a cache of them." Both sentences were
    // about our data layer. Whether we keep a cache is our problem; a person
    // who has just asked for dentists in Austin learns nothing from being told
    // we do not have one, and the screen never said their search back to them,
    // so the only thing on it was a heading that could have belonged to anybody
    // and a progress bar frozen at 40%.
    //
    // The query *is* echoed now, but only the part this step is actually
    // counting. The old comment here was right that
    // "Counting plumbers in Denver that have no online booking" would be a lie
    // — the criterion is settled later, by reading websites — and wrong to
    // conclude from that that nothing could be said. We are counting plumbers
    // in Denver. That is what it says.
    const asked = splitQuery(query);
    const subject =
      asked.what && asked.where
        ? `Counting ${asked.what} in ${asked.where}.`
        : asked.what
          ? `Counting ${asked.what}.`
          : "Counting what is out there.";

    return (
      <div className="appbody short">
        <div className="appmid">
          <h1 className="t-h1">{subject}</h1>
          <p className="t-b" style={{ color: "#36404C", maxWidth: "52ch" }}>
            {/* What they get, in the order the next screen gives it, and the
                part that decides whether they keep waiting: this costs
                nothing. */}
            About ten seconds. Then you will see how many there are, how many
            have a website we can read, and what a list would cost, before
            anything is charged.
          </p>
          {/* Indeterminate, because we do not know the progress. The bar was
              fixed at 40% and never moved, which is a progress bar that lies in
              a product whose whole argument is that it does not. */}
          <div className="track waiting" style={{ maxWidth: 420 }} role="presentation">
            <i />
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- refused --
  if (fail) {
    return (
      <div className="appbody short">
        <div className="appmid">
          <h1 className="t-h1">{fail.reason}</h1>
          {fail.hint && (
            <p className="t-b" style={{ color: "#36404C", maxWidth: "52ch" }}>
              {fail.hint}
            </p>
          )}
          <div className="nextstep">
            <Link className="btn" href="/app">
              Ask for something else
              <Arrow s={17} />
            </Link>
            <Link className="qbtn" href="/app/upload">
              <Up s={15} />
              Check a list you already have
            </Link>
          </div>
          <p className="t-s">Nothing was charged for this.</p>
        </div>
      </div>
    );
  }

  const d = data!;
  const f = d.found;
  // The route's answer wins: it looked the account up, this page only knows
  // what the server component passed on render.
  const haveAccount = d.signedIn ?? signedIn;

  return (
    <div className="appbody">
      <div className="appmid">
        {/* ------------------------------------------------------ the count -- */}
        <div>
          {/* The count is **not** in `.mono` here. IBM Plex Mono gives a comma
              its own full character cell, so `toLocaleString`'s "3,336" came
              out looking like "3 , 336" at heading size — a thousands
              separator reading as a decimal point, on the one number this
              screen exists to state. Fraunces sets it correctly. */}
          <h1 className="t-h1">
            {n(f.listings)} {d.trade.typed || "businesses"} in {d.region.label}.
          </h1>
          <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "56ch" }}>
            <b style={{ color: "#0E1520" }}>{n(f.withSite)}</b> of them have a website we can
            read.
            {(f.alreadyYours > 0 || f.alreadyChecked > 0) && (
              <>
                {/* **This said "N you have had before ... you never pay for the
                    same business twice" about one combined total.** Most of
                    that total was businesses we had opened for this question
                    and found did not fit: never delivered, never charged for,
                    and in one real case produced by a read that matched
                    nothing at all. Telling somebody they already have seventy
                    businesses they have never seen is the product miscounting
                    itself at them. Both exclusions are right; the sentence
                    was not. */}
                {f.alreadyYours > 0 && (
                  <>
                    {" "}
                    {n(f.alreadyYours)} {f.alreadyYours === 1 ? "is" : "are"} already yours, so
                    they are not in what follows, you never pay for the same business twice.
                  </>
                )}
                {f.alreadyChecked > 0 && (
                  <>
                    {" "}
                    {n(f.alreadyChecked)} we have already opened for this exact question and
                    they did not fit, so we will not spend your reading on them again.
                  </>
                )}
              </>
            )}
          </p>
          {d.region.note && (
            <p className="t-s" style={{ marginTop: 10, maxWidth: "60ch" }}>
              {d.region.note}
            </p>
          )}
        </div>

        {/* --------------------------------------------- what we will check -- */}
        {d.refused && (
          <div className="honest">
            <span className="unsure" aria-hidden="true">
              ?
            </span>
            <div>
              <p className="t-b">
                <b>{d.refused.why}</b> We would rather say so than hand you a list we cannot
                stand behind.
              </p>
            </div>
          </div>
        )}

        {!d.question ? (
          <div className="col" style={{ gap: 12 }}>
            <p className="t-h3">What should we look for?</p>
            <div className="exs">
              {d.canCheck.map((c) => (
                <Link
                  className="chip"
                  key={c.check}
                  href={`/app?q=${encodeURIComponent(
                    `${d.trade.typed} in ${d.region.label.split(",")[0]} that ${c.text}`,
                  )}`}
                  prefetch={false}
                >
                  {c.text}
                </Link>
              ))}
            </div>
            <p className="t-s" style={{ maxWidth: "60ch" }}>
              These are the things we can settle off a website and prove with a sentence from
              it. Anything else, we would be guessing.
            </p>
          </div>
        ) : (
          <>
            {/* --------------------------------------------------- how many -- */}
            <div className="grp">
              <div className="hd2">
                <p className="t-h3">How many do you want?</p>
                {sizing && (
                  <span className="t-d m" style={{ color: "#5B6470" }}>
                    {n(sizing.credits)} credits
                  </span>
                )}
              </div>

              {sizing?.short && (
                <p className="t-b" style={{ color: "#36404C", maxWidth: "58ch" }}>
                  {d.region.label.split(",")[0]} probably holds about{" "}
                  <b style={{ color: "#0E1520" }}>
                    {n(sizing.ceiling.low)}&ndash;{n(sizing.ceiling.high)}
                  </b>{" "}
                  that {agree(d.question.text)}. That is fewer than your credits buy, so you can take
                  what is there, or widen to the state.
                </p>
              )}

              <div className="exs">
                {(sizing?.choices ?? []).map((c) => (
                  <button
                    className={`chip${picked === c ? " on" : ""}`}
                    key={c}
                    type="button"
                    onClick={() => {
                      setWant(c);
                      setTyped("");
                    }}
                  >
                    {n(c)}
                    {sizing && c === sizing.credits && c === sizing.realistic
                      ? " all your credits"
                      : sizing && c === sizing.realistic && sizing.short
                        ? " all there is"
                        : ""}
                  </button>
                ))}
                <input
                  className="chip ghost"
                  aria-label="Some other number"
                  placeholder="another number"
                  inputMode="numeric"
                  value={typed}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
                    setTyped(raw);
                    const v = Number(raw);
                    setWant(raw && v > 0 ? v : null);
                  }}
                  style={{ width: 150, font: "inherit" }}
                />
              </div>

              {/* The arithmetic, in the order somebody asks it: how much
                  reading, how long, what it costs. */}
              {sizing && picked > 0 && (
                <Arithmetic
                  want={picked}
                  question={d.question.text}
                  fresh={f.fresh}
                  rates={d.rates}
                  sizing={sizing}
                />
              )}
            </div>

            <div className="col" style={{ gap: 12, alignItems: "flex-start" }}>
              <button
                className="btn big"
                type="button"
                onClick={start}
                disabled={starting || picked < 1 || !haveAccount}
              >
                {starting ? "Starting…" : `Read for ${n(picked)}`}
                <Arrow s={17} />
              </button>
              {!haveAccount && (
                <p className="t-s" style={{ maxWidth: "58ch" }}>
                  A read is queued against a workspace, so this needs an account, {" "}
                  <Link className="lnk" href={`/sign-up?q=${encodeURIComponent(query)}`}>
                    sign up and these {n(picked)} are free
                  </Link>
                  . No card.
                </p>
              )}
              {error && (
                <p className="t-s" style={{ color: "#8A3B2A" }}>
                  {error}
                </p>
              )}
            </div>
          </>
        )}

        {/* ------------------------------------------- what we are looking in */}
        <div style={{ borderTop: "1px solid #D5D9D2", paddingTop: 18 }}>
          <p className="t-h3" style={{ color: "#5B6470" }}>
            Looking in
          </p>
          <div className="exs" style={{ marginTop: 10 }}>
            {d.trade.categories.map((c) => (
              <span className="chip" key={c.id}>
                {c.label}
              </span>
            ))}
          </div>
          {d.trade.near.length > 0 && (
            <>
              <p className="t-s" style={{ marginTop: 14, maxWidth: "60ch" }}>
                Not these, unless you say so. Picking one runs the count again.
              </p>
              <div className="exs" style={{ marginTop: 8 }}>
                {d.trade.near.map((g) => (
                  <button
                    className="chip ghost"
                    key={g.anchor}
                    type="button"
                    onClick={() => {
                      setWant(null);
                      setTyped("");
                      setCats(g.categories);
                    }}
                  >
                    {g.label} · {n(g.listings)} in the US
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="t-s" style={{ marginTop: 14 }}>
            Counted from the open business listings, in {(f.ms / 1000).toFixed(1)} seconds.
            Nothing has been charged.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The reading, the wait and the bill, as three plain sentences.
 *
 * The measured range is quoted **with the market that matched nothing**. It is
 * one of four, and leaving it out would turn a measurement into a sales figure:
 * every criterion that found something found 18 to 31 in a hundred, and one
 * criterion settled 117 sites and found none. Somebody deciding whether to
 * spend 120 credits is entitled to both halves of that.
 */
function Arithmetic({
  want,
  question,
  fresh,
  rates,
  sizing,
}: {
  want: number;
  question: string;
  fresh: number;
  rates: Supply["rates"];
  sizing: NonNullable<Supply["sizing"]>;
}) {
  // The chosen number is not necessarily the one the chips were sized for, so
  // the reads are re-derived from it rather than read off the server's answer.
  const share = want / Math.max(1, sizing.realistic);
  const low = Math.min(fresh, Math.ceil(sizing.reads.low * share));
  const high = Math.min(fresh, Math.ceil(sizing.reads.high * share));
  const secs = (reads: number) => Math.ceil((reads * (3.4 * 1.5 + 1.2)) / 12);

  return (
    <div className="col" style={{ gap: 10, marginTop: 4 }}>
      <p className="t-b" style={{ color: "#36404C", maxWidth: "58ch" }}>
        We will open{" "}
        <b style={{ color: "#0E1520" }}>
          {low === high ? n(high) : `${n(low)}–${n(high)}`}
        </b>{" "}
        {/* `agree` pluralises the criterion's verb. Without it this read "20
            that **has** no online booking" — the catalogue writes criteria in
            the third person singular and the count in front of it is plural.
            Same helper the suggestions on the first-run screen use. */}
        websites to find {n(want)} that {agree(question)}.
      </p>
      <p className="t-b" style={{ display: "flex", alignItems: "center", gap: 8, color: "#36404C" }}>
        <Clock s={16} />
        {/* **Not "we will email you when it is done."** That was true only if a
            mail provider is configured and the scheduler runs, and on the plan
            this ships on the scheduler ticks once a day — so the promise was
            for an email that may not send about a read that would not have
            finished. What is true is what the next screen does: it drives the
            read itself while it is open. */}
        {spell(secs(low), secs(high))} of reading, on the next screen, while you watch it.
      </p>
      <p className="t-s" style={{ maxWidth: "62ch" }}>
        You pay for the ones that fit and nothing for the rest, not for the ones that do not
        fit, and not for the ones we could not tell about.
        {rates && (
          <>
            {" "}
            {/* Both halves are counted, never spelled. An earlier draft said
                "and in a fourth, nothing did", which hardcoded today's 3 + 1
                and would have quietly become false the next time a market was
                measured — a wrong number in the sentence whose whole job is to
                be the honest one. */}
            Of the {rates.markets + rates.zeroes} searches we have measured,{" "}
            {rates.markets} fitted {rates.low} to {rates.high} in every hundred.
            {rates.zeroes > 0 && (
              <>
                {" "}
                {rates.zeroes === 1 ? "One fitted nothing at all." : `${rates.zeroes} fitted nothing at all.`}
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
