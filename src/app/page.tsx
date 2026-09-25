import Link from "next/link";
import Bubbles from "@/components/Bubbles";
import Fish from "@/components/Fish";
import HeroSearch from "@/components/HeroSearch";
import { BANDS, PLANS, SAMPLE_SIZE } from "@/lib/pricing";

/**
 * The marketing home page.
 *
 * **The layout is replicated from `Small_Fish_Marketing_Site/Home.dc.html`; the
 * copy is not.** That split is deliberate and it is the same one
 * `docs/design-system.md` §6 draws: the design is settled ground, the product
 * shape in it is not.
 *
 * ## Rewritten 2026-09-25, to a brief, and where the brief was not followed
 *
 * The brief's diagnosis is right and is the reason for every change below: the
 * page sold an epistemology to a buyer who came shopping for leads. Matches
 * come before what we could not read, the buyer's own nouns replace ours, and
 * the honesty is stated once with its billing consequence rather than four
 * times as a virtue.
 *
 * Four of its numbers are not published here, because the repository cannot
 * support them and this is the page where a claim is loudest:
 *
 *   brief                                 | measured, and used instead
 *   --------------------------------------|--------------------------------------
 *   "212 med spas in Dallas, 212 of 612"  | 26 matched of 145 settled, 200 read
 *   "41 matches across three markets"     | 41 calls, dental in Phoenix alone
 *   "544 of 544 quotes verified"          | 100% (11 of 11 model verdicts)
 *   "~$0.02 a row" for a bought list      | dropped — not a figure we measured
 *
 * The third of those was **already live on this page and was never measured**.
 * `544` appears nowhere in `PROJECT_PLAN.md`, in the coverage report or in
 * `benchmark.json`. It is exactly the kind of number this product exists to
 * refuse, and it was on the page arguing for that.
 *
 * The brief's hero also asks for a cold custom read — any niche, any city,
 * about a minute. `HeroSearch` explains why that is not what ships today.
 *
 * Every number below is read from the code that implements it or carries a date
 * in `PROJECT_PLAN.md`.
 */

export const metadata = {
  title: "Small Fish — find local businesses by what they actually do",
  description:
    "Tell us what you sell and where. We read every business's website and return " +
    "only the ones that fit, each with the line that proves it. Free to try, no sign-up.",
  openGraph: {
    title: "42 dental practices in Phoenix you could call today.",
    description:
      "Small Fish reads local businesses' own websites and hands you only the ones " +
      "worth calling — with the sentence that proves each one.",
  },
};

/* Measured. PROJECT_PLAN.md · Live numbers · 2026-09-22/23, and the tallies in
   public/data/index.json, which is generated from the same runs. */
const DENTAL = { read: 166, matched: 42, noMatch: 51, couldntRead: 73 };
const PROOF = { calls: 41, falsePositives: 0, low: "91.4", quotes: "11 of 11" };
/** The couldn't-tell floor across the three measured markets: 40.6 / 39.6 /
 *  43.1 per docs/stage0-coverage-report.md §2. "About four in ten" is the
 *  honest rounding of that spread, and it is said exactly once on this page. */
const UNREADABLE = "about four in ten";

export default function Home() {
  const paid = PLANS.filter((p) => ["starter", "growth", "agency"].includes(p.id));
  const free = PLANS.find((p) => p.id === "free")!;
  const starter = PLANS.find((p) => p.id === "starter")!;
  /* $29 / 120 credits = $0.242. A common match is one credit, so this is what a
     match costs on the cheapest paid plan — computed, never typed. */
  const perMatch = (starter.priceUsd / starter.credits).toFixed(2).replace(/^0/, "");

  return (
    <main className="mkt">
      {/* ===================== 1 · hero, with the search ===================== */}
      <div style={{ background: "#0E1520", color: "#EEF0EC", position: "relative", overflow: "hidden" }}>
        <nav className="mx-auto flex max-w-[1340px] items-center justify-between px-8 py-6">
          <span className="flex items-center gap-2.5">
            <Fish width={30} />
            <span className="text-[15px] font-medium">small fish</span>
          </span>
          <div className="flex items-center gap-8">
            {/* Every label says what happens, in the visitor's words. "Why it
                exists" was a question nobody asks before "how does it work". */}
            <a href="#search" className="navlink hidden sm:inline">Run a search</a>
            <a href="#how" className="navlink hidden sm:inline">How it works</a>
            <Link href="/templates" className="navlink hidden sm:inline">Templates</Link>
            <Link href="/benchmark" className="navlink hidden sm:inline">How accurate</Link>
            <Link href="/pricing" className="navlink hidden sm:inline">Pricing</Link>
            {/* Quiet, and deliberately so. This page's argument is that the
                free count needs no account; a loud "Sign up" beside it would
                contradict the thing it is trying to prove. */}
            <Link href="/account" className="navlink hidden sm:inline">Sign in</Link>
            <Link
              href="#search"
              className="rounded-full bg-[#C8F03C] px-4 py-2 text-[13px] font-medium text-[#0E1520]"
            >
              Run your market →
            </Link>
          </div>
        </nav>

        <div aria-hidden className="hero-fish swim">
          <Fish variant="outline" width={720} strokeWidth={0.32} />
          <Bubbles where="hero" />
        </div>

        <header id="search" className="relative z-10 mx-auto max-w-[1340px] px-8 pb-20 pt-14">
          <span className="lab" style={{ color: "#5B6470" }}>
            For people who sell to local businesses
          </span>
          <h1
            // `pb-[0.1em]`: line-height 0.92 puts the box bottom above the
            // descenders, so a margin measured from it reads smaller than it is.
            className="dsp mt-8 pb-[0.1em] max-w-[min(100%,900px)]"
            style={{ fontSize: "clamp(40px,6.6vw,104px)" }}
          >
            Find the local businesses{" "}
            <span className="lure whitespace-nowrap">worth calling</span>.
          </h1>
          {/* The `.lure` span carries padding and a box-shadow, so it sits
              lower than its line box; the lede needs more clearance than the
              usual rhythm or the two touch. */}
          <p className="lede mt-14 max-w-[52ch]" style={{ color: "#B9BFB6" }}>
            Tell us what you sell and where. We read every business&rsquo;s own
            website and hand back only the ones that fit — each with the line
            that proves it.
          </p>

          <HeroSearch />
        </header>

        {/* The ticker, cut from four phrases to three. It sits under a search
            box now, so it has to be scannable in one pass rather than read. */}
        <div className="border-y border-[#26303C] py-3">
          <div className="mq lab" style={{ color: "#5B6470" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i}>
                READ THE SITE&nbsp;&nbsp;·&nbsp;&nbsp;SHOW THE LINE&nbsp;&nbsp;·&nbsp;&nbsp;CHARGE
                FOR MATCHES ONLY&nbsp;&nbsp;·&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ======================== 2 · who this is for ======================== */}
      <section className="mx-auto max-w-[1340px] px-8 py-24">
        <span className="lab" style={{ color: "var(--ink-3)" }}>Who uses it</span>
        <h2 className="dsp mt-6 max-w-[20ch]" style={{ fontSize: "clamp(32px,4.6vw,56px)" }}>
          If you sell to clinics, spas or trades, this is your list.
        </h2>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "You sell AI receptionists and booking",
              body: "Your pitch only lands where the phone is still the front desk. Find the ones that never moved online.",
              eg: "Med spas in Dallas that don’t take bookings online",
              href: "/app?market=med-spa-dallas&criterion=no_online_booking",
            },
            {
              title: "You sell websites, SEO and ads",
              body: "You need the businesses whose site is the problem you fix, not every business in town.",
              eg: "HVAC companies in Tampa with no online quote form",
              href: "/app?market=hvac-tampa&criterion=no_quote_form",
            },
            {
              title: "You sell software to one industry",
              body: "Your market is a few thousand independents that no database describes properly.",
              eg: "Dental practices in Phoenix that don’t take bookings online",
              href: "/app?market=dental-phoenix&criterion=no_online_booking",
            },
          ].map((c) => (
            <Link key={c.title} href={c.href} className="card lift block p-7">
              <p className="dsp" style={{ fontSize: 24 }}>{c.title}</p>
              <p className="lede mt-4" style={{ color: "var(--ink-2)" }}>{c.body}</p>
              <p className="mono mt-6 text-[12px]" style={{ color: "var(--lure-text)" }}>
                {c.eg} →
              </p>
            </Link>
          ))}
        </div>

        <p className="lede mt-10 max-w-[60ch]" style={{ color: "var(--ink-2)" }}>
          Those three are read in full today. Any local business with a website
          works the same way — the thing you are looking for is read on the page,
          so nothing has to be built for a new market — but we have not read them
          yet, and a list of verticals we have not touched would be a claim
          rather than a fact.
        </p>
      </section>

      {/* ========================= 3 · one real result ========================= */}
      <section className="mx-auto max-w-[1340px] px-8 pb-24">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <span className="lab" style={{ color: "var(--ink-3)" }}>
              A real read · dental · Phoenix
            </span>
            <h2 className="dsp mt-6" style={{ fontSize: "clamp(34px,4.6vw,58px)" }}>
              {DENTAL.matched} practices you could call today.
            </h2>
            <p className="lede mt-6 max-w-[48ch]" style={{ color: "var(--ink-2)" }}>
              We read {DENTAL.read} dental websites in Phoenix.{" "}
              {DENTAL.matched} matched, {DENTAL.noMatch} clearly didn&rsquo;t, and{" "}
              {DENTAL.couldntRead} we couldn&rsquo;t read well enough to say — and
              you&rsquo;d pay for none of those {DENTAL.noMatch + DENTAL.couldntRead}.
            </p>
            <Link
              href="/app?market=dental-phoenix&criterion=no_online_booking"
              className="cta mt-10"
            >
              See all {DENTAL.matched}, and the {DENTAL.couldntRead} we couldn&rsquo;t read
              <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="relative">
            <div className="card lift tilt-l p-6">
              <div className="flex items-center justify-between">
                <span className="lab" style={{ color: "var(--ink-3)" }}>A match</span>
                <span className="lab" style={{ color: "var(--lure-text)" }}>
                  {DENTAL.read} sites read
                </span>
              </div>
              <p className="dsp mt-5" style={{ fontSize: 30 }}>
                Maplewick Family Dental
              </p>
              <p className="cite mt-4">
                <span className="mark">
                  3 relevant pages read via technology detection; no sign of it
                </span>
              </p>
              <p className="mono mt-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
                maplewickdental.com/contact · read 2026-09-22
              </p>
            </div>

            <div className="card lift tilt-r mt-6 p-6">
              <span className="lab" style={{ color: "var(--ink-3)" }}>
                When we can&rsquo;t tell, we say so
              </span>
              <p className="cite mt-4">
                &ldquo;This site blocks automated reading, so we cannot say
                either way.&rdquo;
              </p>
              <p className="mono mt-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
                never billed · never exported
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================== 4 · how it works =========================== */}
      <section id="how" style={{ background: "#0E1520", color: "#EEF0EC" }}>
        <div className="mx-auto max-w-[1340px] px-8 py-24">
          <span className="lab" style={{ color: "#5B6470" }}>How it works</span>
          <h2 className="dsp mt-6" style={{ fontSize: "clamp(34px,5vw,64px)" }}>
            Three steps, about a minute.
          </h2>

          <div className="mt-16 grid gap-10 md:grid-cols-3">
            {[
              [
                "Say what you're looking for",
                "A niche, a city, and the one thing that decides fit. Plain English, no filters to learn.",
              ],
              [
                "See the count before you spend",
                `We read a sample of ${SAMPLE_SIZE} and tell you how many match, with three examples in full. Free, every time.`,
              ],
              [
                "Unlock only the matches",
                "Names, contact details and the proof line for each. Everything else costs nothing.",
              ],
            ].map(([t, d], i) => (
              <div key={t}>
                <span className="mono text-[13px]" style={{ color: "#C8F03C" }}>
                  {i + 1}
                </span>
                <p className="dsp mt-3" style={{ fontSize: 26 }}>{t}</p>
                <p className="lede mt-4" style={{ color: "#B9BFB6" }}>{d}</p>
              </div>
            ))}
          </div>

          <p className="mono mt-14 text-[13px]" style={{ color: "#5B6470" }}>
            No filters to build · no table to maintain · nothing to install
          </p>
        </div>
      </section>

      {/* ===================== 5 · what you walk away with ===================== */}
      <section className="mx-auto max-w-[1340px] px-8 py-24">
        <span className="lab" style={{ color: "var(--ink-3)" }}>What you get</span>
        <h2 className="dsp mt-6" style={{ fontSize: "clamp(32px,4.6vw,56px)" }}>
          A list you can send from on Monday.
        </h2>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              "The businesses",
              "Name, website, phone, and any email or contact form the business publishes on its own site. Nothing guessed from a domain.",
            ],
            [
              "The proof line",
              "The sentence and the page behind every match, ready to quote in your first email.",
            ],
            [
              "Straight into your tools",
              "A CSV with the proof column, or pushed into HubSpot, Instantly or Smartlead.",
            ],
            [
              // Not "new ones as they appear". Change alerts are written
              // (`src/lib/alerts.ts`) and their budget rests on a change rate
              // nobody has measured yet, so the page does not promise them.
              "What we couldn't read",
              "The ones we couldn't judge, as counts and reasons, so you can open those yourself. They cost nothing.",
            ],
          ].map(([t, d]) => (
            <div key={t} className="card p-7">
              <p className="dsp" style={{ fontSize: 22 }}>{t}</p>
              <p className="lede mt-4" style={{ color: "var(--ink-2)" }}>{d}</p>
            </div>
          ))}
        </div>

        <p className="mono mt-8 text-[13px]" style={{ color: "var(--ink-3)" }}>
          Your list lands in the sequencer you already use. There&rsquo;s no send
          button here, on purpose.
        </p>
      </section>

      {/* ====================== 6 · when we can't tell ====================== */}
      {/* The 40% used to appear four times on this page, each time as a virtue.
          Once, with the billing consequence attached, is the whole of it. */}
      <section className="mx-auto max-w-[1340px] px-8 pb-24">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="lab" style={{ color: "var(--ink-3)" }}>The honest part</span>
            <h2 className="dsp mt-6 max-w-[18ch]" style={{ fontSize: "clamp(30px,4.2vw,52px)" }}>
              {UNREADABLE[0].toUpperCase() + UNREADABLE.slice(1)} sites can&rsquo;t
              be read. We tell you which.
            </h2>
          </div>
          <div className="self-end">
            <p className="lede max-w-[46ch]" style={{ color: "var(--ink-2)" }}>
              Some businesses have no website, some have one page, and some block
              automated reading altogether. Guessing about them is how lists get
              you into trouble, so we don&rsquo;t. They come back marked
              &ldquo;couldn&rsquo;t tell&rdquo;, with the reason, and they cost
              you nothing.
            </p>
            <p className="mono mt-6 text-[12px]" style={{ color: "var(--ink-3)" }}>
              never billed · never exported · shown with the reason ·{" "}
              <Link href="/benchmark" className="underline underline-offset-2">
                what we get wrong
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ====================== 7 · the three alternatives ====================== */}
      <section className="mx-auto max-w-[1340px] px-8 pb-24">
        <span className="lab" style={{ color: "var(--ink-3)" }}>What you&rsquo;d do instead</span>
        <h2 className="dsp mt-6 max-w-[22ch]" style={{ fontSize: "clamp(30px,4.2vw,52px)" }}>
          Buy a list, build it yourself, or hire someone.
        </h2>

        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {[
            [
              "Buy a list",
              "Below a certain size the rows go sparse, stale, or were never there. A category and a headcount don't tell you whether this practice takes bookings online.",
              "cheap per row, then hours of checking",
            ],
            [
              "Build it yourself",
              "Scraping a map gets names and websites, the easy half. Someone still opens forty sites and decides. Nobody does that twice.",
              "half a day per market, every time it goes stale",
            ],
            [
              "Hire someone",
              "It works, and it costs more than the software you sell. The knowledge of who's worth calling lives in one head and leaves when they do.",
              // The anchors recorded with the pricing decision, and the only
              // two cost figures on this page that are not ours to measure.
              "about $2 a lead, or $200–500 a month",
            ],
          ].map(([t, d, cost]) => (
            <div key={t}>
              <span className="lab" style={{ color: "var(--ink-3)" }}>{t}</span>
              <p className="lede mt-3" style={{ color: "var(--ink-2)" }}>{d}</p>
              <p className="mono mt-4 text-[12px]" style={{ color: "var(--ink-3)" }}>{cost}</p>
            </div>
          ))}
        </div>

        <p className="lede mt-12 max-w-[56ch]">
          Small Fish is about <strong>${perMatch} a match</strong> on the cheapest
          paid plan, and nothing at all for the ones that don&rsquo;t match.
        </p>
      </section>

      {/* ============================= 8 · pricing ============================= */}
      <section className="mx-auto max-w-[1340px] px-8 pb-24">
        <span className="lab" style={{ color: "var(--ink-3)" }}>Pricing</span>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <h2 className="dsp max-w-[20ch]" style={{ fontSize: "clamp(32px,4.6vw,56px)" }}>
            You pay for the businesses that matched.
          </h2>
          <p className="lede self-end" style={{ color: "var(--ink-2)" }}>
            Not seats, not rows. Rarer matches take more reading, so they cost{" "}
            {BANDS[1].credits} or {BANDS[2].credits} credits instead of{" "}
            {BANDS[0].credits} — and the rate is on screen before anything is
            spent.
          </p>
        </div>

        <div className="mt-14 border-t border-[var(--line)]">
          <div className="prow">
            <span className="dsp" style={{ fontSize: 34 }}>{free.name}</span>
            <span className="lede" style={{ color: "var(--ink-2)" }}>
              Enough to judge whether the reading is any good
            </span>
            <span className="dsp" style={{ fontSize: 34 }}>$0</span>
            <span className="mono text-[12px]" style={{ color: "var(--ink-3)" }}>
              {free.credits} credits · a {SAMPLE_SIZE}-business sample per search
            </span>
          </div>
          {paid.map((p) => (
            <div key={p.id} className="prow">
              <span className="dsp" style={{ fontSize: 34 }}>{p.name}</span>
              <span className="lede" style={{ color: "var(--ink-2)" }}>
                {p.id === "starter" && "About a month of prospecting in one city"}
                {p.id === "growth" && "Several cities, plus the searches you keep running"}
                {p.id === "agency" && "Ten client markets, each in its own workspace"}
              </span>
              <span className="dsp" style={{ fontSize: 34 }}>
                ${p.priceUsd}
                <span className="mono text-[13px]" style={{ color: "var(--ink-3)" }}>/mo</span>
              </span>
              <span className="mono text-[12px]" style={{ color: "var(--ink-3)" }}>
                {p.credits} credits · {p.credits} common matches, or{" "}
                {Math.floor(p.credits / BANDS[2].credits)} rare ones
              </span>
            </div>
          ))}
        </div>

        {/* The worked example the brief asks for, in the one market where every
            number in it was measured rather than projected. */}
        <div className="card mt-12 max-w-[62ch] p-7">
          <span className="lab" style={{ color: "var(--ink-3)" }}>
            What ${starter.priceUsd} looks like
          </span>
          <p className="lede mt-4" style={{ color: "var(--ink-2)" }}>
            Dental practices in Phoenix that don&rsquo;t take bookings online:{" "}
            {DENTAL.matched} matched out of {DENTAL.read} read. Starter unlocks{" "}
            {starter.credits} matches a month at the common rate, with the proof
            line for each — so this market is one search, with credits left for
            the next one.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="#search"
            className="inline-flex h-12 items-center rounded-full bg-[var(--lure)] px-6 text-[14px] font-semibold text-[var(--ink)]"
          >
            Run your market free
          </a>
          <Link
            href="/pricing"
            className="inline-flex h-12 items-center rounded-full border border-[var(--line-strong)] px-6 text-[14px] font-semibold"
          >
            Compare the plans
          </Link>
        </div>

        <p className="mono mt-8 text-[12px]" style={{ color: "var(--ink-3)" }}>
          Non-matches are free · a wrong match is refunded on the spot · a
          business you unlocked stays yours for 12 months ·{" "}
          <Link href="/pricing" className="underline underline-offset-2">
            the rules in full
          </Link>
        </p>
      </section>

      {/* ========================== 9 · for the sceptics ========================== */}
      <section style={{ background: "#0E1520", color: "#EEF0EC" }}>
        <div className="mx-auto max-w-[1340px] px-8 py-20">
          <span className="lab" style={{ color: "#5B6470" }}>If you want to check</span>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <div>
              <p className="dsp" style={{ fontSize: 24 }}>We never send</p>
              <p className="lede mt-4" style={{ color: "#B9BFB6" }}>
                Sending means domains, warmup, bounce handling and somebody&rsquo;s
                reputation. That&rsquo;s a different company, and it&rsquo;s where
                these tools quietly fail. Your list goes to the sequencer you
                already trust.
              </p>
            </div>
            <div>
              <p className="dsp" style={{ fontSize: 24 }}>We check our own work</p>
              <p className="lede mt-4" style={{ color: "#B9BFB6" }}>
                {PROOF.calls} matches called on dental in Phoenix,{" "}
                {PROOF.falsePositives} false positives found, precision 100% with
                a lower bound of {PROOF.low}% — and {PROOF.quotes} model verdicts
                had their quote found verbatim on the page it came from. One niche
                of three; the other two are being labelled, and the page says so.
              </p>
              <Link href="/benchmark" className="mono mt-4 inline-block text-[12px]" style={{ color: "#C8F03C" }}>
                See the benchmark →
              </Link>
            </div>
            <div>
              <p className="dsp" style={{ fontSize: 24 }}>We crawl politely</p>
              <p className="lede mt-4" style={{ color: "#B9BFB6" }}>
                We read what a business publishes about itself, honour robots.txt,
                identify ourselves honestly, and remove any business that asks.
              </p>
              <Link href="/bot" className="mono mt-4 inline-block text-[12px]" style={{ color: "#C8F03C" }}>
                How we crawl →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================ 10 · closing CTA ============================ */}
      <section style={{ background: "#C8F03C", color: "#0E1520", position: "relative", overflow: "hidden" }}>
        <div aria-hidden className="swim pointer-events-none absolute left-[-4%] top-[10%] opacity-30 max-lg:hidden">
          <Bubbles where="closer" colour="#0E1520" />
          <svg width="520" height="347" viewBox="0 0 48 32">
            <path d="M26 16 L44 5.5 Q41 16 44 26.5 Z" fill="none" stroke="#0E1520" strokeWidth="0.3" />
            <circle cx="17" cy="16" r="12" fill="none" stroke="#0E1520" strokeWidth="0.3" />
            <circle cx="11.5" cy="12.5" r="2.3" fill="#0E1520" />
            <path d="M9.5 21 Q13.5 25 19 24.6" fill="none" stroke="#0E1520" strokeWidth="0.345" strokeLinecap="round" />
          </svg>
        </div>
        <div className="relative mx-auto grid max-w-[1340px] gap-12 px-8 py-24 lg:grid-cols-[1.4fr_1fr]">
          <h2 className="dsp max-w-[16ch]" style={{ fontSize: "clamp(38px,6.4vw,84px)" }}>
            Your market is a few thousand businesses. Let&rsquo;s read it.
          </h2>
          <div className="self-end">
            <a
              href="#search"
              className="inline-flex h-14 items-center rounded-full bg-[#0E1520] px-7 text-[15px] font-medium text-[#EEF0EC]"
            >
              Run your market free →
            </a>
            {/* Not `.lab` here. 11px uppercase mono with 0.14em tracking reads
                fine on paper; on the saturated lure ground it is the least
                legible text on the page. */}
            <p
              className="mono mt-5 text-[14px]"
              style={{ color: "#3A5006", letterSpacing: "0.01em" }}
            >
              {free.credits} free credits · no card · the count is free every time
            </p>
            <Link
              href="/app"
              className="mono mt-3 inline-block text-[13px] underline underline-offset-2"
              style={{ color: "#3A5006" }}
            >
              Or open a market we&rsquo;ve already read →
            </Link>
          </div>
        </div>
      </section>

      {/* ============================== footer ============================== */}
      <footer style={{ background: "#0E1520", color: "#B9BFB6", overflow: "hidden" }}>
        <div className="mx-auto max-w-[1340px] px-8 pt-20">
          <div className="grid gap-10 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <div>
              <span className="flex items-center gap-2.5">
                <Fish width={30} />
                <span className="text-[15px] font-medium text-[#EEF0EC]">small fish</span>
              </span>
              {/* The old hero headline, which is a brand line and belongs here
                  rather than on the first screen a buyer reads. */}
              <p className="mt-4 max-w-[28ch] text-[13px] leading-relaxed">
                The big nets miss the small fish. We read what they can&rsquo;t.
              </p>
            </div>
            {[
              ["Product", [["Run a search", "/app"], ["Your account", "/account"], ["Templates", "/templates"], ["Markets", "/find/dental-practices-with-no-online-booking-phoenix"], ["Pricing", "/pricing"]]],
              ["Company", [["How it works", "#how"], ["How accurate we are", "/benchmark"], ["Compare", "/compare"], ["Remove my business", "/opt-out"]]],
              ["Small print", [["Privacy", "/privacy"], ["Terms", "/terms"], ["How we crawl", "/bot"], ["What we get wrong", "/benchmark"]]],
            ].map(([title, links]) => (
              <div key={title as string}>
                <span className="lab" style={{ color: "#5B6470" }}>{title as string}</span>
                <ul className="mt-4 space-y-2 text-[13px]">
                  {(links as [string, string][]).map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="hover:text-[#C8F03C]">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            aria-hidden
            className="hang mt-16 select-none"
            style={{ fontSize: "clamp(80px,17vw,230px)", lineHeight: 0.78, WebkitTextStroke: "1px #26303C" }}
          >
            small fish
          </div>
        </div>
      </footer>
    </main>
  );
}
