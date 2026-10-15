import { BackLink } from "@/components/MarketingChrome";
import WidgetSnippet from "@/components/WidgetSnippet";

/**
 * Where an agency gets the embed (GTM). Free, no account: paste your domain,
 * copy one line. Linked from /check and from the agency cold email's replies.
 */

export const metadata = {
  title: "Free website check widget for agencies | Small Fish",
  description:
    "Put a free 'does your website take bookings online?' check on your agency's site. Your visitors check their site, you get the conversation. One line of code, no account.",
};

export default function Widget() {
  return (
    <main className="mkt">
      <div className="mx-auto max-w-[860px] px-6 py-16">
        <BackLink />
        <h1 className="dsp mt-10 max-w-[22ch] text-[clamp(32px,5vw,56px)]">
          A free website check for your agency&rsquo;s site.
        </h1>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Your visitors paste their website and find out if it takes bookings online, has a quote
          form or live chat, with the proof. The ones missing it are the ones who need you. One
          line of code, free, no account.
        </p>
        <WidgetSnippet />
      </div>
    </main>
  );
}
