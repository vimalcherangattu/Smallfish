import Link from "next/link";
import { BANDS, PLANS, pricePerCredit } from "@/lib/pricing";

/** The home page (S1-19 groundwork).
 *
 *  **Built from `docs/design/home-page.html`'s visual language and voice, and
 *  deliberately not from its product shape.** `docs/design-system.md` §6 is
 *  explicit about the split: the composed page promises `{{score}}` and
 *  `{{tier}}` per account, weights you can move to re-rank, two meters for
 *  research and watching, and a weekly diff of accounts that changed. The
 *  engine computes none of those. It produces binary verdicts with a quoted
 *  sentence, and S1-07 alerts are not built.
 *
 *  Shipping those claims would be the one thing this product cannot afford:
 *  the home page is where a claim is loudest, and every principle here rests on
 *  not saying more than the evidence supports. So the type, colour, grid and
 *  voice are adopted wholesale — that is settled ground — and each headline
 *  number below is a measurement with a date behind it in `PROJECT_PLAN.md`.
 *
 *  Anything the engine cannot do yet is on the page as an absence with a
 *  reason, which is the same posture the product takes with a business it
 *  could not read. */

export const metadata = {
  title: "Small Fish — find local businesses by what their site actually says",
  description:
    "Every match carries the sentence that proves it. Non-matches cost nothing, " +
    "and the ones we could not settle say why.",
};

/* Measured. Source: PROJECT_PLAN.md, Live numbers, 2026-09-22/23. */
const MEASURED = {
  businesses: "2,464",
  markets: 3,
  positiveCalls: 41,
  falsePositives: 0,
  precisionLow: "91.4",
  proofValidity: "544 of 544",
  recall: "55.0",
  recallCeiling: "75",
  costPerRead: "$0.0168",
};

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="mono text-[34px] leading-none tracking-tight text-[var(--ink)]">
        {value}
      </div>
      <div className="mt-2 max-w-[22ch] text-[13px] leading-snug text-[var(--ink-3)]">
        {label}
      </div>
    </div>
  );
}

export default function Home() {
  const starter = PLANS.find((p) => p.id === "starter")!;

  return (
    <main className="home">
      {/* ---------------- Hero ---------------- */}
      <header className="mx-auto max-w-[1180px] px-6 pt-10">
        <div className="flex items-baseline justify-between gap-4">
          <span className="mono text-[13px] tracking-wide text-[var(--ink-2)]">
            Small Fish
          </span>
          <nav className="mono flex gap-5 text-[12px] text-[var(--ink-3)]">
            <a href="#proof">Proof</a>
            <a href="#price">Price</a>
            <Link href="/app">Open the demo</Link>
          </nav>
        </div>

        <h1 className="dsp mt-14 max-w-[16ch] text-[clamp(44px,8vw,96px)]">
          Every match carries the <span className="lure">sentence</span> that
          proves it.
        </h1>

        <p className="mt-8 max-w-[58ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Small Fish finds local businesses by what their websites actually say —
          not by a category tag. Ask for dental practices with no online booking
          and you get the practices, each with the page we read and the words we
          found there.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link
            href="/app"
            className="rounded-full bg-[var(--lure)] px-6 py-3 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--lure-hover)]"
          >
            Watch it read a real market
          </Link>
          <span className="mono text-[12px] text-[var(--ink-3)]">
            Measured data, no sign-up
          </span>
        </div>
      </header>

      {/* ---------------- The three commitments ---------------- */}
      <section className="mx-auto mt-28 max-w-[1180px] px-6">
        <h2 className="dsp max-w-[20ch] text-[clamp(32px,4.6vw,56px)]">
          It stops at drafted. It never sends.
        </h2>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          <div>
            <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
              We cite the sentence
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
              A verdict you cannot defend is the thing this product exists not to
              ship. Every match travels with the page it was read from, and every
              quote is checked back against that page before you see it.
            </p>
          </div>
          <div>
            <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
              We say when we don&rsquo;t know
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
              A site we could not read is <em>couldn&rsquo;t tell</em>, never{" "}
              <em>no</em>. Proving a business has no online booking means reading
              the pages that would carry it and finding nothing — anything less is
              a guess, and you are not charged for guesses.
            </p>
          </div>
          <div>
            <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
              We write, you send
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
              There is no send button anywhere in the product. Outreach drafts are
              built from observed evidence only, and when there is nothing honest
              to say about a business, the draft says so instead of inventing a
              reason to email them.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Measured ---------------- */}
      <section id="proof" className="mt-28 border-y border-[var(--line)] bg-[var(--paper-2)]">
        <div className="mx-auto max-w-[1180px] px-6 py-20">
          <h2 className="dsp max-w-[22ch] text-[clamp(30px,4vw,48px)]">
            The numbers on this page are measurements, not targets.
          </h2>
          <div className="mt-14 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            <Figure
              value={MEASURED.businesses}
              label={`businesses read and judged across ${MEASURED.markets} markets, on one engine`}
            />
            <Figure
              value={`${MEASURED.positiveCalls} / ${MEASURED.falsePositives}`}
              label={`matches called, false positives found — precision 100%, lower bound ${MEASURED.precisionLow}%`}
            />
            <Figure
              value={MEASURED.proofValidity}
              label="quotes verified verbatim on the page they were taken from"
            />
            <Figure
              value={`${MEASURED.recall}%`}
              label={`of true matches delivered. The ceiling with today's crawl is ${MEASURED.recallCeiling}% — the rest are sites that block us`}
            />
          </div>

          <p className="mt-14 max-w-[70ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
            That last figure is the uncomfortable one, and it is here on purpose.
            Just over half of the businesses that genuinely match are reaching
            you today; a quarter of the remainder are sites that refuse automated
            reading at all. We would rather show you the gap than average it away
            — the whole method collapses the moment a number on this page stops
            being checkable.
          </p>
          <p className="mono mt-6 text-[12px] text-[var(--ink-3)]">
            Method and per-niche results: PROJECT_PLAN.md · every figure carries
            the date it was measured
          </p>
        </div>
      </section>

      {/* ---------------- Pricing ---------------- */}
      <section id="price" className="mx-auto mt-28 max-w-[1180px] px-6">
        <h2 className="dsp max-w-[20ch] text-[clamp(32px,4.6vw,56px)]">
          You pay for matches. Nothing else is billable.
        </h2>
        <p className="mt-8 max-w-[62ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Non-matches and the ones we could not settle arrive as counts and
          reasons, free. What a match costs depends on how rare it is in your
          market, and the rate is shown before a scan starts — from the cautious
          end of a free sample, so it can only go down.
        </p>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
          {BANDS.map((b) => (
            <div key={b.label} className="bg-[var(--paper)] p-7">
              <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
                {b.label}
              </div>
              <div className="mono mt-3 text-[28px] leading-none">
                {b.credits} credit{b.credits === 1 ? "" : "s"}
              </div>
              <div className="mt-3 text-[13px] leading-snug text-[var(--ink-3)]">
                per match, when{" "}
                {b.minRate > 0
                  ? `${Math.round(b.minRate * 100)}% or more of a market matches`
                  : "matches are rarer than 6%"}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-[62ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          On {starter.name}, ${starter.priceUsd} buys {starter.credits} credits —{" "}
          {starter.credits} common matches, or {Math.floor(starter.credits / 3)}{" "}
          rare ones. A scan that turns out not to be worth running stops itself
          and tells you what it read, and a match you tell us is wrong is
          refunded on the spot.
        </p>
      </section>

      {/* ---------------- What it does not do ---------------- */}
      <section className="mx-auto mt-28 max-w-[1180px] px-6 pb-28">
        <h2 className="dsp max-w-[18ch] text-[clamp(30px,4vw,48px)]">
          What it does not do, so you find out here rather than later.
        </h2>
        <ul className="mt-12 grid gap-8 md:grid-cols-2">
          {[
            [
              "No scores, no tiers, no weights",
              "A business either matches a criterion with evidence, or it does not, or we could not tell. A 0–100 score would be a number nobody could check, and there is no measurement behind it.",
            ],
            [
              "No alerts yet",
              "Watching a market for change is designed and not built. The weekly change rate it would cost is still being measured, and pricing something unmeasured is how subscriptions quietly lose money.",
            ],
            [
              "No scraped Google Maps data",
              "Candidates come from Overture Maps, an open dataset, with Google Places used only to fill gaps and only to store place IDs. Scraping Maps breaks Google's terms; that it is technically easy does not make it available to us.",
            ],
            [
              "No guessed contacts",
              "Published contacts only, each with the page it was read from. Where a listing's website turns out to be a chain page or another company's site entirely, the contact is withheld with the reason rather than attributed to someone it does not belong to.",
            ],
          ].map(([title, body]) => (
            <li key={title}>
              <div className="text-[15px] font-semibold text-[var(--ink)]">{title}</div>
              <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                {body}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-20 border-t border-[var(--line)] pt-14">
          <h2 className="dsp max-w-[16ch] text-[clamp(34px,5.4vw,72px)]">
            Point it at your market.
          </h2>
          <Link
            href="/app"
            className="mt-9 inline-block rounded-full bg-[var(--ink)] px-7 py-3.5 text-[14px] font-semibold text-[var(--paper)]"
          >
            Open the demo
          </Link>
          <p className="mono mt-6 text-[12px] text-[var(--ink-3)]">
            Four measured markets · real businesses from Overture Maps · no model
            runs in the demo
          </p>
        </div>
      </section>
    </main>
  );
}
