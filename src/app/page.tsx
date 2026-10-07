import HandoffPage from "@/components/HandoffPage";

/**
 * The home page, built from the designer's handoff of 2026-10-04.
 *
 * Replaces the hand-built page that stood here before. That page was composed
 * from the copy document and the 2026-09-28 design document; this one is the
 * designer's own output, and `HandoffPage` explains why it is served as
 * authored rather than retyped as JSX.
 *
 * The one thing lost in the change is worth naming: the old page assembled its
 * example row from `public/data/dental-phoenix.json` at build time, so the
 * clinic, its contacts and its draft could not drift from what the product
 * actually produces. The handoff's hero and row card carry the same business —
 * Simply Dentistry in Scottsdale, with its own published phone and email — but
 * as markup. **A data change no longer moves this page.** The three demo
 * markets' figures were reconciled against `public/data` by hand on the way
 * in; `test_home_copy.mjs` is what keeps them honest from here.
 */

export const metadata = {
  title: "Small Fish, find the local businesses that fit what you sell",
  description:
    "Tell us who you sell to and where. We check local businesses one by one " +
    "and send back the ones that fit, with contacts and a line on why each " +
    "one fits. 20 free, no card.",
};

export default function Home() {
  return <HandoffPage file="home.html" />;
}
