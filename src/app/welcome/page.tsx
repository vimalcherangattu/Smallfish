import { redirect } from "next/navigation";

import { claimMail, ensureWorkspace, recordAttribution, recordMail } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { firstStop, readHandoff } from "@/lib/handoff";
import { MILLI } from "@/lib/ledger";
import { sendMail, welcomeEmail } from "@/lib/mail";
import { PLANS } from "@/lib/pricing";

/**
 * The first moment after sign-up. Nobody should ever see this page.
 *
 * It makes the workspace, records which door brought them, and sends them
 * straight to their first list. The user-flow document budgets two minutes from
 * sign-up to businesses on screen; a dashboard in between spends some of it on
 * nothing.
 *
 * ## Why the workspace is made here and not only by the webhook
 *
 * `/api/clerk/webhook` already creates one on `user.created`, but a webhook is
 * asynchronous and this page is not: a customer who signs up and lands on their
 * list half a second later would otherwise arrive before their account exists.
 * `ensureWorkspace` looks for an existing membership first, so the two cannot
 * make a second workspace between them.
 *
 * ## And why a failure here is silent
 *
 * If the database is unreachable, the person still gets their list — the three
 * read markets need no account to search. Losing the attribution row is a cost
 * to us; blocking the first list would be a cost to them, and they are the ones
 * who just signed up.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Setting up | Small Fish", robots: { index: false } };

/**
 * Write to them once, and record what happened either way.
 *
 * The address comes from Clerk, which is the only place it exists — this app
 * stores no customer email of its own, deliberately, so there is one copy of it
 * and it is the one the person can change.
 */
async function welcome(
  accountId: string,
  clerkUserId: string,
  query: string | null,
  credits: number,
) {
  if (!(await claimMail(accountId, "welcome"))) return;

  let email = "";
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const user = await (await clerkClient()).users.getUser(clerkUserId);
    email = user.primaryEmailAddress?.emailAddress ?? "";
  } catch {
    email = "";
  }

  if (!email) {
    await recordMail({
      accountId,
      kind: "welcome",
      sent: false,
      why: "No address on the account.",
    }).catch(() => undefined);
    return;
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://getsmallfish.com";
  const result = await sendMail(email, welcomeEmail({ email, siteUrl: site, credits, query }));
  await recordMail({
    accountId,
    kind: "welcome",
    sent: result.sent,
    why: result.why ?? null,
  }).catch(() => undefined);
}

export default async function Welcome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const handoff = readHandoff(await searchParams);

  if (CLERK_ENABLED) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { userId } = await auth();
      if (userId) {
        const free = PLANS.find((p) => p.id === "free")!;
        const { accountId } = await ensureWorkspace({
          clerkUserId: userId,
          allowanceMilli: free.credits * MILLI,
          planName: free.name,
        });
        await recordAttribution({
          accountId,
          source: handoff.source,
          sells: handoff.sells,
          query: handoff.q,
        });

        // The welcome note, claimed once per workspace, ever.
        //
        // Sent from here rather than from the Clerk webhook because this is the
        // only place that knows which door brought them — the webhook has a user
        // id and nothing else, so its welcome could only link to a cold search
        // box. The claim is in the database, so this page being reloaded, or the
        // webhook racing it, cannot produce a second one.
        //
        // Everything about it is best-effort: an address we cannot read, a
        // provider that is not configured, a claim somebody else holds. None of
        // them may delay the redirect below by more than the call itself, and
        // none of them may throw.
        await welcome(accountId, userId, handoff.q, free.credits);
      }
    } catch {
      // Their list matters more than our analytics. See the note above.
    }
  }

  redirect(firstStop(handoff));
}
