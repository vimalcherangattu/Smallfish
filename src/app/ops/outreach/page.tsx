import Link from "next/link";
import { redirect } from "next/navigation";

import { inboxes, instantlyReady } from "@/lib/instantly";
import { opsViewer } from "@/lib/ops";
import { rest } from "@/lib/prospecting";
import { dailyPerInbox, GO_LIVE } from "@/lib/sequence";

/**
 * The outreach backend (GTM). Who we found, who we wrote to, who opened their
 * list, who replied and what we said back, who signed up and who paid.
 *
 * Every number is a count of rows in `gtm_prospects`, `gtm_events` or
 * `accounts`, so anything here can be opened and checked. Owner only.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Outreach | Small Fish ops", robots: { index: false, follow: false } };

type Prospect = {
  domain: string; name: string | null; email: string | null; niche: string | null; city: string | null;
  state: string | null; status: string; list_token: string | null; updated_at: string; niche_quote: string | null;
};
type Event = { id: number; kind: string; domain: string | null; email: string | null; detail: Record<string, unknown>; at: string };

const get = async <T,>(path: string): Promise<T> => ((await rest(path).catch(() => null)) as T) ?? ([] as unknown as T);

function count<T>(rows: T[], key: (r: T) => string | null | undefined) {
  return new Set(rows.map(key).filter(Boolean)).size;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function Outreach() {
  const me = await opsViewer();
  if (!me.ok && me.why === "signed out") redirect("/sign-in?redirect_url=/ops/outreach");
  if (!me.ok) {
    return (
      <main className="mkt"><div className="mx-auto max-w-[760px] px-6 py-24 text-[15px]">Not available: {me.why}</div></main>
    );
  }

  const [prospects, events, accounts, boxes, checks] = await Promise.all([
    get<Prospect[]>("gtm_prospects?select=domain,name,email,niche,city,state,status,list_token,updated_at,niche_quote&order=updated_at.desc&limit=5000"),
    get<Event[]>("gtm_events?select=id,kind,domain,email,detail,at&order=at.desc&limit=5000"),
    get<Array<{ source: string | null; plan_id: string }>>("accounts?source=like.outreach*&select=source,plan_id&limit=5000"),
    instantlyReady() ? inboxes().catch(() => []) : Promise.resolve([]),
    get<Array<{ ref: string | null; verdict: string | null }>>("gtm_checks?select=ref,verdict&order=at.desc&limit=5000"),
  ]);
  const embeds = Object.entries(
    checks.filter((c) => c.ref).reduce<Record<string, number>>((a, c) => ((a[c.ref!] = (a[c.ref!] ?? 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1]);

  const by = (k: string) => events.filter((e) => e.kind === k);
  const status = (s: string[]) => prospects.filter((p) => s.includes(p.status)).length;
  const funnel: [string, number, string][] = [
    ["Agencies read", prospects.length, "every agency site the finder opened"],
    ["Serve a trade we can list", prospects.filter((p) => p.niche).length, "a niche, with a sentence from their site"],
    ["Ready to email", status(["found"]), "niche, address and free list all in place"],
    ["Queued in Instantly", by("queued").length, "handed to the campaign"],
    ["Emails sent", by("email_sent").length, "Instantly's count, every step"],
    ["Opened their list", count(by("visited"), (e) => e.domain), "distinct agencies that loaded /hi"],
    ["Replied", count(by("reply_received"), (e) => e.email), "a person, not an auto-reply"],
    ["Answered automatically", by("auto_replied").length, "sent with no human"],
    ["Interested", status(["interested"]), "asked a question or wanted more"],
    ["Signed up", accounts.length, "a workspace whose source is an outreach link"],
    ["Free website checks", checks.length, "on /check and agency embeds"],
    ["Checks from agency embeds", checks.filter((c) => c.ref).length, `${embeds.length} agencies embedding`],
    ["Paying", accounts.filter((a) => a.plan_id !== "free").length, "on a paid plan"],
    ["Asked to stop", status(["suppressed"]), "blocked everywhere, for good"],
    ["Bounced", status(["bounced"]), "never retried"],
  ];

  const today = new Date().toISOString().slice(0, 10);
  const held = events.filter((e) => ["reply_held", "reply_unhandled", "hook_failed", "webhook_failed"].includes(e.kind)).slice(0, 20);
  const replies = events.filter((e) => e.kind === "reply_classified" || e.kind === "auto_replied").slice(0, 30);
  const niches = Object.entries(
    prospects.filter((p) => p.niche).reduce<Record<string, number>>((a, p) => ((a[p.niche!] = (a[p.niche!] ?? 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1]);

  // Latest count per audience, from the daily run.
  const sized = new Map<string, Event>();
  for (const e of events) if (e.kind === "research_count" && !sized.has(String(e.detail.segment))) sized.set(String(e.detail.segment), e);

  const cell = "border-b border-[var(--line)] px-3 py-2 align-top";
  return (
    <main className="mkt">
      <div className="mx-auto max-w-[1180px] px-6 py-12">
        <div className="mono text-[12px] uppercase tracking-wider text-[var(--ink-3)]">Ops · outreach</div>
        <h1 className="dsp mt-4 text-[40px]">Who we&rsquo;re reaching</h1>

        <section className="mt-8 grid gap-4 text-[14px] md:grid-cols-3">
          <div className="rounded-xl border border-[var(--line)] p-5">
            <div className="text-[var(--ink-3)]">Sending</div>
            <div className="mt-1 text-[18px] font-semibold">
              {dailyPerInbox(today) === 0 ? `Warming up until ${GO_LIVE}` : `${dailyPerInbox(today)} per inbox per day`}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-5">
            <div className="text-[var(--ink-3)]">Inboxes ready</div>
            <div className="mt-1 text-[18px] font-semibold">
              {boxes.filter((b) => b.ready).length} of {boxes.length}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] p-5">
            <div className="text-[var(--ink-3)]">Needs a look</div>
            <div className="mt-1 text-[18px] font-semibold">{held.length ? `${held.length} held or failed` : "Nothing"}</div>
          </div>
        </section>

        <h2 className="mt-12 text-[20px] font-semibold">Funnel</h2>
        <table className="mt-3 w-full text-[14px]">
          <tbody>
            {funnel.map(([k, v, d]) => (
              <tr key={k}>
                <td className={cell}>{k}</td>
                <td className={`${cell} mono text-right`}>{v.toLocaleString()}</td>
                <td className={`${cell} text-[var(--ink-3)]`}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-12 text-[20px] font-semibold">Audiences, sized</h2>
        <p className="mt-1 text-[13px] text-[var(--ink-3)]">Named people with verified work addresses in Instantly SuperSearch. Counting is free.</p>
        <table className="mt-3 w-full text-[14px]">
          <tbody>
            {[...sized.values()].map((e) => (
              <tr key={e.id}>
                <td className={cell}>{String(e.detail.what)}</td>
                <td className={`${cell} mono text-right`}>{Number(e.detail.count).toLocaleString()}</td>
                <td className={`${cell} whitespace-nowrap text-[var(--ink-3)]`}>{when(e.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {embeds.length > 0 && (
          <>
            <h2 className="mt-12 text-[20px] font-semibold">Agencies embedding the checker</h2>
            <p className="mt-2 text-[14px] text-[var(--ink-2)]">{embeds.map(([d, n]) => `${d} ${n}`).join(" · ")}</p>
          </>
        )}

        <h2 className="mt-12 text-[20px] font-semibold">By trade</h2>
        <p className="mt-2 text-[14px] text-[var(--ink-2)]">{niches.map(([n, c]) => `${n} ${c}`).join(" · ") || "None yet"}</p>

        {held.length > 0 && (
          <>
            <h2 className="mt-12 text-[20px] font-semibold">Held or failed</h2>
            <table className="mt-3 w-full text-[13px]">
              <tbody>
                {held.map((e) => (
                  <tr key={e.id}>
                    <td className={`${cell} whitespace-nowrap`}>{when(e.at)}</td>
                    <td className={cell}>{e.kind}</td>
                    <td className={cell}>{e.email ?? e.domain}</td>
                    <td className={`${cell} text-[var(--ink-3)]`}>{JSON.stringify(e.detail).slice(0, 220)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <h2 className="mt-12 text-[20px] font-semibold">Replies and what we said</h2>
        {replies.length ? (
          <table className="mt-3 w-full text-[13px]">
            <tbody>
              {replies.map((e) => (
                <tr key={e.id}>
                  <td className={`${cell} whitespace-nowrap`}>{when(e.at)}</td>
                  <td className={cell}>{e.email}</td>
                  <td className={cell}>{e.kind === "auto_replied" ? "we said" : `they said (${String(e.detail.intent)})`}</td>
                  <td className={`${cell} text-[var(--ink-2)]`}>
                    {String(e.detail.said ?? e.detail.body ?? "").replace(/<[^>]+>/g, " ").slice(0, 400)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-[14px] text-[var(--ink-3)]">No replies yet.</p>
        )}

        <h2 className="mt-12 text-[20px] font-semibold">Prospects</h2>
        <table className="mt-3 w-full text-[13px]">
          <thead className="text-left text-[var(--ink-3)]">
            <tr><th className={cell}>Agency</th><th className={cell}>Trade · city</th><th className={cell}>Status</th><th className={cell}>Address</th><th className={cell}>Their list</th><th className={cell}>Updated</th></tr>
          </thead>
          <tbody>
            {prospects.filter((p) => p.niche).slice(0, 300).map((p) => (
              <tr key={p.domain}>
                <td className={cell}>
                  <a href={`https://${p.domain}`} className="underline">{p.name ?? p.domain}</a>
                  {p.niche_quote && <div className="mt-1 text-[12px] text-[var(--ink-3)]">&ldquo;{p.niche_quote.slice(0, 140)}&rdquo;</div>}
                </td>
                <td className={cell}>{p.niche} · {p.city}{p.state ? `, ${p.state}` : ""}</td>
                <td className={cell}>{p.status}</td>
                <td className={cell}>{p.email ?? "none published"}</td>
                <td className={cell}>{p.list_token ? <Link href={`/hi/${p.list_token}`} className="underline">open</Link> : "not yet"}</td>
                <td className={`${cell} whitespace-nowrap`}>{when(p.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-12 text-[20px] font-semibold">Everything, newest first</h2>
        <table className="mt-3 w-full text-[13px]">
          <tbody>
            {events.slice(0, 100).map((e) => (
              <tr key={e.id}>
                <td className={`${cell} whitespace-nowrap`}>{when(e.at)}</td>
                <td className={cell}>{e.kind}</td>
                <td className={cell}>{e.domain ?? e.email ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
