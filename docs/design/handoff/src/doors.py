from kit import *

def sitenav(cta='Sign up free'):
    return f'''<div class="sitenav">
  {lockup(23,22)}
  <div class="row" style="gap:26px">
    <a class="sm" href="#">How we check</a><a class="sm" href="#">Pricing</a><a class="sm" href="#">Sign in</a>
    {btn(cta,'','','sm')}
  </div>
</div>'''

def minibiz(name, city, why, mail, phone, email, dim=False):
    return f'''<div class="card" style="display:grid;grid-template-columns:1fr 300px">
  <div style="padding:20px 22px;display:flex;flex-direction:column;gap:11px;border-right:1px solid {LINE}">
    <div><p class="bizname">{name}</p><p class="bizmeta" style="margin-top:4px">{city}</p></div>
    <span class="why">{ico(I['check'],12,2)}{why}</span>
    <p class="mail">{mail}</p>
  </div>
  <div style="padding:20px 22px;background:{PAPER2};display:flex;flex-direction:column;gap:10px">
    <p class="kick">Contacts</p>
    <span class="contact">{ico(I['phone'],14)}{phone}</span>
    <span class="contact">{ico(I['mail'],14)}{email}</span>
    <span class="contact">{ico(I['globe'],14)}Contact form</span>
  </div>
</div>'''

SPA = [
 ('Lumen Med Spa','Uptown, Dallas TX','no online booking · Squarespace site',
  'I went through 3 pages of lumenmedspa.com and the only way to book is the phone number in your header. Worth a quick look at what that costs you after hours?',
  '(214) 555-0182','hello@lumenmedspa.com'),
 ('Still Water Aesthetics','Plano, TX','no online booking · one location',
  'Your services page lists eight treatments but every one of them ends in "call to schedule". That is a lot of missed evenings.',
  '(972) 555-0144','front@stillwateraesthetics.com'),
 ('Bishop Arts Skin Studio','Bishop Arts, Dallas TX','books by phone · asks people to DM',
  'You point people to Instagram DMs for appointments, which works until it does not. Two minutes on this one?',
  '(214) 555-0119','studio@bishopartsskin.com'),
]

DEN = [
 ('Simply Dentistry','Scottsdale, AZ','no online booking · Squarespace site',
  'I went through 2 pages of simplydentistry.com and couldn\'t find online booking anywhere. It\'s built on Squarespace, so this is normally an add-on rather than a rebuild.',
  '(480) 429-9700','hello@simplydentistry.com'),
 ('Papago Park Dental','Phoenix, AZ','no online booking · one location',
  'Your new-patient page asks people to call during office hours. That is the one time most people are also at work.',
  '(602) 555-0173','office@papagoparkdental.com'),
 ('Cave Creek Family Dental','Cave Creek, AZ','phone only · no quote form',
  'Everything on cavecreekfamilydental.com routes to a phone number, including the "Request an appointment" button.',
  '(480) 555-0128','hello@cavecreekdental.com'),
]

def door_personal():
    cards = ''.join(f'<div style="margin-top:14px">{minibiz(*b)}</div>' for b in SPA)
    ghosts = ''.join(f'''<div class="card" style="height:118px;margin-top:14px;display:grid;grid-template-columns:1fr 300px">
      <div style="padding:20px 22px;display:flex;flex-direction:column;gap:12px;border-right:1px solid {LINE}">
        <div style="width:{w}px;height:20px;background:{FILL}"></div>
        <div style="width:200px;height:12px;background:{LURET}"></div>
        <div style="width:{w2}px;height:12px;background:{FILL}"></div>
      </div>
      <div style="padding:20px 22px;background:{PAPER2};display:flex;flex-direction:column;gap:10px">
        <div style="width:120px;height:11px;background:{FILL}"></div>
        <div style="width:150px;height:11px;background:{FILL}"></div>
      </div></div>''' for w, w2 in [(230,430),(290,380),(250,460),(210,410)])
    inner = f'''<div class="site">
{sitenav()}
<div class="sw" style="padding-top:48px">
  <p class="kick lime">Made for Northshore Digital · you sell AI receptionists</p>
  <h1 class="dsp h1" style="margin-top:18px;max-width:17ch">38 med spas in Dallas still book by phone.</h1>
  <p style="margin-top:20px;font-size:19px;color:{INK3};max-width:56ch">These 38 med spas in Dallas have no way to book online. Three of them are below, with the email we'd open with.</p>
  <div class="row" style="gap:20px;margin-top:26px">
    {btn('See all 38 — sign up free','','arrow','big')}
    <a class="lnk q" href="#">Rather talk to a person?</a>
  </div>
</div>

<div class="sw" style="margin-top:44px">
  <div class="between"><p class="kick">Three of the 38, in full</p><p class="kick">read on their own websites · 30 Sep 2026</p></div>
  {cards}
</div>

<div class="sw" style="margin-top:34px;position:relative">
  <div class="blur">{ghosts}</div>
  <div class="lock">
    <p class="dsp" style="font-size:30px">35 more, all with contacts and an email.</p>
    {btn('See all 38 — sign up free','','arrow','big')}
    <p class="kick">no card · takes 30 seconds · your market is already filled in</p>
  </div>
</div>
</div>'''
    return board('DoorPersonal.dc.html','Door · personal page',1440,1660,inner,PAPER)

def door_seo():
    cards = ''.join(f'<div style="margin-top:14px">{minibiz(*b)}</div>' for b in DEN)
    related = ''.join(f'<a class="chip" href="#">{t}</a>' for t in
      ['Dentists in Tucson without online booking','Med spas in Phoenix without online booking',
       'Orthodontists in Phoenix without online booking','Dentists in Phoenix with no quote form',
       'Chiropractors in Phoenix without online booking'])
    inner = f'''<div class="site">
{sitenav()}
<div class="sw" style="padding-top:40px">
  <p class="kick"><a href="#">Markets</a> / <a href="#">Dental</a> / <a href="#">Phoenix</a></p>
  <h1 class="dsp" style="font-size:52px;margin-top:16px;max-width:20ch">Dentists in Phoenix without online booking</h1>
  <p style="margin-top:18px;font-size:18px;color:{INK3};max-width:62ch">Clinics where a patient has no way to book a time without picking up the phone. Updated 30 September 2026.</p>

  <div class="strip" style="margin-top:28px">
    <div><p class="kick">Dental clinics in the metro</p><b>3,041</b></div>
    <div><p class="kick">No way to book online</p><b class="lime">42</b></div>
    <div><p class="kick">Each one comes with</p><b style="font-size:19px">an opening email</b></div>
  </div>

  <div class="row" style="gap:20px;margin-top:28px">
    {btn('See all 42 — sign up free','','arrow','big')}
    <a class="lnk q" href="#">Rather talk to a person?</a>
  </div>
</div>

<div class="sw" style="margin-top:42px">
  <p class="kick">Three of the 42, with the email we'd open with</p>
  {cards}
  <div class="card" style="margin-top:14px;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px;background:{LURET};border-color:{LURE}">
    <p style="font-size:16px;color:{LUREI}">39 more clinics fit. Each one comes with contacts and an opening email.</p>
    {btn('See all 42 — sign up free','ink','arrow')}
  </div>
</div>

<div class="sw" style="margin-top:38px">
  <p class="kick">Nearby markets</p>
  <div class="exs" style="margin-top:14px">{related}</div>
  <p class="sm" style="margin-top:20px;max-width:70ch">We only use information a business publishes on its own website. Any business can ask to be removed and we take it out the same day.</p>
</div>
</div>'''
    return board('DoorSEO.dc.html','Door · SEO market page',1440,1520,inner,PAPER)

def door_sample():
    ex = lambda *t: '<div class="exs" style="margin-top:2px">' + ''.join(chip(x) for x in t) + '</div>'
    inner = f'''<div class="site">
{sitenav('Sign in')}
<div class="sw" style="padding-top:60px;display:grid;grid-template-columns:1fr 520px;gap:80px;align-items:start">
  <div>
    <p class="kick lime">Free sample list</p>
    <h1 class="dsp" style="font-size:52px;margin-top:16px;max-width:15ch">Twenty businesses that fit, in your inbox within the hour.</h1>
    <p style="margin-top:22px;font-size:18px;color:{INK3};max-width:46ch">Tell us what you sell and where you sell it. We read the websites one by one and send back the ones that fit, each with an opening email you can send as it is.</p>
    <ul style="margin-top:28px;display:flex;flex-direction:column;gap:14px">
      <li class="row" style="gap:12px">{ico(I['check'],19,2,LUREI)}<span>No card, no account to create first.</span></li>
      <li class="row" style="gap:12px">{ico(I['check'],19,2,LUREI)}<span>Every contact comes off the business's own website.</span></li>
      <li class="row" style="gap:12px">{ico(I['check'],19,2,LUREI)}<span>We never send anything. You do.</span></li>
    </ul>
    <div class="row" style="gap:12px;margin-top:32px;padding-top:24px;border-top:1px solid {LINE}">
      {ico(I['clock'],20,1.6,MUT)}<p class="sm">Most samples land in under 20 minutes. The longest we've taken is 58.</p>
    </div>
  </div>

  <div class="card" style="padding:34px;display:flex;flex-direction:column;gap:24px">
    <div class="field">
      <span class="lab">What do you sell?</span>
      <div class="inp">AI receptionists<span class="caret"></span></div>
      {ex('Websites','SEO','Booking software','Cleaning services')}
    </div>
    <div class="field">
      <span class="lab">Who do you sell to, and where?</span>
      <div class="inp ph">Med spas in Dallas</div>
      {ex('Dentists in Phoenix','Med spas in Dallas','HVAC in Tampa')}
    </div>
    <div class="field">
      <span class="lab">Where should we send it?</span>
      <div class="inp ph">you@youragency.com</div>
    </div>
    {btn('Send me 20 businesses','','arrow','big')}
    <p class="sm" style="text-align:center">One email. No follow-ups unless you ask.</p>
  </div>
</div>
</div>'''
    return board('DoorSample.dc.html','Door · free sample list',1440,790,inner,PAPER)

def door_shared():
    cards = ''.join(f'<div style="margin-top:14px">{minibiz(*b)}</div>' for b in DEN)
    inner = f'''<div class="site">
<div style="background:{INK};color:{PAPER};padding:14px 64px;display:flex;align-items:center;justify-content:space-between;gap:20px">
  <div class="row" style="gap:12px">{ico(I['share'],16,1.6,LURE)}
    <span style="font-size:14px">Shared with you by <b>Marcus at Northshore Digital</b> · read only, nothing here uses your credits</span></div>
  {btn('Get your own list','','arrow','sm')}
</div>
{sitenav()}
<div class="sw" style="padding-top:40px">
  <div class="between" style="align-items:flex-end">
    <div>
      <p class="kick">A shared list · 30 Sep 2026</p>
      <h1 class="dsp" style="font-size:44px;margin-top:14px">42 dental clinics in Phoenix</h1>
      <p style="margin-top:12px;font-size:17px;color:{INK3}">Clinics with no way to book online. Read on their own websites, one by one.</p>
    </div>
    <div class="row" style="gap:10px">
      <span class="chip">{ico(I['dl'],13)}Download</span>
      <span class="chip">{ico(I['map'],13)}Map view</span>
    </div>
  </div>

  {cards}

  <div class="card" style="margin-top:14px;padding:26px;display:flex;align-items:center;justify-content:space-between;gap:24px">
    <div>
      <p class="dsp" style="font-size:26px">39 more in this list.</p>
      <p class="sm" style="margin-top:8px">Marcus shared the whole thing. Sign in to read the rest, or make your own for a market you sell to.</p>
    </div>
    <div class="row" style="gap:14px">{btn('See the rest','white')}{btn('Get your own list','','arrow')}</div>
  </div>

  <p class="sm" style="margin-top:22px">A shared link is read only. Nobody can edit, download or spend credits from it except the person who made it.</p>
</div>
</div>'''
    return board('DoorShared.dc.html','Door · shared list (read only)',1440,1080,inner,PAPER)

def door_referral():
    inner = f'''<div class="site" style="background:{INK}">
<div style="background:{LURE};color:{INK};padding:15px 64px;display:flex;align-items:center;justify-content:space-between;gap:20px">
  <div class="row" style="gap:12px">{ico(I['gift'],18,1.6,INK)}
    <span style="font-size:15px"><b>Marcus gave you 100 extra businesses.</b> They're on your account the moment you sign up.</span></div>
  <span class="kick" style="color:{LUREI}">referral · nsdigital</span>
</div>
<div class="sitenav" style="border-color:{INK2};padding:0 64px">
  {lockup(23,22,color=PAPER,body=LURE,eye=INK,glint=INK)}
  <div class="row" style="gap:26px">
    <a class="sm" style="color:{LINE2}" href="#">How we check</a>
    <a class="sm" style="color:{LINE2}" href="#">Markets</a>
    <a class="sm" style="color:{LINE2}" href="#">Pricing</a>
    {btn('Sign up','','','sm')}
  </div>
</div>
<div class="sw" style="padding-top:78px;color:{PAPER}">
  <h1 class="dsp" style="font-size:68px;max-width:16ch">Only the local businesses that fit what you sell.</h1>
  <p style="margin-top:28px;font-size:20px;color:#D8DCD6;max-width:46ch">Tell us who you sell to and where. We check them one by one. You get only the ones that fit, each with an opening email.</p>
  <div class="row" style="gap:24px;margin-top:38px">
    {btn('Claim 120 free businesses','','arrow','big')}
    <span class="kick dk">20 free + 100 from Marcus · no card</span>
  </div>
</div>
</div>'''
    return board('DoorReferral.dc.html','Door · referral link',1440,700,inner,INK)

SCREENS = [door_personal, door_seo, door_sample, door_shared, door_referral]
