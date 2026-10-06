from kit import *
from doors import DEN, minibiz

def centered(inner, w=1440, h=880, bg=PAPER):
    return f'''<div class="site" style="background:{bg};display:flex;flex-direction:column">
  <div style="height:84px;display:flex;align-items:center;padding:0 64px">{lockup(23,22)}</div>
  <div style="flex:1;display:flex;align-items:flex-start;justify-content:center;padding:24px 64px 64px">{inner}</div>
</div>'''

def steps(n):
    dots = ''
    for i in (1, 2, 3):
        on = i <= n
        dots += (f'<span style="width:{28 if i==n else 8}px;height:8px;border-radius:999px;'
                 f'background:{LURE if i==n else (LUREI if on else LINE2)};display:block"></span>')
    return f'<div class="row" style="gap:6px">{dots}</div>'

def s1_account():
    inner = f'''<div style="width:440px;display:flex;flex-direction:column;gap:26px">
  {steps(1)}
  <div>
    <h1 class="dsp" style="font-size:40px">Create your account.</h1>
    <p style="margin-top:12px;font-size:17px;color:{INK3}">Two more screens and you'll be looking at businesses that fit what you sell.</p>
  </div>
  <button class="btn white big" type="button" style="width:100%;justify-content:center;gap:12px">
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 12.2c0-.7-.06-1.3-.18-1.9H12v3.6h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" fill="#4285F4"></path><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853"></path><path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z" fill="#FBBC05"></path><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z" fill="#EA4335"></path></svg>
    Continue with Google</button>
  <div class="row" style="gap:16px"><span class="hr" style="flex:1"></span><span class="kick">or</span><span class="hr" style="flex:1"></span></div>
  <div class="field"><span class="lab">Email</span><div class="inp ph">you@youragency.com</div></div>
  <div class="field"><span class="lab">Password</span><div class="inp ph">at least 8 characters</div></div>
  {btn('Create account','ink','arrow','big')}
  <p class="sm" style="text-align:center">No company size. No role. No phone number. We'll ask about your market next.</p>
</div>'''
    return board('SignupAccount.dc.html','Sign-up 1 · create account',1440,860,centered(inner))

def s2_market():
    ex = lambda *t: '<div class="exs">' + ''.join(chip(x) for x in t) + '</div>'
    inner = f'''<div style="width:620px;display:flex;flex-direction:column;gap:30px">
  {steps(2)}
  <div>
    <h1 class="dsp" style="font-size:40px">Tell us your market.</h1>
    <p style="margin-top:12px;font-size:17px;color:{INK3}">Three questions. Tap an example if it's close enough — you can change it later.</p>
  </div>

  <div class="field">
    <span class="lab">What do you sell?</span>
    <div class="inp">AI receptionists<span class="caret"></span></div>
    {ex('Websites','SEO','Booking software','Cleaning services')}
  </div>

  <div class="field">
    <span class="lab">Who do you sell to, and where?</span>
    <div class="inp ph">Type of business and a city</div>
    {ex('Dentists in Phoenix','Med spas in Dallas','HVAC in Tampa')}
  </div>

  <div class="field">
    <div class="between"><span class="lab">What makes one a good fit?</span><span class="kick">optional</span></div>
    <div class="inp" style="background:{LURET};border-color:{LURE};color:{LUREI}">
      {ico(I['spark'],16,1.6,LUREI)}Businesses that still book by phone
      <a class="lnk q" href="#" style="margin-left:auto;font-size:13px;color:{LUREI}">edit</a>
    </div>
    <p class="sm">Filled in from what you sell. Leave it and we'll use it, or change it to anything a website would show.</p>
    {ex('No online booking','No quote form','Independent, not a chain')}
  </div>

  {btn('Find them','','arrow','big')}
  <p class="sm" style="text-align:center">Your first 20 businesses are free. No card.</p>
</div>'''
    return board('SignupMarket.dc.html','Sign-up 2 · your market',1440,1020,centered(inner,h=1020))

def s3_checking():
    rows = []
    for i, (nm, st) in enumerate([
        ('Simply Dentistry','fits'),('Desert Ridge Dental Group','40 locations'),
        ('Papago Park Dental','fits'),('Cedar Point Dental','website gone'),
        ('Agave Dental Arts','already has booking'),('Cave Creek Family Dental','fits')]):
        fit = st == 'fits'
        rows.append(f'''<div class="row" style="gap:14px;padding:11px 0;border-bottom:1px solid {LINE};opacity:{1 - i*0.11:.2f}">
        <span style="width:9px;height:9px;border-radius:50%;background:{LURE if fit else LINE2};flex-shrink:0"></span>
        <span style="flex:1;font-size:15px;{'' if fit else f'color:{MUTD}'}">{nm}</span>
        <span class="mono" style="font-size:12.5px;color:{LUREI if fit else MUT}">{st}</span></div>''')
    inner = f'''<div style="width:720px;display:flex;flex-direction:column;gap:32px;align-items:center;text-align:center">
  {steps(3)}
  <div>
    <p class="kick">Reading dental websites in Phoenix</p>
    <h1 class="dsp" style="font-size:80px;margin-top:14px"><span class="mono" style="font-size:80px;font-weight:500">166</span> <span style="color:{MUT};font-size:34px">checked</span></h1>
    <p style="margin-top:10px;font-size:19px;color:{INK3}"><b style="color:{LUREI}">12 fit so far.</b> This usually takes under two minutes.</p>
  </div>
  <div style="width:100%;height:5px;background:{FILL};border-radius:999px;overflow:hidden">
    <span style="display:block;width:38%;height:100%;background:{LURE}"></span>
  </div>
  <div class="card" style="width:100%;padding:8px 24px 18px;text-align:left">
    <p class="kick" style="padding:14px 0 4px">Coming in now</p>
    {''.join(rows)}
  </div>
  <p class="sm">You can close this tab. We'll email you the moment it's done.</p>
</div>'''
    return board('FirstListChecking.dc.html','Sign-up 3a · checking websites',1440,900,centered(inner,h=900))

def s3_firstlist():
    cards = ''.join(f'<div style="margin-top:14px">{minibiz(*b)}</div>' for b in DEN)
    ghost = ''.join(f'''<div class="card" style="height:104px;margin-top:14px;padding:20px 22px;display:flex;flex-direction:column;gap:12px">
      <div style="width:{w}px;height:18px;background:{FILL}"></div>
      <div style="width:200px;height:11px;background:{LURET}"></div>
      <div style="width:{w+180}px;height:11px;background:{FILL}"></div></div>''' for w in (240,200,270))
    inner = f'''<div class="site" style="background:{PAPER};display:flex;flex-direction:column">
  <div style="height:84px;display:flex;align-items:center;justify-content:space-between;padding:0 64px;border-bottom:1px solid {LINE}">
    {lockup(23,22)}
    <div class="row" style="gap:18px"><span class="chip">{ico(I['card'],13)}20 of 20 credits left</span>{btn('Help','ghost','','sm')}</div>
  </div>
  <div class="sw" style="padding-top:40px">
    <div class="between" style="align-items:flex-end">
      <div>
        <p class="kick lime">Done · 3,041 websites read, 2,999 didn't fit</p>
        <h1 class="dsp" style="font-size:46px;margin-top:14px;max-width:22ch">42 dental clinics in Phoenix fit. Your first 20 are ready.</h1>
      </div>
      <div class="row" style="gap:16px">
        <a class="lnk q" href="#">Save this search</a>
        {btn('Download all 20','','dl','big')}
      </div>
    </div>

    <div class="strip" style="margin-top:28px">
      <div><p class="kick">Clinics in Phoenix</p><b>3,126</b></div>
      <div><p class="kick">Websites we could read</p><b>3,041</b></div>
      <div><p class="kick">Fit what you sell</p><b class="lime">42</b></div>
      <div><p class="kick">Ready for you now</p><b class="lime">20</b></div>
      <div><p class="kick">Contacts invented</p><b>0</b></div>
    </div>

    {cards}
    <div style="opacity:.42">{ghost}</div>

    <div class="card" style="margin-top:14px;padding:22px 26px;display:flex;align-items:center;justify-content:space-between;gap:24px;background:{INK};border-color:{INK};color:{PAPER}">
      <div>
        <p class="dsp" style="font-size:24px;color:#fff">22 more clinics fit this search.</p>
        <p class="sm" style="color:{LINE2};margin-top:6px">Your free 20 are above. The rest are there whenever you want them.</p>
      </div>
      <div class="row" style="gap:14px"><a class="lnk q" style="color:{LINE2}" href="#">Save this search</a>{btn('Get the other 22','','arrow')}</div>
    </div>

    <p class="sm" style="margin-top:22px">We skipped 2,999 that don't fit or we couldn't check. You weren't charged for them.</p>
  </div>
</div>'''
    return board('FirstList.dc.html','Sign-up 3b · your first list',1440,1470,inner,PAPER)

SCREENS = [s1_account, s2_market, s3_checking, s3_firstlist]
