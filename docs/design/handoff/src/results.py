from kit import *
from search import shell

R = [
 ('Lumen Med Spa','Uptown, Dallas TX','lumenmedspa.com','no online booking · Squarespace',
  'I went through 3 pages of lumenmedspa.com and the only way to book is the phone number in your header. Worth a quick look at what that costs you after hours?',
  '(214) 555-0182','hello@lumenmedspa.com'),
 ('Still Water Aesthetics','Plano, TX','stillwateraesthetics.com','no online booking · one location',
  'Your services page lists eight treatments and every one ends in "call to schedule". That is a lot of missed evenings for a place open till six.',
  '(972) 555-0144','front@stillwateraesthetics.com'),
 ('Bishop Arts Skin Studio','Bishop Arts, Dallas TX','bishopartsskin.com','books by phone · asks people to DM',
  'You point people to Instagram DMs for appointments, which works right up until it does not. Two minutes on this one?',
  '(214) 555-0119','studio@bishopartsskin.com'),
 ('Renew Aesthetics','Frisco, TX','renewaesthetics.co','no online booking · WordPress site',
  'Your booking button opens a contact form that asks people to wait for a callback. Same intent, three days slower.',
  '(469) 555-0160','hello@renewaesthetics.co'),
]

def results():
    cards = ''.join(f'<div style="margin-top:14px">{biz(*b)}</div>' for b in R)
    toolbar = f'''<div class="card" style="padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px">
  <div class="row wrap" style="gap:9px">
    {chip('Download all', icon='dl')}{chip('Send to Google Sheets', icon='sheet')}{chip('Copy all emails', icon='copy')}
    {chip('Map view', icon='map')}{chip('Share', icon='share')}
  </div>
  {btn('Save this search','ink','bookmark')}
</div>'''
    body = f'''<div style="display:flex;flex-direction:column;gap:20px">
  <div class="between" style="align-items:flex-end">
    <div>
      <p class="kick">Med spas in Dallas · no online booking · read 30 Sep 2026</p>
      <h1 class="dsp" style="font-size:38px;margin-top:12px">140 med spas fit. Strongest first.</h1>
    </div>
    <div class="tabs">
      <span class="tab on">All 140</span><span class="tab">Contacted 19</span><span class="tab">Not a fit 6</span>
    </div>
  </div>

  {toolbar}
  {cards}

  <div class="card" style="padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px">
    <p class="sm">136 more in this list.</p>
    <div class="row" style="gap:14px"><a class="lnk q" href="#">Jump to 50</a>{btn('Show more','white','chev')}</div>
  </div>

  <p class="sm">We skipped 472 that don't fit or we couldn't check. You weren't charged for them.</p>
</div>'''
    return board('Results.dc.html','Results · the list',1440,1580,
                 shell(body, 'lists', 'type', "Med spas in Dallas that don't take bookings online"))

def contacted():
    rows = ''
    for nm, city, when, who, nxt in [
        ('Lumen Med Spa','Uptown, Dallas TX','2 days ago','email · hello@','follow up Thursday'),
        ('Still Water Aesthetics','Plano, TX','2 days ago','email · front@','replied — booked a call'),
        ('Bishop Arts Skin Studio','Bishop Arts, Dallas TX','4 days ago','phone','no answer, try again'),
        ('Renew Aesthetics','Frisco, TX','last week','email · hello@','no reply yet'),
        ('Aurelia Skin Bar','Deep Ellum, Dallas TX','last week','contact form','no reply yet'),
    ]:
        replied = 'replied' in nxt
        rows += f'''<div class="row" style="gap:20px;padding:16px 22px;border-bottom:1px solid {LINE};background:{SURF}">
      <span style="width:9px;height:9px;border-radius:50%;background:{LURE if replied else LINE2};flex-shrink:0"></span>
      <div style="width:290px"><p style="font-weight:500">{nm}</p><p class="bizmeta" style="margin-top:3px">{city}</p></div>
      <span class="mono" style="width:130px;font-size:13px;color:{MUT}">{when}</span>
      <span class="mono" style="flex:1;font-size:13px;color:{MUT}">{who}</span>
      <span class="chip" style="height:28px;font-size:12.5px;{f'background:{LURET};border-color:{LURE};color:{LUREI}' if replied else ''}">{nxt}</span>
      <span class="act">{ico(I['eye'],13)}Open</span>
    </div>'''
    body = f'''<div style="display:flex;flex-direction:column;gap:20px">
  <div class="between" style="align-items:flex-end">
    <div>
      <p class="kick">Across every list</p>
      <h1 class="dsp" style="font-size:38px;margin-top:12px">19 businesses you've reached out to.</h1>
      <p class="sm" style="margin-top:10px;max-width:60ch">Anything marked as contacted is hidden from new lists, so the same business never lands in your inbox twice.</p>
    </div>
    <div class="row" style="gap:10px">{chip('Download', icon='dl')}{chip('Send to Google Sheets', icon='sheet')}</div>
  </div>

  <div class="strip">
    <div><p class="kick">Contacted</p><b>19</b></div>
    <div><p class="kick">Replied</p><b class="lime">4</b></div>
    <div><p class="kick">Waiting on a reply</p><b>13</b></div>
    <div><p class="kick">Marked not a fit</p><b>6</b></div>
  </div>

  <div class="card" style="overflow:hidden">
    <div class="row" style="gap:20px;padding:13px 22px;border-bottom:1px solid {LINE};background:{PAPER2}">
      <span style="width:9px"></span>
      <span class="kick" style="width:290px">Business</span>
      <span class="kick" style="width:130px">When</span>
      <span class="kick" style="flex:1">How</span>
      <span class="kick" style="width:250px">Where it stands</span>
    </div>
    {rows}
  </div>
  <p class="sm">Marked one by mistake? Open it and put it back on the list — nothing is charged twice.</p>
</div>'''
    return board('Contacted.dc.html','Contacted · nobody gets emailed twice',1440,890,
                 shell(body, 'contacted', 'type', 'Start a new search'))

def mylists():
    cards = ''
    for title, sub, n, when, saved in [
        ("Med spas in Dallas · no online booking",'140 fit of 612 read','140','2 hours ago',True),
        ("Dental clinics in Phoenix · no online booking",'42 fit of 3,041 read','42','yesterday',True),
        ("Salons in Austin · no online booking",'88 fit of 402 read','88','4 days ago',False),
        ("HVAC in Tampa · no quote form",'61 fit of 288 read','61','last week',False),
        ("Law firms in Dallas · old website",'23 fit of 310 read','23','2 weeks ago',False),
        ("Vets in Fort Worth · books by phone",'34 fit of 141 read','34','3 weeks ago',False),
    ]:
        cards += f'''<div class="card" style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">
      <div class="between" style="align-items:flex-start">
        <div>
          <p style="font-size:17px;font-weight:500;max-width:34ch">{title}</p>
          <p class="bizmeta" style="margin-top:6px">{sub} · {when}</p>
        </div>
        <span class="mono" style="font-size:26px;font-weight:500;color:{LUREI}">{n}</span>
      </div>
      <div class="row wrap" style="gap:8px">
        {chip('Open', icon='arrow')}{chip('Download', icon='dl')}{chip('Share', icon='share')}
        {chip('Weekly', on=True, icon='bookmark') if saved else chip('Save this search', icon='bookmark')}
      </div>
    </div>'''
    body = f'''<div style="display:flex;flex-direction:column;gap:20px">
  <div class="between" style="align-items:flex-end">
    <div>
      <h1 class="dsp" style="font-size:38px">My lists</h1>
      <p class="sm" style="margin-top:10px">Every search you've run, newest first. Nothing expires.</p>
    </div>
    {btn('New search','ink','plus')}
  </div>
  <div class="card" style="padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px;background:{LURET};border-color:{LURE}">
    <div class="row" style="gap:12px">{ico(I['bookmark'],17,1.6,LUREI)}
      <span style="color:{LUREI};font-size:15px"><b>2 saved searches</b> are bringing you new businesses every Monday. 6 new med spas landed this week.</span></div>
    <a class="lnk" style="color:{LUREI};border-color:{LUREI}" href="#">See saved searches{ico(I['arrow'],14)}</a>
  </div>
  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">{cards}</div>
</div>'''
    return board('MyLists.dc.html','My lists + saved searches',1440,840,
                 shell(body, 'lists', 'type', 'Start a new search'))

SCREENS = [results, contacted, mylists]
