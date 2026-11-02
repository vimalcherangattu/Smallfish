/**
 * "Has no live chat" settles from the page source — the criterion every
 * outreach list for law firms and estate agents is built on.
 *
 * Measured 2026-11-02 on 25 Sacramento law firms, against a rendered page:
 * 6 had chat and the old vendor list caught none of them, so the model (shown
 * text, scripts stripped) was asked a question it could not see, and every
 * outreach list for law firms came back empty — 0 of 80 reads. With the wider
 * list, the hint rule and source settlement: 18 matches, 17 right (94%), none
 * missed, 4 handed to the model.
 */

import { compileLib } from "./_tsmodules.mjs";

delete process.env.ANTHROPIC_API_KEY;

const { load } = compileLib(
  ["src/lib/read.ts", "src/lib/seller.ts", "src/lib/signals.ts", "src/lib/types.ts", "src/lib/contacts.ts", "src/lib/fetchoutcome.ts"],
  "sf-chat-",
);
const R = await load("read");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const WORDS = "<p>" + "Sacramento personal injury attorneys. Free consultation, call our office today. ".repeat(10) + "</p>";
let page = "";
globalThis.fetch = async (input) => {
  const u = String(input);
  if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
  const r = new Response(`<html><head>${page}</head><body>${WORDS}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  Object.defineProperty(r, "url", { value: u });
  return r;
};
const NO_CHAT = { id: "chat:absence", text: "has no live chat", type: "absence", explain: "" };
const verdictFor = async (head) => {
  page = head;
  const r = await R.readSite("https://firm.test/", NO_CHAT, {});
  return (await R.judge(r, NO_CHAT)).verdict;
};

/* -------------------------------- the widgets law firms actually run -- */
for (const [vendor, head] of [
  ["JuvoLeads", '<script src="https://cdn.juvoleads.com/widget.js"></script>'],
  ["ApexChat", '<script src="//www.apexchat.com/scripts/invitation.ashx?company=x"></script>'],
  ["Lawmatics", '<script src="https://app.lawmatics.com/forms/embed.js"></script>'],
  ["Ngage", '<script src="https://messenger.ngageics.com/ilnksrvr.aspx"></script>'],
  ["Intaker", '<script src="https://intaker.com/widget.js"></script>'],
  ["LeadConnector", '<script src="https://widgets.leadconnectorhq.com/loader.js"></script>'],
  ["Podium", '<script src="https://connect.podium.com/widget.js"></script>'],
  ["Intercom", "<script>window.intercomSettings={app_id:'x'}</script>"],
  // A "message us on WhatsApp" link is a live messaging channel, so it counts.
  ["a WhatsApp message link", '<a href="https://api.whatsapp.com/send?phone=1">WhatsApp</a>'],
]) {
  check(`${vendor} found: not a match for "no live chat"`, (await verdictFor(head)) === "no_match");
}

/* ---------------------------------------- settled absence, with proof -- */
{
  page = '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script><link rel="stylesheet" href="/s.css">';
  const r = await R.readSite("https://firm.test/", NO_CHAT, {});
  const v = await R.judge(r, NO_CHAT);
  check("no chat widget and no hint: a match, with no model key", v.verdict === "match", v.verdict);
  check("and the proof says what was read, in the signal's own words", /^No live chat in the source of/.test(v.proof ?? ""), v.proof);
}

/* ------------------------------ a hint holds the source verdict back -- */
for (const [why, head] of [
  ["an unknown script with chat in its name", '<script src="https://cdn.somechatco.io/loader.js"></script>'],
  ["a WhatsApp share button", '<a class="share" href="whatsapp://send?text=hi">Share</a>'],
  ["the words 'chat with us'", "<button>Chat with us</button>"],
  ["a chat-ish class", '<div class="site-chat-bubble"></div>'],
]) {
  const v = await verdictFor(head);
  check(`${why}: not settled from source, handed to the model`, v === "needs_model", v);
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
