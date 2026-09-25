/**
 * Whether login is wired on this deployment (S1-08).
 *
 * This exists because of a failure mode that would have been self-inflicted and
 * total: `<ClerkProvider>` in the root layout throws when the publishable key
 * is absent, and the root layout wraps **every page**. Adding it unconditionally
 * to a site that is already live, before the keys are set, takes down the
 * marketing site, the templates, the benchmark, the free count and the opt-out
 * form — none of which need login at all.
 *
 * So Clerk is mounted only when its key is present, and every part of the
 * product that does not need an account keeps working without it. The site
 * degrades by losing sign-in, not by going dark.
 *
 * Read at module scope rather than per-render: `NEXT_PUBLIC_` variables are
 * inlined at build time, so this is a constant in the bundle and the branch
 * disappears.
 */
export const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Where a signed-out visitor is sent, and where they land afterwards. */
export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const AFTER_AUTH_PATH = "/account";

/**
 * Paths that require an account.
 *
 * Deliberately short. `/app` is **not** here: the free match count is anonymous
 * by design, and the product document's whole argument for it is that a buyer
 * can see a real number before deciding whether we are worth an account. Gating
 * the demo behind a signup form would be the ordinary SaaS instinct and it
 * would remove the one thing that makes the free count persuasive.
 */
export const PROTECTED = ["/account"];

export const isProtected = (pathname: string) =>
  PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
