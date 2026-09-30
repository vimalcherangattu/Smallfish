import Link from "next/link";

import { accountForUser, contactedRows, type ContactedRow } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import UncontactButton from "@/components/UncontactButton";

/**
 * Everyone this workspace has already written to.
 *
 * ## The failure it exists to prevent is small and corrosive
 *
 * A practice that receives the same evidence-backed opener from the same agency
 * twice concludes that nobody is paying attention — which is precisely the
 * opposite of what an opener quoting their own website is for. A list is worked
 * over days, from more than one device, sometimes by more than one person in a
 * workspace, and without this the second person has no way to know.
 *
 * ## It is a record, not a workflow
 *
 * No stages, no follow-up sequence, no "warm / cold". Those are a CRM, the
 * customer already has one, and `deliver.ts` pushes into it. What this product
 * knows, and a CRM does not, is which businesses **we** handed over and when —
 * so that is all this shows, with one action: it was not them, put it back.
 *
 * ## Empty states report what was checked
 *
 * `docs/design-system.md` §4, and the same four causes the Runs page separates:
 * signed out, no workspace, no database on this deployment, or genuinely
 * nothing marked yet. Three of them are not the user's fault and telling all
 * four "nothing here" would be the product failing quietly and blaming them.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Contacted — Small Fish" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-10 sm:px-10">
      <h1 className="sf-h1">Contacted</h1>
      {children}
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sf-card mt-8 max-w-[64ch] p-7">
      <p className="sf-h2">{title}</p>
      <p className="sf-body mt-3 text-[var(--ink-2)]">{children}</p>
    </div>
  );
}

function when(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

const host = (url: string | null) =>
  (url ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] || null;

export default async function ContactedPage() {
  if (!CLERK_ENABLED) {
    return (
      <Shell>
        <Empty title="Accounts are not switched on here.">
          This deployment has no sign-in configured, so there is no workspace to
          keep a record against. Everything else works —{" "}
          <Link href="/app" className="underline">run a search</Link> and the
          results are the same.
        </Empty>
      </Shell>
    );
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return (
      <Shell>
        <Empty title="Sign in to keep track of who you have written to.">
          This is kept per workspace, so two people working one list see the same
          record.{" "}
          <Link href="/sign-up" className="underline">Sign up free</Link>.
        </Empty>
      </Shell>
    );
  }

  let rows: ContactedRow[] = [];
  try {
    const account = await accountForUser(userId);
    if (!account) {
      return (
        <Shell>
          <Empty title="No workspace yet.">
            Open{" "}
            <Link href="/account" className="underline">your account</Link> once
            and one is made for you.
          </Empty>
        </Shell>
      );
    }
    rows = await contactedRows(account.id);
  } catch {
    return (
      <Shell>
        <Empty title="The database is not reachable from this deployment.">
          That is ours rather than yours. Searching and reading still work; only
          this record is unavailable.
        </Empty>
      </Shell>
    );
  }

  if (!rows.length) {
    return (
      <Shell>
        <Empty title="Nobody yet.">
          Every business you tick as contacted on a list appears here, so you do
          not write to the same one twice — which is the thing that makes an
          opener quoting their own website look automated instead of attentive.{" "}
          <Link href="/app" className="underline">Open a list</Link>.
        </Empty>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="sf-body mt-3 max-w-[62ch] text-[var(--ink-2)]">
        {rows.length.toLocaleString()}{" "}
        {rows.length === 1 ? "business" : "businesses"} this workspace has written
        to. They stay ticked wherever they appear, so nobody here writes twice.
      </p>

      <ul className="mt-6 space-y-2">
        {rows.map((r) => (
          <li
            key={r.business_id}
            className="sf-card flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 p-4"
          >
            <div className="min-w-0">
              {/* A row written before migration 0017 has no name. Saying so is
                  better than an empty line: it is a real business somebody
                  contacted, and the id is what we have. */}
              <p className="sf-body text-[var(--ink)]">
                {r.name ?? <span className="text-[var(--muted)]">Name not recorded</span>}
              </p>
              {r.site && (
                <a
                  href={r.site}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="sf-small max-w-full break-all text-[var(--muted)] underline underline-offset-2"
                >
                  {host(r.site)}
                </a>
              )}
            </div>
            <div className="flex shrink-0 items-baseline gap-4">
              <span className="sf-small text-[var(--muted)]">{when(r.at)}</span>
              <UncontactButton businessId={r.business_id} />
            </div>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
