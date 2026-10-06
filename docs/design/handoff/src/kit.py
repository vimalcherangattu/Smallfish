# Small Fish — shared kit for the user-flow artboards
INK='#0E1520'; INK2='#1B2533'; INK3='#36404C'; MUT='#5B6470'; MUTD='#8A929B'
PAPER='#EEF0EC'; PAPER2='#F6F7F4'; SURF='#FFFFFF'; FILL='#E3E6E0'
LINE='#D5D9D2'; LINE2='#B9BFB6'
LURE='#C8F03C'; LURED='#B5DE28'; LUREI='#4A6508'; LURET='#E9F7B5'

FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400..700&amp;family=Libre+Franklin:wght@400;500;600;700&amp;family=DM+Mono:ital,wght@0,400;0,500;1,400&amp;display=swap" rel="stylesheet">')

CSS = """
*{box-sizing:border-box}
body{margin:0}
.sf{--ink:#0E1520;--ink2:#1B2533;--ink3:#36404C;--mut:#5B6470;--mutd:#8A929B;
 --paper:#EEF0EC;--paper2:#F6F7F4;--surf:#FFFFFF;--fill:#E3E6E0;--line:#D5D9D2;--line2:#B9BFB6;
 --lure:#C8F03C;--lured:#B5DE28;--lurei:#4A6508;--luret:#E9F7B5;
 font-family:'Libre Franklin',system-ui,sans-serif;color:var(--ink);font-size:15px;line-height:1.55;
 background:var(--paper2);overflow:hidden;position:relative}
.sf svg{display:block}
.dsp{font-family:'Literata',Georgia,serif;font-weight:700;letter-spacing:-0.007em;line-height:1.06;margin:0;}
.mono{font-family:'DM Mono',ui-monospace,monospace}
.kick{font:500 11px/1.4 'DM Mono',ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase;color:var(--mut);margin:0}
.kick.lime{color:var(--lurei)}
.kick.dk{color:var(--mutd)}
.mut{color:var(--mut)}
.sm{font-size:13.5px;color:var(--mut);margin:0}
p{margin:0}
h1,h2,h3,h4{margin:0}
ul{margin:0;padding:0;list-style:none}
a{color:inherit;text-decoration:none}

/* buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;height:46px;padding:0 22px;border:0;
 border-radius:999px;background:var(--lure);color:var(--ink);font:500 15px 'Libre Franklin',system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.btn.big{height:56px;padding:0 30px;font-size:17px}
.btn.sm{height:36px;padding:0 15px;font-size:13.5px}
.btn.ink{background:var(--ink);color:var(--lure)}
.btn.ghost{background:transparent;border:1px solid var(--line2);color:var(--ink3)}
.btn.white{background:var(--surf);border:1px solid var(--line);color:var(--ink)}
.lnk{display:inline-flex;align-items:center;gap:7px;font-size:14px;color:var(--ink3);border-bottom:1px solid var(--line2);padding-bottom:2px}
.lnk.q{color:var(--mut);border-color:transparent;text-decoration:underline;text-underline-offset:3px}

/* surfaces */
.card{background:var(--surf);border:1px solid var(--line)}
.pad{padding:22px}
.row{display:flex;align-items:center}
.col{display:flex;flex-direction:column}
.between{display:flex;align-items:center;justify-content:space-between;gap:20px}
.wrap{flex-wrap:wrap}
.hr{height:1px;background:var(--line)}

/* chips */
.chip{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 13px;border-radius:999px;
 background:var(--surf);border:1px solid var(--line2);font:400 13.5px 'Libre Franklin',system-ui,sans-serif;color:var(--ink)}
.chip.on{background:var(--luret);border-color:var(--lure);color:var(--lurei);font-weight:500}
.chip.ghost{background:transparent;border-style:dashed;color:var(--mut)}

/* app shell */
.shell{display:grid;grid-template-columns:252px 1fr;height:100%}
.nav{background:var(--surf);border-right:1px solid var(--line);padding:20px 14px;display:flex;flex-direction:column;gap:18px}
.navlogo{display:flex;align-items:center;gap:9px;padding:2px 8px}
.navname{font-family:'Literata',Georgia,serif;font-size:21px;font-weight:700;letter-spacing:-.016em}
.navlist{display:flex;flex-direction:column;gap:2px}
.navitem{display:flex;align-items:center;gap:11px;height:40px;padding:0 11px;border-radius:8px;font-size:14.5px;color:var(--ink3)}
.navitem.on{background:var(--fill);color:var(--ink);font-weight:600}
.navitem .n{margin-left:auto;font:400 12px 'DM Mono',ui-monospace,monospace;color:var(--mut)}
.navfoot{margin-top:auto;display:flex;flex-direction:column;gap:12px}
.meter{height:6px;border-radius:3px;background:var(--fill);overflow:hidden}
.meter i{display:block;height:100%;background:var(--ink)}
.main{overflow:hidden;display:flex;flex-direction:column}
.topbar{height:78px;flex-shrink:0;border-bottom:1px solid var(--line);background:var(--surf);
 display:flex;align-items:center;gap:16px;padding:0 32px}
.searchbox{flex:1;height:48px;border:1px solid var(--line2);border-radius:999px;display:flex;align-items:center;gap:12px;
 padding:0 20px;background:var(--paper2);font-size:15px;color:var(--mut);max-width:720px}
.tabs{display:flex;gap:4px;background:var(--fill);padding:4px;border-radius:999px}
.tab{height:34px;padding:0 15px;border-radius:999px;display:flex;align-items:center;gap:7px;font-size:13.5px;color:var(--ink3)}
.tab.on{background:var(--surf);color:var(--ink);font-weight:500;box-shadow:0 1px 3px rgba(14,21,32,.10)}
.body{flex:1;overflow:hidden;padding:30px 32px}

/* business card */
.biz{background:var(--surf);border:1px solid var(--line);display:grid;grid-template-columns:1fr 340px}
.biz .l{padding:20px 22px;display:flex;flex-direction:column;gap:12px;border-right:1px solid var(--line)}
.biz .r{padding:20px 22px;background:var(--paper2);display:flex;flex-direction:column;gap:11px}
.bizname{font-family:'Literata',Georgia,serif;font-size:22px;font-weight:700;letter-spacing:-0.005em;line-height:1.15}
.bizmeta{font:400 12.5px 'DM Mono',ui-monospace,monospace;color:var(--mut)}
.why{display:inline-flex;align-items:center;gap:8px;font:400 12.5px 'DM Mono',ui-monospace,monospace;color:var(--lurei);
 background:var(--luret);padding:5px 11px;border-radius:999px;align-self:flex-start}
.mail{font-family:'Literata',Georgia,serif;font-size:16.5px;line-height:1.5;color:var(--ink2)}
.contact{display:flex;align-items:center;gap:9px;font:400 13px 'DM Mono',ui-monospace,monospace;color:var(--ink3)}
.acts{display:flex;gap:7px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
.act{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--line);
 border-radius:999px;background:var(--surf);font-size:12.5px;color:var(--ink3)}
.act.p{background:var(--ink);border-color:var(--ink);color:var(--lure)}

/* fields */
.field{display:flex;flex-direction:column;gap:9px}
.inp{height:52px;border:1px solid var(--line2);border-radius:10px;background:var(--surf);display:flex;align-items:center;
 gap:10px;padding:0 16px;font-size:16px;color:var(--ink)}
.inp.ph{color:var(--mutd)}
.lab{font-size:14.5px;font-weight:500}
.caret{width:1.5px;height:19px;background:var(--ink);display:inline-block}
.exs{display:flex;gap:7px;flex-wrap:wrap}

/* stat strip */
.strip{display:flex;gap:0;border:1px solid var(--line);background:var(--surf)}
.strip>div{flex:1;padding:16px 20px;border-right:1px solid var(--line)}
.strip>div:last-child{border-right:0}
.strip b{display:block;font:500 27px 'DM Mono',ui-monospace,monospace;letter-spacing:-.02em;margin-top:5px}
.strip b.lime{color:var(--lurei)}

/* site (marketing) */
.site{background:var(--paper);height:100%;overflow:hidden;position:relative}
.sitenav{height:84px;display:flex;align-items:center;justify-content:space-between;padding:0 64px;border-bottom:1px solid var(--line)}
.sw{padding:0 64px}
.h1{font-size:60px}
.h2{font-size:40px}
.blur{filter:blur(5px);opacity:.5;user-select:none}
.lock{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
"""

def ico(d, s=18, sw=1.6, c='currentColor'):
    return (f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="{d}"></path></svg>')

I = dict(
  search='M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20.5 20.5L16.5 16.5',
  plus='M12 5v14M5 12h14',
  list='M4 6h16M4 12h16M4 18h10',
  bookmark='M6 3h12v18l-6-5-6 5z',
  check='M5 12l5 5 9-10',
  card='M3 6h18v12H3zM3 10h18',
  gift='M4 11h16v9H4zM12 11v9M3 7h18v4H3zM12 7C10 7 8 6 8 4.6S9.5 2.6 12 7zM12 7c2 0 4-1 4-2.4S14.5 2.6 12 7z',
  help='M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9.6 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2-2.5 3.6M12 17.2h.01',
  phone='M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  mail='M3 6h18v12H3zM3 7l9 6 9-6',
  globe='M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c4 4.5 4 12.5 0 18M12 3c-4 4.5-4 12.5 0 18',
  form='M4 4h16v16H4zM8 9h8M8 13h8M8 17h4',
  dl='M12 15V3M7 8l5-5 5 5M4 15v5h16v-5',
  sheet='M4 4h16v16H4zM4 9h16M9.5 9v11',
  map='M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  share='M6.5 14.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5zM17.5 8a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5zM17.5 21a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5zM8.7 10.8l6.6-3.4M8.7 13.2l6.6 3.4',
  copy='M9 9h11v11H9zM5 15V4h11',
  pen='M4 20l4-1 11-11-3-3L5 16z',
  redo='M20 12a8 8 0 1 1-2.4-5.7M20.5 4.5V10h-5.5',
  x='M6 6l12 12M18 6L6 18',
  up='M12 3v12M7 8l5-5 5 5M4 17v3h16v-3',
  chev='M9 6l6 6-6 6',
  pin='M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 8.5a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 0 0 0-3.6z',
  clock='M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5V12l3 2',
  spark='M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z',
  warn='M12 4l9 16H3zM12 10v4M12 17.5h.01',
  cal='M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  chat='M4 5h16v11H9l-5 4z',
  arrow='M5 12h14M13 6l6 6-6 6',
  back='M19 12H5M11 18l-6-6 6-6',
  calc='M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h.01M8 15h2M12 15h2M16 15h.01',
  eye='M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
)

def mark(h=24, body=INK, eye=LURE, glint=LURE):
    w = round(h*1.5)
    return (f'<svg width="{w}" height="{h}" viewBox="0 0 48 32" role="img" aria-label="Small Fish">'
            f'<path d="M26 16 L44 5.5 Q41 16 44 26.5 Z" fill="{body}"></path>'
            f'<circle cx="17" cy="16" r="12" fill="{body}"></circle>'
            f'<circle cx="11.5" cy="12.5" r="2.3" fill="{eye}"></circle>'
            f'<path d="M9.5 21 Q13.5 25 19 24.6" fill="none" stroke="{glint}" stroke-width="2" stroke-linecap="round"></path></svg>')

def lockup(h=24, px=21, color=INK, **k):
    return (f'<span class="navlogo" style="padding:0">{mark(h,**k)}'
            f'<span class="navname" style="color:{color};font-size:{px}px">small fish</span></span>')

def btn(label, kind='', icon=None, size=''):
    cls = ' '.join(x for x in ['btn', kind, size] if x)
    ic = ico(I[icon], 17) if icon else ''
    return f'<button class="{cls}" type="button">{label}{ic}</button>'

def chip(label, on=False, ghost=False, icon=None):
    cls = 'chip' + (' on' if on else '') + (' ghost' if ghost else '')
    ic = ico(I[icon], 13) if icon else ''
    return f'<span class="{cls}">{ic}{label}</span>'

MENU = [('New search','plus','new'),('My lists','list','lists'),('Saved searches','bookmark','saved'),
        ('Contacted','check','contacted'),('Credits and plan','card','credits'),
        ('Give 100, get 100','gift','refer'),('Help','help','help')]

def nav(active='lists', counts=None, credits=(112,150)):
    counts = counts or {'lists':'7','saved':'2','contacted':'19'}
    items = []
    for label, icn, key in MENU:
        on = ' on' if key == active else ''
        n = f'<span class="n">{counts[key]}</span>' if key in counts else ''
        items.append(f'<a class="navitem{on}" href="#">{ico(I[icn],17)}<span>{label}</span>{n}</a>')
    used, tot = credits
    pct = round(used/tot*100)
    return f'''<nav class="nav" aria-label="Primary">
  <div class="navlogo">{mark(23)}<span class="navname">small fish</span></div>
  {btn('New search','ink','plus')}
  <div class="navlist">{''.join(items[1:])}</div>
  <div class="navfoot">
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:9px">
      <div class="between" style="gap:8px"><span style="font-size:12.5px;color:var(--mut)">Credits left</span>
        <span class="mono" style="font-size:12.5px">{tot-used} of {tot}</span></div>
      <div class="meter"><i style="width:{pct}%"></i></div>
      <p class="sm" style="font-size:12px">Businesses that don't fit are free.</p>
    </div>
  </div>
</nav>'''

def topbar(text='Med spas in Dallas that don\'t take bookings online', tab='type', right=None):
    tabs = ''.join(f'<span class="tab{" on" if t==tab else ""}">{ico(I[ic],14)}{lb}</span>'
                   for lb, ic, t in [('Type','search','type'),('Map','map','map')])
    right = right or f'<span class="tabs">{tabs}</span>'
    return f'''<div class="topbar">
  <div class="searchbox">{ico(I['search'],18,1.6,MUT)}<span style="color:{INK}">{text}</span></div>
  {right}
</div>'''

def biz(name, city, site, why, mail, phone, email, form='Contact form', primary='Copy email'):
    return f'''<div class="biz">
  <div class="l">
    <div class="between" style="align-items:flex-start">
      <div><p class="bizname">{name}</p><p class="bizmeta" style="margin-top:5px">{city} · {site}</p></div>
      <span class="chip" style="height:28px;font-size:12px">{ico(I['spark'],12)}strong fit</span>
    </div>
    <span class="why">{ico(I['check'],12,2)}{why}</span>
    <p class="mail">{mail}</p>
    <div class="acts">
      <span class="act p">{ico(I['copy'],13)}{primary}</span>
      <span class="act">{ico(I['pen'],13)}Edit</span>
      <span class="act">{ico(I['redo'],13)}Rewrite</span>
      <span class="act">{ico(I['check'],13)}Mark as contacted</span>
      <span class="act">{ico(I['x'],13)}Not a fit</span>
    </div>
  </div>
  <div class="r">
    <p class="kick">Contacts, as they publish them</p>
    <span class="contact">{ico(I['phone'],14)}{phone}</span>
    <span class="contact">{ico(I['mail'],14)}{email}</span>
    <span class="contact">{ico(I['form'],14)}{form}</span>
    <div class="hr" style="margin:4px 0"></div>
    <p class="sm" style="font-size:12.5px">Every line of the email traces to a page on their site.</p>
  </div>
</div>'''

def board(fname, title, w, h, inner, bg=PAPER2):
    return (fname, title, w, h, f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
{FONTS}
<style>{CSS}</style>
</helmet>
<div class="sf" style="width:{w}px;height:{h}px;background:{bg}">
{inner}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
''')
