import Link from "next/link";
import { REMOVAL_DAYS } from "@/lib/suppression";

/** The privacy policy (S1-09, and required to publish the Google OAuth
 *  consent screen).
 *
 *  Written around a distinction most policies blur and this product cannot:
 *  **there are two kinds of people here, and only one of them agreed to
 *  anything.** A customer signed up. A listed business did not — they are in
 *  the product because their details are in an open dataset and their website
 *  is public. Lumping both under "users" would be the same overclaim the rest
 *  of this product refuses, so they get separate sections and the second one
 *  comes first, because they are the ones with no relationship to us.
 *
 *  Every claim here is checkable against the code: the crawler's behaviour is
 *  `stage0/src/coverage/site_probe.py`, what is stored is
 *  `export_app_data.py`, and removal is `src/lib/suppression.ts` plus the
 *  `suppressions` table. If one of them changes, this page is wrong and should
 *  change with it. */

export const metadata = {
  title: "Privacy — Small Fish",
  description:
    "What Small Fish holds about a listed business, what it holds about a customer, and how to have either removed.",
};

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[var(--ink-2)]">
        {children}
      </div>
    </section>
  );
}

export default function Privacy() {
  return (
    <main className="mkt">
      <div className="mx-auto max-w-[720px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 text-[clamp(32px,5vw,54px)]">Privacy.</h1>
        <p className="mono mt-6 text-[12px] text-[var(--ink-3)]">
          last updated 2026-09-25
        </p>

        <p className="mt-8 text-[16px] leading-relaxed text-[var(--ink-2)]">
          Two different people show up in Small Fish, and only one of them chose
          to. A <strong className="font-semibold text-[var(--ink)]">customer</strong>{" "}
          signed up and agreed to something. A{" "}
          <strong className="font-semibold text-[var(--ink)]">listed business</strong>{" "}
          did not — they are here because their details are in an open dataset
          and their website is public. Calling both &ldquo;users&rdquo; would
          hide that, so they are dealt with separately, and the businesses come
          first.
        </p>

        <h2 className="dsp mt-16 text-[26px]">If you are a business we list</h2>

        <S title="What we hold about you">
          <p>
            Your business name, address, phone number and website address as
            they appear in <strong>Overture Maps</strong>, an open dataset
            published under an open licence. Where open data had a gap we may
            have filled it from <strong>Google Places</strong>, in which case we
            store Google&rsquo;s place identifier and nothing else, as
            Google&rsquo;s terms require.
          </p>
          <p>
            Plus facts we read from your own public website — whether it offers
            online booking, for instance — together with the page address each
            fact came from and the sentence that showed it.
          </p>
          <p>
            <strong className="text-[var(--ink)]">
              We do not keep copies of your pages.
            </strong>{" "}
            We store the extracted fact and the quote that supports it, not the
            page. We hold no personal data about your customers, no analytics
            about your visitors, and nothing from behind a login.
          </p>
        </S>

        <S title="How we read your site">
          <p>
            Politely, and identifying ourselves honestly. We honour{" "}
            <code className="mono text-[13px]">robots.txt</code>, make one
            request at a time per domain, and send a user agent that says who we
            are and links to{" "}
            <Link href="/bot" className="underline underline-offset-4">
              a page explaining it
            </Link>{" "}
            — rather than pretending to be a browser. We measured what that
            costs: presenting as a browser would let us read one more site in
            78. It is not a trade worth making.
          </p>
        </S>

        <S title="Having your business removed">
          <p>
            Use{" "}
            <Link href="/opt-out" className="underline underline-offset-4">
              the removal form
            </Link>
            , or email{" "}
            <span className="mono">getsmallfish@gmail.com</span>. Give the
            website or the phone number on your listing and it will find every
            listing we hold for you, including other branches.
          </p>
          <p>
            We confirm through the contact already on your listing rather than
            the one you give us, because your website and phone number are
            public and anyone could type them. An opt-out anyone could file for
            anyone else would be a way to erase a competitor. Once confirmed you
            are gone from every future search and export within{" "}
            <strong>{REMOVAL_DAYS} days</strong>.
          </p>
          <p>
            <strong className="text-[var(--ink)]">
              What we cannot undo, and will not pretend otherwise:
            </strong>{" "}
            if a customer has already exported a row about your business it is
            in their spreadsheet or their CRM and we cannot reach it. Removal
            stops future exports; it cannot recall one that has happened. We can
            tell you the date each export occurred if that helps you follow it
            up, and we will.
          </p>
        </S>

        <S title="What we never do">
          <p>
            We do not send you email, and we do not send email on a
            customer&rsquo;s behalf. We do not sell your details as a list. We
            do not scrape Google Maps. We do not guess: if we could not tell
            whether something was true of your site, the product says
            &ldquo;couldn&rsquo;t tell&rdquo; rather than filling the gap.
          </p>
        </S>

        <h2 className="dsp mt-20 text-[26px]">If you are a customer</h2>

        <S title="What we hold about you">
          <p>
            Your email address and name, held by{" "}
            <strong>Clerk</strong>, who run our sign-in. Your workspace, your
            credit balance and every line of your billing ledger, held by{" "}
            <strong>Supabase</strong> in a Postgres database in the United
            States. If you pay us, <strong>Stripe</strong> handles the card —{" "}
            <strong className="text-[var(--ink)]">
              we never see or store card details
            </strong>
            .
          </p>
          <p>
            We record product events — a search was confirmed, an export was
            downloaded — to know whether the thing works. Those events carry
            counts and reasons and are stripped of identifying fields before
            they are stored; the database rejects an event carrying a business
            name, address, phone, email or website outright.
          </p>
        </S>

        <S title="Your ledger cannot be edited, including by us">
          <p>
            Every charge, refund and grant is a line that cannot be changed or
            deleted — the database refuses both. A correction is a new line, so
            the history still shows what happened. If you close your account we
            keep that ledger and remove what identifies you, because destroying
            the record of what you were charged would remove the one thing a
            billing dispute needs.
          </p>
        </S>

        <S title="Your choices">
          <p>
            You can export your data, ask for a copy of what we hold, or close
            your account, at{" "}
            <span className="mono">getsmallfish@gmail.com</span>. Depending on
            where you live you may have rights to access, correct, delete or
            port your data, and to object to how it is processed; we will honour
            those requests whether or not they apply to you by law.
          </p>
        </S>

        <S title="Who else sees it">
          <p>
            Only the companies that run the product: Clerk (sign-in), Supabase
            (database), Stripe (payments), Vercel (hosting) and Anthropic
            (reading and judging websites). Each sees only what it needs. We do
            not sell data to anybody, and we do not share it for advertising.
          </p>
        </S>

        <S title="Changes, and telling you honestly">
          <p>
            If this page changes in a way that affects what we hold or who sees
            it, the date at the top changes and customers are told by email. A
            silent edit to a privacy policy is the same kind of thing as a
            silent edit to a benchmark, and this project has rules against the
            second.
          </p>
        </S>

        <p className="mono mt-16 border-t border-[var(--line)] pt-8 text-[12px] leading-relaxed text-[var(--ink-3)]">
          Small Fish · getsmallfish@gmail.com · This describes what the software
          actually does, and each claim is checkable against the code that does
          it. It has not been reviewed by a lawyer, and it is not legal advice.
        </p>
      </div>
    </main>
  );
}
