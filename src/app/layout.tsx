import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/clerk";
import { DM_Mono, Libre_Franklin, Literata } from "next/font/google";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

// The three voices of the design system: the product speaks in Libre Franklin,
// the account speaks in Literata, and anything we computed speaks in DM Mono.
// Typeface changed 2026-10-06 (was Fraunces / IBM Plex Sans / IBM Plex Mono).
// Literata and Libre Franklin are variable; DM Mono has 400 and 500 only.
const display = Literata({ subsets: ["latin"], variable: "--font-display" });
const sans = Libre_Franklin({ subsets: ["latin"], variable: "--font-sans" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Small Fish",
  description:
    "Find local businesses by what they actually do, and prove every match.",
};

/** `<ClerkProvider>` throws without a publishable key, and this layout wraps
 *  every page — so mounting it unconditionally on a site that is already live
 *  would take down the marketing pages, the templates, the benchmark, the free
 *  count and the opt-out form, none of which need login. Mounted only when the
 *  key is there. See `lib/clerk.ts`. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const page = (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
  return CLERK_ENABLED ? <ClerkProvider>{page}</ClerkProvider> : page;
}
