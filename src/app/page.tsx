import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Bubbles from "@/components/Bubbles";
import Explainer from "@/components/Explainer";
import Fish from "@/components/Fish";
import School from "@/components/School";
import { CTA_HREF, CTA_LABEL, CTA_NOTE, CTA_NOTE_LONG, NAV_CTA, SIGNUP_OPEN } from "@/lib/launch";
import { outreachFor } from "@/lib/outreach";
import { PLANS } from "@/lib/pricing";
import type { Market } from "@/lib/types";

/**
 * The home page, to the 2026-09-26 copy: seven blocks, one action.
 *
 * The previous page argued the method before it said what arrives in your
 * hands. This one says what arrives, shows one real row, and stops. Everything
 * it dropped is still on the site — the benchmark and the refusals moved to
 * `/how-we-check`, the essayistic lines to `/why-it-exists`, the market picker
 * to `/markets`.
 *
 * ## Four places the copy is not shipped verbatim, all the same kind
 *
 *   as written                              | shipped, and why
 *   ----------------------------------------|----------------------------------
 *   "20 BUSINESSES FREE"                    | "up to 20" — 20 *credits*, and a
 *                                           | rare match costs 2 or 3, so 20 is
 *                                           | the ceiling, not the promise
 *   "Name, phone, email, website"           | "the contact details they
 *                                           | publish" — only 32.4% of the
 *                                           | 1,572 businesses we hold contacts
 *                                           | for published an email at all
 *   Maplewick Family Dental, (602) 555-0148 | a real matched clinic, its real
 *                                           | published phone
 *   "544 of 544 quotes verified"            | 11 of 11. `544` appears nowhere
 *                                           | in any measurement, and this is
 *                                           | the third document to carry it
 *
 * The example row is the one that matters. The copy's build list asks for
 * "real values in the block 2 row, from a finished read", so this assembles it
 * from `public/data` at render: a business that was read, the phone it
 * publishes on its own site, and the sentence `outreach.ts` writes from the
 * evidence. Maplewick has appeared in three design documents and exists in
 * none of the data.
 *
 * ## And one condition the copy set for itself
 *
 * It says the buttons may only say "Sign up free" if a new user can describe a
 * market and get a real list back, and gives the exact fallback if not. They
 * cannot — cold reads need a model key — so `lib/launch.ts` holds the switch
 * and the buttons say waitlist. Every other word is the copy's.
 */

export const metadata = {
  title: "Small Fish — find the local businesses that fit what you sell",
  description:
    "Tell us who you sell to and where. We check every local business one by one " +
    "and send back the ones that fit, with contacts and a line on why each one fits.",
  openGraph: {
    title: "42 dental clinics in Phoenix still take bookings by phone.",
    description:
      "Small Fish checks local businesses one by one and gives you only the ones " +
      "that fit what you sell.",
  },
};

/** Measured: PROJECT_PLAN.md · Live numbers · 2026-09-22. */
const PHOENIX_MATCHES = 42;

/**
 * One real row for block 2.
 *
 * Picky, for two reasons that have already bitten. It needs a business whose
 * site is its own — Overture's `website` field sometimes carries a franchise's
 * or a manufacturer's domain — and it needs a contact the business actually
 * published, which `extract_contacts.py` withholds for shared domains because
 * anything on them belongs to someone it cannot identify.
 */
async function exampleRow() {
  try {
    const [market, contacts] = await Promise.all([
      readFile(path.join(process.cwd(), "public", "data", "dental-phoenix.json"), "utf8").then(
        (t) => JSON.parse(t) as Market,
      ),
      readFile(
        path.join(process.cwd(), "public", "data", "contacts-dental-phoenix.json"),
        "utf8",
      ).then(
        (t) =>
          (JSON.parse(t) as {
            contacts: Record<
              string,
              {
                emails?: { value: string }[];
                phones?: { value: string; page: string }[];
                contactPage?: string | null;
                withheld?: string;
              }
            >;
          }).contacts,
      ),
    ]);

    const criterion = market.criteria.find((c) => c.id === "no_online_booking");
    if (!criterion) return null;

    for (const b of market.businesses) {
      if (b.verdicts.no_online_booking?.verdict !== "match") continue;
      if (!b.site || !b.read?.pages) continue;
      const c = contacts[b.id];
      if (!c || c.withheld || !c.phones?.length) continue;

      // `outreachFor` writes in the **customer's** voice — "I read 4 pages of
      // their site" is an opener they will send. Under a "Why it fits" label
      // that is the wrong speaker: it reads as the visitor claiming to have
      // done the reading. So the sentence is composed here from the same three
      // facts the verdict rests on — pages read, whose site, and what was
      // looked for — which is a restatement of the record rather than a second
      // opinion about it. Requiring an icebreaker first keeps the row to
      // businesses `outreach.ts` would also vouch for.
      const o = outreachFor(b, [criterion]);
      if (!o.icebreaker) continue;
      const domain = b.site.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

      return {
        name: b.name,
        where: b.addr.split(",").slice(-2).join(",").trim(),
        phone: c.phones[0].value,
        email: c.emails?.[0]?.value ?? null,
        contactPage: c.contactPage ?? null,
        site: domain,
        why:
          `We read ${b.read.pages} pages of ${domain}, including the ones that ` +
          `would carry a booking link, and found none.`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export default async function Home() {
  const row = await exampleRow();
  const free = PLANS.find((p) => p.id === "free")!;
  const paid = PLANS.filter((p) => ["starter", "growth", "agency"].includes(p.id));

  return (
    <main className="mkt">
      {/* ============================== 1 · hero ============================== */}
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
          <School width={1600} height={620} />
        </div>
        <div style={{ position: "absolute", right: -180, top: 170 }} className="swim" aria-hidden>
          <Fish variant="outline" width={720} strokeWidth={0.35} />
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
            <span className="dsp" style={{ fontSize: 24, fontWeight: 600, color: "#EEF0EC", lineHeight: 1 }}>
              small fish
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <Link className="navlink max-sm:hidden" href="/how-we-check">How we check</Link>
            <Link className="navlink max-sm:hidden" href="/markets">Markets</Link>
            <Link className="navlink max-sm:hidden" href="/pricing">Pricing</Link>
            <Link className="navlink max-sm:hidden" href="/app">Sign in</Link>
            <Link className="cta sm" href={CTA_HREF}>{NAV_CTA}</Link>
          </div>
        </nav>

        <div className="wrap g12" style={{ position: "relative", paddingTop: 66 }}>
          <h1
            className="dsp"
            style={{ gridColumn: "1 / span 10", fontSize: "clamp(42px,7.4vw,108px)" }}
          >
            Get the local businesses that{" "}
            <span className="hilite">actually fit</span> what you sell.
          </h1>
          <p className="lede" style={{ gridColumn: "1 / span 6", marginTop: 48, fontSize: 22 }}>
            Tell us who you sell to and where. We check every business one by one
            and send back the ones that fit — with names, contacts, and one line
            on why each one fits.
          </p>
          <div
            style={{
              gridColumn: "1 / span 7",
              marginTop: 40,
              display: "flex",
              alignItems: "center",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <Link className="cta" href={CTA_HREF}>{CTA_LABEL}</Link>
            <span className="lab" style={{ color: "#8A929B" }}>
              {SIGNUP_OPEN ? `Up to ${free.credits} businesses free · no card` : CTA_NOTE}
            </span>
          </div>
        </div>

        <div className="ticker" style={{ marginTop: 84 }}>
          <span className="mq lab">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}>
                WE CHECK EVERY ONE &nbsp;·&nbsp; WE TELL YOU WHY IT FITS &nbsp;·&nbsp; YOU ONLY
                PAY FOR THE ONES THAT DO &nbsp;·&nbsp;{" "}
              </span>
            ))}
          </span>
        </div>
      </header>

      {/* =========================== 2 · one example =========================== */}
      <section className="wrap" style={{ paddingTop: 96, paddingBottom: 96 }}>
        <div className="g12" style={{ rowGap: 36 }}>
          <div style={{ gridColumn: "1 / span 5" }}>
            <p className="lab" style={{ color: "var(--ink-3)" }}>You ask for</p>
            <p className="dsp" style={{ fontSize: "clamp(24px,2.6vw,34px)", marginTop: 12 }}>
              Dental clinics in Phoenix that still take bookings by phone.
            </p>
          </div>
          <div style={{ gridColumn: "7 / span 5" }}>
            <p className="lab" style={{ color: "var(--ink-3)" }}>You get</p>
            <p className="dsp" style={{ fontSize: "clamp(24px,2.6vw,34px)", marginTop: 12 }}>
              {PHOENIX_MATCHES} clinics. Name, website, the contact details they
              publish, and one line on why each one fits.
            </p>
          </div>
        </div>

        {row ? (
          <div className="panel lift" style={{ marginTop: 44 }}>
            <p className="dsp" style={{ fontSize: 26 }}>{row.name}</p>
            <p className="src">
              {row.where} · {row.phone}
              {row.email ? ` · ${row.email}` : ""}
              {!row.email && row.contactPage ? " · contact form" : ""} · {row.site}
            </p>
            <p className="cite" style={{ marginTop: 6 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600 }}>
                Why it fits:{" "}
              </span>
              <span className="mark">{row.why}</span>
            </p>
          </div>
        ) : (
          <p className="lede" style={{ marginTop: 44, color: "var(--ink-2)" }}>
            The measured markets are not on this deployment, so there is no row to
            show here rather than one made up.
          </p>
        )}
      </section>

      {/* ============================ the explainer ============================ */}
      {/* After the example, not before it. The row above is the strongest thing
          on the page and a video in front of it would be a gate on the argument.
          This shows what that row tells, for whoever would rather watch. */}
      <section className="wrap" style={{ paddingBottom: 96 }}>
        <div className="g12">
          <div style={{ gridColumn: "1 / span 8" }}>
            <Explainer />
          </div>
          <p
            className="small"
            style={{ gridColumn: "10 / span 3", color: "var(--ink-3)", alignSelf: "end" }}
          >
            Forty-four seconds, no voiceover: the list you would have bought,
            the sites you would have opened, and what comes back instead.
          </p>
        </div>
      </section>

      {/* ======================== 3 · what's in the list ======================== */}
      <section style={{ background: "#FFFFFF" }}>
        <div className="wrap" style={{ paddingTop: 96, paddingBottom: 96 }}>
          <div className="dsp" style={{ fontSize: "clamp(26px,3.4vw,44px)", maxWidth: "24ch", lineHeight: 1.22 }}>
            <p style={{ margin: 0 }}>Every business that fits, with nothing made up.</p>
            <p style={{ margin: "0.55em 0 0" }}>
              Phone, email and contact form exactly as they publish them.
            </p>
            <p style={{ margin: "0.55em 0 0" }}>
              One line on why each one fits what you asked for.
            </p>
            <p style={{ margin: "0.55em 0 0" }}>
              CSV, or straight into the tool you already use.
            </p>
          </div>
        </div>
      </section>

      {/* ===================== 4 · any local business, anywhere ===================== */}
      <section style={{ paddingTop: 96, paddingBottom: 96, overflow: "hidden" }}>
        <div className="wrap g12" style={{ alignItems: "end", marginBottom: 44 }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: "clamp(30px,4.4vw,56px)" }}>
            Any local business, anywhere in the US.
          </h2>
          <p className="lede" style={{ gridColumn: "9 / span 4", color: "var(--ink-2)" }}>
            Clinics, salons, contractors, garages, law firms, studios, agencies,
            shops. One city, a county, or a whole state. If they have a website,
            we can check them.
          </p>
        </div>
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
      </section>

      {/* ====================== 5 · why not the usual way ====================== */}
      <section className="wrap" style={{ paddingBottom: 96 }}>
        <div className="g12" style={{ rowGap: 28 }}>
          {[
            ["Bought lists", "Stale rows, and none of them say who actually fits."],
            ["Scraping it yourself", "Gets you names and websites. Someone still has to open all of them."],
            ["Hiring someone", "Slow, and it costs more than the software you're selling."],
          ].map(([title, line], i) => (
            <div key={title} style={{ gridColumn: `${1 + i * 4} / span 3` }}>
              <p className="lab" style={{ color: "var(--ink-3)" }}>{title}</p>
              <p className="lede" style={{ marginTop: 12, color: "var(--ink-2)" }}>{line}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============================= 6 · pricing ============================= */}
      <section className="wrap" style={{ paddingBottom: 110 }}>
        <div className="g12" style={{ alignItems: "end", rowGap: 20 }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 7", fontSize: "clamp(30px,4.4vw,56px)" }}>
            You only pay for the businesses that fit.
          </h2>
          <div style={{ gridColumn: "9 / span 4" }}>
            <p className="lede" style={{ color: "var(--ink-2)" }}>
              ${paid[0].priceUsd}, ${paid[1].priceUsd} or ${paid[2].priceUsd} a
              month, depending on how many you need. The ones that don&rsquo;t fit
              cost nothing.
            </p>
            <Link className="txtlink" href="/pricing" style={{ color: "var(--lure-text)", marginTop: 18 }}>
              See pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* ============================== 7 · close ============================== */}
      <section className="signup wrap" style={{ paddingTop: 96, paddingBottom: 104 }}>
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
        <div className="g12" style={{ position: "relative", rowGap: 28 }}>
          <h2 className="dsp" style={{ gridColumn: "1 / span 6", fontSize: "clamp(36px,5.4vw,68px)" }}>
            Try it on your own market.
          </h2>
          <div style={{ gridColumn: "8 / span 5", alignSelf: "end" }}>
            <Link className="cta ink" href={CTA_HREF}>{CTA_LABEL}</Link>
            <p className="lab" style={{ color: "#3A4F05", marginTop: 18, letterSpacing: "0.08em" }}>
              {SIGNUP_OPEN
                ? `Up to ${free.credits} businesses free · no card · nothing to install`
                : CTA_NOTE_LONG}
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

        <div className="g12" style={{ position: "relative", rowGap: 32 }}>
          <div style={{ gridColumn: "1 / span 4", display: "flex", flexDirection: "column", gap: 16 }}>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <Fish width={39} />
              <span className="dsp" style={{ fontSize: 24, fontWeight: 600, color: "#EEF0EC", lineHeight: 1 }}>
                small fish
              </span>
            </Link>
            <span className="small" style={{ color: "#8A929B", fontStyle: "italic" }}>
              We read, we cite, and we say when we could not tell. We never send.
            </span>
          </div>

          <FooterCol
            column={7}
            title="Product"
            links={[
              ["Markets", "/markets"],
              ["Pricing", "/pricing"],
              ["Sign in", "/app"],
            ]}
          />
          <FooterCol
            column={9}
            title="Company"
            links={[
              ["How we check", "/how-we-check"],
              ["Why it exists", "/why-it-exists"],
              ["Remove my business", "/opt-out"],
            ]}
          />
          <FooterCol
            column={11}
            title="Small print"
            links={[
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
              ["How we crawl", "/bot"],
              ["What we get wrong", "/benchmark"],
            ]}
          />
        </div>

        <div style={{ position: "relative", height: 140, overflow: "hidden" }} aria-hidden>
          <span className="ghostword">small fish</span>
        </div>
      </footer>
    </main>
  );
}

function FooterCol({
  title,
  links,
  column,
}: {
  title: string;
  links: [string, string][];
  column: number;
}) {
  return (
    <div style={{ gridColumn: `${column} / span 2`, display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="lab" style={{ color: "#5B6470" }}>{title}</span>
      {links.map(([label, href]) => (
        <Link key={label} className="navlink" href={href}>
          {label}
        </Link>
      ))}
    </div>
  );
}
