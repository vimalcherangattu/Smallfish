import { SignUp } from "@clerk/nextjs";

import NoAuth from "@/components/NoAuth";
import { CLERK_ENABLED } from "@/lib/clerk";
import { handoffParams, readHandoff } from "@/lib/handoff";

/**
 * Sign-up, carrying whatever door the visitor came through.
 *
 * ## What was wrong
 *
 * `/for/{slug}` writes `q`, `market`, `criterion`, `source` and `sells` into
 * this link and this page read **none of them**. Two things followed, and the
 * second is worse than the first:
 *
 *   1. The user retyped what the page had just shown them, against the
 *      user-flow document's own rule that context is never asked twice.
 *   2. `source` was lost, so no paying customer could be traced back to the
 *      door that brought them — which is the single number the GTM plan needs
 *      to decide where to spend more. Every channel was unmeasurable.
 *
 * ## How it carries now
 *
 * Clerk owns the form and the redirect, so the context rides on the URL it
 * redirects *to*: this page hands `/welcome?…` to `fallbackRedirectUrl`, and
 * `/welcome` creates the workspace, records the attribution once, and sends the
 * person to their first list. Nothing is stored in a cookie or a global, so a
 * visitor who opens two doors in two tabs gets two correct answers.
 */

export const metadata = { title: "Create an account | Small Fish" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!CLERK_ENABLED) return <NoAuth />;

  const handoff = readHandoff(await searchParams);
  const qs = handoffParams(handoff).toString();
  const after = qs ? `/welcome?${qs}` : "/welcome";

  return (
    <main className="mkt flex min-h-screen flex-col items-center justify-center px-6 py-16">
      {handoff.q && (
        <p className="lab" style={{ color: "var(--ink-3)", marginBottom: 20, textAlign: "center" }}>
          Your first list is ready: {handoff.q}
        </p>
      )}
      <SignUp fallbackRedirectUrl={after} forceRedirectUrl={after} signInUrl="/sign-in" />
    </main>
  );
}
