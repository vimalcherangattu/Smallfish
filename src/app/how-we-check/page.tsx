import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { MarketingFooter, MarketingNav } from "@/components/MarketingChrome";

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
