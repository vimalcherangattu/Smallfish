import Link from "next/link";
import Fish from "@/components/Fish";
import { BANDS, PLANS } from "@/lib/pricing";
import { SAMPLE_SIZE } from "@/lib/pricing";

/**
 * The marketing home page.
 *
 * **The layout is replicated from `Small_Fish_Marketing_Site/Home.dc.html`; the
 * copy is not.** That split is deliberate and it is the same one
 * `docs/design-system.md` §6 draws: the design is settled ground, the product
 * shape in it is not.
 *
 * What the mockup promises that the engine cannot do, and what is here instead:
 *
 *   mockup                              | this page
 *   ------------------------------------|---------------------------------------
 *   "SCORE IT" in the ticker            | "SAY WHEN WE CAN'T" — there is no score
 *   a `74` score badge on an account    | the quoted sentence and its source
 *   "320 qualified of 500"              | the measured 166-site dental read
 *   "Noticing is the habit" (§04)       | the proof, because alerts are unbuilt
 *   "Two meters, researched and watched"| bands, which is what we actually bill
 *   Free / Team $149 / Agency $499      | the measured plans in `pricing.ts`
 *
 * Every number below is read from the code that implements it or carries a date
 * in `PROJECT_PLAN.md`. The home page is where a claim is loudest, so it is the
 * last place to put one nobody checked.
 */

export const metadata = {
  title: "Small Fish — the accounts the big nets can't read",
  description:
    "Find local businesses by what their own website says, and get the sentence " +
    "that proves each match. Non-matches cost nothing, and the ones we could not " +
    "settle say why.",
};

/* Measured. PROJECT_PLAN.md, Live numbers, 2026-09-22/23. */
const DENTAL = { read: 166, matched: 42, noMatch: 51, refused: 73 };
const PROOF = { calls: 41, falsePositives: 0, low: "91.4", quotes: "544 of 544" };

const MARKETS_A = [
  "dental", "med spas", "HVAC", "vet clinics", "law firms", "pharmacies",
];
const MARKETS_B = [
  "roofers", "dentists", "clinics", "plumbers", "studios", "garages",
];

export default function Home() {
  const starter = PLANS.find((p) => p.id === "starter")!;
  const paid = PLANS.filter((p) => ["starter", "growth", "agency"].includes(p.id));
  const free = PLANS.find((p) => p.id === "free")!;

  return (
    <main className="mkt">
      {/* ============================ hero ============================ */}
      <div style={{ background: "#0E1520", color: "#EEF0EC", position: "relative", overflow: "hidden" }}>
        <nav className="mx-auto flex max-w-[1340px] items-center justify-between px-8 py-6">
          <span className="flex items-center gap-2.5">
            <Fish width={30} />
            <span className="text-[15px] font-medium">small fish</span>
          </span>
          <div className="flex items-center gap-8">
            <a href="#demo" className="navlink hidden sm:inline">Try it</a>
            <a href="#why" className="navlink hidden sm:inline">Why it exists</a>
            <a href="#markets" className="navlink hidden sm:inline">Markets</a>
            <Link href="/pricing" className="navlink hidden sm:inline">Pricing</Link>
            <Link
              href="/app"
              className="rounded-full bg-[#C8F03C] px-4 py-2 text-[13px] font-medium text-[#0E1520]"
            >
              Read a market now
            </Link>
          </div>
        </nav>

        {/* The mark sits behind the type, to the right of it. The design keeps
            the headline to three narrow lines so the two never collide; left
            unconstrained the headline ran the full container and the outline
            crossed every line of it. */}
        <div
          aria-hidden
          className="swim pointer-events-none absolute right-[-7%] top-[16%] z-0 opacity-70 max-xl:hidden"
        >
          <Fish variant="outline" width={720} strokeWidth={0.32} />
        </div>

        <header className="relative z-10 mx-auto max-w-[1340px] px-8 pb-24 pt-16">
          <span className="lab" style={{ color: "#5B6470" }}>
            Local market intelligence the databases cannot see
          </span>
          <h1
            className="dsp mt-10 max-w-[min(100%,940px)]"
            style={{ fontSize: "clamp(52px,9vw,136px)" }}
          >
            The accounts the <span className="lure">big nets</span> can&rsquo;t
            read.
          </h1>
          <p className="lede mt-10 max-w-[46ch]" style={{ color: "#B9BFB6" }}>
            Your market is a few thousand small businesses. Every scraper can
            list them. None of them opens the websites and works out which ones
            you should actually call.
          </p>
          <a href="#demo" className="lab mt-10 inline-flex items-center gap-2" style={{ color: "#C8F03C" }}>
            ↓ Watch it read a real market, free
          </a>
        </header>

        {/* ticker */}
        <div className="border-y border-[#26303C] py-3">
          <div className="mq lab" style={{ color: "#5B6470" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i}>
                READ THE SITE&nbsp;&nbsp;·&nbsp;&nbsp;CITE THE SENTENCE&nbsp;&nbsp;·&nbsp;&nbsp;SAY
                WHEN WE CAN&rsquo;T&nbsp;&nbsp;·&nbsp;&nbsp;CHARGE FOR MATCHES
                ONLY&nbsp;&nbsp;·&nbsp;&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ============================ demo ============================ */}
      <section id="demo" className="mx-auto max-w-[1340px] px-8 py-24">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <span className="lab" style={{ color: "var(--ink-3)" }}>
              Measured data · no sign-up
            </span>
            <h2 className="dsp mt-6" style={{ fontSize: "clamp(32px,4vw,48px)" }}>
              Pick a market. Watch what it read.
            </h2>
            <p className="lede mt-6 max-w-[46ch]" style={{ color: "var(--ink-2)" }}>
              Four markets, already read. Every verdict on the screen carries
              the pages it came from, and the ones we could not settle are there
              too, with the reason. Nothing is generated.
            </p>
            <Link href="/app" className="cta mt-10">
              Open the demo
              <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Two cards, tilted, as the mockup composes them. */}
          <div className="relative">
            <div className="card lift tilt-l p-6">
              <div className="flex items-center justify-between">
                <span className="lab" style={{ color: "var(--ink-3)" }}>
                  Dental · Phoenix
                </span>
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
                The same read, where it could not decide
              </span>
              <p className="cite mt-4">
                &ldquo;This site blocks automated reading, so we cannot say
                either way.&rdquo;
              </p>
              <p className="mono mt-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
                counted against us · never billed · never exported
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================== 01 · why ========================== */}
      <section id="why" className="mx-auto max-w-[1340px] px-8 py-20">
        <div className="grid gap-10 lg:grid-cols-[120px_1fr]">
          <span className="hang" style={{ fontSize: 96, lineHeight: 0.8 }}>01</span>
          <div>
            <p className="dsp max-w-[24ch]" style={{ fontSize: "clamp(34px,5vw,66px)" }}>
              {DENTAL.read} sites read came back as{" "}
              <span className="lure">{DENTAL.matched} matches</span>,{" "}
              {DENTAL.noMatch} clear no&rsquo;s, and {DENTAL.refused} we refused
              to guess about — each with the reason why.
            </p>

            <div className="mt-16 grid gap-10 md:grid-cols-3">
              {[
                ["Buy a list",
                 "Below a certain size the rows go sparse, stale, or were never there. A category and a headcount do not tell you whether this practice takes bookings online."],
                ["Build it yourself",
                 "Scraping a map gets names and websites, the easy half. Someone still opens forty sites and decides. Nobody does that twice."],
                ["Hire someone",
                 "It works, and it costs more than the software you sell. The qualification logic lives in one head and leaves when they do."],
              ].map(([t, d]) => (
                <div key={t}>
                  <span className="lab" style={{ color: "var(--ink-3)" }}>{t}</span>
                  <p className="lede mt-3" style={{ color: "var(--ink-2)" }}>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ======================= 02 · the line ======================= */}
      <section style={{ background: "#0E1520", color: "#EEF0EC" }}>
        <div className="mx-auto max-w-[1340px] px-8 py-24">
          <span className="lab" style={{ color: "#5B6470" }}>02 — the line</span>
          <h2 className="dsp mt-8 max-w-[16ch]" style={{ fontSize: "clamp(40px,7vw,88px)" }}>
            It stops at drafted. It never sends.
          </h2>
          <div className="mt-14 grid gap-10 md:grid-cols-2">
            <p className="lede max-w-[46ch]" style={{ color: "#B9BFB6" }}>
              Sending means domains, warmup, bounce handling and somebody&rsquo;s
              reputation. That is a different company, and it is where tools
              quietly fail. There is no send button anywhere in this product.
            </p>
            <p className="lede max-w-[46ch]" style={{ color: "#B9BFB6" }}>
              Finished research goes into the sequencer you already use, as a CSV
              whose every row carries the sentence it rests on. When a draft has
              nothing honest to say, it says that instead of inventing a reason
              to email someone.
            </p>
          </div>
        </div>
      </section>

      {/* ======================== 03 · markets ======================== */}
      <section id="markets" className="py-24">
        <div className="mx-auto max-w-[1340px] px-8">
          <span className="lab" style={{ color: "var(--ink-3)" }}>03 — markets</span>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
            <h2 className="dsp max-w-[20ch]" style={{ fontSize: "clamp(32px,4.6vw,56px)" }}>
              Anywhere the good accounts are too small to be in a database.
            </h2>
            <p className="lede self-end" style={{ color: "var(--ink-2)" }}>
              A criterion is read on the page, so a new market needs no code —
              only a market whose businesses have websites with enough on them
              to read.
            </p>
          </div>
        </div>

        <div className="mt-16 overflow-hidden">
          <div className="mq dsp" style={{ fontSize: "clamp(40px,7vw,76px)" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i}>
                {MARKETS_A.map((m) => (
                  <span key={m} className="mr-10">{m}</span>
                ))}
              </span>
            ))}
          </div>
          <div className="mq-slow dsp hang mt-3" style={{ fontSize: "clamp(40px,7vw,76px)" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i}>
                {MARKETS_B.map((m) => (
                  <span key={m} className="mr-10">{m}</span>
                ))}
              </span>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 flex max-w-[1340px] flex-wrap items-baseline gap-4 px-8">
          <span className="lab" style={{ color: "var(--ink-3)" }}>One requirement</span>
          <span className="lede" style={{ color: "var(--ink-2)" }}>
            the business has a website with enough on it to read — about 40% do
            not, and we say so rather than guessing
          </span>
        </div>
      </section>

      {/* ======================== 04 · the proof ======================== */}
      <section className="mx-auto max-w-[1340px] px-8 py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_120px]">
          <div>
            <h2 className="dsp max-w-[18ch]" style={{ fontSize: "clamp(32px,4.6vw,56px)" }}>
              The sentence is the product. The list is the packaging.
            </h2>
            <p className="lede mt-6 max-w-[48ch]" style={{ color: "var(--ink-2)" }}>
              Anyone can hand you rows. What decides whether you send the email
              is whether you believe the row — so every match carries the page it
              was read from, and every quote is checked back against that page
              before you ever see it.
            </p>
          </div>
          <span className="hang justify-self-end max-lg:hidden" style={{ fontSize: 96, lineHeight: 0.8 }}>
            04
          </span>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <div className="card p-7">
            <span className="lab" style={{ color: "var(--ink-3)" }}>What a match looks like</span>
            <p className="cite mt-4">
              <span className="mark">
                3 relevant pages read via technology detection; no sign of it
              </span>
            </p>
            <p className="mono mt-4 text-[12px]" style={{ color: "var(--ink-3)" }}>
              {PROOF.calls} matches called across three markets · {PROOF.falsePositives}{" "}
              false positives found · precision 100%, lower bound {PROOF.low}%
            </p>
          </div>
          <div className="card p-7" style={{ background: "#0E1520", borderColor: "#26303C" }}>
            <span className="lab" style={{ color: "#5B6470" }}>What a refusal looks like</span>
            <p className="cite mt-4" style={{ color: "#EEF0EC" }}>
              &ldquo;Only the homepage could be read, which is too little to
              prove this is absent.&rdquo;
            </p>
            <p className="mono mt-4 text-[12px]" style={{ color: "#B9BFB6" }}>
              {PROOF.quotes} quotes verified verbatim on the page they came from
            </p>
          </div>
        </div>
      </section>

      {/* ======================== 05 · pricing ======================== */}
      <section className="mx-auto max-w-[1340px] px-8 py-20">
        <span className="lab" style={{ color: "var(--ink-3)" }}>05 — pricing</span>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
          <h2 className="dsp max-w-[20ch]" style={{ fontSize: "clamp(32px,4.6vw,56px)" }}>
            One meter. Businesses you matched.
          </h2>
          <p className="lede self-end" style={{ color: "var(--ink-2)" }}>
            Not seats, and not rows. A match costs {BANDS[0].credits}, {BANDS[1].credits}{" "}
            or {BANDS[2].credits} credits depending on how rare it is in your
            market, and the rate is shown before anything is spent.
          </p>
        </div>

        <div className="mt-14 border-t border-[var(--line)]">
          <div className="prow">
            <span className="dsp" style={{ fontSize: 34 }}>{free.name}</span>
            <span className="lede" style={{ color: "var(--ink-2)" }}>
              Anyone, to see whether the reading is any good
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
                {p.id === "starter" && "One market at a time, run properly"}
                {p.id === "growth" && "Several markets, and the searches you keep"}
                {p.id === "agency" && "Agencies running many client markets"}
              </span>
              <span className="dsp" style={{ fontSize: 34 }}>
                ${p.priceUsd}
                <span className="mono text-[13px]" style={{ color: "var(--ink-3)" }}>/mo</span>
              </span>
              <span className="mono text-[12px]" style={{ color: "var(--ink-3)" }}>
                {p.credits} credits · {p.credits} common matches, or{" "}
                {Math.floor(p.credits / 3)} rare ones
              </span>
            </div>
          ))}
        </div>
        <p className="mono mt-6 text-[12px]" style={{ color: "var(--ink-3)" }}>
          Non-matches are free · a wrong match is refunded on the spot · a
          business you unlocked stays yours for 12 months ·{" "}
          <Link href="/pricing" className="underline underline-offset-2">
            the rules in full
          </Link>
        </p>
      </section>

      {/* ========================== closing CTA ========================== */}
      <section style={{ background: "#C8F03C", color: "#0E1520", position: "relative", overflow: "hidden" }}>
        <div aria-hidden className="pointer-events-none absolute left-[-4%] top-[10%] opacity-30 max-lg:hidden">
          <svg width="520" height="347" viewBox="0 0 48 32">
            <path d="M26 16 L44 5.5 Q41 16 44 26.5 Z" fill="none" stroke="#0E1520" strokeWidth="0.3" />
            <circle cx="17" cy="16" r="12" fill="none" stroke="#0E1520" strokeWidth="0.3" />
            <circle cx="11.5" cy="12.5" r="2.3" fill="#0E1520" />
            <path d="M9.5 21 Q13.5 25 19 24.6" fill="none" stroke="#0E1520" strokeWidth="0.345" strokeLinecap="round" />
          </svg>
        </div>
        <div className="relative mx-auto grid max-w-[1340px] gap-12 px-8 py-24 lg:grid-cols-[1.4fr_1fr]">
          <h2 className="dsp max-w-[16ch]" style={{ fontSize: "clamp(38px,6.4vw,84px)" }}>
            You just watched it read one market. Point it at yours.
          </h2>
          <div className="self-end">
            <Link
              href="/app"
              className="inline-flex h-14 items-center rounded-full bg-[#0E1520] px-7 text-[15px] font-medium text-[#EEF0EC]"
            >
              Open the demo →
            </Link>
            <p className="lab mt-5" style={{ color: "#4A6508" }}>
              Measured data · no sign-up · no card
            </p>
          </div>
        </div>
      </section>

      {/* ============================ footer ============================ */}
      <footer style={{ background: "#0E1520", color: "#B9BFB6", overflow: "hidden" }}>
        <div className="mx-auto max-w-[1340px] px-8 pt-20">
          <div className="grid gap-10 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <div>
              <span className="flex items-center gap-2.5">
                <Fish width={30} />
                <span className="text-[15px] font-medium text-[#EEF0EC]">small fish</span>
              </span>
              <p className="mt-4 max-w-[28ch] text-[13px] leading-relaxed">
                We read, we cite, and we say when we could not tell. We never
                send.
              </p>
            </div>
            {[
              ["Product", [["Try it", "/app"], ["Markets", "/find/dental-practices-with-no-online-booking-phoenix"], ["Pricing", "/pricing"]]],
              ["Company", [["Why it exists", "#why"], ["Compare", "/compare"], ["Remove my business", "/opt-out"]]],
              ["Small print", [["How we crawl", "/opt-out"], ["What we do not do", "/compare"]]],
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

          {/* The wordmark, hung off the bottom edge as the design does. */}
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
