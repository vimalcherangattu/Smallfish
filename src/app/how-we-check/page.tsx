import HandoffPage from "@/components/HandoffPage";

/**
 * The evidence page, built from the designer's handoff of 2026-10-04.
 *
 * It replaces the page that read its figures out of `benchmark.json`. That
 * rule — "it carries no number of its own" — was the thing keeping two
 * accuracy pages from quoting two different precisions, and this page does not
 * inherit it: its numbers are markup. `/benchmark` is still generated from the
 * plan's own measurements and is still the one place a figure is authoritative.
 */

export const metadata = {
  title: "How we check each business — Small Fish",
  description:
    "What a check actually does, what we cannot read, and what we get wrong.",
};

export default function HowWeCheck() {
  return <HandoffPage file="how-we-check.html" />;
}
