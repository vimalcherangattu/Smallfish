import Link from "next/link";

/** Comparison pages (S1-15).
 *
 *  The GTM plan asks for pages against Scrap.io, Outscraper and D7. The temptation
 *  on a page like this is to pick a competitor's worst quality and a flattering
 *  claim of our own, and it is a bad trade: the reader is comparing tools because
 *  they are about to spend money, and the fastest way to lose them is a comparison
 *  they can falsify in one click.
 *
 *  So each row says what the other tool is genuinely better at, and the honest
 *  cases where it is the right choice are at the bottom rather than omitted. The
 *  only claims made for Small Fish here are ones `PROJECT_PLAN.md` can date. */
export const metadata = {
  title: "Small Fish vs Scrap.io, Outscraper and D7",
  description:
    "What each tool is for, where the others are better, and where a proven match is worth paying for.",
};

const ROWS: [string, string, string][] = [
  [
    "What you get",
    "Every business in a category and area, exported in bulk",
    "Only the businesses whose own website shows what you asked for, with the sentence that shows it",
  ],
  [
    "What you pay for",
    "Rows, whether or not they are relevant",
    "Matched businesses only. Non-matches and unreadable sites are counts and reasons, free",
  ],
  [
    "Volume",
    "Tens of thousands of rows for tens of dollars — genuinely cheaper per row, by a wide margin",
    "Hundreds of proven matches. Nobody should buy this for volume",
  ],
  [
    "Filtering by what a site says",
    "Category, rating, presence of a website — not what the site actually says",
    "The criterion is read on the page: booking widget, service offered, quote form",
  ],
  [
    "When it cannot tell",
    "The row arrives anyway",
    "It says so, and you are not charged. About a quarter of sites, today",
  ],
  [
    "Speed",
    "Immediate — the data is already collected",
    "A market has to be read. A cold market takes time, and we say so before you start",
  ],
];

export default function Compare() {
  return (
    <main className="home">
      <div className="mx-auto max-w-[1000px] px-6 py-16">
        <Link href="/" className="mono text-[13px] text-[var(--ink-3)]">
          ← Small Fish
        </Link>

        <h1 className="dsp mt-10 max-w-[20ch] text-[clamp(34px,5.4vw,60px)]">
          Small Fish, and when a scraper is the better buy.
        </h1>
        <p className="mt-8 max-w-[62ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Scrap.io, Outscraper and D7 do a different job well. They export every
          business in a category and area, fast and very cheaply per row. If that
          is what you need, they are the right tool and this page will not talk
          you out of it.
        </p>

        <div className="mt-14 overflow-hidden rounded-xl border border-[var(--line)]">
          <div className="grid grid-cols-1 gap-px bg-[var(--line)] sm:grid-cols-[1fr_1.4fr_1.4fr]">
            {["", "Bulk exporters", "Small Fish"].map((h) => (
              <div key={h} className="mono bg-[var(--paper-2)] px-5 py-3 text-[12px] uppercase tracking-wider text-[var(--ink-3)]">
                {h}
              </div>
            ))}
            {ROWS.map(([label, them, us]) => (
              <Row key={label} label={label} them={them} us={us} />
            ))}
          </div>
        </div>

        <h2 className="dsp mt-20 max-w-[24ch] text-[clamp(26px,3.4vw,40px)]">
          Buy a scraper instead if any of these is true.
        </h2>
        <ul className="mt-8 grid gap-5 text-[15px] leading-relaxed text-[var(--ink-2)] sm:grid-cols-2">
          <li>You want every business in a category, not a filtered subset.</li>
          <li>Your filter is something a listing already carries — rating, review count, has-a-website.</li>
          <li>You need tens of thousands of rows, and cost per row is what decides it.</li>
          <li>You need the data today, and cannot wait for a market to be read.</li>
        </ul>

        <p className="mt-14 max-w-[64ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
          What Small Fish is for is the case where the thing you care about is only
          visible on the business&rsquo;s own site — no online booking, no quote form,
          a service offered or not — and where sending a hundred emails you can
          defend beats sending ten thousand you cannot.
        </p>

        <p className="mono mt-10 text-[12px] leading-relaxed text-[var(--ink-3)]">
          A measured side-by-side on identical searches is S0-19 and is not run
          yet. Until it is, this page compares what each tool is for, not how
          accurate each one is — we are not going to publish an accuracy claim
          about someone else&rsquo;s product that we have not measured.
        </p>
      </div>
    </main>
  );
}

function Row({ label, them, us }: { label: string; them: string; us: string }) {
  return (
    <>
      <div className="bg-[var(--paper)] px-5 py-4 text-[14px] font-semibold">{label}</div>
      <div className="bg-[var(--paper)] px-5 py-4 text-[14px] leading-relaxed text-[var(--ink-2)]">
        {them}
      </div>
      <div className="bg-[var(--paper)] px-5 py-4 text-[14px] leading-relaxed text-[var(--ink-2)]">
        {us}
      </div>
    </>
  );
}
