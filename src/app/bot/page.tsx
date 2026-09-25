import type { Metadata } from "next";

/** The page our crawler's user agent points at (S0-30).
 *
 *  Principle 7 is "crawl politely and identify honestly", and S0-26 priced it:
 *  presenting as a browser instead would recover exactly one readable site in
 *  78, so the principle costs almost nothing and stays. But an honest identity
 *  is only honest if it resolves. Until now the user agent pointed at
 *  `smallfish.example/bot`, a domain that does not exist — we were asking
 *  thousands of site owners to trust a URL they could not open.
 *
 *  Static, so it costs nothing to serve and cannot break the build.
 */

export const metadata: Metadata = {
  title: "SmallFishBot — what this crawler is",
  description:
    "What SmallFishBot fetches, how often, how to block it, and how to have a business removed.",
};

const UA = "SmallFishBot/0.1";

/** A real, monitored inbox. It has to be: this page tells site owners it is
 *  how they get a business removed, and a removal route that bounces is worse
 *  than not offering one. Set this and `site_probe.py`'s `CONTACT` together;
 *  they are asserted equal by `stage0/tests/test_crawler_identity.py`. */
const CONTACT = "getsmallfish@gmail.com";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7">
      <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-1.5 space-y-2 text-[13px] leading-relaxed text-[var(--muted)]">
        {children}
      </div>
    </section>
  );
}

export default function BotPage() {
  return (
    <main className="mx-auto max-w-[62ch] px-5 py-12">
      <h1 className="text-[18px] font-semibold tracking-tight">
        SmallFishBot
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
        If you found this page in your server logs, this is what fetched your
        site and what it did with what it read.
      </p>

      <pre className="mt-4 overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[11px] leading-relaxed">
        {UA} (+https://www.getsmallfish.com/bot;{"\n"}
        {"  "}local business relevance research; contact: {CONTACT})
      </pre>

      <Section title="What it does">
        <p>
          It reads a small number of pages of a business website and records
          facts about what the business offers — whether there is a way to book
          online, request a quote, or start a chat. People searching for
          suppliers use those facts to find businesses that match what they
          need.
        </p>
        <p>
          <strong className="text-[var(--ink)]">
            It stores extracted facts, not copies of your pages.
          </strong>{" "}
          No page is republished, mirrored or cached for readers.
        </p>
      </Section>

      <Section title="How it behaves">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>robots.txt</code> is fetched first and honoured. A disallow
            for <code>{UA}</code> or <code>*</code> stops the fetch.
          </li>
          <li>
            At most a homepage plus three linked pages per business, chosen by
            what the search is actually asking about.
          </li>
          <li>
            One request at a time per host, with at least 1.5 seconds between
            them.
          </li>
          <li>
            <code>Retry-After</code> is honoured on 429 and 503, and a host that
            refuses gets exponentially longer gaps before any further request.
          </li>
          <li>
            No login is attempted, no form is submitted, no paywall or block is
            worked around. A site that declines to be read stays unread, and
            says so to our users as &ldquo;this site blocks automated
            reading&rdquo;.
          </li>
        </ul>
      </Section>

      <Section title="How to block it">
        <p>Add this to your robots.txt and it will stop on the next visit:</p>
        <pre className="overflow-x-auto rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[11px] leading-relaxed">
          User-agent: {UA}
          {"\n"}Disallow: /
        </pre>
        <p>
          We do not disguise ourselves as a browser to get around this. That was
          tested and measured: it would make one site in 78 readable, which is
          not worth being the kind of crawler that does it.
        </p>
      </Section>

      <Section title="How to have a business removed">
        <p>
          Email <strong className="text-[var(--ink)]">{CONTACT}</strong> from an
          address at the business&rsquo;s own domain, or from the phone number
          listed on its site, and it will be suppressed from results.
        </p>
        <p>
          Being honest about the limits. A self-serve opt-out form with
          ownership verification is planned and not yet built, so removal is a
          manual request today. And removal cannot reach rows a user has
          already exported — nothing can. What it does do is stop the business
          appearing in any future result or export.
        </p>
      </Section>

      <Section title="Where the business data comes from">
        <p>
          Business names, addresses and phone numbers come from{" "}
          <a
            href="https://overturemaps.org"
            className="text-[var(--accent)] underline underline-offset-2"
          >
            Overture Maps
          </a>
          , an open dataset. Everything else is read from the business&rsquo;s
          own public website.
        </p>
      </Section>

      <p className="mt-8 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--muted)]">
        <a
          href="/"
          className="text-[var(--accent)] underline underline-offset-2"
        >
          Small Fish
        </a>{" "}
        · this page is the URL in the user agent above, so it is the one place
        the claims made there can be checked.
      </p>
    </main>
  );
}
