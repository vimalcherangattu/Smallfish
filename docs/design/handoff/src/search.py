from kit import *
from doors import SPA, minibiz
import random

def citymap(w=780, h=560, seed=5):
    rnd = random.Random(seed)
    roads = []
    for i in range(9):
        y = 40 + i * (h - 80) / 8 + rnd.uniform(-9, 9)
        roads.append(f'<path d="M0 {y:.0f} Q {w*0.4:.0f} {y+rnd.uniform(-16,16):.0f} {w} {y+rnd.uniform(-12,12):.0f}" '
                     f'fill="none" stroke="{LINE}" stroke-width="{1.6 if i%3 else 3}"></path>')
    for i in range(11):
        x = 30 + i * (w - 60) / 10 + rnd.uniform(-8, 8)
        roads.append(f'<path d="M{x:.0f} 0 Q {x+rnd.uniform(-16,16):.0f} {h*0.5:.0f} {x+rnd.uniform(-12,12):.0f} {h}" '
                     f'fill="none" stroke="{LINE}" stroke-width="{1.6 if i%3 else 3}"></path>')
    # water / park blocks
    blocks = (f'<path d="M{w*0.06:.0f} {h*0.62:.0f} q60 -40 130 -10 q50 22 30 70 q-30 60 -110 40 q-70 -18 -50 -100z" '
              f'fill="#DDE4D6"></path>'
              f'<circle cx="{w*0.78:.0f}" cy="{h*0.22:.0f}" r="52" fill="#DDE4D6"></circle>')
    # radius selection
    cx, cy, r = w * 0.52, h * 0.5, 190
    sel = (f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r}" fill="rgba(200,240,60,.17)" stroke="{LUREI}" '
           f'stroke-width="1.6" stroke-dasharray="7 6"></circle>'
           f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="5" fill="{INK}"></circle>'
           f'<rect x="{cx-40:.0f}" y="{cy+r-13:.0f}" width="80" height="26" rx="13" fill="{INK}"></rect>'
           f'<text x="{cx:.0f}" y="{cy+r+5:.0f}" text-anchor="middle" font-family="DM Mono, monospace" '
           f'font-size="12" fill="#fff">25 miles</text>')
    pins = []
    for _ in range(96):
        px, py = rnd.uniform(24, w - 24), rnd.uniform(24, h - 24)
        inside = (px - cx) ** 2 + (py - cy) ** 2 < r * r
        fit = inside and rnd.random() < 0.26
        if not inside and rnd.random() < 0.55:
            continue
        if fit:
            pins.append(f'<circle cx="{px:.0f}" cy="{py:.0f}" r="7" fill="{LURE}" stroke="{INK}" stroke-width="1.4"></circle>')
        else:
            pins.append(f'<circle cx="{px:.0f}" cy="{py:.0f}" r="4" fill="none" stroke="{LINE2}" stroke-width="1.5"></circle>')
    return (f'<svg viewBox="0 0 {w} {h}" width="100%" role="img" aria-label="Map of Dallas with a 25 mile radius selected. '
            f'Filled pins are businesses that fit; hollow pins were checked and did not.">'
            f'<rect width="{w}" height="{h}" fill="#EDEFEA"></rect>{blocks}{"".join(roads)}{sel}{"".join(pins)}</svg>')

def shell(body, active='new', tab=None, topbar_text=None, topright=None, h=1000):
    tb = topbar(topbar_text, tab, topright) if tab or topbar_text else ''
    return f'''<div class="shell">
{nav(active)}
<div class="main">{tb}<div class="body">{body}</div></div>
</div>'''

def confirm_bar(count, total, credits, note):
    return f'''<div class="card" style="padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px;border-color:{INK};border-width:2px">
  <div>
    <p class="dsp" style="font-size:25px">About {count} fit, out of {total} we can see.</p>
    <p class="sm" style="margin-top:6px">{note}</p>
  </div>
  <div class="row" style="gap:14px">
    <a class="lnk q" href="#">Get the first 20 now</a>
    {btn(f'Get {count} businesses · uses {credits} credits','','arrow','big')}
  </div>
</div>'''

def s_type():
    chips = ''.join(chip(t, on=True) + ('' if i == 2 else '<span class="mut" style="padding:0 2px">·</span>')
                    for i, t in enumerate(['Med spas', 'Dallas, TX', 'no online booking']))
    cards = ''.join(f'<div style="margin-top:12px">{minibiz(*b)}</div>' for b in SPA)
    body = f'''<div style="display:flex;flex-direction:column;gap:22px">
  <div class="card" style="padding:22px 24px;display:flex;flex-direction:column;gap:16px">
    <div class="between">
      <p class="kick">How we read your sentence — tap any part to change it</p>
      <a class="lnk q" href="#">Start over</a>
    </div>
    <div class="row wrap" style="gap:8px">{chips}{chip('add a condition', ghost=True, icon='plus')}</div>
  </div>

  {confirm_bar(140, 612, 140, "612 med spas in Dallas. We read every one. Businesses that don't fit are free.")}

  <div>
    <div class="between" style="margin-bottom:2px">
      <p class="kick">Three of them, free, before you spend anything</p>
      <p class="kick">strongest fit first</p>
    </div>
    {cards}
  </div>
</div>'''
    return board('SearchType.dc.html','Search 1 · type it',1440,1050,
                 shell(body, 'new', 'type', "Med spas in Dallas that don't take bookings online"))

def s_map():
    body = f'''<div style="display:grid;grid-template-columns:1fr 360px;gap:22px;height:100%">
  <div class="card" style="overflow:hidden;display:flex;flex-direction:column">
    <div class="between" style="padding:14px 18px;border-bottom:1px solid {LINE}">
      <div class="row" style="gap:8px">
        {chip('City, county or state')}{chip('Pin + radius', on=True, icon='pin')}{chip('Draw a shape')}
      </div>
      <div class="row" style="gap:16px">
        <span class="row" style="gap:7px">{ico(I['pin'],13,1.6,LUREI)}<span class="kick lime">37 fit</span></span>
        <span class="row" style="gap:7px"><span style="width:9px;height:9px;border:1.5px solid {LINE2};border-radius:50%"></span><span class="kick">142 checked</span></span>
      </div>
    </div>
    <div style="flex:1;overflow:hidden">{citymap()}</div>
    <div class="between" style="padding:12px 18px;border-top:1px solid {LINE}">
      <div class="row" style="gap:7px">{chip('5 mi')}{chip('10 mi')}{chip('25 mi', on=True)}{chip('50 mi')}</div>
      <p class="sm">Dropped at 2100 Ross Ave · drag the edge to resize</p>
    </div>
  </div>

  <div style="display:flex;flex-direction:column;gap:18px">
    <div class="field">
      <span class="lab">Type of business</span>
      <div class="inp">Med spas<span class="caret"></span></div>
      <div class="exs">{chip('Dentists')}{chip('Salons')}{chip('HVAC')}</div>
    </div>
    <div class="field">
      <span class="lab">What makes a fit</span>
      <div class="inp" style="font-size:15px">No online booking</div>
      <div class="exs">{chip('No quote form')}{chip('Independent')}</div>
    </div>
    <div class="card" style="padding:18px;display:flex;flex-direction:column;gap:12px">
      <p class="kick">In this shape, so far</p>
      <p class="dsp" style="font-size:44px"><span class="mono" style="font-weight:500">37</span> <span style="font-size:19px;color:{MUT}">of 142 read</span></p>
      <div style="height:5px;background:{FILL};border-radius:999px;overflow:hidden"><span style="display:block;width:44%;height:100%;background:{LURE}"></span></div>
      <p class="sm">Pins keep filling in while you adjust the area. Nothing is charged until you press the button.</p>
    </div>
    {btn('Get 37 businesses · uses 37 credits','','arrow','big')}
    <p class="sm" style="text-align:center">Useful for a rep's patch or a day of route planning.</p>
  </div>
</div>'''
    return board('SearchMap.dc.html','Search 2 · pick it on the map',1440,1080,
                 shell(body, 'new', 'map', 'Med spas · 25 miles around downtown Dallas'))

TEMPLATES = [
 ('AI receptionist prospects','Clinics and spas that still book by phone','spark',
  ['Dentists','Med spas','Vets','Physio clinics']),
 ('Website redesign prospects','Businesses with no quote form or an old site','globe',
  ['Law firms','Contractors','Accountants','Dentists']),
 ('Booking software prospects','Salons and studios with no online booking','cal',
  ['Salons','Yoga studios','Barbers','Nail bars']),
 ('Review management prospects','Businesses with few or old reviews','spark',
  ['Restaurants','Garages','Movers','Gyms']),
]

def s_templates():
    cards = ''
    for name, sub, icn, niches in TEMPLATES:
        cards += f'''<div class="card" style="padding:24px;display:flex;flex-direction:column;gap:14px">
      <span style="width:42px;height:42px;border-radius:10px;background:{LURET};display:grid;place-items:center">{ico(I[icn],20,1.7,LUREI)}</span>
      <div>
        <p class="dsp" style="font-size:22px">{name}</p>
        <p class="sm" style="margin-top:7px">{sub}</p>
      </div>
      <div class="exs" style="margin-top:2px">{''.join(chip(n) for n in niches[:3])}</div>
      <div class="row" style="gap:10px;margin-top:6px">
        <div class="inp" style="height:42px;flex:1;font-size:14px"><span style="color:{MUTD}">Add a city</span></div>
        {btn('Run','ink','arrow','sm')}
      </div>
    </div>'''
    body = f'''<div style="display:flex;flex-direction:column;gap:26px">
  <div>
    <h1 class="dsp" style="font-size:34px">Not sure what to type? Start from one of these.</h1>
    <p style="margin-top:10px;font-size:16px;color:{INK3};max-width:60ch">Each one is a search we already know works. Tap a card, add a city, and it runs exactly like a typed search — same count, same three free examples, same confirm.</p>
  </div>
  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px">{cards}</div>
  <div class="card" style="padding:20px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;background:{PAPER};border-style:dashed">
    <p class="sm">Sell something that isn't here? Type it in the box above in your own words — nothing has to be built for a new trade.</p>
    <a class="lnk" href="#">Type it instead{ico(I['arrow'],15)}</a>
  </div>
</div>'''
    return board('SearchTemplates.dc.html','Search 3 · start from a template',1440,990,
                 shell(body, 'new', 'type', 'Start typing, or pick a template below'))

def s_upload():
    rows = ''.join(f'''<div class="row" style="gap:0;border-bottom:1px solid {LINE};font-size:14px">
      <span style="width:46px;padding:11px 0;color:{MUTD}" class="mono">{i}</span>
      <span style="flex:1;padding:11px 0">{site}</span>
      <span style="width:200px;padding:11px 0;color:{MUT}" class="mono">{name}</span>
      <span style="width:110px;padding:11px 0;text-align:right" class="mono">{st}</span></div>'''
      for i, site, name, st in [
        (1,'lumenmedspa.com','Lumen Med Spa','ready'),
        (2,'stillwateraesthetics.com','Still Water Aesthetics','ready'),
        (3,'bishopartsskin.com','Bishop Arts Skin Studio','ready'),
        (4,'—','Glow Bar Dallas','no website'),
        (5,'renewaesthetics.co','Renew Aesthetics','ready')])
    body = f'''<div style="display:grid;grid-template-columns:1fr 380px;gap:22px">
  <div style="display:flex;flex-direction:column;gap:20px">
    <div>
      <h1 class="dsp" style="font-size:34px">Already have a list? We'll check it.</h1>
      <p style="margin-top:10px;font-size:16px;color:{INK3};max-width:62ch">Upload a CSV with a column of websites or business names. We read each one and hand back only the ones that fit, with an opening email. The rest are free, same as any search.</p>
    </div>

    <div class="card" style="padding:26px;border-style:dashed;border-width:2px;display:flex;align-items:center;gap:20px;background:{PAPER}">
      <span style="width:52px;height:52px;border-radius:12px;background:{LURET};display:grid;place-items:center">{ico(I['up'],23,1.7,LUREI)}</span>
      <div style="flex:1">
        <p style="font-size:16px;font-weight:500">dallas-medspas-master.csv</p>
        <p class="sm" style="margin-top:4px">318 rows · website column found · uploaded just now</p>
      </div>
      <a class="lnk q" href="#">Replace</a>
    </div>

    <div class="card">
      <div class="between" style="padding:14px 18px;border-bottom:1px solid {LINE}">
        <p class="kick">First five rows, as we read them</p>
        <div class="row" style="gap:8px">{chip('website', on=True)}{chip('name')}</div>
      </div>
      <div style="padding:0 18px 6px">{rows}</div>
      <div class="between" style="padding:13px 18px;border-top:1px solid {LINE}">
        <p class="sm">313 rows have a website we can open. 5 don't — those are skipped and never charged.</p>
      </div>
    </div>
  </div>

  <div style="display:flex;flex-direction:column;gap:18px">
    <div class="field">
      <span class="lab">What makes one a fit?</span>
      <div class="inp" style="font-size:15px">No online booking</div>
      <div class="exs">{chip('No quote form')}{chip('Independent, not a chain')}{chip('Old site')}</div>
    </div>
    <div class="card" style="padding:20px;display:flex;flex-direction:column;gap:12px">
      <p class="kick">What this will cost</p>
      <div class="between"><span class="sm">Rows we can read</span><span class="mono">313</span></div>
      <div class="between"><span class="sm">Rows with no website</span><span class="mono">5</span></div>
      <div class="hr"></div>
      <div class="between"><span style="font-weight:500">You only pay for fits</span><span class="mono" style="font-size:19px">?</span></div>
      <p class="sm">We can't know how many fit until we've read them. Nothing is charged for the ones that don't.</p>
    </div>
    {btn('Check all 313','','arrow','big')}
    <p class="sm" style="text-align:center">Takes a few minutes. We'll email you when it's done.</p>
  </div>
</div>'''
    return board('SearchUpload.dc.html','Search 4 · bring your own list',1440,820,
                 shell(body, 'new', 'type', 'Or paste a sentence to search instead'))

SCREENS = [s_type, s_map, s_templates, s_upload]
