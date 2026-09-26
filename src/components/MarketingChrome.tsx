import Link from "next/link";

import Fish from "@/components/Fish";
import { CTA_HREF, NAV_CTA } from "@/lib/launch";

/**
 * The nav and footer the marketing pages share.
 *
 * Three pages were added at once when the home page was cut down to seven
 * blocks, and each needed the same header and the same footer. Copying them
 * was how the old site ended up with a footer that listed a page that had been
 * renamed — so they live here, and a link changes in one place.
 */

export function MarketingNav({ dark = false }: { dark?: boolean }) {
  const ink = dark ? "#EEF0EC" : "var(--ink)";
  return (
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
        <Fish width={36} />
        <span className="dsp" style={{ fontSize: 22, fontWeight: 600, color: ink, lineHeight: 1 }}>
          small fish
        </span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <Link className="navlink max-sm:hidden" href="/how-we-check">How we check</Link>
        <Link className="navlink max-sm:hidden" href="/markets">Markets</Link>
        <Link className="navlink max-sm:hidden" href="/pricing">Pricing</Link>
        <Link className="navlink max-sm:hidden" href="/app">Sign in</Link>
        <Link className="cta sm" href={CTA_HREF}>{NAV_CTA}</Link>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  const cols: [string, [string, string][]][] = [
    ["Product", [["Markets", "/markets"], ["Pricing", "/pricing"], ["Sign in", "/app"]]],
    [
      "Company",
      [
        ["How we check", "/how-we-check"],
        ["Why it exists", "/why-it-exists"],
        ["Remove my business", "/opt-out"],
      ],
    ],
    [
      "Small print",
      [
        ["Privacy", "/privacy"],
        ["Terms", "/terms"],
        ["How we crawl", "/bot"],
        ["What we get wrong", "/benchmark"],
      ],
    ],
  ];

  return (
    <footer
      style={{
        background: "#0E1520",
        color: "#B9BFB6",
        padding: "56px 56px 48px",
        marginTop: 80,
      }}
    >
      <div className="g12" style={{ rowGap: 32 }}>
        <div style={{ gridColumn: "1 / span 4", display: "flex", flexDirection: "column", gap: 14 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <Fish width={34} />
            <span className="dsp" style={{ fontSize: 21, fontWeight: 600, color: "#EEF0EC", lineHeight: 1 }}>
              small fish
            </span>
          </Link>
          <span className="small" style={{ color: "#8A929B", fontStyle: "italic" }}>
            We read, we cite, and we say when we could not tell. We never send.
          </span>
        </div>
        {cols.map(([title, links], i) => (
          <div
            key={title}
            style={{
              gridColumn: `${7 + i * 2} / span 2`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <span className="lab" style={{ color: "#5B6470" }}>{title}</span>
            {links.map(([label, href]) => (
              <Link key={label} className="navlink" href={href}>
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </footer>
  );
}
