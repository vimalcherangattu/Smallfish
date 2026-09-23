import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { templateLibrary } from "@/lib/templates";
import { MIN_PROVEN_MATCHES } from "@/lib/saturation";
import type { MarketIndex } from "@/lib/types";

/** The templates library (S2-01).
 *
 *  Three lists, and the second and third are the point. Anyone can publish the
 *  searches that work. Publishing the ones the detector exists for but nothing
 *  has been measured on, and the ones people ask for that we cannot settle at
 *  all, is what makes the first list worth believing. */

export const metadata = {
  title: "Search templates — Small Fish",
  description:
    "Searches you can start from, what each one asks of a website, and the ones we refuse because the engine cannot settle them.",
};

async function index(): Promise<MarketIndex | null> {
  try {
    const file = path.join(process.cwd(), "public", "data", "index.json");
    return JSON.parse(await readFile(file, "utf8")) as MarketIndex;
  } catch {
    return null;
  }
}

export default async function Templates() {
  const { published, unmeasured, refused } = templateLibrary(await index());

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[900px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 max-w-[19ch] text-[clamp(34px,5.4vw,60px)]">
          Searches you can start from.
        </h1>
        <p className="mt-8 max-w-[62ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Each template is one question put to a business&rsquo;s own website. The
          counts below are stored from the last time those markets were read, not
          a scan run for this page — crawlers visit far more often than buyers do,
          and a page that counts on demand would spend real money on every visit.
        </p>

        {/* ---- published ---- */}
        <h2 className="lab mt-16 text-[var(--ink-3)]">Proven, with counts</h2>
        <div className="mt-5 space-y-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)]">
          {published.map((t) => (
            <Link
              key={t.slug}
              href={`/templates/${t.slug}`}
              className="flex flex-wrap items-baseline gap-x-5 gap-y-1 bg-[var(--paper)] px-5 py-5 transition-colors hover:bg-[var(--paper-2)]"
            >
              <span className="mono text-[26px] leading-none">{t.matches}</span>
              <span className="flex-1 text-[16px] leading-snug">{t.title}</span>
              <span className="mono text-[12px] text-[var(--ink-3)]">
                {t.markets} {t.markets === 1 ? "market" : "markets"} read →
              </span>
            </Link>
          ))}
          {published.length === 0 && (
            <p className="bg-[var(--paper)] px-5 py-5 text-[15px] text-[var(--ink-2)]">
              No template has {MIN_PROVEN_MATCHES} proven matches behind it yet.
            </p>
          )}
        </div>

        {/* ---- runnable, unproven ---- */}
        <h2 className="lab mt-16 text-[var(--ink-3)]">
          The engine can run these; we have not measured a market for them
        </h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          The detector exists and the check is the same one above. What is missing
          is a market read against it, so there is no count to show and no page to
          send you to. You can still run them — you would be the first.
        </p>
        <ul className="mt-5 space-y-3">
          {unmeasured.map((t) => (
            <li key={`${t.signalId}-${t.polarity}`} className="border-l-2 border-[var(--line)] pl-4">
              <div className="text-[15px]">{t.title}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-[var(--ink-3)]">{t.how}</div>
            </li>
          ))}
        </ul>

        {/* ---- refused ---- */}
        <h2 className="lab mt-16 text-[var(--ink-3)]">Asked for, and refused</h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          These come up constantly and the engine cannot settle any of them today.
          They are listed rather than quietly left out, because an omission reads
          as &ldquo;we never thought of it&rdquo; and this is not that.
        </p>
        <ul className="mt-5 space-y-4">
          {refused.map((r) => (
            <li key={r.signalId} className="border-l-2 border-[var(--line)] pl-4">
              <div className="text-[15px]">{r.title}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-[var(--ink-3)]">{r.why}</div>
              <div className="mt-1 text-[13px] leading-snug text-[var(--ink-2)]">
                <span className="mono text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
                  would take ·{" "}
                </span>
                {r.wouldTake}
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-16 max-w-[62ch] border-t border-[var(--line)] pt-8 text-[15px] leading-relaxed text-[var(--ink-2)]">
          <strong className="font-semibold text-[var(--ink)]">
            These are a starting point, not the limit.
          </strong>{" "}
          A template exists because a cheap detector exists for it. Criteria with
          no detector — &ldquo;does commercial work&rdquo;, &ldquo;treats exotic
          pets&rdquo;, &ldquo;not part of a group&rdquo; — are read and judged the
          same way, just without the shortcut. Type your own on the search page.
        </p>

        <Link
          href="/app"
          className="mt-8 inline-block rounded-full bg-[var(--lure)] px-6 py-3 text-[14px] font-semibold text-[var(--ink)]"
        >
          Write your own criterion
        </Link>
      </div>
    </main>
  );
}
