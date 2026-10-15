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
  /** Counts only: how many inboxes Instantly is still setting up, how many are
   *  ready, and the raw `status` / `warmup_status` values it reports, tallied.
   *  Raw because Instantly does not document the enums; a guessed label here
   *  would be the kind of number this endpoint exists to avoid. */
  inboxes?: { settingUp: number; ready: number; status: Record<string, number>; warmup: Record<string, number> };
  message: string;
};

const tally = (items: Record<string, unknown>[], field: string) =>
  items.reduce<Record<string, number>>((acc, a) => {
    const v = String(a[field] ?? "none");
    acc[v] = (acc[v] ?? 0) + 1;
    return acc;
  }, {});

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
    const body = JSON.parse(text) as { items?: Record<string, unknown>[] };
    const items = Array.isArray(body.items) ? body.items : [];
    const n = items.length;
    const settingUp = items.filter((a) => a.setup_pending === true).length;
    return out({
      configured: true, works: true, status: res.status, accounts: n,
      inboxes: {
        settingUp,
        ready: n - settingUp,
        status: tally(items, "status"),
        warmup: tally(items, "warmup_status"),
      },
      message: !n
        ? "The key works. No sending inboxes are connected yet."
        : settingUp
          ? `The key works. ${settingUp} of ${n} inboxes are still being set up by Instantly; warmup can be switched on once they are ready.`
          : `The key works and all ${n} inboxes are set up.`,
    });
  } catch (err) {
    return out({
      configured: true, works: false, status: null, accounts: null,
      message: `Could not reach Instantly: ${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}`,
    });
  }
}
