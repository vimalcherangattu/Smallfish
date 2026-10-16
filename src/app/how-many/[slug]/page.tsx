import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackLink } from "@/components/MarketingChrome";
import { MIN_LISTINGS, parseSlug, perTenThousand, share } from "@/lib/howmany";
import { countBySlug, countsForCity, countsForTrade } from "@/lib/howmanydata";

/**
 * "How many <trade> are in <city>?" (GTM, automated SEO/AEO).
 *
 * The answer is the first sentence, because that is what a search snippet or
 * an AI answer lifts. Everything below it is a number we counted: share with a
 * website, per 10,000 residents, and how the city ranks among the others we
 * counted for the same trade. A page renders only from its row.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const month = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const n = (x: number) => x.toLocaleString("en-US");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = parseSlug(slug) ? await countBySlug(slug) : null;
  if (!r) return { title: "Not found | Small Fish", robots: { index: false } };
  return {
    title: `How many ${r.label} are in ${r.city}, ${r.state}? (${new Date(r.computed_at).getFullYear()}) | Small Fish`,
    description: `${n(r.listings)} ${r.label} in ${r.city}, ${r.state}, ${n(r.with_site)} with a website. Counted from open business listings, ${month(r.computed_at)}.`,
    alternates: { canonical: `/how-many/${slug}` },
    robots: { index: r.listings >= MIN_LISTINGS, follow: true },
  };
}

export default async function HowMany({ params }: Props) {
  const { slug } = await params;
  const parsed = parseSlug(slug);
  const r = parsed ? await countBySlug(slug) : null;
  if (!r) notFound();

  const [sameTrade, sameCity] = await Promise.all([countsForTrade(r.trade), countsForCity(r.city, r.state)]);
  const density = perTenThousand(r.listings, r.pop);
  const ranked = sameTrade
    .map((x) => ({ ...x, d: perTenThousand(x.listings, x.pop) ?? 0 }))
    .sort((a, b) => b.d - a.d);
  const rank = ranked.findIndex((x) => x.slug === r.slug) + 1;
  const answer =
    `There are ${n(r.listings)} ${r.label} in ${r.city}, ${r.state}. ` +
    `${n(r.with_site)} of them (${share(r.with_site, r.listings)}%) have a website.`;

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How many ${r.label} are in ${r.city}, ${r.state}?`,
        acceptedAnswer: { "@type": "Answer", text: `${answer} Counted from open business listings in ${month(r.computed_at)}.` },
      },
    ],
  };

  return (
    <main className="mkt">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <div className="mx-auto max-w-[900px] px-6 py-16">
        <BackLink />
        <h1 className="dsp mt-10 max-w-[24ch] text-[clamp(32px,5vw,54px)]">
          How many {r.label} are in {r.city}, {r.state}?
        </h1>
        <p className="mt-6 max-w-[60ch] text-[19px] leading-relaxed">{answer}</p>

        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
          {[
            [n(r.listings), `${r.label} listed`],
            [`${share(r.with_site, r.listings)}%`, "have a website"],
            [density !== null ? String(density) : "n/a", "per 10,000 residents"],
          ].map(([big, small]) => (
            <div key={small} className="bg-[var(--paper)] p-6">
              <div className="mono text-[30px] leading-none">{big}</div>
              <div className="mt-2 text-[14px] text-[var(--ink-3)]">{small}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-[var(--line)] p-7">
          <div className="text-[18px] font-semibold">Selling to {r.label} in {r.city}?</div>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
            Small Fish reads each one&rsquo;s website and keeps the ones that fit what you sell, like
            &ldquo;no online booking&rdquo;, with a phone, an email and a one-line reason to reach out.
          </p>
          <Link
            href={`/app/find?source=${encodeURIComponent(`how-many/${slug}`)}`}
            className="mt-5 inline-block rounded-full bg-[var(--ink)] px-6 py-3 text-[15px] font-semibold text-[var(--paper)]"
          >
            Find the ones worth contacting →
          </Link>
        </div>

        {ranked.length > 2 && rank > 0 && (
          <>
            <h2 className="mt-14 text-[22px] font-semibold">How {r.city} compares</h2>
            <p className="mt-2 text-[15px] text-[var(--ink-2)]">
              {r.city} ranks {rank} of {ranked.length} cities we counted for {r.label} per resident.
            </p>
            <table className="mt-4 w-full text-[14px]">
              <thead className="text-left text-[var(--ink-3)]">
                <tr><th className="border-b border-[var(--line)] py-2">City</th><th className="border-b border-[var(--line)] py-2 text-right">{r.label}</th><th className="border-b border-[var(--line)] py-2 text-right">per 10,000</th></tr>
              </thead>
              <tbody>
                {ranked.slice(0, 12).map((x) => (
                  <tr key={x.slug} className={x.slug === r.slug ? "font-semibold" : ""}>
                    <td className="border-b border-[var(--line)] py-2">
                      {x.slug === r.slug ? `${x.city}, ${x.state}` : <Link href={`/how-many/${x.slug}`} className="underline">{x.city}, {x.state}</Link>}
                    </td>
                    <td className="mono border-b border-[var(--line)] py-2 text-right">{n(x.listings)}</td>
                    <td className="mono border-b border-[var(--line)] py-2 text-right">{x.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {sameCity.length > 1 && (
          <>
            <h2 className="mt-14 text-[22px] font-semibold">Other businesses in {r.city}</h2>
            <ul className="mt-4 grid gap-2 text-[15px] sm:grid-cols-2">
              {sameCity.filter((x) => x.slug !== r.slug).map((x) => (
                <li key={x.slug}>
                  <Link href={`/how-many/${x.slug}`} className="underline">{x.label}</Link>
                  <span className="text-[var(--ink-3)]">: {n(x.listings)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="mt-14 text-[18px] font-semibold">How we count</h2>
        <p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-[var(--ink-3)]">
          From the open Overture Maps business listings (release {r.release}), within {r.city}&rsquo;s
          boundary, counted in {month(r.computed_at)}. Listings data, not a census: a few may have closed or
          moved, and a business filed under another category is not included. Population is the city&rsquo;s
          own figure from the same release&rsquo;s boundaries.
        </p>
        <p className="mt-6 text-[14px]">
          <Link href="/how-many" className="underline">All trades and cities</Link>
        </p>
      </div>
    </main>
  );
}
