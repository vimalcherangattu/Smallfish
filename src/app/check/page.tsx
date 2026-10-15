import { BackLink } from "@/components/MarketingChrome";
import SiteCheck from "@/components/SiteCheck";

/**
 * The free website checker (GTM). A lead magnet built from the engine itself:
 * one site, one question, the proof. Every check ends with the same offer,
 * every business in a city like this one.
 */

export const metadata = {
  title: "Free website checker: does this business have online booking? | Small Fish",
  description:
    "Paste any business's website. We read it the way a customer would and tell you if it has online booking, a quote form or live chat, with the proof.",
};

export default function Check() {
  return (
    <main className="mkt">
      <div className="mx-auto max-w-[860px] px-6 py-16">
        <BackLink />
        <h1 className="dsp mt-10 max-w-[20ch] text-[clamp(34px,5.5vw,60px)]">
          Does this business have online booking?
        </h1>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Paste their website. We read it the way a customer would and tell you what&rsquo;s
          there, with the proof. Free, five a day.
        </p>
        <SiteCheck />
        <p className="mt-12 text-[14px] text-[var(--ink-3)]">
          Run an agency?{" "}
          <a href="/check/widget" className="underline">Put this check on your own site, free.</a>
        </p>
      </div>
    </main>
  );
}
