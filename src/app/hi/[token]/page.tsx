import Link from "next/link";
import { notFound } from "next/navigation";

import ProspectList from "@/components/ProspectList";
import { listByToken, listCriterion } from "@/lib/prospecting";
import { NICHES } from "@/lib/prospects";

/**
 * The page a cold email links to (GTM, outreach A2).
 *
 * An agency that serves a trade gets three real businesses in that trade, in
 * its own city, missing the thing the agency sells, with the proof off each
 * business's own site. Then one button into the product with the search
 * already typed. No demo, no call: the owner's decision of 2026-10-15 is that
 * the product sells itself or it does not.
 *
 * Not indexed. It names three businesses who did not ask to be in a search
 * result, the same rule `/list/[token]` follows.
 */

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your list | Small Fish",
  robots: { index: false, follow: false },
};

export default async function Hi({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await listByToken(token).catch(() => null);
  if (!p || !p.list_query) notFound();

  const niche = NICHES.find((n) => n.id === p.niche);
  const gap = listCriterion(p.niche)?.label ?? "it";
  const city = p.city ?? "your city";
  const count = p.list_readable ?? p.list_listings;
  const signUp = `/sign-up?${new URLSearchParams({ source: "outreach", q: p.list_query })}`;

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[860px] px-6 py-16">
        {p.name && (
          <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">For {p.name}</div>
        )}
        <h1 className="dsp mt-6 max-w-[22ch] text-[clamp(32px,5vw,56px)]">
          {count ? `${count.toLocaleString()} ` : ""}
          {niche?.label ?? "businesses"} in {city}. Here are some with no {gap}.
        </h1>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          We read each business&rsquo;s own website and kept only the ones that fit. Every row
          says how we know.
        </p>

        <ProspectList token={token} initial={p.list_rows} gap={gap} />

        <div className="mt-12 flex flex-wrap items-center gap-5">
          <Link
            href={signUp}
            className="rounded-full bg-[var(--ink)] px-6 py-3.5 text-[15px] font-semibold text-[var(--paper)]"
          >
            Get the full list free →
          </Link>
          <span className="text-[14px] text-[var(--ink-3)]">No card. You only pay for the ones that fit.</span>
        </div>

        <p className="mt-20 max-w-[60ch] text-[13px] leading-relaxed text-[var(--ink-3)]">
          You&rsquo;re seeing this because we wrote to {p.name ?? "you"}. Not for you? Reply
          &ldquo;no&rdquo; to the email and we won&rsquo;t write again.
        </p>
      </div>
    </main>
  );
}
