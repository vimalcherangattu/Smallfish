import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { templateLibrary, templateFor } from "@/lib/templates";
import type { MarketIndex } from "@/lib/types";

/** One template (S2-01).
 *
 *  Sister to `/find/[slug]`, and the difference is worth keeping straight. A
 *  `/find` page is a claim about one market: this many dental practices in
 *  Phoenix. A template page is a claim about a *check*: this is the question,
 *  this is how it is settled, and here is every market it has been run on. The
 *  per-market breakdown is the page's substance — an aggregate of 68 across two
 *  metros is a different thing from 68 in one, and the reader should not have to
 *  take the aggregate on trust. */

async function index(): Promise<MarketIndex | null> {
  try {
    const file = path.join(process.cwd(), "public", "data", "index.json");
    return JSON.parse(await readFile(file, "utf8")) as MarketIndex;
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const { published } = templateLibrary(await index());
  return published.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = templateFor(await index(), (await params).slug);
  if (!t) return {};
  return {
    title: `${t.title} — Small Fish`,
    description: `${t.matches} proven across ${t.markets} measured ${
      t.markets === 1 ? "market" : "markets"
    }. ${t.how}`,
  };
}

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = templateFor(await index(), (await params).slug);
  if (!t) notFound();

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[900px] px-6 py-16">
        <Link href="/templates" className="mono text-[13px] text-[var(--ink-3)]">
          ← All templates
        </Link>

        <h1 className="dsp mt-10 max-w-[18ch] text-[clamp(32px,5vw,58px)]">{t.title}</h1>

        <p className="mono mt-8 text-[42px] leading-none">{t.matches}</p>
        <p className="mt-3 max-w-[58ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
          proven matches across {t.markets} measured{" "}
          {t.markets === 1 ? "market" : "markets"}, each with the page we read and
          the sentence we found there. Stored from the last read of those markets,
          not a scan run for this page.
        </p>

        <div className="mt-14 grid gap-8 border-t border-[var(--line)] pt-10 sm:grid-cols-2">
          <div>
            <div className="lab text-[var(--ink-3)]">What we ask the site</div>
            <p className="mt-2 text-[16px] leading-relaxed">{t.question}</p>
          </div>
          <div>
            <div className="lab text-[var(--ink-3)]">How it is settled</div>
            <p className="mt-2 text-[16px] leading-relaxed">{t.how}</p>
          </div>
        </div>

        {t.polarity === "absence" && (
          <p className="mt-10 max-w-[62ch] rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-6 py-5 text-[15px] leading-relaxed text-[var(--ink-2)]">
            <strong className="font-semibold text-[var(--ink)]">
              A &ldquo;no&rdquo; here is a positive finding, not a missing one.
            </strong>{" "}
            This template only returns a business once the pages that would carry
            the signal have been read and none was found. Where those pages could
            not be read, the answer is &ldquo;couldn&rsquo;t tell&rdquo; — counted
            below, and never billed.
          </p>
        )}

        {t.uses.some((u) => u.derived) && (
          <p className="mt-10 max-w-[62ch] rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-6 py-5 text-[15px] leading-relaxed text-[var(--ink-2)]">
            <strong className="font-semibold text-[var(--ink)]">
              Where this count comes from.
            </strong>{" "}
            {t.derivedOnly ? "Every market below was" : "Some of the markets below were"}{" "}
            read for the opposite question, and one read settles both directions —
            a business ruled out of that criterion is a business proved into this
            one. Those rows are marked with the question that was actually put to
            the site. Nothing here was inferred from a business we did not read.
          </p>
        )}

        <h2 className="lab mt-16 text-[var(--ink-3)]">Every market this has been run on</h2>
        <div className="mt-5 overflow-hidden rounded-xl border border-[var(--line)]">
          <div className="grid grid-cols-[1.6fr_repeat(3,0.8fr)] gap-px bg-[var(--line)]">
            {["Market", "Proven", "Couldn't tell", "Read"].map((h) => (
              <div
                key={h}
                className="mono bg-[var(--paper-2)] px-4 py-3 text-[11px] uppercase tracking-wider text-[var(--ink-3)]"
              >
                {h}
              </div>
            ))}
            {t.uses.map((u) => (
              <Row key={u.marketId} use={u} />
            ))}
          </div>
        </div>

        <p className="mt-8 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          The couldn&rsquo;t-tell column is the honest one. Those are businesses
          whose sites were fetched and still did not settle the question — we do
          not guess them either way, and you are not charged for them.
        </p>

        {t.polarity === "absence" && (
          <p className="mt-12 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
            <span className="mono text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
              why it is worth a call ·{" "}
            </span>
            {t.consequence}. That is a likely consequence, not one we measured —
            we observed the gap, not its effect, and it is phrased so you can
            check it against the business in front of you.
          </p>
        )}

        <Link
          href="/app"
          className="mt-10 inline-block rounded-full bg-[var(--lure)] px-6 py-3 text-[14px] font-semibold text-[var(--ink)]"
        >
          Run this on your own area
        </Link>
      </div>
    </main>
  );
}

function Row({ use }: { use: import("@/lib/templates").TemplateUse }) {
  const cell = "bg-[var(--paper)] px-4 py-4 text-[14px]";
  return (
    <>
      <div className={cell}>
        {use.pageSlug ? (
          <Link href={`/find/${use.pageSlug}`} className="underline underline-offset-4">
            {use.niche.replace(/_/g, " ")} · {use.metro}
          </Link>
        ) : (
          <span>
            {use.niche.replace(/_/g, " ")} · {use.metro}
          </span>
        )}
        <div className="mt-0.5 text-[12px] text-[var(--ink-3)]">
          {use.derived ? "read as " : ""}&ldquo;{use.criterionText}&rdquo;
          {use.derived ? ", counted the other way" : ""}
        </div>
      </div>
      <div className={`${cell} mono`}>{use.matches}</div>
      <div className={`${cell} mono text-[var(--ink-3)]`}>{use.couldNotSettle}</div>
      <div className={`${cell} mono text-[var(--ink-3)]`}>{use.judged}</div>
    </>
  );
}
