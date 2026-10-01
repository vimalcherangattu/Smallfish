import Link from "next/link";

import Explainer from "@/components/Explainer";
import Motion from "@/components/Motion";
import Bubbles from "@/components/Bubbles";
import Fish from "@/components/Fish";
import School from "@/components/School";
import { MarketingFooter, MarketingNav } from "@/components/MarketingChrome";
import { CTA_HREF, CTA_LABEL, CTA_NOTE, CTA_NOTE_LONG } from "@/lib/launch";
import { showcase } from "@/lib/showcase";

/**
 * The home page.
 *
 * Two sources set it. "Small Fish — Home Page (simple)" (rev 8) sets the
 * argument, a StoryBrand run where the reader is the hero, the junk list is the
 * villain and we are the guide. The design document of 2026-09-28 sets the
 * form: the tilted lure ticker, the dot field, the example row, the slab, the
 * lure sign-off.
 *
 * ## The 2026-10-01 restructure
 *
 * The page used to argue its method before it showed its product. A visitor met
 * the junk-list row counts, an annotated drawing of a crawler reading a dental
 * website, and a strip reading "42 that fit · 51 that don't · 73 we couldn't
 * tell" — all of it true, all of it the wrong first conversation. **Everything
 * about crawling, row counts and couldn't-tell now lives on `/how-we-check`**,
 * linked once, quietly, under the three steps.
 *
 * What replaces it is the thing itself: a static product card in the hero,
 * beside the headline, showing what you ask for and what comes back. It is not
 * a screenshot — it is assembled from the same measured data and the same
 * `composeMessage` as the product, so it cannot drift from what the product
 * does.
 *
 * ## Where the copy is not used as written
 *
 * | It says | What ships, and why |
 * |---|---|
 * | "We check every business", in the marquee | "We check them one by one." We read 200 of the 2,778 Phoenix dental listings with a website. The claim the copy is reaching for is that nothing is sampled or guessed, and that survives without the word "every" — which is the one word this product cannot use. |
 * | Maplewick Family Dental, Dr Alvarez, "we set up online booking for Phoenix practices" | No such clinic, and we cannot know what a visitor sells. The row is Simply Dentistry in Scottsdale with its own published phone and email, and the draft is what `composeMessage` produces. |
 * | "See it in 45 seconds", "No autoplay" | The file is 44 seconds, measured. It autoplays muted because the user asked for that directly on 2026-09-27, which outranks the document. |
 * | "Or get a free sample list for your city →" | Left out. There is no such flow, and a link to nothing is worse than no link. |
 */

export const metadata = {
  title: "Small Fish — find the exact small businesses that need what you sell",
  description:
    "Pick a type of business and a city. We find the ones that fit, with " +
    "their email and a first message ready to send. 20 businesses free, no card.",
};

const TRADES = [
  "dentists", "salons", "plumbers", "garages",
  "gyms", "law firms", "shops", "clinics",
];

export default async function Home() {
  const s = await showcase();

  return (
    <main className="mkt">
      {/* The choreography. Installs `.js` on <html>, so nothing above is
          hidden until it is certain something can reveal it again. */}
      <Motion />

      {/* ------------------------------------------------------------ hero -- */}
      <section style={{ background: "var(--ink)", color: "var(--paper)", position: "relative", overflow: "hidden", paddingBottom: 30 }}>
        <MarketingNav dark />

        {/* Source order is headline → sub → card → button, which **is** the
            phone order the brief asks for, so the small screen needs no
            reordering at all. Above 980px the grid puts the card in the right
            column and lifts the button back under the sub. Doing it the other
            way round — desktop order in the DOM, `order:` on mobile — is how a
            page ends up tabbing in a different sequence from the one it is
            read in. */}
        <div className="wrap herogrid" style={{ position: "relative", zIndex: 1, paddingTop: 18, paddingBottom: 34 }}>
          <h1 className="dsp hero-h1">
            Find the exact small businesses that{" "}
            <span
              style={{
                background: "var(--lure)",
                color: "var(--ink)",
                padding: "0 .06em",
                display: "inline-block",
                transform: "rotate(-1.2deg)",
              }}
            >
              need what you sell.
            </span>
          </h1>

          <p className="lede hero-sub">
            Pick a type of business and a city. We find the ones that fit, with
            their email and a first message ready to send.
          </p>

          {s && (
            <div className="herocard">
              <div className="herocard-ask">
                <p><span className="lab">You sell</span> &nbsp;·&nbsp; online booking</p>
                <p><span className="lab">To</span> &nbsp;·&nbsp; dental clinics in Phoenix</p>
              </div>

              <p className="herocard-result dsp">
                <span className="lure" data-count={s.fit}>{s.fit}</span> clinics fit
              </p>

              {/* The same `.rowcard` the product section below uses, at a
                  smaller size: one component, so the card in the hero cannot
                  promise a shape the page later fails to deliver. */}
              <div className="rowcard herocard-row">
                <div className="head">
                  <div>
                    <p className="name">{s.name}</p>
                    <p className="place">{s.city}</p>
                  </div>
                  <div className="herocard-contacts">
                    {s.phone && <span className="mono">{s.phone}</span>}
                    {s.email && <span className="mono">{s.email}</span>}
                    {s.domain && <span className="mono dim">{s.domain}</span>}
                  </div>
                </div>

                {s.message && (
                  <div className="heromail">
                    <p className="lab">Opening email · ready to send</p>
                    {/* Two lines and a fade, not an excerpt chosen by hand:
                        the height is two line-boxes and the gradient is the
                        card's own background, so whatever `composeMessage`
                        writes is cut at the same place.

                        The paragraphs are joined rather than taking the first.
                        `composeMessage` opens with a bare greeting — "Hi
                        there," — so the first paragraph on its own filled both
                        visible lines with nothing. Joined, the two lines carry
                        the greeting and the start of the observation, which is
                        the part worth previewing. */}
                    <div className="heromail-body">
                      <p className="cite">{s.message.split("\n\n").join(" ")}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="hero-cta">
            <Link className="cta" data-magnet href={CTA_HREF}>{CTA_LABEL}</Link>
            <p className="lab" style={{ marginTop: 14, color: "#8A929B" }}>{CTA_NOTE}</p>
          </div>
        </div>

        {/* The school drifting behind the headline.

            `zIndex: 0` and "sits first" were meant to keep the nav above it,
            and that reasoning holds *inside* the hero, where every later
            sibling carries `zIndex: 1`. **The nav is not inside the hero.** It
            is earlier in the document with no z-index of its own, so this
            positioned layer painted over it — and swallowed every click on
            every header link, including Sign up.

            `pointerEvents: "none"` is the fix that does not depend on getting
            a stacking order right. This element is `aria-hidden`: it is
            decoration, it is not there for a screen reader, and it has no
            business being there for a mouse either. */}
        <div
          style={{
            position: "absolute",
            left: -80,
            top: 0,
            width: 1600,
            opacity: 0.55,
            zIndex: 0,
            pointerEvents: "none",
          }}
          className="schoolmove"
          aria-hidden
        >
          <School width={1600} height={620} />
        </div>

        {/* The mark, and its bubbles.
            `Bubbles` is positioned in percentages of *this* container, so it
            has to live inside it — rendering it as a sibling puts six circles
            in the top-left corner of the page. And the mark is the outline
            variant: the design draws it as a line, and a solid lure fish that
            size becomes the loudest thing on the screen, louder than the
            headline it sits behind. */}
        <div className="hero-fish swim" style={{ pointerEvents: "none" }} aria-hidden>
          <Fish variant="outline" width={720} strokeWidth={0.35} />
          <Bubbles where="hero" />
        </div>
      </section>

      {/* The ticker. "We look at every website" was the design's line and is the
          one claim this product may not make — we read 200 of Phoenix's 2,778.
          The promise that survives is the one we keep. */}
      <div className="band band-lure" style={{ marginTop: 48 }}>
        <div className="mq lab" style={{ fontSize: 12 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i}>
              WE CHECK THEM ONE BY ONE &nbsp;·&nbsp; YOU GET ONLY THE ONES THAT FIT
              &nbsp;·&nbsp; EACH ONE COMES WITH AN OPENING EMAIL &nbsp;·&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------- 1 · three steps -- */}
      <section className="wrap tight">
        <p className="lab eyebrow">Three steps</p>
        <h2 className="dsp h-sec">Here&rsquo;s how it works.</h2>

        <div className="steps stagger">
          <div className="step">
            <div className="stepart">
              <div className="miniform">
                <div className="minifield"><span>who</span> dentists</div>
                <div className="minifield"><span>where</span> Phoenix</div>
                <span className="sf-btn-lure" style={{ height: 34, fontSize: 13, pointerEvents: "none" }}>
                  Find them
                </span>
              </div>
            </div>
            <div className="stepbody">
              <span className="stepnum">01</span>
              <h3>Tell us who you sell to and where.</h3>
              <p>A type of business and a city. That&rsquo;s the whole form.</p>
            </div>
          </div>

          <div className="step">
            <div className="stepart">
              <div className="sheets" aria-hidden><i /><i /><i /></div>
            </div>
            <div className="stepbody">
              <span className="stepnum">02</span>
              <h3>We read them one by one.</h3>
              <p>Each on its own website, page by page. No guessing from a database.</p>
            </div>
          </div>

          <div className="step">
            <div className="stepart">
              <div className="minirow">
                <div className="top">
                  <span className="dot" aria-hidden />
                  <span className="nm2">{s?.name ?? "A business that fits"}</span>
                </div>
                <i className="ln" /><i className="ln s" />
                <span className="mail">opening email ready</span>
              </div>
            </div>
            <div className="stepbody">
              <span className="stepnum">03</span>
              <h3>Get only the ones that fit.</h3>
              <p>Contacts, the reason it fits, and an email you can send as it is.</p>
            </div>
          </div>
        </div>

        {/* The one link to the method. Everything it points at used to be on
            this page, above the price, where it answered a question nobody had
            asked yet. One quiet line is the whole of it now. */}
        <p style={{ marginTop: "var(--s4)" }}>
          <Link
            href="/how-we-check"
            className="sf-tap"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: "var(--ink-2)",
              borderBottom: "1px solid var(--line-strong)",
              paddingBottom: 3,
            }}
          >
            How we check each business →
          </Link>
        </p>
      </section>

      {/* ------------------------------------------------- 2 · the one row -- */}
      {s && (
        <section className="wrap tight">
          <p className="lab eyebrow">And this is the row you get</p>
          <div className="rowcard rise" data-tilt>
            <div className="head">
              <div>
                <p className="name">{s.name}</p>
                <p className="place">{s.city}</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "right" }}>
                {s.phone && <span className="mono" style={{ fontSize: 15 }}>{s.phone}</span>}
                {s.email && <span className="mono" style={{ fontSize: 15 }}>{s.email}</span>}
                {s.domain && <span className="mono" style={{ fontSize: 15, color: "var(--ink-3)" }}>{s.domain}</span>}
              </div>
            </div>

            {s.message && (
              <div className="mailwrap">
                <p className="lab" style={{ color: "var(--lure-text)" }}>Your opening email</p>
                {/* Rendered as the paragraphs it is written in. As one block
                    it read as a wall; the draft is four short beats —
                    greeting, what is true of their site, why it costs them
                    something, and the ask. */}
                {s.message.split("\n\n").map((para, i) => (
                  <p
                    key={i}
                    className="cite"
                    style={{ fontSize: "clamp(17px,1.8vw,20px)", lineHeight: 1.55, marginTop: 14, maxWidth: "58ch" }}
                  >
                    {para}
                  </p>
                ))}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--s3)",
                    justifyContent: "space-between",
                    marginTop: "var(--s4)",
                    paddingTop: "var(--s3)",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <span className="small" style={{ color: "var(--ink-3)" }}>
                    Every line traces back to something on their own website.
                  </span>
                  <span className="lab" style={{ color: "var(--ink-3)" }}>
                    You edit it · you send it · we never send anything
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ 3 · the stakes */}
      <section className="wrap tight">
        <p className="lab eyebrow">What a bought list actually costs</p>
        <div className="g12" style={{ rowGap: "var(--s3)" }}>
          <h2 className="dsp h-sec" style={{ gridColumn: "1 / span 7" }}>
            Junk lists cost you more than money.
          </h2>
          <div style={{ gridColumn: "8 / span 5" }}>
            <p className="lede" style={{ color: "var(--ink-2)" }}>
              Most of the businesses on them will never buy from you. You lose
              days checking websites by hand. And you still don&rsquo;t know who
              to call first.
            </p>
            <p className="dsp" style={{ fontSize: "clamp(18px,2vw,25px)", marginTop: "var(--s3)", lineHeight: 1.3 }}>
              <span className="lure">
                Every email to the wrong business makes the next one less likely
                to land.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- 4 · the guide speaks -- */}
      <section className="wrap" style={{ paddingTop: 76 }}>
        {/* `alignItems: end` sets the paragraph on the headline's last line.
            Left at the default it hung from the top of a four-line headline
            with a screen of white under it, reading as two unrelated things
            rather than a statement and its answer. */}
        <div className="g12" style={{ rowGap: 20, alignItems: "end" }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: "clamp(26px,3.6vw,46px)" }}>
            We know what it&rsquo;s like to open forty websites and still not
            know who to call.
          </h2>
          <p className="lede" style={{ gridColumn: "8 / span 5", color: "var(--ink-2)" }}>
            So we do the checking for you. Every business, one by one, on its
            own website. Nothing is guessed and nothing is made up.
          </p>
        </div>

        {/* The proof line, standing in for the testimonial until there are
            users to quote — so it has to carry the block, not sit in the
            corner of it as an 12px chip. Full width, the two numbers in lure
            at reading size, and rendered from the measured tallies. */}
        {s && (
          <div
            style={{
              marginTop: 40,
              background: "var(--ink)",
              padding: "24px 30px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <span className="lab" style={{ color: "#5B6470" }}>Measured in Phoenix</span>
            <span className="mono" style={{ color: "#B9BFB6", fontSize: "clamp(15px,1.7vw,20px)" }}>
              <strong style={{ color: "var(--lure)", fontWeight: 500 }} data-count={s.checked}>
                {s.checked}
              </strong>{" "}
              dental websites checked &nbsp;·&nbsp;{" "}
              <strong style={{ color: "var(--lure)", fontWeight: 500 }} data-count={s.fit}>
                {s.fit}
              </strong>{" "}
              were a fit
            </span>
          </div>
        )}
      </section>

      {/* ----------------------------------------------------- 5 · the film -- */}
      <section className="wrap" style={{ paddingTop: 84, maxWidth: 980, marginLeft: "auto", marginRight: "auto" }}>
        <Explainer />
      </section>

      {/* ------------------------------------------------------ 6 · coverage -- */}
      <section className="wrap tight">
        <p className="lab eyebrow">Coverage</p>
        <h2 className="dsp h-sec wide">Any local business. Any city in the US.</h2>

        <div className="mapgrid">
          <div className="mapcol">
            <p className="lede" style={{ color: "var(--ink-2)", maxWidth: "52ch" }}>
              What you are looking for is read off the page. It is not looked up
              in a list of industries we prepared in advance.
            </p>
            <div className="mqband">
              <div className="mq dsp" style={{ fontSize: "clamp(26px,4vw,54px)" }}>
                {Array.from({ length: 3 }, (_, i) => (
                  <span key={i}>
                    {TRADES.map((t) => (
                      <span key={t} style={{ marginRight: "0.5em" }}>{t}</span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="legcol stagger">
            <div className="legrow">
              <i style={{ background: "var(--lure)" }} />
              <span>
                <b>Phoenix, Austin, Tampa</b>
                <span>Read in full today, so a search here comes back at once.</span>
              </span>
            </div>
            <div className="legrow">
              <i style={{ background: "var(--line-strong)" }} />
              <span>
                <b>Everywhere else</b>
                {/* The design promised "the answer comes back the same day".
                    Reading a city cold is not switched on at all yet, so that
                    is a delivery date we cannot keep — it says what happens
                    instead. */}
                <span>We start reading a city the first time somebody asks for it.</span>
              </span>
            </div>
            <div className="legrow">
              <i style={{ background: "var(--ink)" }} />
              <span>
                <b>Any trade, no setup</b>
                <span>Dentists, salons, plumbers, garages, gyms, law firms. Nothing is hard-coded per industry.</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ 7 · the price -- */}
      <section className="slab-v3">
        <div className="wrap">
          <p className="lab eyebrow" style={{ color: "#5B6470" }}>Pricing</p>
          <div className="g12" style={{ rowGap: "var(--s4)" }}>
            <div style={{ gridColumn: "1 / span 6" }}>
              <h2 className="dsp h-sec" style={{ color: "#EEF0EC" }}>
                You only pay for businesses that fit.
              </h2>
              <div className="prices stagger">
                {["$29", "$79", "$199"].map((p2) => (
                  <span className="price" key={p2}>
                    <b>{p2}</b>
                    <span>a month</span>
                  </span>
                ))}
              </div>
              <p className="small" style={{ color: "#B9BFB6", marginTop: "var(--s3)" }}>
                How many businesses you need decides which one.
              </p>
            </div>

            <div style={{ gridColumn: "8 / span 5" }}>
              {/* Each of these is enforced somewhere in the repo, which is why
                  they can be printed as promises: BILLABLE gates the charge,
                  every published contact carries the page it came from,
                  nothing in the codebase sends mail, and the free plan is 20
                  credits. */}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--s2)" }}>
                {[
                  "Businesses that don’t fit are free.",
                  "Every contact comes from their own website.",
                  "We never send anything. You do.",
                  "Your first 20 are free. No card.",
                ].map((line) => (
                  <li key={line} style={{ display: "flex", gap: 12, color: "#EEF0EC", fontSize: 16, lineHeight: 1.5 }}>
                    <span aria-hidden style={{ color: "var(--lure)" }}>→</span>
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="sf-tap"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: "var(--s4)",
                  color: "var(--lure)",
                  fontWeight: 500,
                  borderBottom: "1px solid rgba(200,240,60,.45)",
                  paddingBottom: 3,
                }}
              >
                See pricing →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- 8 · sign-off */}
      <section className="signoff">
        {/* Its own mark, drawn in ink rather than lure because the panel is
            already lure. Bubbles inside the same positioned box, for the same
            reason as the hero's. */}
        <div
          // Down and further out than the design's placement. At
          // right:-130/bottom:-110 the circle ran straight through "20
          // BUSINESSES FREE · NO CARD · NOTHING TO INSTALL", which wraps to two
          // lines at desktop width — the text sits above it in z-order and
          // still read as struck through.
          style={{
            position: "absolute",
            right: -210,
            bottom: -200,
            opacity: 0.4,
            zIndex: 0,
            pointerEvents: "none",
          }}
          className="swim"
          aria-hidden
        >
          <Bubbles where="closer" colour="#0E1520" />
          <Fish variant="outline" width={470} strokeWidth={0.3} outlineColour="#0E1520" />
        </div>

        <div className="wrap" style={{ position: "relative", zIndex: 1, paddingTop: 84, paddingBottom: 84 }}>
          <div className="g12" style={{ rowGap: 30, alignItems: "center" }}>
            <div style={{ gridColumn: "1 / span 7" }}>
              <h2 className="dsp" style={{ fontSize: "clamp(38px,6.4vw,84px)" }}>
                From guessing to knowing.
              </h2>
              <p className="lede" style={{ marginTop: 20, maxWidth: "34ch", color: "#2C3A15" }}>
                Stop working from junk lists. Start with the businesses that
                need you.
              </p>
            </div>
            <div style={{ gridColumn: "9 / span 4" }}>
              <Link
                className="cta"
                data-magnet
                href={CTA_HREF}
                style={{ background: "var(--ink)", color: "var(--lure)" }}
              >
                {CTA_LABEL}
              </Link>
              <p className="lab" style={{ marginTop: 14, color: "#4A6508" }}>{CTA_NOTE_LONG}</p>
            </div>
          </div>
        </div>
      </section>

      {/* The ghost wordmark and the footer are one ink block.
          Two things were wrong. They were separate elements, and the footer's
          default 80px top margin let the page's paper through between them as
          a white band — a rendering fault, not a gap. And the wordmark was set
          at up to 250px with its own padding, so it took a whole screen of
          dark on the way to the footer and read as an empty section.
          It is a watermark: smaller, and the footer is pulled up over its
          lower half so the two overlap the way the design draws them. */}
      <div style={{ background: "#0E1520", overflow: "hidden" }}>
        <p
          className="ghostword wrap"
          aria-hidden
          style={{ margin: 0, whiteSpace: "nowrap", paddingTop: 26 }}
        >
          small fish
        </p>
        <div style={{ marginTop: "-0.34em" }}>
          <MarketingFooter flush />
        </div>
      </div>
    </main>
  );
}
