/** The promise's value, or null if `ms` runs out first. The work is not
 *  cancelled — fetch has no shared signal here — but the caller stops waiting,
 *  which is what keeps the response inside the platform's limit. */
export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  if (ms <= 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}
