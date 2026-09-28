import { redirect } from "next/navigation";

/**
 * The confirm step, retired.
 *
 * This page used to sit between the search box and the results: it echoed the
 * parsed query back in three fields, then quoted what the read would cost
 * ("1,000 websites · about $16.80 of reading") and offered a button to go and
 * see the matches. Every one of those was a real thing we knew, and together
 * they were a toll gate made of our own internals in front of the answer.
 *
 * `/app` answers the query on the screen that asked it. This route stays
 * because saved runs, the nav and anything a user bookmarked point at it.
 */
export default async function Search({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  redirect(q.trim() ? `/app?q=${encodeURIComponent(q.trim())}` : "/app");
}
