import { BackLink } from "@/components/MarketingChrome";

/** How to connect Small Fish to an AI assistant (GTM). The page MCP
 *  directories link to. */

export const metadata = {
  title: "Small Fish MCP server: local business counts and website checks for AI assistants",
  description:
    "Connect Small Fish to Claude, ChatGPT, Cursor or any MCP client. Count local businesses in any US city and check whether a business's website takes bookings online. Free, no key.",
};

const URL = "https://www.getsmallfish.com/api/mcp";

export default function Mcp() {
  return (
    <main className="mkt">
      <div className="mx-auto max-w-[860px] px-6 py-16">
        <BackLink />
        <h1 className="dsp mt-10 max-w-[22ch] text-[clamp(32px,5vw,56px)]">Small Fish for your AI assistant.</h1>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-relaxed text-[var(--ink-2)]">
          Ask your assistant how many dentists are in Dallas, or whether a salon&rsquo;s website takes
          bookings online, and it asks Small Fish. Free, no key.
        </p>
        <h2 className="mt-12 text-[20px] font-semibold">Server URL</h2>
        <pre className="mono mt-3 overflow-x-auto rounded-xl border border-[var(--line)] p-5 text-[14px]">{URL}</pre>
        <p className="mt-3 text-[15px] text-[var(--ink-2)]">
          Streamable HTTP. In Claude, add it as a custom connector. In Cursor or other clients, add it as a remote MCP server.
        </p>
        <h2 className="mt-12 text-[20px] font-semibold">Tools</h2>
        <dl className="mt-3 grid gap-5 text-[15px]">
          <div>
            <dt className="font-semibold">count_businesses</dt>
            <dd className="mt-1 text-[var(--ink-2)]">How many of a kind of business are in a US city or state, and how many have a website.</dd>
          </div>
          <div>
            <dt className="font-semibold">check_website</dt>
            <dd className="mt-1 text-[var(--ink-2)]">Whether a business&rsquo;s website has online booking, a quote form or live chat, and why.</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}
