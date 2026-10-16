/**
 * Are the sending domains still set up to be believed? (GTM, deliverability.)
 *
 * Cold mail goes out from secondary domains through Instantly. A missing or
 * doubled SPF record, or a DMARC record that has gone, fails silently: the
 * mail still sends and quietly lands in spam. The morning digest asks DNS
 * every day and names any domain that has lost one, so a person hears about
 * it the day it happens rather than when the replies stop.
 *
 * `authProblems` is pure and held by `test_mailauth.mjs`; `checkDomains` is
 * the DNS lookup around it.
 */

export interface DnsTxt {
  /** TXT records at the domain itself, each joined from its chunks. */
  root: string[];
  /** TXT records at `_dmarc.<domain>`. */
  dmarc: string[];
}

/** What is wrong, in a sentence each, or nothing. */
export function authProblems(t: DnsTxt): string[] {
  const out: string[] = [];
  const spf = t.root.filter((r) => /^v=spf1\b/i.test(r.trim()));
  if (!spf.length) out.push("no SPF record, so mail from it can be taken for forged");
  else if (spf.length > 1) out.push(`${spf.length} SPF records; receivers treat more than one as no SPF at all`);
  else if (!/include:|ip4:|ip6:|a\b|mx\b|redirect=/i.test(spf[0])) out.push("its SPF record allows no sender");
  const dmarc = t.dmarc.filter((r) => /^v=DMARC1\b/i.test(r.trim()));
  if (!dmarc.length) out.push("no DMARC record; Google and Yahoo want one from bulk senders");
  else if (dmarc.length > 1) out.push("more than one DMARC record, which counts as none");
  return out;
}

export const domainsOf = (emails: string[]) =>
  [...new Set(emails.map((e) => e.split("@")[1]?.toLowerCase()).filter((d): d is string => Boolean(d)))].sort();

/** Look each domain up. A lookup that fails for a reason other than "no such
 *  record" is ours, not theirs, and reports nothing rather than a problem. */
export async function checkDomains(domains: string[]): Promise<Array<{ domain: string; problems: string[] }>> {
  const { resolveTxt } = await import("node:dns/promises");
  const txt = async (name: string): Promise<string[] | null> => {
    try {
      return (await resolveTxt(name)).map((chunks) => chunks.join(""));
    } catch (e) {
      const code = (e as { code?: string }).code;
      return code === "ENOTFOUND" || code === "ENODATA" ? [] : null;
    }
  };
  return Promise.all(
    domains.map(async (domain) => {
      const [root, dmarc] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`)]);
      if (root === null || dmarc === null) return { domain, problems: [] };
      return { domain, problems: authProblems({ root, dmarc }) };
    }),
  );
}
