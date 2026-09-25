import Link from "next/link";
import BuyPlan from "@/components/BuyPlan";
import { BANDS, COST_PER_READ, MAX_LOSS_PER_SCAN_USD, PLANS, READS_PER_CREDIT } from "@/lib/pricing";
import { NO_WEBSITE_UNLOCK, UNLOCK_MONTHS, credits } from "@/lib/ledger";

/** The pricing page (S1-08).
 *
 *  Every figure is read from `pricing.ts` and `ledger.ts` rather than typed
 *  here, so a page that says $29 buys 120 credits cannot drift from the code
 *  that grants them. The guardrails are on the page for the same reason the
 *  home page carries what the product does not do: a customer should meet the
 *  scan budget and the stop rule here, not the first time one fires. */
export const metadata = {
  title: "Small Fish — pricing",
  description: "You pay per matched business, at a rate shown before anything is spent.",
};

export default function Pricing() {
  const paid = PLANS.filter((p) => p.priceUsd > 0 && p.id !== "pack" && p.id !== "watch");
  const free = PLANS.find((p) => p.id === "free")!;
  const pack = PLANS.find((p) => p.id === "pack")!;

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 max-w-[18ch] text-[clamp(38px,6vw,72px)]">
          You pay for matches. Nothing else is billable.
        </h1>
        <p className="mt-8 max-w-[62ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          A match costs 1, 2 or 3 credits depending on how rare it is in your
          market. The rate is set from a free sample, from the cautious end of
          it, and shown before a scan starts — so it can only go down. Non-
          matches and the businesses we could not settle arrive as counts and
          reasons, free.
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] md:grid-cols-4">
          {[free, ...paid].map((p) => (
            <div key={p.id} className="bg-[var(--paper)] p-7">
              <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
                {p.name}
              </div>
              <div className="mono mt-3 text-[30px] leading-none">
                {p.priceUsd === 0 ? "Free" : `$${p.priceUsd}`}
              </div>
              <div className="mono mt-3 text-[13px] text-[var(--ink-2)]">
                {p.credits} credits
              </div>
              <div className="mt-2 text-[13px] leading-snug text-[var(--ink-3)]">
                {p.credits} common matches, or {Math.floor(p.credits / 3)} rare
                ones
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
          Also: a ${pack.priceUsd} pack of {pack.credits} credits with no
          subscription. Unused credits carry one month, capped at one month&rsquo;s
          allowance.
        </p>

        <h2 className="dsp mt-24 max-w-[22ch] text-[clamp(28px,3.6vw,44px)]">
          The rules that decide what you are charged.
        </h2>
        <dl className="mt-10 grid gap-8 md:grid-cols-2">
          {[
            ["A match is a business, not a listing",
             "Open data lists a practice more than once. Two listings of one business at one address are one match, and the row says how many listings it stands for."],
            [`Unlocked once, yours for ${UNLOCK_MONTHS} months`,
             "A business you have already paid for is free to your workspace for a year, however many searches return it."],
            ["A wrong match is refunded on the spot",
             "One click, no form, no review queue. It leaves your export too, because a row you have told us is wrong is not one you want in your outreach."],
            [`A business with no website costs ${credits(NO_WEBSITE_UNLOCK)} of a credit`,
             "There is no site to read, so nothing was proved — it is sold at a quarter rate rather than leaked for free."],
            [`Each credit carries ${READS_PER_CREDIT} reads`,
             "Charging only for matches means a criterion nothing satisfies would otherwise read a whole market for free. The budget is shown before a scan starts."],
            ["A hopeless scan stops itself",
             `If matches dry up, the scan stops and tells you what it read and what to change. That costs us at most $${MAX_LOSS_PER_SCAN_USD.toFixed(2)} and costs you nothing.`],
          ].map(([t, d]) => (
            <div key={t}>
              <dt className="text-[15px] font-semibold text-[var(--ink)]">{t}</dt>
              <dd className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                {d}
              </dd>
            </div>
          ))}
        </dl>

        <h2 className="dsp mt-24 max-w-[24ch] text-[clamp(28px,3.6vw,44px)]">
          Why a match is banded rather than flat-priced.
        </h2>
        <p className="mt-8 max-w-[64ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          Reading a business costs us about ${COST_PER_READ.toFixed(4)} and that
          barely varies. What varies is how many businesses must be read to find
          one that matches — measured across three markets, that swung 6.1×. A
          flat price has to be set against the worst market, so everyone in a
          good one overpays six times over and the pricing page has to keep
          quiet about it. Banding collapses that spread to 2.3× and lets the
          page say exactly this.
        </p>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
          {BANDS.map((b) => (
            <div key={b.label} className="bg-[var(--paper)] p-6">
              <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
                {b.label}
              </div>
              <div className="mono mt-2 text-[24px]">{b.credits}×</div>
              <div className="mt-2 text-[13px] text-[var(--ink-3)]">
                {b.minRate > 0
                  ? `${Math.round(b.minRate * 100)}%+ of the market matches`
                  : "under 6% matches"}
              </div>
            </div>
          ))}
        </div>

        <p className="mono mt-16 text-[12px] leading-relaxed text-[var(--ink-3)]">
          Payments are not switched on yet. Nothing on this page can be bought
          today — the plans and the credit rules are live in the product and
          tested, and the card step is the last thing left.
        </p>
      </div>
    </main>
  );
}
