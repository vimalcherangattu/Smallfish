import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { CLERK_ENABLED } from "@/lib/clerk";
import { credits, planOf, readsRemaining, type Entry } from "@/lib/ledger";
import { accountForUser, balanceOf, ledgerOf, NotConfigured } from "@/lib/accounts";
import { READS_PER_CREDIT } from "@/lib/pricing";
import NoAuth from "@/components/NoAuth";

/** The account page (S1-08).
 *
 *  It is a ledger, not a dashboard. The product's whole argument is that every
 *  claim traces to something you can check, and a balance is a claim — so the
 *  page leads with the number and then shows every line that produced it, in
 *  the words the ledger stored at the time. A customer who cannot reconstruct
 *  their own balance from this page has been asked to take it on trust, which
 *  is the thing we refuse everywhere else.
 *
 *  Server component: the reads below hold the service-role key. */

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account — Small Fish" };

const LABEL: Record<Entry["kind"], string> = {
  grant: "Granted",
  rollover: "Carried over",
  expiry: "Expired",
  match: "Match",
  no_website_unlock: "No-website unlock",
  discovery: "Discovery",
  refund: "Refunded",
};

export default async function Account() {
  if (!CLERK_ENABLED) return <NoAuth />;

  const { userId } = await auth();
  if (!userId) return <NoAuth />;

  let body: React.ReactNode;
  try {
    const account = await accountForUser(userId);
    if (!account) {
      body = (
        <Problem title="You are signed in, but you have no workspace.">
          A workspace is created by Clerk&rsquo;s <code className="mono">user.created</code>{" "}
          webhook. If you signed up before that webhook was configured, or it
          failed, this is what it looks like — the account simply was not made.
          It is fixable and nothing was lost. See{" "}
          <code className="mono">docs/SETUP.md</code> §2.3.
        </Problem>
      );
    } else {
      const [milli, entries] = await Promise.all([
        balanceOf(account.id),
        ledgerOf(account.id),
      ]);
      const plan = planOf({
        planId: account.plan_id,
        entries: [],
        unlocked: {},
        readsThisPeriod: account.reads_this_period,
      });
      const readsLeft = readsRemaining({
        planId: account.plan_id,
        entries: [],
        unlocked: {},
        readsThisPeriod: account.reads_this_period,
      });

      body = (
        <>
          <p className="mono mt-10 text-[54px] leading-none">{credits(milli)}</p>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--ink-2)]">
            credits on {plan.name}. Only a proven match costs one — a no-match, a
            site we could not read and a site that blocks reading are all free,
            and the lines below say which was which.
          </p>

          <div className="mt-12 grid gap-8 border-t border-[var(--line)] pt-10 sm:grid-cols-3">
            <Stat n={String(readsLeft)} of={`of ${plan.credits * READS_PER_CREDIT}`}>
              sites left to read this period. This is what bounds the bill when a
              criterion matches nothing at all
            </Stat>
            <Stat n={String(account.reads_this_period)}>read so far this period</Stat>
            <Stat n={new Date(account.period_start).toISOString().slice(0, 10)}>
              period began; unused credits carry one month, capped at one
              month&rsquo;s allowance
            </Stat>
          </div>

          <h2 className="lab mt-16 text-[var(--ink-3)]">Every line, oldest last</h2>
          {entries.length === 0 ? (
            <p className="mt-4 text-[15px] text-[var(--ink-2)]">Nothing yet.</p>
          ) : (
            <div className="mt-5 space-y-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)]">
              {entries.map((e, i) => (
                <div
                  key={`${e.at}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-5 gap-y-1 bg-[var(--paper)] px-5 py-4"
                >
                  <span
                    className={`mono w-[5.5ch] shrink-0 text-[15px] ${
                      e.milli > 0 ? "" : e.milli < 0 ? "text-[var(--ink-3)]" : "text-[var(--ink-3)]"
                    }`}
                  >
                    {e.milli === 0 ? "—" : `${e.milli > 0 ? "+" : "−"}${credits(Math.abs(e.milli))}`}
                  </span>
                  <span className="flex-1 text-[15px] leading-snug">{e.why}</span>
                  <span className="mono text-[11px] uppercase tracking-wider text-[var(--ink-3)]">
                    {LABEL[e.kind]} · {e.at.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-6 max-w-[62ch] text-[14px] leading-relaxed text-[var(--ink-3)]">
            These lines cannot be edited or deleted, by us or by anybody — the
            database refuses it. A correction is a new line, so the history still
            shows what happened. If a match here is wrong, say so and it is
            refunded at exactly what it cost, read back from the line that
            charged it rather than recalculated.
          </p>
        </>
      );
    }
  } catch (err) {
    body =
      err instanceof NotConfigured ? (
        <Problem title="The database is not configured on this deployment.">
          Nothing is broken and nothing was lost — there is simply nowhere to
          read a balance from yet. See <code className="mono">docs/SETUP.md</code> §1,
          or <Link href="/api/status" className="underline underline-offset-4">/api/status</Link>{" "}
          for what else is missing.
        </Problem>
      ) : (
        <Problem title="We could not read your account just now.">
          Rather than show you a balance we are not sure of:{" "}
          <span className="mono text-[13px]">
            {err instanceof Error ? err.message : String(err)}
          </span>
        </Problem>
      );
  }

  return (
    <main className="mkt">
      <div className="mx-auto max-w-[860px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>
        <h1 className="dsp mt-10 text-[clamp(30px,4.4vw,48px)]">Your account.</h1>
        {body}
      </div>
    </main>
  );
}

function Stat({ n, of, children }: { n: string; of?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mono text-[22px]">
        {n}
        {of && <span className="text-[13px] text-[var(--ink-3)]"> {of}</span>}
      </div>
      <div className="mt-1 text-[13px] leading-snug text-[var(--ink-3)]">{children}</div>
    </div>
  );
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 max-w-[62ch] rounded-xl border border-[var(--line)] bg-[var(--paper-2)] px-6 py-6">
      <p className="text-[16px] font-semibold">{title}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  );
}

export const revalidate = 0;
