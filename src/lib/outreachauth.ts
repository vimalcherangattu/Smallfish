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

export function hookSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret ? createHmac("sha256", secret).update("instantly-webhook-v1").digest("hex") : null;
}

export function hookAuthorised(req: Request): boolean {
  const want = hookSecret();
  return !!want && same(req.headers.get("x-smallfish-hook") ?? "", want);
}
