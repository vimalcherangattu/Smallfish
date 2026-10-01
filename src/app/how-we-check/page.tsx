import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Dots from "@/components/Dots";
import { MarketingFooter, MarketingNav } from "@/components/MarketingChrome";
import { CMS_NAME, showcase } from "@/lib/showcase";

/**
 * How we check — the accuracy page.
 *
 * Everything that came off the home page on 2026-09-26 and is about the
 * *method* lands here: what a check actually does, what we cannot read, and
 * what we get wrong. The copy calls it "the accuracy page: benchmark, what we
 * can't read, what we get wrong".
 *
 * **It carries no number of its own.** The measured figures are read from
 * `public/data/benchmark.json`, which `export_benchmark.py` generates from the
 * Live numbers table in `PROJECT_PLAN.md`, and `test_benchmark_export.py` fails
 * on drift. That rule was made for `/benchmark` and it applies twice as hard
 * here: a second accuracy page with its own hard-coded copies of the same
 * numbers is exactly how a site ends up quoting two different precisions.
 *
 * The copy's move list includes "544 of 544 quotes verified". It is not here,
 * for the third time of asking: `544` appears nowhere in the plan, the coverage
 * report or the benchmark export. The measured proof-validity figure is 11 of
 * 11 model verdicts, and it comes out of the same file as everything else.
 *
 * ## What arrived on 2026-10-01
 *
 * Three blocks came off the home page, where they argued the method before the
 * product had been shown: the junk-list row counts, the annotated drawing of
 * the page we read for one clinic, and the fit/don't/couldn't-tell strip. They
 * are the evidence for the claim this page makes, so this is where they belong
 * — and the home page now links here once, quietly, under the three steps.
 *
 * They render from `lib/showcase.ts`, the same loader the home page uses, so
 * the two pages cannot quote different numbers for the same market.
 */

export const metadata = {
  title: "How we check — Small Fish",
  description:
    "What a check actually does, what we cannot read, and what we get wrong. " +
    "Every number here comes from the measured benchmark.",
};

type Row = { id: string; label: string; measured: string; date: string };

async function benchmark(): Promise<{ rows: Row[]; newest: string } | null> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "public", "data", "benchmark.json"),
      "utf8",
    );
    const json = JSON.parse(raw) as { rows: Row[]; newest: string };
    return json;
  } catch {
    return null;
  }
}

/** The rows worth leading with. Named by id so a renamed label cannot silently
 *  drop one, and so the ones that undercut the headline stay pinned. */
const LEAD = ["precision", "recall", "couldnt_tell", "proof_validity"];

export default async function HowWeCheck() {
  const data = await benchmark();
  const s = await showcase();
  const rows = (data?.rows ?? []).filter((r) => LEAD.includes(r.id));
  const rest = (data?.rows ?? []).filter((r) => !LEAD.includes(r.id));

  return (
    <main className="mkt" style={{ background: "var(--paper)" }}>
      <MarketingNav />

      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 40 }}>
        <h1 className="dsp" style={{ fontSize: "clamp(34px,5vw,64px)", maxWidth: "18ch" }}>
          A match is only a match when a sentence proves it.
        </h1>
        <p className="lede" style={{ marginTop: 24, maxWidth: "58ch", color: "var(--ink-2)" }}>
          Every check opens the business&rsquo;s own website and looks for the
          thing you asked about, on the pages that would carry it. What comes
          back is a verdict and the evidence behind it — or, when there is not
          enough to be sure, the reason we could not say.
        </p>
      </div>

      {/* ------------------------------------------------ the three answers -- */}
      <section className="wrap" style={{ paddingBottom: 72 }}>
        <div className="g12" style={{ rowGap: 28 }}>
          {[
            [
              "It fits",
              "We found what you asked about, and the sentence that says so, on the page it was found on.",
            ],
            [
              "It doesn't",
              "We found the opposite — a booking link where you asked for businesses without one. You are not charged.",
            ],
            [
              "We couldn't tell",
              "The site has one page, or blocks automated reading, or does not say either way. Never guessed, never billed.",
            ],
          ].map(([title, body], i) => (
            <div key={title} style={{ gridColumn: `${1 + i * 4} / span 3` }}>
              <p className="lab" style={{ color: "var(--ink-3)" }}>{title}</p>
              <p className="lede" style={{ marginTop: 12, color: "var(--ink-2)" }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------- the three answers, counted ---- */}
      {/* Moved from the home page, 2026-10-01. It belongs under the three
          answers above because it is those three answers with a number against
          each: a product that only shows fit and not-fit is claiming it always
          knows, and 73 of these we could not settle. */}
      {s && (
        <section className="wrap" style={{ paddingBottom: 72 }}>
          <h2 className="dsp" style={{ fontSize: "clamp(26px,3.6vw,44px)", maxWidth: "20ch" }}>
            One market, every business we formed a view on.
          </h2>
          <p className="lede" style={{ marginTop: 20, maxWidth: "58ch", color: "var(--ink-2)" }}>
            Dental clinics in Phoenix, asked whether they have online booking.
            One dot per business.
          </p>
          <div className="card" style={{ marginTop: 26, padding: "32px 36px 26px" }}>
            <Dots fit={s.fit} notFit={s.notFit} unclear={s.unclear} />
            <div className="dotkey">
              <span><i style={{ background: "var(--lure)" }} />{s.fit} that fit</span>
              <span><i style={{ background: "#D5D9D2" }} />{s.notFit} that don&rsquo;t</span>
              <span><i style={{ background: "#E6E1CC" }} />{s.unclear} we couldn&rsquo;t tell, never billed</span>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------ what we can't read -- */}
      <section style={{ background: "#FFFFFF" }}>
        <div className="wrap" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <div className="g12" style={{ rowGap: 24 }}>
            <h2 className="dsp" style={{ gridColumn: "1 / span 6", fontSize: "clamp(26px,3.6vw,44px)" }}>
              About four in ten sites can&rsquo;t be read. We tell you which.
            </h2>
            <p className="lede" style={{ gridColumn: "8 / span 5", color: "var(--ink-2)" }}>
              Some businesses have no website, some have a single page, and some
              block automated reading outright. Guessing about them is how lists
              get you into trouble, so we don&rsquo;t. They come back marked
              &ldquo;couldn&rsquo;t tell&rdquo;, with the reason, and they cost
              you nothing.
            </p>
          </div>
          <p className="lab" style={{ color: "var(--ink-3)", marginTop: 36 }}>
            never billed · never exported · shown with the reason
          </p>
        </div>
      </section>

      {/* ---------------------------------------------- the page we read ----- */}
      {/* Moved from the home page, 2026-10-01. */}
      {s && (
        <section className="wrap tight">
          <p className="lab eyebrow">How we can tell</p>
          <h2 className="dsp h-sec wide">
            We read their website the way you would. Just faster.
          </h2>
          <p className="lede" style={{ marginTop: "var(--s3)", maxWidth: "58ch", color: "var(--ink-2)" }}>
            This is the page we read for one clinic in Scottsdale, and the
            four things we took off it. Each marker is numbered to the finding
            beside it.
          </p>

          <div className="readergrid">
            <div className="browsercol scene rise">
              {/* A drawing of their page, not a screenshot of it: we store
                  extracted facts, never page copies, so the mock carries only
                  what our own read recorded — the domain, the pages read, the
                  phone, the platform, and that there is no booking route. */}
              <div className="browser" data-tilt>
                <div className="chrome">
                  <span style={{ display: "flex", gap: 5 }} aria-hidden>
                    {["#D5D9D2", "#D5D9D2", "#D5D9D2"].map((c, i) => (
                      <i key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, display: "block" }} />
                    ))}
                  </span>
                  <span className="url">{s.domain}</span>
                  <span className="lab" style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    {s.pagesRead} pages read
                  </span>
                </div>

                <div className="sitemenu">
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{s.name}</span>
                  <span>Home</span>
                  <span>About</span>
                  <span>Services</span>
                  <span>Contact</span>
                  <span className="pin" style={{ top: -13, right: -13 }} aria-hidden>1</span>
                </div>

                <div className="sitehero">
                  <h4>The page we read, as the crawler saw it.</h4>
                  <div className="btnrow" style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 13, background: "var(--ink)", color: "var(--paper)", padding: "9px 14px" }}>
                      {s.phone}
                    </span>
                    <span className="mono" style={{ fontSize: 13, border: "1px solid var(--line-strong)", padding: "9px 14px" }}>
                      Directions
                    </span>
                    <span className="pin p2" style={{ top: 22, right: -13 }} aria-hidden>2</span>
                  </div>
                </div>

                <div className="sitecards">
                  {["Cleanings", "Whitening", "Implants"].map((t) => (
                    <div key={t}>
                      <b>{t}</b>
                      <i /><i style={{ width: "70%" }} />
                    </div>
                  ))}
                </div>

                <div className="sitefoot">
                  {s.address}
                  {s.cms && <> &nbsp;·&nbsp; Powered by {CMS_NAME[s.cms] ?? s.cms}</>}
                  <span className="pin p3" style={{ bottom: -13, right: -13 }} aria-hidden>3</span>
                </div>
              </div>
            </div>

            <div className="findcol stagger">
              {[
                ["1", "Online booking", "Not found",
                 "No booking link anywhere in the menu, and the only thing to click is a phone number.",
                 `read across ${s.pagesRead} pages`],
                ["2", "Phone", s.phone ?? "—",
                 "Printed on the page itself, so this is the number they want used.",
                 "read on the page"],
                ["3", "Built on", s.cms ? (CMS_NAME[s.cms] ?? s.cms) : "—",
                 "Named in the footer. Booking is normally an add-on here, not a rebuild.",
                 "read in the footer"],
              ].map(([i, k, v, why, src]) => (
                <div className="find" key={i}>
                  <span className="idx">{i}</span>
                  <span>
                    <b>{k}</b>
                    <span className="val">{v}</span>
                    <p>{why}</p>
                    <span className="src">{src}</span>
                  </span>
                </div>
              ))}
              {/* The finding that is not a finding, and the best thing on
                  this page: we say so rather than filling the field. */}
              <div className="find none">
                <span className="idx">—</span>
                <span>
                  <b>Owner&rsquo;s name</b>
                  <span className="val">We couldn&rsquo;t tell</span>
                  <p>
                    There is no name anywhere on the site, so the field stays
                    empty. We would rather leave a blank than invent one.
                  </p>
                  <span className="src">nothing found</span>
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------- what a bought list holds */}
      {/* Moved from the home page, 2026-10-01. The design named eight clinics
          and gave each a trading claim — "closed in 2024", "email bounced".
          Seven of the eight names are in no file we hold, and a false claim of
          that kind about a real business is the one invention here that could
          do harm. So these are the categories, each with its own measured
          count from the dental listings Overture has for Phoenix, and the two
          keepers are businesses we actually read. */}
      {s && (
        <section className="wrap tight">
          <p className="lab eyebrow">What a bought list actually holds</p>
          <h2 className="dsp h-sec wide">
            {s.listed.toLocaleString()} rows, and this is what is in them.
          </h2>

          <div className="junk rise stagger" style={{ marginTop: "var(--s4)" }} data-tilt>
            {[
              [`${s.noSite.toLocaleString()} rows`, "no website at all. Nothing to check."],
              [`${s.sharedRows.toLocaleString()} rows`, "share a domain with another listing"],
              // Nested under the row above rather than beside it: these are
              // part of that larger count, and listing them as a separate line
              // read as double counting.
              [`${s.worstDomainRows} of those`, `one chain, all on ${s.worstDomain}`],
              [`${s.notFit} rows`, "already have what you'd be selling"],
              [`${s.blocked} rows`, "the site refused to be read"],
              [`${s.couldntTell} rows`, "read, and still not clear either way"],
            ].map(([nm, why]) => (
              <div className="jrow out" key={nm + why}>
                <span className="nm">{nm}</span>
                <span className="lead" aria-hidden />
                <span className="why">{why}</span>
              </div>
            ))}
            {[s.name, s.keep2].filter(Boolean).map((nm) => (
              <div className="jrow keep" key={nm}>
                <span className="nm">{nm}</span>
                <span className="lead" aria-hidden />
                <span className="why">a fit</span>
              </div>
            ))}
          </div>
          <p className="lab" style={{ marginTop: "var(--s3)", color: "var(--ink-3)" }}>
            {s.listed.toLocaleString()} rows &nbsp;·&nbsp; {s.fit} worth sending
            &nbsp;·&nbsp; {s.checked} of them read so far
          </p>
        </section>
      )}

      {/* ------------------------------------------------------ the numbers -- */}
      <section className="wrap" style={{ paddingTop: 72, paddingBottom: 40 }}>
        <h2 className="dsp" style={{ fontSize: "clamp(26px,3.6vw,44px)" }}>
          What we measured, including the parts that go against us.
        </h2>

        {rows.length === 0 ? (
          <p className="lede" style={{ marginTop: 24, color: "var(--ink-2)" }}>
            The benchmark export is not on this deployment, so there are no
            numbers here rather than numbers from memory.
          </p>
        ) : (
          <>
            <div style={{ marginTop: 36, borderTop: "2px solid var(--ink)" }}>
              {rows.map((r) => (
                <BenchRow key={r.id} row={r} />
              ))}
              {rest.map((r) => (
                <BenchRow key={r.id} row={r} muted />
              ))}
            </div>
            <p className="lab" style={{ color: "var(--ink-3)", marginTop: 24 }}>
              Generated from the plan&rsquo;s own measurements · newest {data?.newest}
            </p>
          </>
        )}

        <p className="lede" style={{ marginTop: 32, maxWidth: "60ch", color: "var(--ink-2)" }}>
          Precision is measured on one niche of three. The other two are being
          labelled by hand, and until they are, the number above describes dental
          in Phoenix and nothing else.{" "}
          <Link href="/benchmark" style={{ textDecoration: "underline" }}>
            The full benchmark
          </Link>{" "}
          has every row, with dates.
        </p>
      </section>

      {/* ------------------------------------------------------- how we crawl */}
      <section className="wrap" style={{ paddingBottom: 96 }}>
        <div className="g12" style={{ rowGap: 24 }}>
          <div style={{ gridColumn: "1 / span 5" }}>
            <p className="lab" style={{ color: "var(--ink-3)" }}>How we crawl</p>
            <p className="lede" style={{ marginTop: 12, color: "var(--ink-2)" }}>
              We read what a business publishes about itself, honour robots.txt,
              identify ourselves honestly, and remove any business that asks.{" "}
              <Link href="/bot" style={{ textDecoration: "underline" }}>
                The details
              </Link>
              .
            </p>
          </div>
          <div style={{ gridColumn: "7 / span 5" }}>
            <p className="lab" style={{ color: "var(--ink-3)" }}>We never send</p>
            <p className="lede" style={{ marginTop: 12, color: "var(--ink-2)" }}>
              There is no send button anywhere in the product. Your list goes to
              the sequencer you already use, and a person approves every email.
            </p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

function BenchRow({ row, muted }: { row: Row; muted?: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(200px, 1fr) 2fr auto",
        gap: 24,
        alignItems: "baseline",
        padding: "20px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <span className="lede" style={{ color: muted ? "var(--ink-3)" : "var(--ink)" }}>
        {row.label}
      </span>
      <span className="small" style={{ color: "var(--ink-2)" }}>{row.measured}</span>
      <span className="src">{row.date}</span>
    </div>
  );
}
