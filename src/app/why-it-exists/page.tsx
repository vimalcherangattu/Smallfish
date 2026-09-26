import Link from "next/link";

import { MarketingFooter, MarketingNav } from "@/components/MarketingChrome";
import { CTA_HREF, CTA_LABEL } from "@/lib/launch";

/**
 * Why it exists.
 *
 * The essayistic lines that led the home page until 2026-09-26 live here. The
 * copy's own verdict on them is the right one: "These are good writing and they
 * earn attention from someone already interested. They just aren't what a
 * first-time reader needs."
 *
 * So nothing is deleted, it is moved — and the page is written for the person
 * who has already understood what the product does and wants to know why it is
 * shaped this way.
 */

export const metadata = {
  title: "Why it exists — Small Fish",
  description:
    "The accounts the big nets can't read, why it stops at drafted, and why a " +
    "new market needs no code.",
};

export default function WhyItExists() {
  return (
    <main className="mkt" style={{ background: "var(--paper)" }}>
      <MarketingNav />

      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 72 }}>
        <h1 className="dsp" style={{ fontSize: "clamp(36px,6vw,88px)", maxWidth: "14ch" }}>
          The accounts the <span className="hilite">big nets</span> can&rsquo;t read.
        </h1>
        <p className="lede" style={{ marginTop: 32, maxWidth: "54ch", color: "var(--ink-2)", fontSize: 21 }}>
          Your market is a few thousand small businesses. Every scraper can list
          them. None of them opens the websites and works out which ones you
          should actually call.
        </p>
      </div>

      <section style={{ background: "#0E1520", color: "#EEF0EC" }}>
        <div className="wrap" style={{ paddingTop: 88, paddingBottom: 88 }}>
          <div className="g12" style={{ rowGap: 32 }}>
            <h2 className="dsp" style={{ gridColumn: "1 / span 10", fontSize: "clamp(32px,6vw,80px)" }}>
              It stops at drafted. It never sends.
            </h2>
            <p className="lede" style={{ gridColumn: "1 / span 5", color: "#B9BFB6" }}>
              Sending means domains, warmup, bounce handling and somebody&rsquo;s
              reputation. That is a different company, and it is where most tools
              in this category quietly fail their customers.
            </p>
            <p className="lede" style={{ gridColumn: "7 / span 5", color: "#B9BFB6" }}>
              Finished research goes into the sequencer you already use, and a
              person approves every email. Nothing we hand you was invented,
              which is also why these lists don&rsquo;t bounce.
            </p>
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <div className="g12" style={{ rowGap: 24 }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: "clamp(28px,4vw,52px)" }}>
            Anywhere the good accounts are too small to be in a database.
          </h2>
          <p className="lede" style={{ gridColumn: "9 / span 4", color: "var(--ink-2)" }}>
            What you are looking for is read off the page, so a new market needs
            no code and no catalogue — only businesses whose websites have enough
            on them to read.
          </p>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 96 }}>
        <div className="panel" style={{ maxWidth: "62ch" }}>
          <p className="lab" style={{ color: "var(--ink-3)" }}>The rule underneath all of it</p>
          <p className="cite" style={{ marginTop: 10 }}>
            A row you cannot defend is the thing this product exists not to ship.
          </p>
          <p className="small" style={{ marginTop: 14, color: "var(--ink-2)", lineHeight: 1.6 }}>
            Which is why a business we could not read comes back saying so rather
            than being guessed at, why every match carries the page it was read
            from, and why you are never charged for either.{" "}
            <Link href="/how-we-check" style={{ textDecoration: "underline" }}>
              How we check
            </Link>
            .
          </p>
        </div>

        <div style={{ marginTop: 48 }}>
          <Link className="cta" href={CTA_HREF}>{CTA_LABEL}</Link>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
