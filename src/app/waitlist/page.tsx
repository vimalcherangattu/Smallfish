import Link from "next/link";

import Fish from "@/components/Fish";
import WaitlistForm from "@/components/WaitlistForm";
import { SIGNUP_OPEN } from "@/lib/launch";
import { PLANS } from "@/lib/pricing";

/**
 * The waitlist, which is where the whole home page currently points.
 *
 * The copy's sign-up page says "Tell us your first market", and that heading
 * survives the switch intact — it is the right question either way, and the
 * market somebody names is what decides which one gets read next.
 *
 * It says plainly why there is a queue. "We're letting people in a few at a
 * time" is true and is the line the copy asked for, but a stranger deserves
 * the actual reason on the page they are handing an address to.
 */

export const metadata = {
  title: "Join the waitlist — Small Fish",
  description:
    "Tell us your first market and we will write when it is next. " +
    "We are letting people in a few at a time.",
};

export default function WaitlistPage() {
  const free = PLANS.find((p) => p.id === "free")!;

  return (
    <main className="mkt" style={{ background: "var(--paper)", minHeight: "100vh" }}>
      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 96 }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <Fish width={32} />
          <span className="dsp" style={{ fontSize: 21, fontWeight: 600, lineHeight: 1 }}>
            small fish
          </span>
        </Link>

        <h1 className="dsp" style={{ fontSize: "clamp(34px,5vw,60px)", marginTop: 56, maxWidth: "16ch" }}>
          Tell us your first market.
        </h1>
        <p className="lede" style={{ marginTop: 22, maxWidth: "52ch", color: "var(--ink-2)" }}>
          Who you sell to, which city, and what makes one of them a fit. Your
          first {free.credits} businesses are free when you are in.
        </p>

        <div style={{ marginTop: 40 }}>
          <WaitlistForm source="waitlist-page" />
        </div>

        {/* The reason, not just the fact. Somebody handing over an address is
            owed the actual answer to "why can't I just use it". */}
        {!SIGNUP_OPEN && (
          <div className="panel" style={{ marginTop: 48, maxWidth: "60ch" }}>
            <p className="lab" style={{ color: "var(--ink-3)" }}>Why there is a queue</p>
            <p className="small" style={{ color: "var(--ink-2)", lineHeight: 1.6 }}>
              Reading a market means opening every business&rsquo;s own website and
              judging it against what you asked for. That part runs, and it has
              been run on four markets end to end — but it is not yet switched on
              for a market you name, and we would rather queue you than sell you
              something that does not exist yet.
            </p>
            <p className="small" style={{ color: "var(--ink-2)", lineHeight: 1.6 }}>
              In the meantime the finished reads are open to anyone, with every
              verdict and the page it came from:{" "}
              <Link href="/markets" style={{ textDecoration: "underline" }}>
                see the markets
              </Link>
              .
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
