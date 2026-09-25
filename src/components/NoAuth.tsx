import Link from "next/link";

/** What a sign-in page says when login is not configured (S1-08).
 *
 *  Not a blank page and not a crash. The honest thing to tell someone who
 *  clicked "sign in" on a deployment with no auth keys is that the product
 *  works without an account today, and what an account will and will not
 *  change — because most of what they came for needs neither. */
export default function NoAuth() {
  return (
    <main className="mkt">
      <div className="mx-auto max-w-[620px] px-6 py-24">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>
        <h1 className="dsp mt-10 text-[clamp(30px,4.6vw,48px)]">
          Accounts are not switched on yet.
        </h1>
        <p className="mt-6 text-[16px] leading-relaxed text-[var(--ink-2)]">
          Nothing you came for needs one. The map, the criteria, the free match
          count with its sample, the proof behind every match and the export are
          all open at{" "}
          <Link href="/app" className="underline underline-offset-4">
            the app
          </Link>
          . An account is what will hold a credit balance, and there is nothing
          to charge for yet.
        </p>
        <Link
          href="/app"
          className="mt-10 inline-block rounded-full bg-[var(--lure)] px-6 py-3 text-[14px] font-semibold text-[var(--ink)]"
        >
          Use it without an account
        </Link>
      </div>
    </main>
  );
}
