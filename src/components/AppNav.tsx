"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import Fish from "@/components/Fish";

/**
 * The product's navigation.
 *
 * **Literal words only**, per `docs/design-system.md` §4: Search, Runs,
 * Exports, Watchlist. No "reel in", no "cast a net", no fish anywhere near a
 * verdict. The mark in the corner is the one place the brand is allowed to be
 * a brand, because the design itself puts it there.
 *
 * Every item here goes somewhere that exists. A nav that lists features to
 * come is how a product feels unfinished in the one place a customer looks to
 * find out what it does — anything unbuilt stays off this list until it is not.
 * "Runs" was absent for exactly that reason until 2026-09-26, when searches
 * started being kept. It is here now because the page behind it has something
 * in it.
 */

const ITEMS: { href: string; label: string; hint: string }[] = [
  { href: "/app", label: "Overview", hint: "Where things stand" },
  { href: "/app/search", label: "Search", hint: "Find businesses by what their site says" },
  { href: "/app/icp", label: "Who to target", hint: "Turn what you sell into things we can check" },
  { href: "/app/runs", label: "Runs", hint: "Every search you have run" },
  { href: "/app/explore", label: "Explore a market", hint: "The markets already read, on a map" },
  { href: "/app/destinations", label: "Destinations", hint: "Where matched rows go" },
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
