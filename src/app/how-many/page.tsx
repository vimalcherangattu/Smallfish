import Link from "next/link";

import { BackLink } from "@/components/MarketingChrome";
import { TRADES } from "@/lib/howmany";
import { allCounts } from "@/lib/howmanydata";

/** The hub for the /how-many pages: every trade and city we have counted. */

export const dynamic = "force-dynamic";
export const metadata = {
  title: "How many local businesses are in each US city? | Small Fish",
  description:
    "Counts of dentists, plumbers, salons, restaurants and 26 other trades in the 50 largest US cities, with how many have a website. From open business listings.",
};

export default async function Hub() {
  const rows = await allCounts();
  const byTrade = new Map<string, typeof rows>();
  for (const r of rows) byTrade.set(r.trade, [...(byTrade.get(r.trade) ?? []), r]);
  return (
    <main className="mkt">
      <div className="mx-auto max-w-[1000px] px-6 py-16">
        <BackLink />
        <h1 className="dsp mt-10 max-w-[24ch] text-[clamp(32px,5vw,54px)]">How many local businesses are in each US city?</h1>
        <p className="mt-6 max-w-[60ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Counted from open business listings, with how many have a website. Updated monthly.
        </p>
        {TRADES.filter((t) => byTrade.has(t.id)).map((t) => (
          <section key={t.id} className="mt-10">
            <h2 className="text-[20px] font-semibold capitalize">{t.label}</h2>
            <p className="mt-2 text-[14px] leading-loose">
              {byTrade.get(t.id)!.map((r, i) => (
                <span key={r.slug}>
                  {i > 0 && " · "}
                  <Link href={`/how-many/${r.slug}`} className="underline">{r.city}, {r.state}</Link>
                </span>
              ))}
            </p>
          </section>
        ))}
        {!rows.length && <p className="mt-10 text-[15px] text-[var(--ink-3)]">The first counts are being made now.</p>}
      </div>
    </main>
  );
}
