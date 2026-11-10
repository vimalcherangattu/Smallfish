import { notFound, redirect } from "next/navigation";

import { listByToken, logEvent } from "@/lib/prospecting";
import { tryUrl } from "@/lib/sequence";

/**
 * The link in a cold email. It goes straight into the product.
 *
 * Until 2026-11-10 this was a free list page: three businesses we had read for
 * the prospect, then a button into the product. 210 people were emailed it
 * and nobody replied (owner's call, 2026-11-10: "directly get them to try the
 * product"). Now it records the click, which is the only click signal outreach
 * has (the emails carry no tracking), and lands them on `/app/find` with their
 * trade and city already typed, so the search runs on arrival.
 *
 * Kept as a redirect rather than deleted because every email already sent
 * links here.
 */

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Hi({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await listByToken(token).catch(() => null);
  if (!p) notFound();
  // A mail scanner opening the link counts too.
  await logEvent("visited", { domain: p.domain }).catch(() => undefined);
  redirect(tryUrl("", p, token));
}
