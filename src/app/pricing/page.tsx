import Link from "next/link";
import { BackLink } from "@/components/MarketingChrome";
import BuyPlan from "@/components/BuyPlan";
import { BANDS, PLANS } from "@/lib/pricing";
import { UNLOCK_MONTHS } from "@/lib/ledger";

/** The pricing page (S1-08).
 *
 *  Every figure is read from `pricing.ts` and `ledger.ts` rather than typed
 *  here, so a page that says $29 buys 120 credits cannot drift from the code
 *  that grants them. The guardrails are on the page for the same reason the
 *  home page carries what the product does not do: a customer should meet the
 *  scan budget and the stop rule here, not the first time one fires. */
export const metadata = {
  title: "Pricing | Small Fish",
  description: `You only pay for the businesses that fit. The first ${
    PLANS.find((p) => p.id === "free")!.credits
  } are free, no card.`,
};

export default function Pricing() {
  const paid = PLANS.filter((p) => p.priceUsd > 0 && p.id !== "pack" && p.id !== "watch");
  const free = PLANS.find((p) => p.id === "free")!;
  const pack = PLANS.find((p) => p.id === "pack")!;
  // The heavier bands ("double or triple"), read from BANDS rather than typed.
  const times: Record<number, string> = { 2: "double", 3: "triple", 4: "four times over" };
  const heavier = BANDS.filter((b) => b.credits > 1)
    .map((b) => times[b.credits] ?? `${b.credits} times over`)
    .join(" or ");

  // 2026-10-07, owner: the old page ("the rules that decide what you are
  // charged", "why a match is banded rather than flat-priced") was "too
  // complex, too jargony, nobody cares, nobody understands". The guardrails
  // are still here, said the way a buyer would ask about them.
  const goodToKnow: [string, string][] = [
    ["Wrong match? It's refunded.", "One click. No form, no waiting."],
    [
      "Pay for a business once.",
      `If it turns up in another search, it's free to you for ${UNLOCK_MONTHS} months.`,
    ],
    [
      `Harder-to-find businesses count ${heavier}.`,
      "You see what a search will cost before it starts.",
    ],
    [
      "A search that finds nothing costs nothing.",
      "It stops on its own and tells you what to change.",
    ],
  ];

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        <BackLink />

        <h1 className="dsp mt-10 max-w-[18ch] text-[clamp(38px,6vw,72px)]">
          You only pay for the businesses that fit.
        </h1>
        <p className="mt-8 max-w-[52ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          The ones that don&rsquo;t fit cost nothing. Your first {free.credits} are
          free, no card.
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] md:grid-cols-4">
          {[free, ...paid].map((p) => (
            <div key={p.id} className="bg-[var(--paper)] p-7">
              <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
                {p.name}
              </div>
              <div className="mono mt-3 text-[30px] leading-none">
                ${p.priceUsd}
                {p.priceUsd > 0 && (
                  <span className="text-[13px] text-[var(--ink-3)]"> a month</span>
                )}
              </div>
              <div className="mt-3 text-[14px] text-[var(--ink-2)]">
                {p.priceUsd === 0
                  ? `${p.credits} businesses that fit`
                  : `Up to ${p.credits.toLocaleString()} businesses that fit`}
              </div>
              {p.priceUsd === 0 ? (
                <Link
                  href="/app"
                  className="mt-5 block rounded-full border border-[var(--line-strong)] px-4 py-2.5 text-center text-[13px] font-semibold"
                >
                  Start free
                </Link>
              ) : (
                <BuyPlan planId={p.id} name={p.name} />
              )}
            </div>
          ))}
        </div>

        <p className="mt-6 text-[14px] text-[var(--ink-3)]">
          No subscription? Get up to {pack.credits} for ${pack.priceUsd}, once.
        </p>

        <dl className="mt-20 grid gap-8 md:grid-cols-2">
          {goodToKnow.map(([t, d]) => (
            <div key={t}>
              <dt className="text-[17px] font-semibold text-[var(--ink)]">{t}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-[var(--ink-2)]">{d}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
