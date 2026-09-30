import { redirect } from "next/navigation";

import { ensureWorkspace, recordAttribution } from "@/lib/accounts";
import { CLERK_ENABLED } from "@/lib/clerk";
import { firstStop, readHandoff } from "@/lib/handoff";
import { MILLI } from "@/lib/ledger";
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
export const metadata = { title: "Setting up — Small Fish", robots: { index: false } };

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
      }
    } catch {
      // Their list matters more than our analytics. See the note above.
    }
  }

  redirect(firstStop(handoff));
}
