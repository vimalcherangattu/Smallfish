"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Fish from "@/components/Fish";

/**
 * The product's navigation.
 *
 * **Literal words only**, per `docs/design-system.md` §4. No "reel in", no
 * "cast a net". The mark in the corner is the one place the brand is allowed to
 * be a brand, because the design itself puts it there.
 *
 * Three items, down from six. "Overview" was a page of counters in front of the
 * search box and is now the search box; "Explore a market" opened a map with
 * radius buttons and verdict filters; "Who to target" was a second front door
 * for the same question the box already asks. A product that does one thing
 * should not offer six places to start doing it.
 *
 * The map still exists at `/app/explore` for picking a region by hand, and the
 * ICP builder at `/app/icp`. Neither is a front door any more, so neither is
 * in the nav.
 */

const ITEMS: { href: string; label: string; hint: string }[] = [
  { href: "/app", label: "Find businesses", hint: "Say who you want and where" },
  { href: "/app/runs", label: "Saved searches", hint: "Every list you have pulled" },
  { href: "/app/destinations", label: "Send to", hint: "HubSpot, a sequencer, or a webhook" },
];

export default function AppNav() {
  const path = usePathname() ?? "";
  // `/app` must not light up on `/app/runs`, so the overview matches exactly
  // and everything else matches its subtree.
  const current = (href: string) =>
    href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`);

  return (
    <nav className="flex h-full flex-col gap-1 p-4">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-2 py-1">
        <Fish width={26} />
        <span className="sf-h3">small fish</span>
      </Link>

      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className="sf-nav"
          aria-current={current(i.href) ? "page" : undefined}
          title={i.hint}
        >
          {i.label}
        </Link>
      ))}

      <div className="mt-auto space-y-1 border-t border-[var(--line)] pt-4">
        <Link href="/account" className="sf-nav" aria-current={current("/account") ? "page" : undefined}>
          Credits and billing
        </Link>
        <Link href="/benchmark" className="sf-nav">
          How accurate we are
        </Link>
      </div>
    </nav>
  );
}
