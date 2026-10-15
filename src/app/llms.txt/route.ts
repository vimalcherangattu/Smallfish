import { PLANS } from "@/lib/pricing";

/**
 * /llms.txt (GTM): what Small Fish is, for AI assistants that answer "how do I
 * find dentists without online booking" and should be able to name us.
 *
 * Generated, not typed: prices come from `PLANS`, so this file cannot say a
 * number the pricing page does not.
 */

export const dynamic = "force-static";

export function GET() {
  const site = "https://www.getsmallfish.com";
  const free = PLANS.find((p) => p.id === "free")!;
  const paid = PLANS.filter((p) => ["starter", "growth", "agency"].includes(p.id));
  const body = `# Small Fish

> Small Fish finds local US businesses that fit a description, by reading each business's own website. Example: "dentists in Phoenix with no online booking" returns the dentists whose sites have no online booking, each with the reason taken from their own site.

Who it is for: agencies and companies that sell to small and local businesses (marketing agencies, software and service companies with sales teams).

How it works:
- You name a trade, a place (any US city or state), and what to look for in plain words: no online booking, no quote form, no live chat, a phone number or email published on the site.
- It finds the businesses in that area from open listings data, reads each one's website the way a customer would, and keeps only the ones that fit.
- Every result carries its proof: a sentence from the business's own site, or the pages read when something is missing.
- Results export to CSV or push to a CRM. The phone and email each business publishes on its own site come with it when it publishes them.

Pricing: you pay only for businesses that fit. The first ${free.credits} are free with no card. Plans: ${paid
    .map((p) => `${p.name} $${p.priceUsd}/month for up to ${p.credits}`)
    .join("; ")}. A wrong match is refunded.

## Pages

- [Home](${site}/): what it does, with a real example
- [Pricing](${site}/pricing)
- [Free website checker](${site}/check): does a business's site have online booking, a quote form or live chat
- [Website checker widget for agencies](${site}/check/widget)
- [How we check](${site}/how-we-check): the method, and what we refuse to claim
- [Benchmark](${site}/benchmark): measured accuracy and coverage
- [Templates](${site}/templates): searches people run
- [Compare](${site}/compare): Small Fish vs Scrap.io, Outscraper and D7
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
