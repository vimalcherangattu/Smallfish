import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** The published benchmark (S2-04).
 *
 *  Every number on this page comes from `public/data/benchmark.json`, which is
 *  generated from the Live numbers table in `PROJECT_PLAN.md` by
 *  `stage0/src/benchmark/export_benchmark.py`. Nothing is typed here, because
 *  the failure mode for a page like this is not a wrong number — it is a number
 *  that was right once. A stale figure looks identical to a fresh one, and the
 *  only defence is that the page physically cannot carry one.
 *
 *  The order below is deliberate. The two rows that undercut the headline —
 *  the run-to-run noise floor and the wrong-website ceiling — are above the
 *  fold rather than in a footnote, because a reader who finds them later is
 *  right to wonder what else was moved down the page. */

export const metadata = {
  title: "The benchmark — Small Fish",
  description:
    "Precision, recall, couldn't-tell and cost, measured rather than claimed — including the numbers that undercut the headline.",
};

type Row = { id: string; label: string; metric: string; target: string; measured: string; date: string };
type Benchmark = {
  oldest: string | null;
  newest: string | null;
  rows: Row[];
  notYetMeasured: string[];
};

async function benchmark(): Promise<Benchmark | null> {
  try {
    const file = path.join(process.cwd(), "public", "data", "benchmark.json");
    return JSON.parse(await readFile(file, "utf8")) as Benchmark;
  } catch {
    return null;
  }
}

/** The headline number, and the number it should be read against. */
const HEADLINE = ["precision", "recall", "couldnt_tell", "cost_per_credit"];
const CAVEAT = ["noise_floor", "wrong_website", "recall_ceiling", "genuine_couldnt_tell"];
const REST = ["precision_absence", "proof_validity", "cost_cold", "coverage", "settled_no_model"];

export default async function Benchmark() {
  const data = await benchmark();

  if (!data) {
    return (
      <main className="mkt">
        <div className="mx-auto max-w-[900px] px-6 py-16">
          <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
            ← Small Fish
          </Link>
          <h1 className="dsp mt-10 text-[clamp(32px,5vw,58px)]">
            The benchmark data did not build.
          </h1>
          <p className="mt-6 max-w-[58ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
            Rather than show numbers from somewhere else. Run{" "}
            <code className="mono text-[14px]">
              python3 stage0/src/benchmark/export_benchmark.py
            </code>
            .
          </p>
        </div>
      </main>
    );
  }

  const by = new Map(data.rows.map((r) => [r.id, r]));
  const group = (ids: string[]) => ids.map((id) => by.get(id)).filter(Boolean) as Row[];

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[900px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 max-w-[17ch] text-[clamp(34px,5.4vw,60px)]">
          What this actually gets right, and how we know.
        </h1>
        <p className="mt-8 max-w-[62ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Every figure here is measured against businesses a person labelled by
          hand, without seeing what the engine said. None of it is generated from
          this page — it is read from the same table the plan is run off, so a
          number here cannot be newer or older than the number we work from.
        </p>
        <p className="mono mt-5 text-[12px] text-[var(--ink-3)]">
          measured between {data.oldest} and {data.newest}
        </p>

        <Band title="The four numbers that matter" rows={group(HEADLINE)} />

        <h2 className="lab mt-16 text-[var(--ink-3)]">
          And the four that should be read next to them
        </h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          A benchmark page that only lists what went well is marketing wearing a
          lab coat. These are the measurements that limit the ones above, and
          they are here rather than in a footnote.
        </p>
        <Table rows={group(CAVEAT)} />

        <div className="mt-10 max-w-[64ch] space-y-5 rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-6 py-6 text-[15px] leading-relaxed text-[var(--ink-2)]">
          <p>
            <strong className="font-semibold text-[var(--ink)]">
              Precision is proven on one niche of three.
            </strong>{" "}
            The labelled set is dental. Med spa and HVAC are not labelled yet, so
            the figure above is not a cross-niche claim and is not used as one.
            The gate in our own plan wants all three before we buy traffic
            against an accuracy claim.
          </p>
          <p>
            <strong className="font-semibold text-[var(--ink)]">
              Two identical runs disagreed with each other.
            </strong>{" "}
            Same code, same frozen corpus, same labels — and precision came back
            different, by the margin in the noise-floor row above. That spread is
            wider than the gap between the models we tested, which means no
            engine change smaller than it can honestly be called an improvement.
            It is why every rate on this page is an interval.
          </p>
          <p>
            <strong className="font-semibold text-[var(--ink)]">
              Some source records point at the wrong website.
            </strong>{" "}
            The share is in the row above, and it is a hard ceiling on precision
            that no amount of better reading fixes. It is ours to carry, not the
            business&rsquo;s.
          </p>
        </div>

        <h2 className="lab mt-16 text-[var(--ink-3)]">The rest of the measurements</h2>
        <Table rows={group(REST)} />

        <h2 className="lab mt-16 text-[var(--ink-3)]">Targets with no number yet</h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          Published so that the list above cannot read as complete. Each of these
          has a target in the plan and no measurement behind it.
        </p>
        <ul className="mt-4 space-y-2">
          {data.notYetMeasured.map((m) => (
            <li key={m} className="border-l-2 border-[var(--line)] pl-4 text-[15px]">
              {m}
            </li>
          ))}
        </ul>

        <h2 className="lab mt-16 text-[var(--ink-3)]">How it is measured</h2>
        <ol className="mt-4 max-w-[64ch] space-y-4 text-[15px] leading-relaxed text-[var(--ink-2)]">
          <li>
            <span className="mono text-[13px] text-[var(--ink-3)]">1 · </span>A
            market is drawn from open data, deduplicated, and read with a polite
            crawler that honours robots.txt and identifies itself.
          </li>
          <li>
            <span className="mono text-[13px] text-[var(--ink-3)]">2 · </span>A
            sample is labelled by hand <em>with the engine&rsquo;s verdict
            withheld</em>. A labeller who can see &ldquo;the engine said
            match&rdquo; agrees with it more often, which inflates the very number
            the benchmark exists to test.
          </li>
          <li>
            <span className="mono text-[13px] text-[var(--ink-3)]">3 · </span>
            Every match carries a quote, and the quote is checked against the
            fetched text character by character. A verdict whose proof is not
            found verbatim is a failure whether or not the verdict was right.
          </li>
          <li>
            <span className="mono text-[13px] text-[var(--ink-3)]">4 · </span>Our
            own failures — proxy errors, timeouts, network faults — are excluded
            from every rate rather than counted against the business. A site we
            could not reach is our problem, not evidence about them.
          </li>
          <li>
            <span className="mono text-[13px] text-[var(--ink-3)]">5 · </span>
            Rates are reported as intervals. A sample of 41 does not support a
            point estimate, and the noise floor above is why.
          </li>
        </ol>

        <p className="mt-12 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          When a measurement contradicts something we said earlier, the
          retraction is written down next to the original. There are several.
        </p>

        <Link
          href="/templates"
          className="mt-10 inline-block rounded-full bg-[var(--lure)] px-6 py-3 text-[14px] font-semibold text-[var(--ink)]"
        >
          See what it can find
        </Link>
      </div>
    </main>
  );
}

/** The target and the date. A plan row whose target cell is "—" has no target
 *  — it is a diagnostic we track, not a bar we set — and printing "target —"
 *  makes it look like a bar we forgot to fill in. */
function Stamp({ row }: { row: Row }) {
  const target = ["—", "-", "", "measure"].includes(row.target)
    ? "no target — tracked, not gated"
    : `target ${row.target}`;
  return (
    <div className="mono mt-3 text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
      {target} · {row.date}
    </div>
  );
}

function Band({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <>
      <h2 className="lab mt-16 text-[var(--ink-3)]">{title}</h2>
      <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="bg-[var(--paper)] px-6 py-6">
            <div className="text-[14px] leading-snug text-[var(--ink-3)]">{r.label}</div>
            <div className="mono mt-2 text-[15px] leading-relaxed">{r.measured}</div>
            <Stamp row={r} />
          </div>
        ))}
      </div>
    </>
  );
}

function Table({ rows }: { rows: Row[] }) {
  return (
    <div className="mt-5 space-y-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)]">
      {rows.map((r) => (
        <div key={r.id} className="bg-[var(--paper)] px-5 py-5">
          <div className="text-[15px] leading-snug">{r.label}</div>
          <div className="mono mt-1.5 text-[14px] leading-relaxed text-[var(--ink-2)]">
            {r.measured}
          </div>
          <Stamp row={r} />
        </div>
      ))}
    </div>
  );
}
