from kit import *

# ============================================================
# Small Fish app screens, v2 — built to the coding agent's brief.
# Type rules are load-bearing:
#   Literata      = what a business published   (names, quoted evidence)
#   Libre Franklin = our words                  (UI, explanations)
#   DM Mono        = anything we counted        (numbers, contacts, dates)
# ============================================================

CSS2 = """
.t-h1{font-family:'Literata',Georgia,serif;font-weight:700;font-size:30px;line-height:38px;letter-spacing:-0.006em;margin:0;}
.t-h2{font:600 20px/26px 'Libre Franklin',system-ui,sans-serif;margin:0}
.t-h3{font:600 15px/21px 'Libre Franklin',system-ui,sans-serif;margin:0}
.t-ev{font-family:'Literata',Georgia,serif;font-weight:400;font-size:17px;line-height:25px;margin:0}
.t-b{font:400 15px/24px 'Libre Franklin',system-ui,sans-serif;margin:0}
.t-s{font:400 13px/20px 'Libre Franklin',system-ui,sans-serif;margin:0;color:#5B6470}
.t-d{font:400 13px/18px 'DM Mono',ui-monospace,monospace;margin:0}
.t-d.m{font-weight:500}
.mark{background:#E4F5A6;padding:1px 4px;box-decoration-break:clone;-webkit-box-decoration-break:clone}

.appbar{height:64px;flex-shrink:0;border-bottom:1px solid #D5D9D2;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 28px;gap:20px}
.credit{display:inline-flex;align-items:center;gap:9px;height:34px;padding:0 13px;border-radius:999px;background:#F6F7F4;border:1px solid #D5D9D2;font:400 13px/18px 'DM Mono',ui-monospace,monospace}

.tabs2{display:flex;gap:26px;border-bottom:1px solid #D5D9D2}
.tab2{padding:0 0 13px;font:600 15px/21px 'Libre Franklin',system-ui,sans-serif;color:#5B6470;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:8px}
.tab2.on{color:#0E1520;border-color:#0E1520}
.tab2 .n{font:500 13px/18px 'DM Mono',ui-monospace,monospace;color:#5B6470}
.tab2.on .n{color:#0E1520}

.rowc{background:#fff;border:1px solid #D5D9D2;margin-top:-1px}
.rowc:first-of-type{margin-top:0}
.rowtop{display:grid;grid-template-columns:1fr auto;gap:24px;padding:20px 24px;align-items:start}
.bname{font-family:'Literata',Georgia,serif;font-weight:700;font-size:21px;line-height:28px;letter-spacing:-0.005em;margin:0}
.btown{font:400 13px/18px 'DM Mono',ui-monospace,monospace;color:#5B6470;margin:4px 0 0}
.reason{font:400 15px/24px 'Libre Franklin',system-ui,sans-serif;margin:11px 0 0;max-width:62ch}
.ready{display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 11px;border-radius:999px;background:#E9F7B5;color:#4A6508;font:400 12px/18px 'DM Mono',ui-monospace,monospace;white-space:nowrap}
.chev{width:34px;height:34px;border:1px solid #D5D9D2;background:#fff;display:grid;place-items:center;cursor:pointer;flex-shrink:0}

.evbox{border-left:2px solid #C8F03C;padding:2px 0 2px 16px;margin:14px 0 0;display:flex;flex-direction:column;gap:7px}
.src{font:400 12px/18px 'DM Mono',ui-monospace,monospace;color:#5B6470}
.cts2{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
.ct{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 13px;border:1px solid #D5D9D2;background:#fff;font:400 13px/18px 'DM Mono',ui-monospace,monospace;color:#36404C}
.mailwell{margin-top:18px;border:1px solid #D5D9D2;background:#F6F7F4}
.mailwell .hd{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;border-bottom:1px solid #D5D9D2;flex-wrap:wrap}
.mailwell .bd{padding:18px;display:flex;flex-direction:column;gap:12px}
.mailwell .bd p{font-family:'Literata',Georgia,serif;font-weight:400;font-size:17px;line-height:25px;margin:0;max-width:60ch}
.rowacts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px 24px;border-top:1px solid #D5D9D2;background:#F6F7F4}
.qbtn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border:1px solid #D5D9D2;background:#fff;font:400 13px/20px 'Libre Franklin',system-ui,sans-serif;color:#36404C;cursor:pointer}

.honest{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;padding:16px 20px;
  background:#F6F7F4;border:1px solid #D5D9D2;border-left:3px solid #8A929B}
.unsure{width:30px;height:30px;border-radius:50%;border:1.5px dashed #8A929B;display:grid;place-items:center;
  font:500 14px/1 'DM Mono',ui-monospace,monospace;color:#5B6470;flex-shrink:0}

.costbar{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;padding:22px 24px;background:#0E1520;color:#EEF0EC}
.costbar .t-s{color:#B9BFB6}
.itemised{display:flex;gap:20px;margin-top:9px;flex-wrap:wrap}
.itemised span{font:400 12px/18px 'DM Mono',ui-monospace,monospace;color:#8A929B}

.exs2{display:flex;flex-direction:column;gap:9px;margin-top:14px}

/* pressable tile — the back/front offset mechanic, system-dressed.
   back sits 5px down-right in --fill; front rides on it. no gradients, no blur. */
.ptiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 18px;margin-top:16px}
.ptile{position:relative;display:block;padding:0 5px 5px 0;border:0;background:none;cursor:pointer;
 text-align:left;font:inherit;color:inherit}
.ptile__back{position:absolute;left:5px;top:5px;right:0;bottom:0;background:#E3E6E0;
 border:1px solid #B9BFB6}
.ptile__front{position:relative;display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start;
 padding:17px 18px;background:#fff;border:1px solid #D5D9D2;
 transition:transform .14s ease,border-color .14s ease}
.ptile:hover .ptile__front{transform:translate(-2px,-2px);border-color:#0E1520}
.ptile:active .ptile__front{transform:translate(2px,2px)}
.ptile:focus-visible .ptile__front{outline:2px solid #0E1520;outline-offset:2px}
.ptile__ico{display:flex;width:34px;height:34px;align-items:center;justify-content:center;
 border:1px solid #D5D9D2;background:#F6F7F4;color:#36404C}
.ptile__txt b{display:block;font:500 15.5px/22px 'Libre Franklin',system-ui,sans-serif;color:#0E1520}
.ptile__txt em{display:block;margin-top:3px;font:400 13.5px/20px 'Libre Franklin',system-ui,sans-serif;
 font-style:normal;color:#5B6470}
.ptile__tag{position:absolute;left:16px;top:-9px;z-index:2;padding:1px 7px;background:#C8F03C;
 color:#4A6508;font:500 10px/16px 'DM Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
/* the suggested one. tint, not fill — the only lure BUTTON on this screen is Find them. */
.ptile.sug .ptile__back{background:#E9F7B5;border-color:#C8F03C}
.ptile.sug .ptile__ico{background:#E9F7B5;border-color:#C8F03C;color:#4A6508}
@media (max-width:620px){ .ptiles{grid-template-columns:1fr} }
.ex2{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding:14px 16px;border:1px solid #D5D9D2;background:#fff;cursor:pointer;text-align:left}
.ex2 .lead{font:400 15px/24px 'Libre Franklin',system-ui,sans-serif}
.ex2 .cnt{font:500 13px/18px 'DM Mono',ui-monospace,monospace;color:#4A6508}

.bigq{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px 12px;
  font-family:'Literata',Georgia,serif;font-weight:700;font-size:32px;line-height:52px;letter-spacing:-0.006em}
.slot{display:inline-flex;align-items:center;min-width:120px;height:48px;padding:0 14px;border:1px solid #B9BFB6;
  background:#fff;font:400 24px/1 'Libre Franklin',system-ui,sans-serif;color:#0E1520}
.slot.ph{color:#8A929B}

.arrive{display:grid;grid-template-columns:10px 1fr auto auto;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid #D5D9D2}
.dotv{width:9px;height:9px;border-radius:50%}
.track{height:4px;background:#E3E6E0;overflow:hidden}
.track i{display:block;height:100%;background:#0E1520}

.grp{background:#fff;border:1px solid #D5D9D2;padding:20px 22px;display:flex;flex-direction:column;gap:12px}
.grp .hd2{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.nextstep{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px}
"""

import kit as _kit
_kit.CSS = _kit.CSS + CSS2


def head(title, right=None, sub=None):
    right = right or f'<span class="credit">{ico(I["card"],14)}20 of 20 free left</span>'
    return f'''<div class="appbar">
  <div class="row" style="gap:12px">{mark(21)}<span class="navname" style="font-size:19px">small fish</span></div>
  <div class="row" style="gap:12px">{right}</div>
</div>'''


def shell2(body, bg=PAPER, right=None, h=None):
    return f'''<div style="height:100%;display:flex;flex-direction:column;background:{bg}">
{head('', right)}
<div style="flex:1;overflow:hidden">{body}</div>
</div>'''


# ---------- the atoms ----------

def ev(quote, source):
    return f'''<div class="evbox">
  <p class="t-ev"><span class="mark">{quote}</span></p>
  <p class="src">{source}</p>
</div>'''


def contacts2(tel, mail, site):
    return f'''<div class="cts2">
  <span class="ct">{ico(I['phone'],13)}{tel}</span>
  <span class="ct">{ico(I['mail'],13)}{mail}</span>
  <span class="ct">{ico(I['globe'],13)}{site}</span>
</div>'''


def row_collapsed(name, town, why, open_=False):
    return f'''<div class="rowc">
  <div class="rowtop">
    <div>
      <p class="bname">{name}</p>
      <p class="btown">{town}</p>
      <p class="reason">{why}</p>
    </div>
    <div class="col" style="gap:10px;align-items:flex-end">
      <span class="ready">{ico(I['mail'],12)}email ready</span>
      <span class="chev">{ico(I['chev'],16,1.8,INK3)}</span>
    </div>
  </div>
</div>'''


def row_expanded(name, town, why, quote, source, tel, mail, site, email_body, pages):
    body = ''.join(f'<p>{p}</p>' for p in email_body)
    return f'''<div class="rowc" style="border-color:{INK};box-shadow:0 10px 30px rgba(14,21,32,.07)">
  <div class="rowtop">
    <div>
      <p class="bname">{name}</p>
      <p class="btown">{town}</p>
      <p class="reason">{why}</p>
      {ev(quote, source)}
      {contacts2(tel, mail, site)}
    </div>
    <div class="col" style="gap:10px;align-items:flex-end">
      <span class="ready">{ico(I['mail'],12)}email ready</span>
      <span class="chev" style="transform:rotate(90deg)">{ico(I['chev'],16,1.8,INK3)}</span>
    </div>
  </div>

  <div style="padding:0 24px 20px">
    <div class="mailwell">
      <div class="hd">
        <span class="t-h3">Your opening email</span>
        <div class="row" style="gap:7px">
          <span class="qbtn">As written</span>
          <span class="qbtn">Shorter</span>
          <span class="qbtn">Warmer</span>
        </div>
      </div>
      <div class="bd">
        {body}
        <p class="t-s" style="margin-top:4px">Every line points at something on their own site. You edit it and you send it — we never send anything.</p>
      </div>
    </div>
  </div>

  <div class="rowacts">
    {btn('Copy email','','copy')}
    <span class="qbtn">{ico(I['eye'],13)}See what we read ({pages} pages)</span>
    <span class="qbtn">{ico(I['check'],13)}Mark as contacted</span>
    <span class="qbtn">{ico(I['x'],13)}Not a fit — refunds the credit</span>
  </div>
</div>'''


# ---------- S1 · first run ----------

EXAMPLES = [
    ('online booking', 'dental clinics', 'Phoenix', '42 fit'),
    ('AI receptionists', 'med spas', 'Dallas', '38 fit'),
    ('website redesigns', 'HVAC companies', 'Tampa', '61 fit'),
]

WAYS = [
    ('spark', 'Start from an example',
     "Six searches other people ran. Open one and change the words.", True),
    ('map', 'Pick it on a map',
     "Draw round the area you actually drive to, instead of naming a city.", False),
    ('sheet', 'Start from a template',
     "The usual asks for your kind of business, already written out.", False),
    ('up', 'Bring your own list',
     "A CSV of businesses you already have. We read their sites and tell you which fit.", False),
]

def ways():
    out = []
    for key, title, sub, sug in WAYS:
        tag = '<span class="ptile__tag">start here</span>' if sug else ''
        out.append(f'''<button class="ptile{' sug' if sug else ''}" type="button">{tag}
      <span class="ptile__back" aria-hidden="true"></span>
      <span class="ptile__front">
        <span class="ptile__ico">{ico(I[key],17,1.7)}</span>
        <span class="ptile__txt"><b>{title}</b><em>{sub}</em></span>
      </span>
    </button>''')
    return '<div class="ptiles">' + ''.join(out) + '</div>'


def s_firstrun():
    body = f'''<div style="height:100%;display:flex;align-items:flex-start;justify-content:center;padding:72px 32px">
  <div style="width:720px;display:flex;flex-direction:column;gap:30px">
    <div>
      <h1 class="t-h1" style="font-size:36px;line-height:44px">What do you sell, and who do you sell it to?</h1>
      <p class="t-b" style="margin-top:12px;color:{INK3};max-width:56ch">Two things and we can start. A type of business and a city is enough.</p>
    </div>

    <div class="bigq">
      <span>I sell</span>
      <span class="slot">online booking<span class="caret"></span></span>
      <span>to</span>
      <span class="slot ph">dental clinics</span>
      <span>in</span>
      <span class="slot ph">Phoenix</span>
    </div>

    <div>
      <p class="t-h3" style="color:{MUT}">Or get there another way</p>
      {ways()}
    </div>

    <div class="col" style="gap:14px;align-items:flex-start;padding-top:8px;border-top:1px solid {LINE}">
      {btn('Find them','','arrow','big')}
      <p class="t-s" style="max-width:62ch">We open each business's own website and read it. You get back only the ones that fit, each with an opening email. <b style="color:{INK}">Your first 20 are free and we don't ask for a card.</b></p>
    </div>
  </div>
</div>'''
    return board('AppFirstRun.dc.html', 'App 1 · first run', 1440, 860, shell2(body), PAPER)


# ---------- S2 · the result ----------

ROWS = [
    ('Lumen Med Spa', 'Uptown, Dallas TX',
     'No way to book online. The only route in is the phone number in their header.',
     'Call the office to schedule your consultation.',
     'their home page · read 2 Oct',
     '(214) 555-0182', 'hello@lumenmedspa.com', 'lumenmedspa.com',
     ["I went through three pages of lumenmedspa.com and the only way to book is the phone number in your header.",
      "Your phone rings after six and nobody is there to pick it up. Worth fifteen minutes to see what those calls are worth?"], 3),
    ('Still Water Aesthetics', 'Plano, TX',
     'Eight treatments listed and every one of them ends in "call to schedule".', '', '', '', '', '', [], 0),
    ('Bishop Arts Skin Studio', 'Bishop Arts, Dallas TX',
     'Appointments go through Instagram DMs. There is no booking link on the site.', '', '', '', '', '', [], 0),
    ('Renew Aesthetics', 'Frisco, TX',
     'The booking button opens a contact form that asks people to wait for a callback.', '', '', '', '', '', [], 0),
]

def results_body(mapped=False):
    rows = row_expanded(*ROWS[0]) + ''.join(row_collapsed(r[0], r[1], r[2]) for r in ROWS[1:])
    return f'''<div style="padding:28px 32px 0;display:flex;flex-direction:column;gap:20px">

  <div class="between" style="align-items:flex-start">
    <div style="max-width:72ch">
      <h1 class="t-h1">Med spas in Dallas that don't have online booking — <span class="mono" style="font-weight:500">26 fit</span>.</h1>
      <p class="t-s" style="margin-top:9px">Read 2 October · <a href="#" style="text-decoration:underline;text-underline-offset:3px">change what you asked for</a></p>
    </div>
    <div class="row" style="gap:10px">
      <span class="qbtn">{ico(I['map'],13)}Where we looked</span>
      <span class="qbtn">{ico(I['dl'],13)}Download</span>
      {btn('Copy all 20 emails','ink','copy')}
    </div>
  </div>

  <div class="tabs2">
    <span class="tab2 on">All that fit <span class="n">26</span></span>
    <span class="tab2">New since 2 Oct <span class="n">4</span></span>
    <span class="tab2">Contacted <span class="n">0</span></span>
  </div>

  <div class="honest">
    <span class="unsure">?</span>
    <div>
      <p class="t-b"><b>We couldn't tell on 38 of them.</b> Their sites don't say either way, so we left them out rather than guess. You were not charged for any of them.</p>
    </div>
    <span class="qbtn">See the 38{ico(I['arrow'],13)}</span>
  </div>

  <div>{rows}</div>

  <div class="costbar">
    <div>
      <p class="t-h2" style="color:#fff">Six more fit than your free twenty.</p>
      <p class="t-s" style="margin-top:6px">One credit is one business that fits. The 38 we couldn't tell about stay free, and anything you mark "not a fit" comes straight back.</p>
      <div class="itemised">
        <span>20 of 20 free used</span><span>·</span><span>6 more that fit</span><span>·</span><span>6 credits</span><span>·</span><span>$0 today — card added at checkout</span>
      </div>
    </div>
    {btn('Get the other 6','white','arrow','big')}
  </div>

  <div style="height:28px"></div>
</div>'''

def s_results():
    return board('AppResults.dc.html', 'App 2 · the result', 1440, 1740,
                 shell2(results_body(), right=f'<span class="credit">{ico(I["card"],14)}20 of 20 free left</span>'), PAPER)


# ---------- S3 · the row, both states ----------

def s_row():
    body = f'''<div style="padding:34px 32px;display:flex;flex-direction:column;gap:26px">
  <div>
    <p class="t-h3" style="color:{MUT}">Collapsed — still shows the name, the reason, and that an email is ready</p>
    <div style="margin-top:12px">{row_collapsed(*ROWS[1][:3])}{row_collapsed(*ROWS[2][:3])}</div>
  </div>
  <div>
    <p class="t-h3" style="color:{MUT}">Expanded — evidence, contacts, the email, and one obvious Copy</p>
    <div style="margin-top:12px">{row_expanded(*ROWS[0])}</div>
  </div>
  <div class="card" style="padding:18px 22px;background:{PAPER2};border-style:dashed;display:flex;gap:22px;align-items:flex-start">
    <span class="t-h3" style="width:120px;flex-shrink:0">The type rule</span>
    <p class="t-s" style="max-width:none">What the business published is set in <b style="font-family:'Literata',Georgia,serif;font-weight:700">Literata</b> and marked in lure tint. Our explanation of it is <b>Libre Franklin</b>. Anything we counted — phone numbers, dates, page counts, credits — is <b class="mono">DM Mono</b>. A reader can tell who is speaking without being told.</p>
  </div>
</div>'''
    return board('AppRow.dc.html', 'App 3 · the business row', 1440, 1180, shell2(body), PAPER)


# ---------- S4 · couldn't tell ----------

UNSURE = [
    ('Their site never mentions booking either way', 14,
     ['Aurelia Skin Bar', 'Knox Glow', 'Addison Skin Studio'],
     'Nothing on the pages we could reach says how an appointment is made.'),
    ('The site did not load for us', 12,
     ['Oak Lawn Laser', 'Preston Hollow Med', 'Deep Ellum Skin'],
     'We tried three times over two days and got nothing back.'),
    ('The page asked us not to read it', 12,
     ['Uptown Glow DFW', 'Frisco Med Spa', 'Plano Aesthetics'],
     'Their robots file tells crawlers to stay out, so we stayed out.'),
]

def s_unsure():
    grps = ''
    for title, n, names, why in UNSURE:
        chips = ''.join(f'<span class="qbtn">{nm}{ico(I["globe"],12)}</span>' for nm in names)
        grps += f'''<div class="grp">
      <div class="hd2">
        <p class="t-h2">{title}</p>
        <span class="t-d m">{n}</span>
      </div>
      <p class="t-b" style="color:{INK3};max-width:60ch">{why}</p>
      <div class="row wrap" style="gap:8px">{chips}<span class="t-s">and {n-3} more</span></div>
    </div>'''
    body = f'''<div style="padding:28px 32px;display:flex;flex-direction:column;gap:22px">
  <div class="between" style="align-items:flex-start">
    <div style="max-width:70ch">
      <h1 class="t-h1">We couldn't tell on <span class="mono" style="font-weight:500">38</span> med spas.</h1>
      <p class="t-b" style="margin-top:12px;color:{INK3};max-width:60ch">This is a real answer, not a failure. Their sites don't settle the question, and we would rather hand you a gap than a guess. <b style="color:{INK}">None of these cost you anything.</b></p>
    </div>
    <span class="qbtn">{ico(I['back'],13)}Back to the 26 that fit</span>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">{grps}</div>

  <div class="card" style="padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px">
    <div>
      <p class="t-h2">What you can do with these</p>
      <p class="t-s" style="margin-top:7px;max-width:64ch">Open them yourself — it takes a minute each and you'll know. Or tell us something else to look for, and we'll re-read them for free.</p>
    </div>
    <div class="row" style="gap:10px">
      <span class="qbtn">{ico(I['dl'],13)}Download the 38 with their websites</span>
      {btn('Look for something else','white','redo')}
    </div>
  </div>
</div>'''
    return board('AppUnsure.dc.html', "App 4 · couldn't tell", 1440, 900, shell2(body), PAPER)


# ---------- S5 · reading in progress ----------

ARRIVING = [
    ('Lumen Med Spa', 'Uptown, Dallas TX', 'fits', 1),
    ('Glow Bar Dallas', 'Deep Ellum, Dallas TX', 'site gone', 0),
    ('Still Water Aesthetics', 'Plano, TX', 'fits', 1),
    ('Renew Aesthetics', 'Frisco, TX', 'already books online', 0),
    ('Bishop Arts Skin Studio', 'Bishop Arts, Dallas TX', 'fits', 1),
    ('Uptown Glow DFW', 'Uptown, Dallas TX', "couldn't tell", 2),
]

def s_progress():
    rows = ''
    for nm, tw, st, kind in ARRIVING:
        col = LURE if kind == 1 else (LINE2 if kind == 0 else SURF)
        extra = f'border:1.5px dashed {MUTD}' if kind == 2 else ''
        tcol = LUREI if kind == 1 else MUT
        rows += f'''<div class="arrive">
      <span class="dotv" style="background:{col};{extra}"></span>
      <span class="bname" style="font-size:17px;line-height:24px">{nm}</span>
      <span class="t-d" style="color:{MUT}">{tw}</span>
      <span class="t-d m" style="color:{tcol};width:150px;text-align:right">{st}</span>
    </div>'''
    body = f'''<div style="height:100%;display:flex;align-items:flex-start;justify-content:center;padding:56px 32px">
  <div style="width:760px;display:flex;flex-direction:column;gap:26px">
    <div>
      <h1 class="t-h1">Reading med spas in Dallas.</h1>
      <p class="t-b" style="margin-top:11px;color:{INK3};max-width:58ch">We haven't been through this city before, so we're opening each one now. They'll appear here as they come in.</p>
    </div>

    <div class="col" style="gap:11px">
      <div class="track"><i style="width:34%"></i></div>
      <div class="between">
        <span class="t-d" style="color:{MUT}"><b class="t-d m" style="color:{INK}">208</b> of <b class="t-d m" style="color:{INK}">612</b> med spas in Dallas</span>
        <span class="t-d m" style="color:{LUREI}">9 fit so far</span>
      </div>
    </div>

    <div class="card" style="padding:4px 22px 14px">
      <p class="t-h3" style="padding:16px 0 4px;color:{MUT}">Coming in now</p>
      {rows}
    </div>

    <div class="card" style="padding:18px 22px;display:flex;align-items:center;gap:16px;background:{PAPER2}">
      {ico(I['clock'],19,1.6,MUT)}
      <p class="t-b" style="flex:1">A city this size takes about four minutes. <b>You can close this tab</b> — we'll email you the moment it's done.</p>
      <span class="qbtn">Email me and close</span>
    </div>
  </div>
</div>'''
    return board('AppProgress.dc.html', 'App 5 · reading in progress', 1440, 900, shell2(body), PAPER)


# ---------- S6 · nothing found ----------

def s_empty():
    body = f'''<div style="height:100%;display:flex;align-items:flex-start;justify-content:center;padding:64px 32px">
  <div style="width:720px;display:flex;flex-direction:column;gap:26px">
    <div>
      <h1 class="t-h1">None of the <span class="mono" style="font-weight:500">180</span> we checked fit.</h1>
      <p class="t-b" style="margin-top:12px;color:{INK3};max-width:58ch">That usually means one condition too many. You asked for med spas in Plano that offer Botox, don't have online booking <b style="color:{INK}">and</b> have fewer than ten reviews.</p>
    </div>

    <div class="card" style="padding:20px 22px;display:flex;flex-direction:column;gap:2px">
      <p class="t-h3" style="margin-bottom:10px;color:{MUT}">What happened to the 180</p>
      <div class="arrive"><span class="dotv" style="background:{LINE2}"></span><span class="t-b" style="grid-column:2/4">Have online booking already</span><span class="t-d m" style="text-align:right">104</span></div>
      <div class="arrive"><span class="dotv" style="background:{LINE2}"></span><span class="t-b" style="grid-column:2/4">More than ten reviews</span><span class="t-d m" style="text-align:right">52</span></div>
      <div class="arrive" style="border-bottom:0"><span class="dotv" style="border:1.5px dashed {MUTD}"></span><span class="t-b" style="grid-column:2/4">Couldn't tell either way — free, never guessed</span><span class="t-d m" style="text-align:right">24</span></div>
    </div>

    <div class="col" style="gap:12px">
      <p class="t-h3">Try one of these</p>
      <div class="nextstep">
        {btn('Drop the review condition · 52 would fit','','arrow')}
        <span class="qbtn">Widen to all of Dallas–Fort Worth</span>
        <span class="qbtn">Change what counts as a fit</span>
      </div>
      <p class="t-s">Nothing was charged for this search. You still have 20 free businesses.</p>
    </div>
  </div>
</div>'''
    return board('AppEmpty.dc.html', 'App 6 · nothing found', 1440, 820, shell2(body), PAPER)


# ---------- phones ----------

def phone(inner, title, fname, h=844):
    return board(fname, title, 390, h, f'''<div style="height:100%;display:flex;flex-direction:column;background:{PAPER}">
  <div class="appbar" style="padding:0 18px;height:58px">
    <div class="row" style="gap:9px">{mark(18)}<span class="navname" style="font-size:17px">small fish</span></div>
    <span class="credit" style="height:30px;font-size:12px">20 free left</span>
  </div>
  <div style="flex:1;overflow:hidden">{inner}</div>
</div>''', PAPER)


def s_firstrun_m():
    inner = f'''<div style="padding:26px 18px;display:flex;flex-direction:column;gap:22px">
  <h1 class="t-h1" style="font-size:27px;line-height:34px">What do you sell, and who do you sell it to?</h1>
  <div style="display:flex;flex-direction:column;gap:11px">
    <div><p class="t-h3" style="margin-bottom:7px">I sell</p><div class="slot" style="width:100%;height:52px;font-size:17px">online booking<span class="caret"></span></div></div>
    <div><p class="t-h3" style="margin-bottom:7px">to</p><div class="slot ph" style="width:100%;height:52px;font-size:17px">dental clinics</div></div>
    <div><p class="t-h3" style="margin-bottom:7px">in</p><div class="slot ph" style="width:100%;height:52px;font-size:17px">Phoenix</div></div>
  </div>
  {btn('Find them','','arrow','big')}
  <p class="t-s">Your first 20 are free and we don't ask for a card.</p>
  <div>
    <p class="t-h3" style="color:{MUT};margin-bottom:4px">Or get there another way</p>
    {ways()}
  </div>
</div>'''
    return phone(inner, 'App 1 · first run · phone', 'AppFirstRunM.dc.html', 900)


def s_results_m():
    rows = ''
    for nm, tw, why in [(r[0], r[1], r[2]) for r in ROWS[:3]]:
        rows += f'''<div class="rowc">
      <div style="padding:16px 16px;display:flex;flex-direction:column;gap:9px">
        <div><p class="bname" style="font-size:19px;line-height:25px">{nm}</p><p class="btown">{tw}</p></div>
        <p class="reason" style="font-size:14px;line-height:22px;margin:0">{why}</p>
        <div class="between"><span class="ready">{ico(I['mail'],12)}email ready</span><span class="chev">{ico(I['chev'],16,1.8,INK3)}</span></div>
      </div>
    </div>'''
    inner = f'''<div style="padding:20px 18px;display:flex;flex-direction:column;gap:16px">
  <div>
    <h1 class="t-h1" style="font-size:24px;line-height:31px">Med spas in Dallas with no online booking — <span class="mono" style="font-weight:500">26 fit</span>.</h1>
    <p class="t-s" style="margin-top:7px">Read 2 October</p>
  </div>
  <div class="tabs2" style="gap:18px"><span class="tab2 on" style="font-size:14px">Fit <span class="n">26</span></span><span class="tab2" style="font-size:14px">New <span class="n">4</span></span><span class="tab2" style="font-size:14px">Contacted <span class="n">0</span></span></div>
  <div class="honest" style="grid-template-columns:auto 1fr;gap:12px;padding:14px">
    <span class="unsure">?</span>
    <p class="t-s" style="color:{INK3}"><b style="color:{INK}">We couldn't tell on 38.</b> Free, never guessed. <a href="#" style="text-decoration:underline">See them</a></p>
  </div>
  <div>{rows}</div>
  <div class="costbar" style="grid-template-columns:1fr;gap:14px;padding:18px">
    <div><p class="t-h2" style="color:#fff;font-size:17px;line-height:23px">Six more fit than your free twenty.</p>
    <p class="t-s" style="margin-top:6px">6 credits. The 38 we couldn't tell about stay free.</p></div>
    {btn('Get the other 6','','arrow')}
  </div>
</div>'''
    return phone(inner, 'App 2 · the result · phone', 'AppResultsM.dc.html', 1120)


def s_row_m():
    nm, tw, why, quote, source, tel, mail, site, body_, pages = ROWS[0]
    inner = f'''<div style="padding:18px;display:flex;flex-direction:column;gap:14px">
  <div class="rowc" style="border-color:{INK}">
    <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
      <div><p class="bname" style="font-size:20px;line-height:26px">{nm}</p><p class="btown">{tw}</p></div>
      <p class="reason" style="font-size:14px;line-height:22px;margin:0">{why}</p>
      {ev(quote, source)}
      <div class="col" style="gap:8px;margin-top:4px">
        <span class="ct" style="width:100%">{ico(I['phone'],13)}{tel}</span>
        <span class="ct" style="width:100%">{ico(I['mail'],13)}{mail}</span>
        <span class="ct" style="width:100%">{ico(I['globe'],13)}{site}</span>
      </div>
    </div>
    <div style="padding:0 16px 16px">
      <div class="mailwell">
        <div class="hd" style="padding:11px 14px"><span class="t-h3">Your opening email</span></div>
        <div class="bd" style="padding:14px">{''.join(f'<p style="font-size:16px;line-height:24px">{p}</p>' for p in body_)}</div>
      </div>
    </div>
    <div class="rowacts" style="padding:12px 16px">
      <button class="btn" type="button" style="width:100%;height:48px">Copy email{ico(I['copy'],16)}</button>
      <span class="qbtn" style="flex:1;justify-content:center">{ico(I['eye'],13)}What we read</span>
      <span class="qbtn" style="flex:1;justify-content:center">{ico(I['x'],13)}Not a fit</span>
    </div>
  </div>
</div>'''
    return phone(inner, 'App 3 · the row · phone', 'AppRowM.dc.html', 980)


SCREENS = [s_firstrun, s_results, s_row, s_unsure, s_progress, s_empty,
           s_firstrun_m, s_results_m, s_row_m]
