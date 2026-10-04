"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Arrow, Grid, Map, Spark, Up } from "@/components/app/icons";
import { inferFromOffer } from "@/lib/icp";

/**
 * First run — `AppFirstRun`, §5.1.
 *
 * ## One question, in a sentence
 *
 * **I sell [___] to [___] in [___]**. Three slots, Fraunces, no labels, no
 * field borders that say "form". §5.1: *"It is a form that does not look like a
 * form, because the form is two facts."*
 *
 * ## Why the first slot is what you sell, not what to look for
 *
 * The screen this replaces asked for the search directly — *"dentists in
 * Phoenix that have no online booking"* — which requires the person to have
 * already worked out that a business worth calling is one **missing** the thing
 * they sell. That inversion is the product's insight and it was being set as
 * the user's homework.
 *
 * `inferFromOffer` does it instead: "online booking" in, `has no online
 * booking` out. It is the same function the ICP flow uses, so the sentence
 * typed here and the sentence built there cannot drift.
 *
 * ## And when an offer names nothing a website can show
 *
 * It says so, before the search runs, with what it would take to settle it.
 * `signals.ts` keeps `provable: false` entries precisely so the product can
 * refuse out loud rather than propose a criterion the engine cannot settle.
 * That refusal is the reason to trust the rest of it.
 */

const WAYS: ReadonlyArray<{
  href: string;
  icon: (p: { s?: number }) => React.ReactElement;
  title: string;
  detail: string;
  suggested?: boolean;
}> = [
  {
    href: "/templates",
    icon: Spark,
    title: "Start from an example",
    detail: "Searches that return something today. Open one and change the words.",
    suggested: true,
  },
  {
    href: "/app/explore",
    icon: Map,
    title: "Pick it on a map",
    detail: "Draw round the area you actually drive to, instead of naming a city.",
  },
  {
    href: "/templates",
    icon: Grid,
    title: "Start from a template",
    detail: "The usual asks for your kind of business, already written out.",
  },
  {
    href: "/app/upload",
    icon: Up,
    title: "Bring your own list",
    detail: "A CSV of businesses you already have. We read their sites and tell you which fit.",
  },
] as const;

export default function FirstRun({
  examples,
}: {
  /** Searches that return something today, measured — never invented. */
  examples: Array<{ q: string; n: number }>;
}) {
  const router = useRouter();
  const [sell, setSell] = useState("");
  const [to, setTo] = useState("");
  const [where, setWhere] = useState("");

  const read = useMemo(() => (sell.trim() ? inferFromOffer(sell) : null), [sell]);
  const criterion = read?.propose[0]?.criterionText ?? null;
  const refused = read && read.propose.length === 0 ? read : null;

  const ready = !!(criterion && to.trim() && where.trim());
  const go = () => {
    if (!ready) return;
    router.push(`/app?q=${encodeURIComponent(`${to.trim()} in ${where.trim()} that ${criterion}`)}`);
  };

  return (
    <div className="appbody">
      <div className="appmid">
        <div>
          <h1 className="t-h1" style={{ fontSize: 36, lineHeight: "44px" }}>
            What do you sell, and who do you sell it to?
          </h1>
          <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "56ch" }}>
            Two things and we can start. A type of business and a city is enough.
          </p>
        </div>

        <form
          className="bigq"
          onSubmit={(e) => {
            e.preventDefault();
            go();
          }}
        >
          <span>I sell</span>
          <Slot value={sell} set={setSell} placeholder="online booking" label="What you sell" />
          <span>to</span>
          <Slot value={to} set={setTo} placeholder="dental clinics" label="Who you sell it to" />
          <span>in</span>
          <Slot value={where} set={setWhere} placeholder="Phoenix" label="Where they are" />
          <button type="submit" hidden aria-hidden="true" />
        </form>

        {/* What we will look for, before anything is spent. The person can see
            the inversion happen instead of having to know about it. */}
        {criterion && (
          <div className="evbox">
            <p className="t-b">
              So we will look for {to.trim() || "businesses"} in {where.trim() || "your area"}{" "}
              that <b>{criterion}</b> — the ones that need what you sell.
            </p>
          </div>
        )}

        {refused && (
          <div className="honest">
            <span className="unsure" aria-hidden="true">
              ?
            </span>
            <div>
              {refused.refused.length > 0 ? (
                <p className="t-b">
                  <b>We can&rsquo;t settle that from a website.</b> To know whether a business
                  needs {refused.refused[0].signal.label}, we would need{" "}
                  {refused.refused[0].wouldTake}. We would rather say so than hand you a list
                  we cannot stand behind.
                </p>
              ) : (
                <p className="t-b">
                  <b>Nothing in that is visible on a website.</b> Tell us what a customer would
                  see, or not see, on their site — &ldquo;online booking&rdquo;, &ldquo;a quote
                  form&rdquo;, &ldquo;live chat&rdquo; — and we can read for it.
                </p>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="t-h3" style={{ color: "#5B6470" }}>
            Or get there another way
          </p>
          <div className="ptiles">
            {WAYS.map((w) => (
              <Link className={`ptile${w.suggested ? " sug" : ""}`} href={w.href} key={w.title}>
                {w.suggested && <span className="ptile__tag">start here</span>}
                <span className="ptile__back" aria-hidden="true" />
                <span className="ptile__front">
                  <span className="ptile__ico">
                    <w.icon s={17} />
                  </span>
                  <span className="ptile__txt">
                    <b>{w.title}</b>
                    <em>{w.detail}</em>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div
          className="col"
          style={{ gap: 14, alignItems: "flex-start", paddingTop: 8, borderTop: "1px solid #D5D9D2" }}
        >
          <button className="btn big" type="button" onClick={go} disabled={!ready}>
            Find them
            <Arrow s={17} />
          </button>
          <p className="t-s" style={{ maxWidth: "62ch" }}>
            We open each business&rsquo;s own website and read it. You get back only the ones
            that fit, each with an opening email.{" "}
            <b style={{ color: "#0E1520" }}>
              Your first 20 are free and we don&rsquo;t ask for a card.
            </b>
          </p>
        </div>

        {examples.length > 0 && (
          <div style={{ borderTop: "1px solid #D5D9D2", paddingTop: 18 }}>
            <p className="t-h3" style={{ color: "#5B6470" }}>
              Ready right now
            </p>
            <div className="col" style={{ gap: 2, marginTop: 10 }}>
              {examples.slice(0, 5).map((e) => (
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

/** A `.slot` that is a real input. The artboard draws a `<span>` with a fake
 *  caret; a span cannot be typed into, and §9 requires every interactive
 *  element be real. `size` keeps it from being a full-width field, which is
 *  what makes the row read as a sentence rather than a form. */
function Slot({
  value,
  set,
  placeholder,
  label,
}: {
  value: string;
  set: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <input
      className={`slot${value ? "" : " ph"}`}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => set(e.target.value)}
      size={Math.max(placeholder.length, value.length + 1)}
      style={{ font: "inherit", color: value ? "#0E1520" : undefined }}
      autoComplete="off"
    />
  );
}
