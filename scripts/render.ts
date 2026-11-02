/**
 * The headless half of the fetcher (DEW, 2026-11-01): for a page that is an
 * empty frame until a browser runs its script, and only for that.
 *
 * Measured on 100 HVAC Tampa listings: 10 home pages came back with under 300
 * visible characters on a plain fetch. They are not unreadable sites, they are
 * sites a plain fetch cannot read. `read.ts` calls this only after the plain
 * fetch has already happened and found a shell, so the browser is a fallback
 * and never the default: robots.txt was checked, the host was throttled, and
 * the user agent is ours, the same one the plain fetch sends.
 *
 * Never imported by the Next.js app. Vercel does not run a browser, and the
 * team's CPU allowance is shared, so this lives with the GitHub Actions runner
 * and is injected with `setRenderer`.
 */

import type { Browser } from "playwright";

import type { Renderer } from "@/lib/read";

let browser: Promise<Browser> | null = null;

export async function headlessRenderer(): Promise<{ render: Renderer; close: () => Promise<void> } | null> {
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return null; // no browser here: shells are reported as js_shell, which is true
  }
  const render: Renderer = async (url, ua) => {
    browser ??= chromium.launch();
    const b = await browser;
    const ctx = await b.newContext({ userAgent: ua, javaScriptEnabled: true });
    try {
      const page = await ctx.newPage();
      // Pictures, fonts and video are not words; skipping them keeps a render
      // to about the cost of the page itself.
      await page.route("**/*", (r) =>
        ["image", "media", "font"].includes(r.request().resourceType()) ? r.abort() : r.continue(),
      );
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
      await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => undefined);
      return await page.content();
    } finally {
      await ctx.close();
    }
  };
  return {
    render,
    close: async () => {
      if (browser) await (await browser).close();
      browser = null;
    },
  };
}
