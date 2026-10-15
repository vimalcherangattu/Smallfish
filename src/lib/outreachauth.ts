import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Who may drive the outreach routes (GTM).
 *
 * The cron routes take Vercel's `Authorization: Bearer $CRON_SECRET`, as
 * `/api/worker` does. Instantly's webhook cannot send that header's value
 * without us handing it the secret itself, so it gets a **derived** one: an
 * HMAC of a fixed label under `CRON_SECRET`, registered as a custom header on
 * the webhook. No new variable to set, and leaking it lets somebody write to
 * the outreach log, not run the crawler.
 *
 * Both refuse when `CRON_SECRET` is not set, rather than defaulting to open.
 */

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && same(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

/**
 * Vercel Cron on Hobby fires once a day, somewhere in the hour, and on
 * 2026-10-15 it did not fire at all. So Supabase's pg_cron drives these routes
 * instead (migration 0027): it sends `x-smallfish-cron` with a secret that was
 * generated inside Supabase Vault and has never been printed anywhere, and the
 * route asks the database whether it matches. Nothing to set on Vercel.
 */
export async function schedulerAuthorised(req: Request): Promise<boolean> {
  if (cronAuthorised(req)) return true;
  const token = req.headers.get("x-smallfish-cron") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/gtm_cron_ok`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    return res.ok && (await res.json()) === true;
  } catch {
    return false;
  }
}

export function hookSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret ? createHmac("sha256", secret).update("instantly-webhook-v1").digest("hex") : null;
}

export function hookAuthorised(req: Request): boolean {
  const want = hookSecret();
  return !!want && same(req.headers.get("x-smallfish-hook") ?? "", want);
}
