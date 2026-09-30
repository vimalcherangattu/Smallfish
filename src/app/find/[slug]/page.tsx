import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { saturationSet, type Page as SatPage } from "@/lib/saturation";
import type { MarketIndex } from "@/lib/types";

/** Programmatic pages for the saturation set (S1-14).
 *
 *  Statically generated, and each one serves the count measured when the
 *  market was last read — never a scan per visitor. Crawlers visit far more
 *  than buyers do, and a page that counts on demand pays for a market read
 *  every time one arrives.
 *
 *  Each page carries the couldn't-tell and blocked counts beside the match
 *  count. That is not modesty: a page claiming 42 matches out of a market it
 *  read 166 of is making a different claim from one that read all of it, and
 *  the difference is exactly what a visitor needs to judge us by. */

async function index(): Promise<MarketIndex | null> {
  try {
    const file = path.join(process.cwd(), "public", "data", "index.json");
    return JSON.parse(await readFile(file, "utf8")) as MarketIndex;
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const { pages } = saturationSet(await index());
  return pages.map((p) => ({ slug: p.slug }));
}

async function pageFor(slug: string): Promise<SatPage | undefined> {
  const { pages } = saturationSet(await index());
  return pages.find((p) => p.slug === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await pageFor((await params).slug);
  if (!p) return {};
  return {
    title: `${p.headline} — Small Fish`,
    description: `${p.matches} ${p.niche} in ${p.metro} ${p.headline.split(" ").slice(-3).join(" ")}, each with the page we read and the words we found there.`,
  };
}

export default async function Programmatic({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const p = await pageFor((await params).slug);
  if (!p) notFound();

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[900px] px-6 py-16">
        <Link href="/" className="sf-tap mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 max-w-[18ch] text-[clamp(34px,5.4vw,64px)]">
          {p.headline}
        </h1>

        <p className="mono mt-8 text-[42px] leading-none">{p.matches}</p>
        <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-[var(--ink-2)]">
          proven matches, each with the page we read and the sentence we found
          there. This is a stored count from the last time we read this market,
          not a live scan.
        </p>

        <div className="mt-12 grid gap-8 border-t border-[var(--line)] pt-10 sm:grid-cols-3">
          <div>
            <div className="mono text-[22px]">{p.judged}</div>
            <div className="mt-1 text-[13px] leading-snug text-[var(--ink-3)]">
              businesses read and judged here
            </div>
          </div>
          <div>
            <div className="mono text-[22px]">{p.couldNotSettle}</div>
            <div className="mt-1 text-[13px] leading-snug text-[var(--ink-3)]">
              read, but the evidence did not settle it — counted against us, not
              hidden
            </div>
          </div>
          <div>
            <div className="mono text-[22px]">{p.blocked}</div>
            <div className="mt-1 text-[13px] leading-snug text-[var(--ink-3)]">
              sites that refuse automated reading, so we cannot say either way
            </div>
          </div>
        </div>

        <p className="mt-12 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          We do not claim to have read every {p.niche.replace(/s$/, "")} in{" "}
          {p.metro.split(",")[0]}. We claim that for the {p.matches} above, the
          pages that would carry a booking widget were read and none was found —
          which is the only thing that makes a &ldquo;no&rdquo; worth anything.
        </p>

        {/* This is a door, so it carries its market into sign-up like every
            other one. It used to point at a bare /app, which meant an SEO
            visitor arrived at an empty search box having just read a page about
            their exact market — and arrived unattributed, so the channel that
            brought them could not be counted. */}
        <Link
          href={`/sign-up?${new URLSearchParams({
            // `headline` is already the whole search phrase — "dental
            // practices in Phoenix with no online booking". Wrapping it in
            // "<niche> in <metro> that ..." produced "dental practices in
            // Phoenix that dental practices in Phoenix with no online booking",
            // which splitQuery would then have to make sense of.
            q: p.headline,
            market: p.marketId,
            criterion: p.criterionId,
            source: `find/${p.slug}`,
          }).toString()}`}
          className="mt-10 inline-block rounded-full bg-[var(--lure)] px-6 py-3 text-[14px] font-semibold text-[var(--ink)]"
        >
          See all {p.matches} — sign up free →
        </Link>
      </div>
    </main>
  );
}
