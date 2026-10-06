from kit import *
from search import shell

def save_search():
    modal = f'''<div class="card" style="width:560px;padding:32px;display:flex;flex-direction:column;gap:22px;box-shadow:0 40px 90px rgba(14,21,32,.22)">
  <div>
    <p class="kick lime">Save this search</p>
    <h2 class="dsp" style="font-size:31px;margin-top:12px">Get the new ones without searching again.</h2>
    <p class="sm" style="margin-top:12px">Med spas in Dallas · no online booking. We re-read the market and email you only what's new.</p>
  </div>
  <div style="display:flex;flex-direction:column;gap:10px">
    <label class="card" style="padding:16px 18px;display:flex;align-items:center;gap:14px;border-color:{LURE};background:{LURET}">
      <span style="width:19px;height:19px;border-radius:50%;border:5px solid {LUREI};background:{SURF};flex-shrink:0"></span>
      <span style="flex:1"><b>Every Monday</b><span class="sm" style="display:block;margin-top:3px">Most people pick this. Roughly 4–8 new a week in a market this size.</span></span>
    </label>
    <label class="card" style="padding:16px 18px;display:flex;align-items:center;gap:14px">
      <span style="width:19px;height:19px;border-radius:50%;border:1.5px solid {LINE2};flex-shrink:0"></span>
      <span style="flex:1"><b>Once a month</b><span class="sm" style="display:block;margin-top:3px">For slower markets, or if weekly is too much.</span></span>
    </label>
  </div>
  <div class="card" style="padding:16px 18px;background:{PAPER};display:flex;gap:12px;align-items:flex-start">
    {ico(I['card'],17,1.6,MUT)}
    <p class="sm">Nothing is charged when the email arrives. You only spend credits if you choose to get the new ones.</p>
  </div>
  <div class="row" style="gap:14px">{btn('Save it','','check','big')}<a class="lnk q" href="#">Not now</a></div>
</div>'''
    email = f'''<div style="width:440px;display:flex;flex-direction:column;gap:14px">
  <p class="kick dk">What lands on Monday</p>
  <div class="card" style="overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid {LINE};background:{PAPER2};display:flex;flex-direction:column;gap:5px">
      <p class="mono" style="font-size:12px;color:{MUT}">Small Fish · Monday 7:00am</p>
      <p style="font-size:16px;font-weight:500">6 new med spas in Dallas fit this week.</p>
    </div>
    <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
      <p class="sm">Three of them opened or changed their site in the last seven days. Here's the first:</p>
      <div style="padding:14px;border-left:2px solid {LURE};background:{PAPER2}">
        <p style="font-weight:500;font-size:15px">Aurelia Skin Bar</p>
        <p class="bizmeta" style="margin-top:4px">Deep Ellum, Dallas TX · no online booking</p>
        <p class="mail" style="margin-top:10px;font-size:15px">You launched three weeks ago and everything still routes to a phone number…</p>
      </div>
      {btn('See all 6','ink','arrow','sm')}
      <p class="sm" style="font-size:12.5px">Nothing charged yet. Weekly · change or stop any time.</p>
    </div>
  </div>
</div>'''
    inner = f'''<div style="position:relative;height:100%;background:{INK}">
  <div style="position:absolute;inset:0;opacity:.22;padding:40px 60px;display:flex;flex-direction:column;gap:14px">
    {''.join(f'<div style="height:96px;background:{SURF};border:1px solid {LINE}"></div>' for _ in range(6))}
  </div>
  <div style="position:relative;height:100%;display:flex;align-items:center;justify-content:center;gap:44px">
    {modal}{email}
  </div>
</div>'''
    return board('SaveSearch.dc.html','Save a search · new ones every week',1440,900,inner,INK)

def credits_plan():
    plans = ''
    for name, price, per, note, on in [
        ('Starter','$29','a month','300 businesses a month',False),
        ('Working','$79','a month','1,000 a month · saved searches',True),
        ('Agency','$199','a month','3,000 a month · client sharing',False)]:
        plans += f'''<div class="card" style="padding:24px;display:flex;flex-direction:column;gap:14px;{f'border-color:{INK};border-width:2px' if on else ''}">
      <div class="between"><p class="kick">{name}</p>{'<span class="chip on" style="height:26px;font-size:11.5px">your plan</span>' if on else ''}</div>
      <p class="dsp" style="font-size:40px"><span class="mono" style="font-weight:500">{price}</span> <span style="font-size:15px;color:{MUT}">{per}</span></p>
      <p class="sm">{note}</p>
      {btn('Current plan','ghost','','sm') if on else btn('Switch to '+name,'white','','sm')}
    </div>'''
    body = f'''<div style="display:grid;grid-template-columns:1fr 400px;gap:24px;align-items:start">
  <div style="display:flex;flex-direction:column;gap:20px">
    <div>
      <h1 class="dsp" style="font-size:36px">Credits and plan</h1>
      <p class="sm" style="margin-top:10px;max-width:58ch">One credit is one business that fits. Businesses we check and leave out cost nothing, and anything you mark as not a fit is refunded on the spot.</p>
    </div>

    <div class="card" style="padding:24px;display:flex;flex-direction:column;gap:16px">
      <div class="between">
        <div><p class="kick">This month</p><p class="dsp" style="font-size:34px;margin-top:8px"><span class="mono" style="font-weight:500">38</span> <span style="font-size:17px;color:{MUT}">of 150 left</span></p></div>
        <div class="row" style="gap:12px">{btn('Top up 100 for $19','white')}{btn('Upgrade','ink','arrow')}</div>
      </div>
      <div class="meter" style="height:8px"><i style="width:75%"></i></div>
      <div class="row wrap" style="gap:24px">
        <span class="sm">112 used · 6 refunded · resets 14 October</span>
      </div>
    </div>

    <div class="card" style="padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:22px;background:{LURET};border-color:{LURE}">
      <div>
        <p style="font-size:17px;font-weight:500;color:{LUREI}">118 more fit in your Dallas search.</p>
        <p class="sm" style="margin-top:5px;color:{LUREI}">You have 38 credits. Get what you can now, or top up and take the lot.</p>
      </div>
      <div class="row" style="gap:12px">{btn('Get 38 now','white')}{btn('Top up and get all 118','ink','arrow')}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">{plans}</div>
  </div>

  <div style="display:flex;flex-direction:column;gap:16px">
    <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:14px">
      <p class="kick">What a credit is spent on</p>
      <div class="between"><span class="sm">A business that fits</span><span class="mono">1</span></div>
      <div class="between"><span class="sm">A rare fit (under 20 in a market)</span><span class="mono">2</span></div>
      <div class="between"><span class="sm">A business we check and leave out</span><span class="mono" style="color:{LUREI}">0</span></div>
      <div class="between"><span class="sm">Re-writing an email</span><span class="mono" style="color:{LUREI}">0</span></div>
      <div class="between"><span class="sm">Anything you mark not a fit</span><span class="mono" style="color:{LUREI}">refunded</span></div>
    </div>
    <div class="card" style="padding:22px;display:flex;flex-direction:column;gap:12px">
      <p class="kick">Billing</p>
      <div class="row" style="gap:12px">{ico(I['card'],17,1.6,MUT)}<span class="sm">Visa ending 4417 · next charge 14 October</span></div>
      <div class="row" style="gap:10px">{chip('Update card')}{chip('Invoices')}{chip('Cancel')}</div>
    </div>
  </div>
</div>'''
    return board('CreditsPlan.dc.html','Get more · credits and plan',1440,900,
                 shell(body, 'credits', 'type', 'Start a new search'))

def refer_help():
    refer = f'''<div class="card" style="padding:30px;display:flex;flex-direction:column;gap:20px">
  <span style="width:48px;height:48px;border-radius:12px;background:{LURET};display:grid;place-items:center">{ico(I['gift'],23,1.7,LUREI)}</span>
  <div>
    <h2 class="dsp" style="font-size:30px">Give 100, get 100.</h2>
    <p class="sm" style="margin-top:10px">Send someone your link. When they pay for the first time, you both get 100 extra businesses. No cap, no expiry.</p>
  </div>
  <div class="inp" style="background:{PAPER2};justify-content:space-between">
    <span class="mono" style="font-size:14px">getsmallfish.com/r/nsdigital</span>
    <span class="act p">{ico(I['copy'],13)}Copy</span>
  </div>
  <div class="row" style="gap:10px">{chip('Email it', icon='mail')}{chip('Post it', icon='share')}</div>
  <div class="hr"></div>
  <div class="row" style="gap:32px">
    <div><p class="kick">Invited</p><p class="mono" style="font-size:26px;font-weight:500;margin-top:5px">7</p></div>
    <div><p class="kick">Paid</p><p class="mono" style="font-size:26px;font-weight:500;margin-top:5px">3</p></div>
    <div><p class="kick">Credits earned</p><p class="mono" style="font-size:26px;font-weight:500;margin-top:5px;color:{LUREI}">300</p></div>
  </div>
</div>'''
    qs = ''.join(f'''<div class="row" style="gap:12px;padding:13px 0;border-bottom:1px solid {LINE}">
    <span style="flex:1;font-size:14.5px">{q}</span>{ico(I['chev'],15,1.6,MUTD)}</div>'''
    for q in ['Why did this business not use a credit?','Can I get a refund on a wrong business?',
              'How often do you re-read a market?','Do you ever send the emails for me?',
              'Can I use this outside the US?'])
    help_ = f'''<div class="card" style="padding:30px;display:flex;flex-direction:column;gap:20px">
  <span style="width:48px;height:48px;border-radius:12px;background:{FILL};display:grid;place-items:center">{ico(I['chat'],23,1.7,INK3)}</span>
  <div>
    <h2 class="dsp" style="font-size:30px">An answer, or a person.</h2>
    <p class="sm" style="margin-top:10px">The chat answers credits, searches and billing questions on the spot. If you'd rather talk, pick a time.</p>
  </div>
  <div class="inp" style="background:{PAPER2}">
    <span style="color:{MUTD}">Ask anything about your account…</span>
  </div>
  <div>
    <p class="kick" style="margin-bottom:6px">People usually ask</p>
    {qs}
  </div>
  <div class="row" style="gap:14px;margin-top:2px">{btn('Book 15 minutes','ink','cal')}<span class="sm">Usually same week.</span></div>
</div>'''
    body = f'''<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">{refer}{help_}</div>'''
    return board('ReferHelp.dc.html','Refer a friend · get help',1440,840,
                 shell(body, 'refer', 'type', 'Start a new search'))

EDGE = [
 ('Nothing fits','warn','"None of the 25 we checked fit. That usually means one condition too many."',
  ['Drop the last condition','Widen the area'], 0),
 ('Very few fit','spark','"This one\'s rare: about 8 fit in Dallas. Rare finds use 2 credits each."',
  ['Get them anyway','Try all of Texas'], 0),
 ('Out of credits','card','"You\'ve used your 20 free. 118 more fit in this search."',
  ['Upgrade','Top up 100 for $19'], 1),
 ('Search still running','clock','"Checking a new market takes a few minutes. We\'ll email you when it\'s ready."',
  ['Keep watching','Close the tab'], 0),
 ('Asking what a website can\'t show','eye','"Revenue and owner age aren\'t on websites. Try something they\'d publish."',
  ['No online booking','No quote form','Independent'], 2),
 ('Outside the US','globe','"We cover the US for now. We\'ll tell you when your country opens."',
  ['Notify me'], 0),
 ('Wrong business in the list','x','"Removed and refunded. Thanks, this makes the next list better."',
  ['Back to the list'], 0),
 ('Payment failed','warn','"Your card didn\'t go through. Your lists are safe."',
  ['Update card'], 0),
]

def edge_states():
    cells = ''
    for title, icn, msg, acts, kind in EDGE:
        if kind == 2:
            actrow = '<div class="exs">' + ''.join(chip(a) for a in acts) + '</div>'
        else:
            actrow = '<div class="row" style="gap:10px">' + btn(acts[0], 'ink' if kind else 'white', '', 'sm') + \
                     (btn(acts[1], 'white', '', 'sm') if len(acts) > 1 else '') + '</div>'
        cells += f'''<div class="card" style="padding:24px;display:flex;flex-direction:column;gap:14px">
      <div class="row" style="gap:11px">
        <span style="width:34px;height:34px;border-radius:9px;background:{FILL};display:grid;place-items:center;flex-shrink:0">{ico(I[icn],17,1.7,INK3)}</span>
        <p class="kick">{title}</p>
      </div>
      <p style="font-family:'Literata',Georgia,serif;font-size:19px;line-height:1.4;letter-spacing:-0.004em">{msg}</p>
      <div style="margin-top:auto;padding-top:6px">{actrow}</div>
    </div>'''
    body = f'''<div style="display:flex;flex-direction:column;gap:22px">
  <div>
    <h1 class="dsp" style="font-size:36px">When things go sideways</h1>
    <p style="margin-top:10px;font-size:16px;color:{INK3};max-width:66ch">Every awkward moment gets one plain line and one button. Short, calm, on the user's side. Never blame the user, never make them read twice, never show an error code.</p>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px">{cells}</div>
  <div class="card" style="padding:22px 26px;display:flex;gap:26px;align-items:center;background:{PAPER};border-style:dashed">
    <p class="kick" style="width:120px">The pattern</p>
    <p class="sm" style="flex:1;max-width:none">One sentence saying what happened · one button saying what to do next · no list of what went wrong · no numbers in a headline the user didn't ask for. If a credit was spent on something that shouldn't have counted, it comes back before the message is shown.</p>
  </div>
</div>'''
    return board('EdgeStates.dc.html','Edge states · when things go sideways',1440,870,
                 shell(body, 'help', None, None))

def menu_board():
    inner = f'<div style="height:100%;display:flex">{nav("lists")}</div>'
    return board('Menu.dc.html','Left menu (kept short on purpose)',252,900,inner,SURF)

SCREENS = [save_search, credits_plan, refer_help, edge_states, menu_board]
