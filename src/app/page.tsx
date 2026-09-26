import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Bubbles from "@/components/Bubbles";
import Fish from "@/components/Fish";
import MarketProof, { type MarketCard } from "@/components/MarketProof";
import School from "@/components/School";
import { BANDS, PLANS, SAMPLE_SIZE } from "@/lib/pricing";
import { VERDICT_LABEL, type Market, type VerdictKind } from "@/lib/types";

/**
 * The marketing home page, composed to `Claude_Product_Design_System.html`
 * (2026-09-26).
 *
 * The layout, the type, the colour and the voice are the design's. Four things
 * in it are not shipped as written, and each is the same kind of problem:
 *
 *   design                                | what is here, and why
 *   --------------------------------------|-------------------------------------
 *   four invented businesses and quotes   | real rows from `public/data`
 *   "544 of 544 quotes verified"          | 11 of 11 — 544 was never measured
 *   "41 matches across three markets"     | 41 calls, dental in Phoenix alone
 *   "Vet · Denver · 143 sites"            | the vet market is Columbus, OH
 *
 * The first is the important one. A mockup fills a card with a plausible clinic
 * and a plausible sentence, and on almost any other site that is fine. Here the
 * card exists to demonstrate that a row carries the sentence that proves it —
 * so demonstrating it with an invented sentence is the exact failure the page
 * is arguing against. Every business named below was read, and every line under
 * a name is the line the engine recorded.
 *
 * `544` has now been caught twice. It appears nowhere in `PROJECT_PLAN.md`, the
 * coverage report or `benchmark.json`.
 *
 * **One thing here contradicts the previous brief**, which is worth flagging
 * rather than quietly reconciling: that brief moved "The accounts the big nets
 * can't read" to the footer, on the grounds that it is a claim about us rather
 * than a promise about them, and that "accounts" is analyst language. This
 * design puts it back in the hero. The newer instruction wins and the line is
 * in the hero — but the earlier reasoning has not been answered, only
 * outvoted, and `test_home_copy.mjs` records the exemption instead of silently
 * dropping the check.
 */

export const metadata = {
  title: "Small Fish — the accounts the big nets can't read",
  description:
    "Tell us the kind of local business you sell to and where. We read every one " +
    "of their websites and send back the ones that qualify, each with the sentence " +
    "that proves it.",
};

/* Measured. PROJECT_PLAN.md · Live numbers · 2026-09-22/23. */
const DENTAL = { read: 166, matched: 42, noMatch: 51, couldntRead: 73 };

/**
 * When the markets on this page were read.
 *
 * From `PROJECT_PLAN.md`'s Live numbers, because **the exported market files
 * do not carry a read date** — `export_app_data.py` writes counts and tallies
 * and no timestamp. Evidence goes stale, so the date belongs on the evidence
 * line, and until the export carries one it has to be stated here. It should
 * move into the data: a date typed beside a number is a date that stops being
 * true without anything failing.
 */
const READ_ON = "2026-09-22";

/** Markets to show in the proof section, and which criterion to show for each.
 *  Only criteria something actually settled: `vet-columbus` is read but neither
 *  of its criteria produced a single match, so a card for it would be an empty
 *  demonstration of the thing being demonstrated. */
const SHOWN: { file: string; criterion: string; niche: string }[] = [
  { file: "dental-phoenix", criterion: "no_online_booking", niche: "Dental" },
  { file: "med-spa-dallas", criterion: "no_online_booking", niche: "Med spa" },
  { file: "hvac-tampa", criterion: "no_quote_form", niche: "HVAC" },
];

const host = (url: string | null) =>
  (url ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];

/**
 * Build the proof cards from the measured markets.
 *
 * Deliberately picky about which row it shows. It skips a business whose
 * `website` belongs to someone else — Overture's `website` field sometimes
 * carries a manufacturer's or a franchise's domain, and the plan records
 * finding "AAA Accurate Dental Care" listed against `advancedsmilescenter.com`.
 * A home page whose example row points at the wrong company's site is the worst
 * possible place for that defect to surface.
 */
async function proofCards(): Promise<MarketCard[]> {
  const cards: MarketCard[] = [];

  for (const s of SHOWN) {
    let market: Market;
    try {
      market = JSON.parse(
        await readFile(path.join(process.cwd(), "public", "data", `${s.file}.json`), "utf8"),
      ) as Market;
    } catch {
      continue;
    }

    const criterion = market.criteria.find((c) => c.id === s.criterion);
    if (!criterion) continue;

    const verdictOf = (b: (typeof market.businesses)[number]) =>
      (b.verdicts[s.criterion]?.verdict ?? "unread") as VerdictKind;

    // A site whose host does not resemble the business name is the Overture
    // defect above. Cheap heuristic, and it only has to be right about the one
    // row that ends up on the page.
    const looksOwn = (name: string, site: string | null) => {
      const h = host(site).split(".")[0].replace(/[^a-z0-9]/gi, "").toLowerCase();
      const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
      return !!h && words.some((w) => h.includes(w));
    };

    const matches = market.businesses
      .filter((b) => verdictOf(b) === "match" && b.site && b.read?.pages)
      .filter((b) => looksOwn(b.name, b.site))
      .sort((a, b) => (b.read?.pages ?? 0) - (a.read?.pages ?? 0));

    const misses = market.businesses
      .filter((b) => verdictOf(b) === "no_match" && b.site && b.read?.pages)
      .filter((b) => looksOwn(b.name, b.site))
      .sort((a, b) => (b.read?.pages ?? 0) - (a.read?.pages ?? 0));

    const match = matches[0];
    const miss = misses[0];
    if (!match || !miss) continue;

    const judged = market.businesses.filter((b) => {
      const v = verdictOf(b);
      return v !== "unread" && v !== "needs_model";
    }).length;

    cards.push({
      key: s.file,
      niche: s.niche,
      metro: market.metro,
      judged,
      question: criterion.text,
      explain: criterion.explain,
      match: {
        name: match.name,
        evidence:
          match.verdicts[s.criterion]?.proof ??
          match.verdicts[s.criterion]?.reason ??
          "",
        source: `${host(match.site)} · read ${READ_ON}`,
        pages: match.read?.pages ?? 0,
      },
      miss: {
        name: miss.name,
        verdict: VERDICT_LABEL[verdictOf(miss)],
        reason:
          miss.verdicts[s.criterion]?.reason ??
          "No reason was recorded, which is itself a defect.",
        // A restatement of the recorded reason, not a new claim: the engine
        // found the thing the criterion says is absent, so the criterion is
        // false here. Kept generic on purpose — the moment this starts
        // describing what was found, it is asserting something the record does
        // not carry.
        plain:
          `We found what the search said should be missing, so "${criterion.text}" ` +
          `is not true of them. Nothing was charged.`,
        source: host(miss.site),
        pages: miss.read?.pages ?? 0,
      },
    });
  }

  return cards;
}

export default async function Home() {
  const cards = await proofCards();
  const free = PLANS.find((p) => p.id === "free")!;
  const paid = PLANS.filter((p) => ["starter", "growth", "agency"].includes(p.id));
  const starter = PLANS.find((p) => p.id === "starter")!;
  /* $29 / 120 credits. Computed, so it cannot drift from `pricing.ts`. */
  const per100 = Math.round((starter.priceUsd / starter.credits) * 100);

  const pct = (n: number) => ((n / DENTAL.read) * 100).toFixed(1);

  return (
    <main className="mkt">
      {/* ================================ hero ================================ */}
      <header
        style={{
          position: "relative",
          background: "#0E1520",
          color: "#EEF0EC",
          overflow: "hidden",
          paddingBottom: 36,
        }}
      >
        <div
          style={{ position: "absolute", left: -80, top: 0, width: 1600, opacity: 0.55 }}
          className="schoolmove"
          aria-hidden
        >
          <School width={1600} height={700} />
        </div>

        <div style={{ position: "absolute", right: -180, top: 200 }} className="swim" aria-hidden>
          <Fish variant="outline" width={780} strokeWidth={0.35} />
          <Bubbles where="hero" />
        </div>

        <nav
          className="wrap"
          aria-label="Main"
          style={{
            position: "relative",
            height: 88,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <Fish width={39} />
            <span
              className="dsp"
              style={{ fontSize: 24, fontWeight: 600, color: "#EEF0EC", lineHeight: 1 }}
            >
              small fish
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <a className="navlink max-sm:hidden" href="#cost">Why it exists</a>
            <a className="navlink max-sm:hidden" href="#accuracy">Accuracy</a>
            <a className="navlink max-sm:hidden" href="#markets">Markets</a>
            <a className="navlink max-sm:hidden" href="#pricing">Pricing</a>
            <Link className="navlink max-sm:hidden" href="/sign-in">Sign in</Link>
            <Link className="cta sm" href="/app">Start free</Link>
          </div>
        </nav>

        <div className="wrap g12" style={{ position: "relative", paddingTop: 74 }}>
          <p className="lab" style={{ gridColumn: "span 7", color: "#8A929B" }}>
            Local market intelligence the databases cannot see
          </p>
          <h1
            className="dsp"
            style={{
              gridColumn: "span 11",
              fontSize: "clamp(48px,9.2vw,132px)",
              marginTop: 34,
            }}
          >
            The accounts
            <br />
            <span style={{ display: "inline-block", marginLeft: "10vw" }}>
              the <span className="hilite">big nets</span>
            </span>
            <br />
            <span style={{ display: "inline-block", marginLeft: "3vw" }}>can&rsquo;t read.</span>
          </h1>
          <p
            className="lede"
            style={{ gridColumn: "1 / span 6", marginTop: 52, fontSize: 22 }}
          >
            Tell us the kind of local business you sell to and where. We read every
            one of their websites and send back the ones that qualify — each with
            the sentence from their own site that proves it.
          </p>
          <div
            style={{
              gridColumn: "1 / span 7",
              marginTop: 40,
              display: "flex",
              alignItems: "center",
              gap: 28,
              flexWrap: "wrap",
            }}
          >
            <Link className="cta" href="/app">
              Start free — {free.credits} credits
              <span aria-hidden>→</span>
            </Link>
            <a className="txtlink" href="#accuracy">
              See a market we read
            </a>
            <span className="lab" style={{ color: "#8A929B" }}>No card</span>
          </div>
        </div>

        <div className="ticker" style={{ marginTop: 88 }}>
          <span className="mq lab">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i}>
                READ THE SITE &nbsp;·&nbsp; CITE THE SENTENCE &nbsp;·&nbsp; SAY WHEN WE
                CAN&rsquo;T &nbsp;·&nbsp; CHARGE FOR MATCHES ONLY &nbsp;·&nbsp;{" "}
              </span>
            ))}
          </span>
        </div>
      </header>

      {/* =========================== what it replaces =========================== */}
      <section id="cost" className="wrap" style={{ paddingTop: 110, paddingBottom: 120 }}>
        <div className="g12" style={{ alignItems: "end" }}>
          <p className="lab" style={{ gridColumn: "span 3", color: "var(--ink-3)" }}>
            100 businesses you can actually call
          </p>
          <h2 className="dsp" style={{ gridColumn: "1 / span 8", fontSize: 56, marginTop: 18 }}>
            Every other way costs you a day, or a salary.
          </h2>
        </div>

        <div style={{ marginTop: 52 }}>
          <div className="cost" style={{ borderTop: "2px solid var(--ink)", paddingTop: 18 }}>
            <p className="lab" style={{ color: "var(--ink-3)" }}>Where it comes from</p>
            <p className="lab" style={{ color: "var(--ink-3)" }}>What you pay</p>
            <p className="lab" style={{ color: "var(--ink-3)" }}>Hours of your time</p>
            <p className="lab" style={{ color: "var(--ink-3)" }}>What you end up with</p>
          </div>

          {/* The three prices are what buyers report paying, recorded with the
              pricing decision — about $2 a lead from a freelancer, $200–500 a
              month for an agency. They are anchors from conversations, not
              measurements of ours, and the line under the table says so. */}
          <CostRow
            name="Buy a list"
            price="$2"
            note="a lead"
            bar={57}
            delay={0.05}
            outcome="Rows, then an afternoon opening sites to check them"
          />
          <CostRow
            name="Build it yourself"
            price="$0"
            bar={100}
            delay={0.15}
            outcome="Names and websites, the easy half. Nobody does it twice"
          />
          <CostRow
            name="Hire someone"
            price="$200–500"
            note="a month"
            bar={12}
            delay={0.25}
            outcome="Good work, in one person's head, that leaves when they do"
          />
          <div className="cost ours">
            <h3 style={{ color: "#EEF0EC" }}>Small Fish</h3>
            <span className="mono" style={{ fontSize: 20, color: "#C8F03C" }}>
              ${per100}
            </span>
            <span className="bar">
              <i style={{ width: "3%", animationDelay: "0.35s" }} />
            </span>
            <span className="small" style={{ color: "#B9BFB6" }}>
              100 qualified businesses, each with the sentence that proves it
            </span>
          </div>
        </div>
        <p className="lab" style={{ color: "var(--ink-3)", marginTop: 22 }}>
          Bars are your hours, not ours · non-matches are free · the three prices
          above are what buyers told us they pay, not figures we measured
        </p>
      </section>

      {/* ============================== accuracy ============================== */}
      <section id="accuracy" style={{ background: "#FFFFFF", padding: "110px 0 120px" }}>
        <div className="wrap g12" style={{ alignItems: "end" }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 8", fontSize: 56 }}>
            A match is only a match when a sentence proves it.
          </h2>
          <p className="lede" style={{ gridColumn: "9 / span 4", color: "var(--ink-2)" }}>
            Markets we have read end to end. Every row below came out of those
            files — the business, the evidence and the page it was found on.
          </p>
        </div>

        {cards.length > 0 ? (
          <MarketProof markets={cards} />
        ) : (
          <p className="wrap lede" style={{ marginTop: 40, color: "var(--ink-2)" }}>
            The measured markets are not on this deployment, so there is nothing
            to show here rather than something made up.
          </p>
        )}
      </section>

      {/* ============================== the number ============================== */}
      <section id="numbers" className="wrap" style={{ paddingTop: 110, paddingBottom: 120 }}>
        <div className="g12">
          <p className="dsp" style={{ gridColumn: "1 / span 10", fontSize: 62, lineHeight: 1.08 }}>
            <span className="hilite" style={{ transform: "rotate(-.8deg)" }}>
              {DENTAL.matched} practices worth calling
            </span>
            , out of {DENTAL.read} read — alongside {DENTAL.noMatch} clear no&rsquo;s
            and {DENTAL.couldntRead} we refused to guess about, each with the reason
            why.
          </p>
        </div>
        <div style={{ marginTop: 56, maxWidth: 1100 }}>
          <span className="numbar">
            <i style={{ width: `${pct(DENTAL.matched)}%`, background: "#C8F03C", animationDelay: "0.1s" }} />
            <i style={{ width: `${pct(DENTAL.noMatch)}%`, background: "#36404C", animationDelay: "0.25s" }} />
            <i style={{ width: `${pct(DENTAL.couldntRead)}%`, background: "#E0CF8E", animationDelay: "0.4s" }} />
          </span>
          <span className="numkey">
            <span>
              <i style={{ background: "#C8F03C" }} />
              {DENTAL.matched} matches · worth a call
            </span>
            <span>
              <i style={{ background: "#36404C" }} />
              {DENTAL.noMatch} clear no&rsquo;s · with the line that ruled them out
            </span>
            <span>
              <i style={{ background: "#E0CF8E" }} />
              {DENTAL.couldntRead} we couldn&rsquo;t read · never billed
            </span>
          </span>
        </div>
      </section>

      {/* ============================ stops at drafted ============================ */}
      <section className="slab">
        <div className="inner">
          <div className="g12" style={{ rowGap: 32 }}>
            <h2 className="dsp" style={{ gridColumn: "1 / span 10", fontSize: 86 }}>
              It stops at drafted. It never sends.
            </h2>
            <p className="lede" style={{ gridColumn: "1 / span 5", color: "#B9BFB6" }}>
              Sending means domains, warmup, bounce handling and somebody&rsquo;s
              reputation. That is a different company, and it is where most tools
              in this category quietly fail their customers.
            </p>
            <p className="lede" style={{ gridColumn: "7 / span 5", color: "#B9BFB6" }}>
              Finished research goes into the sequencer you already use, and a
              person approves every email. Nothing we hand you was invented, which
              is also why these lists don&rsquo;t bounce.
            </p>
          </div>
        </div>
      </section>

      {/* ============================ where it works ============================ */}
      <section id="markets" style={{ paddingTop: 100, paddingBottom: 110, overflow: "hidden" }}>
        <div className="wrap g12" style={{ alignItems: "end", marginBottom: 48 }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: 56 }}>
            Anywhere the good accounts are too small to be in a database.
          </h2>
          <p className="lede" style={{ gridColumn: "9 / span 4", color: "var(--ink-2)" }}>
            What you are looking for is read off the page, so a new market needs no
            code and no catalogue — only businesses whose websites have enough on
            them to read.
          </p>
        </div>
        {/* These are kinds of business the method works on, not markets we have
            read. The heading and the line below it both say so; an earlier
            version of this marquee did not, and it read as a coverage claim. */}
        <div
          style={{
            transform: "rotate(-2deg)",
            margin: "0 -40px",
            borderTop: "1px solid var(--line)",
            borderBottom: "1px solid var(--line)",
            padding: "18px 0",
            overflow: "hidden",
            background: "#FFFFFF",
          }}
        >
          <span className="mq dsp" style={{ fontSize: 74 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i}>
                dental &nbsp;&nbsp; med spas &nbsp;&nbsp; vet clinics &nbsp;&nbsp; HVAC
                &nbsp;&nbsp; law firms &nbsp;&nbsp; salons &nbsp;&nbsp; roofers
                &nbsp;&nbsp; carpenters &nbsp;&nbsp; pharmacies &nbsp;&nbsp;{" "}
              </span>
            ))}
          </span>
        </div>
        <div
          className="wrap"
          style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 44 }}
        >
          <span className="lab" style={{ color: "var(--ink-3)" }}>One requirement</span>
          <span style={{ flexGrow: 1, height: 1, background: "var(--line)" }} />
          <span className="lede" style={{ color: "var(--ink-2)" }}>
            the business has a website with enough on it to read
          </span>
        </div>
      </section>

      {/* ============================== pricing ============================== */}
      <section id="pricing" className="wrap" style={{ paddingBottom: 130 }}>
        <div className="g12" style={{ alignItems: "end" }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: 56 }}>
            You pay for matches, not for rows.
          </h2>
          <p className="lede" style={{ gridColumn: "9 / span 4", color: "var(--ink-2)" }}>
            A match costs {BANDS[0].credits}, {BANDS[1].credits} or {BANDS[2].credits}{" "}
            credits depending on how rare it is in your market, and the rate is
            shown before anything is spent.
          </p>
        </div>

        <div style={{ marginTop: 44 }}>
          <div className="prow" style={{ borderTop: "2px solid var(--ink)" }}>
            <span className="dsp" style={{ fontSize: 32 }}>
              {free.name}{" "}
              <span className="mono" style={{ fontSize: 26, fontWeight: 500 }}>$0</span>
            </span>
            <span className="lede" style={{ color: "var(--ink-2)" }}>
              {free.credits} credits · a {SAMPLE_SIZE}-business sample per search
            </span>
            <span className="small" style={{ color: "var(--ink-3)" }}>
              Enough to see whether the reading is any good
            </span>
            <Link className="cta out" href="/app">Start free</Link>
          </div>
          {paid.map((p) => (
            <div key={p.id} className="prow">
              <span className="dsp" style={{ fontSize: 32 }}>
                {p.name}{" "}
                <span className="mono" style={{ fontSize: 26, fontWeight: 500 }}>
                  ${p.priceUsd}
                </span>
              </span>
              <span className="lede" style={{ color: "var(--ink-2)" }}>
                {p.credits} credits · {p.credits} common matches, or{" "}
                {Math.floor(p.credits / BANDS[2].credits)} rare ones
              </span>
              <span className="small" style={{ color: "var(--ink-3)" }}>
                {p.id === "starter" && "About a month of prospecting in one city"}
                {p.id === "growth" && "Several cities, and the searches you keep running"}
                {p.id === "agency" && "Ten client markets, each kept separate"}
              </span>
              <Link className={p.id === "growth" ? "cta" : "cta out"} href="/pricing">
                Choose {p.name}
              </Link>
            </div>
          ))}
          <p className="lab" style={{ color: "var(--ink-3)", marginTop: 22 }}>
            Non-matches are free · a wrong match is refunded on the spot · a business
            you unlocked stays yours for 12 months
          </p>
        </div>
      </section>

      {/* =============================== sign up =============================== */}
      <section
        id="signup"
        className="signup wrap"
        style={{ paddingTop: 104, paddingBottom: 112 }}
      >
        <div
          style={{ position: "absolute", right: -130, bottom: -110, opacity: 0.45 }}
          className="swim"
          aria-hidden
        >
          <Bubbles where="closer" colour="#0E1520" />
          <svg width="520" height="347" viewBox="0 0 48 32" aria-hidden>
            <path d="M26 16 L44 5.5 Q41 16 44 26.5 Z" fill="none" stroke="#0E1520" strokeWidth="0.3" />
            <circle cx="17" cy="16" r="12" fill="none" stroke="#0E1520" strokeWidth="0.3" />
            <circle cx="11.5" cy="12.5" r="2.3" fill="#0E1520" />
            <path d="M9.5 21 Q13.5 25 19 24.6" fill="none" stroke="#0E1520" strokeWidth="0.345" strokeLinecap="round" />
          </svg>
        </div>

        <div className="g12" style={{ position: "relative" }}>
          <div
            style={{
              gridColumn: "1 / span 5",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            <h2 className="dsp" style={{ fontSize: 64 }}>
              Start with {free.credits} credits and a market of your choosing.
            </h2>
            <p className="lede" style={{ color: "#2C3A08" }}>
              Pick your business type and city, and the first {SAMPLE_SIZE} reads run
              while you watch. No card, and non-matches never cost a credit.
            </p>
          </div>

          {/* The design has this collect an email and answer with "check your
              inbox". We have Clerk, so it goes to the real sign-up instead:
              a form that pretends to enrol somebody and does nothing is a
              worse first impression than one honest button. */}
          <div
            style={{
              gridColumn: "7 / span 5",
              display: "flex",
              flexDirection: "column",
              gap: 26,
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              <Link className="cta ink" href="/sign-up">
                Create your account
                <span aria-hidden>→</span>
              </Link>
              <span className="lab" style={{ color: "#3A4F05" }}>
                {free.credits} credits · no card · cancel any time
              </span>
            </div>
            <p className="small" style={{ color: "#2C3A08" }}>
              Or{" "}
              <Link href="/app" style={{ textDecoration: "underline" }}>
                run a search first
              </Link>{" "}
              — the count is free and needs no account at all.
            </p>
          </div>
        </div>
      </section>

      {/* =============================== footer =============================== */}
      <footer
        style={{
          background: "#0E1520",
          color: "#B9BFB6",
          padding: "64px 56px 0",
          display: "flex",
          flexDirection: "column",
          gap: 46,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{ position: "absolute", right: -40, top: 30, opacity: 0.45 }}
          className="schoolmove"
          aria-hidden
        >
          <School width={620} height={200} />
        </div>

        <div className="g12" style={{ position: "relative" }}>
          <div
            style={{
              gridColumn: "1 / span 4",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <Fish width={39} />
              <span
                className="dsp"
                style={{ fontSize: 24, fontWeight: 600, color: "#EEF0EC", lineHeight: 1 }}
              >
                small fish
              </span>
            </Link>
            <span className="small" style={{ color: "#8A929B" }}>
              We read the site, cite the sentence, say when we can&rsquo;t, and charge
              for matches only.
            </span>
          </div>

          <FooterCol
            title="Product"
            links={[
              ["Accuracy", "#accuracy"],
              ["Templates", "/templates"],
              ["Pricing", "/pricing"],
              ["Start free", "/app"],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ["Why it exists", "#cost"],
              ["What we get wrong", "/benchmark"],
              ["Compare", "/compare"],
              ["Remove my business", "/opt-out"],
            ]}
            column={9}
          />
          <div style={{ gridColumn: "11 / span 2", display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="lab" style={{ color: "#5B6470" }}>Small print</span>
            <span className="small" style={{ color: "#8A929B" }}>
              Only business information companies publish themselves. Removal on
              request.
            </span>
            <Link className="navlink" href="/privacy">Privacy</Link>
            <Link className="navlink" href="/terms">Terms</Link>
            <Link className="navlink" href="/bot">How we crawl</Link>
          </div>
        </div>

        <div style={{ position: "relative", height: 140, overflow: "hidden" }} aria-hidden>
          <span className="ghostword">small fish</span>
        </div>
      </footer>
    </main>
  );
}

function CostRow({
  name,
  price,
  note,
  bar,
  delay,
  outcome,
}: {
  name: string;
  price: string;
  note?: string;
  bar: number;
  delay: number;
  outcome: string;
}) {
  return (
    <div className="cost">
      <h3>{name}</h3>
      <span className="mono" style={{ fontSize: 20, whiteSpace: "nowrap" }}>
        {price}
        {note && (
          <span style={{ fontSize: 13, color: "var(--ink-3)" }}> {note}</span>
        )}
      </span>
      <span className="bar">
        <i style={{ width: `${bar}%`, animationDelay: `${delay}s` }} />
      </span>
      <span className="small" style={{ color: "var(--ink-2)" }}>
        {outcome}
      </span>
    </div>
  );
}

function FooterCol({
  title,
  links,
  column = 7,
}: {
  title: string;
  links: [string, string][];
  column?: number;
}) {
  return (
    <div
      style={{
        gridColumn: `${column} / span 2`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <span className="lab" style={{ color: "#5B6470" }}>{title}</span>
      {links.map(([label, href]) => (
        <Link key={label} className="navlink" href={href}>
          {label}
        </Link>
      ))}
    </div>
  );
}
