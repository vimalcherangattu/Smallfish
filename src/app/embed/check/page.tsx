import SiteCheck from "@/components/SiteCheck";

/**
 * The checker, bare, for an agency to put in an iframe on its own site (GTM).
 *
 * The agency gets a free "check your website" tool for its visitors; we get a
 * "powered by" link on its site and every check tagged with its domain
 * (`?agency=`), which is how /ops counts what each embed sends. Same limits as
 * /check, because it is the same endpoint.
 */

export const metadata = {
  title: "Website check | Small Fish",
  robots: { index: false, follow: true },
};

export default async function EmbedCheck({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.agency) ? sp.agency[0] : sp.agency;
  const agency = raw && /^[a-z0-9.-]{3,80}$/i.test(raw) ? raw.toLowerCase() : null;
  return (
    <main className="mkt" style={{ minHeight: "auto" }}>
      <div className="px-4 py-4">
        <div className="text-[17px] font-semibold text-[var(--ink)]">Does your website take bookings online?</div>
        <SiteCheck agency={agency} />
        <p className="mt-5 text-[12px] text-[var(--ink-3)]">
          Powered by{" "}
          <a href={`https://www.getsmallfish.com/?source=embed${agency ? `/${agency}` : ""}`} target="_blank" rel="noopener" className="underline">
            Small Fish
          </a>
          , which finds every local business that fits.
        </p>
      </div>
    </main>
  );
}
