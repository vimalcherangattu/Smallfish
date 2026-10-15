/**
 * Is the outreach sender wired? (GTM automation, 2026-10-15.)
 *
 * `/api/status` answers "is the variable set". This answers the question that
 * comes straight after: does the key actually work against Instantly, and can it
 * see the sending inboxes. A key pasted before a plan was chosen, or on a plan
 * without API access, is set and useless, and only a real call tells the two
 * apart.
 *
 * Same rule as `/api/status`: **presence and counts, never values.** No key, no
 * prefix, no inbox address. Instantly's own error text is cut short and passed
 * through, because "your plan does not include the API" is the one sentence the
 * owner needs, and it names nothing of ours.
 */

export const dynamic = "force-dynamic";

const API = "https://api.instantly.ai/api/v2";

type Result = {
  configured: boolean;
  works: boolean;
  status: number | null;
  accounts: number | null;
  message: string;
};

export async function GET() {
  const key = process.env.INSTANTLY_API_KEY;
  const out = (r: Result) =>
    Response.json(r, { headers: { "cache-control": "no-store" } });

  if (!key) {
    return out({
      configured: false, works: false, status: null, accounts: null,
      message: "INSTANTLY_API_KEY is not set on this deployment.",
    });
  }

  try {
    const res = await fetch(`${API}/accounts?limit=100`, {
      headers: { authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let said = "";
      try {
        const body = JSON.parse(text) as { message?: string; error?: string };
        said = String(body.message ?? body.error ?? "");
      } catch {
        said = text;
      }
      return out({
        configured: true, works: false, status: res.status, accounts: null,
        message: `Instantly refused the key (${res.status})${said ? `: ${said.slice(0, 160)}` : "."}`,
      });
    }
    const body = JSON.parse(text) as { items?: unknown[] };
    const n = Array.isArray(body.items) ? body.items.length : 0;
    return out({
      configured: true, works: true, status: res.status, accounts: n,
      message: n
        ? `The key works and sees ${n} sending inbox${n === 1 ? "" : "es"}.`
        : "The key works. No sending inboxes are connected yet.",
    });
  } catch (err) {
    return out({
      configured: true, works: false, status: null, accounts: null,
      message: `Could not reach Instantly: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`,
    });
  }
}
