import { REQUIRED_ENV, REQUIRED_AUTH_ENV, currentEnv } from "@/lib/db";
import { REQUIRED_ENV as STRIPE_ENV } from "@/lib/checkout";
import { SITE } from "@/lib/site";

/**
 * What is wired on this deployment, and what is not (S1-08, S1-09).
 *
 * `stage0/src/engine/preflight.py` established the shape and the reason: five
 * different missing-credential states have five different fixes, and finding
 * out about them one failed attempt at a time is five times the work. This is
 * that idea for the deployed site — the answer to "I set the variables, did it
 * take?", which is otherwise answered by clicking around the product until
 * something misbehaves.
 *
 * **It reports presence, never values.** Not the key, not a prefix, not a
 * length — those leak more than they look like they do, and the question this
 * answers is only ever "is it there". A status endpoint that helps you debug a
 * key by showing part of it is a status endpoint that helps anyone else too.
 *
 * Public on purpose. Everything it discloses is already visible from the
 * outside by trying the feature, and an endpoint you have to authenticate to
 * reach is useless for diagnosing broken authentication.
 */

export const dynamic = "force-dynamic";

type Group = {
  section: string;
  what: string;
  ready: boolean;
  missing: string[];
  unlocks: string;
};

export function GET() {
  const env = currentEnv();
  const absent = (list: readonly (readonly [string, string])[]) =>
    list.filter(([k]) => !env[k]).map(([k]) => k);

  const groups: Group[] = [
    {
      section: "1 · Supabase",
      what: "the database",
      missing: absent(REQUIRED_ENV),
      ready: absent(REQUIRED_ENV).length === 0,
      unlocks:
        "Removals take effect on the next request instead of the next deploy. " +
        "Accounts and the credit ledger have somewhere to live.",
    },
    {
      section: "2 · Clerk",
      what: "login",
      missing: absent(REQUIRED_AUTH_ENV),
      ready: absent(REQUIRED_AUTH_ENV).length === 0,
      unlocks: "Sign-up, sign-in, and a workspace per customer.",
    },
    {
      section: "4 · Stripe",
      what: "payment",
      missing: absent(STRIPE_ENV),
      ready: absent(STRIPE_ENV).length === 0,
      unlocks: "Taking money. Every rule about what to charge is already built.",
    },
    {
      section: "5 · Anthropic",
      what: "the engine",
      missing: env.ANTHROPIC_API_KEY ? [] : ["ANTHROPIC_API_KEY"],
      ready: !!env.ANTHROPIC_API_KEY,
      unlocks:
        "Reading and judging a market nobody has read. Without it the four " +
        "measured markets are frozen data.",
    },
    {
      section: "7 · Site URL",
      what: "where this is served from",
      missing: env.NEXT_PUBLIC_SITE_URL ? [] : ["NEXT_PUBLIC_SITE_URL"],
      ready: !!env.NEXT_PUBLIC_SITE_URL,
      unlocks:
        "A sitemap and robots.txt that name the right host, and checkout " +
        "returning people to the right place.",
    },
  ];

  const blocked = groups.filter((g) => !g.ready);

  return Response.json(
    {
      site: SITE,
      // Not a boolean called `ok`: three of these five can be absent while the
      // marketing site, the templates, the benchmark and the free count all
      // work perfectly. "Everything is configured" and "the site is fine" are
      // different questions and conflating them makes both answers useless.
      configured: groups.length - blocked.length,
      of: groups.length,
      groups,
      nextStep: blocked.length
        ? `Set ${blocked[0].missing.join(", ")} — see docs/SETUP.md §${blocked[0].section.split(" ")[0]}. ` +
          "Then redeploy: Vercel bakes environment variables in at build time, " +
          "so setting one changes nothing until you do."
        : "Everything this endpoint knows about is set.",
      note:
        "Presence only — no key, prefix or length is reported, because a status " +
        "page that helps you debug a key helps anyone else debug it too.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
