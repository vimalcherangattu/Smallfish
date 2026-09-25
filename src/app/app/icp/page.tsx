"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import IcpBuilder from "@/components/IcpBuilder";
import type { MarketIndex } from "@/lib/types";

/**
 * Who to target, as its own screen (S1-23 – S1-26).
 *
 * The ICP flow existed already, as a panel that opened over the map and closed
 * again — which made it feel like a detour rather than the thing most people
 * should do first. Somebody who cannot yet name their own vertical is exactly
 * who this product is for; the research says so, and the flow is the answer to
 * it. So it gets a place in the navigation and a URL you can come back to.
 *
 * What it will not do is invent a criterion. `icp.ts` proposes only things the
 * engine can settle on a page, and says out loud which of the things you might
 * want are not among them — `signals.ts` carries `provable: false` entries for
 * precisely that purpose.
 */

export default function IcpPage() {
  const router = useRouter();
  const [index, setIndex] = useState<MarketIndex | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/data/index.json")
      .then((r) => r.json() as Promise<MarketIndex>)
      .then((i) => live && setIndex(i))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-[900px] px-6 py-10 sm:px-10">
      <h1 className="sf-h1">Who should you be calling?</h1>
      <p className="sf-body mt-3 max-w-[62ch] text-[var(--ink-2)]">
        Describe what you sell. We turn it into things that can actually be
        checked on a business&rsquo;s own website, and tell you plainly which of
        them cannot be — a criterion we cannot settle is worse than no criterion,
        because it comes back as a verdict you cannot defend.
      </p>

      <div className="mt-8">
        <IcpBuilder
          index={index}
          onPick={(c) =>
            router.push(`/app/explore?market=${c.marketId}&criterion=${c.criterionId}`)
          }
          onClose={() => router.push("/app")}
        />
      </div>
    </div>
  );
}
