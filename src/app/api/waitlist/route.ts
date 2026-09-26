import { canWrite, currentEnv } from "@/lib/db";

/**
 * Join the waitlist (S2-13).
 *
 * The market somebody describes is the point of this endpoint, not the email.
 * An address is a number to report; "roofers in Sacramento who don't show
 * pricing" is the queue telling us which market to read first.
 *
 * It answers 200 for an address already on the list, and says so. The
 * alternative — an error for "you are already in the queue" — punishes
 * somebody for the entirely ordinary act of forgetting, and leaks which
 * addresses are on the list to anybody willing to guess.
 */

export const dynamic = "force-dynamic";

/** Deliberately loose. A regex that rejects a valid address is worse than one
 *  that accepts an invalid one: the second costs a wasted row, the first costs
 *  a customer who cannot tell you why the form will not take their email. */
const looksLikeEmail = (s: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s);

export async function POST(request: Request) {
  let body: { email?: unknown; market?: unknown; source?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, reason: "Send JSON." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  if (!looksLikeEmail(email)) {
    return Response.json(
      { ok: false, reason: "That does not look like an email address." },
      { status: 400 },
    );
  }

  if (!canWrite()) {
    return Response.json(
      {
        ok: false,
        reason:
          "The waitlist is not configured on this deployment, so nothing was " +
          "saved. That is ours rather than yours — nothing about your address " +
          "was kept.",
      },
      { status: 503 },
    );
  }

  const env = currentEnv();
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/rest/v1/rpc/join_waitlist`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        p_email: email,
        // Bounded: free text from a stranger, stored and later read by us.
        p_market: String(body.market ?? "").slice(0, 300) || null,
        p_source: String(body.source ?? "").slice(0, 60) || null,
      }),
    });

    if (!res.ok) {
      return Response.json(
        { ok: false, reason: "That did not save. Nothing was kept — try again." },
        { status: 502 },
      );
    }

    const rows = (await res.json()) as Array<{ joined: boolean; already: boolean }>;
    const row = rows[0] ?? { joined: false, already: false };
    if (!row.joined) {
      return Response.json(
        { ok: false, reason: "That does not look like an email address." },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      already: row.already,
      message: row.already
        ? "You are already on the list — we have updated what you are looking for."
        : "You are on the list. We will write when your market is next.",
    });
  } catch {
    return Response.json(
      { ok: false, reason: "Could not reach the server. Nothing was saved." },
      { status: 502 },
    );
  }
}
