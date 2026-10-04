
(function () {
  var d = document;
  d.documentElement.classList.add('js');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- reveal on scroll ---- */
  function reveal() {
    var els = d.querySelectorAll('.rise, .stagger');
    if (!('IntersectionObserver' in window)) {
      for (var i = 0; i < els.length; i++) els[i].classList.add('in');
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    for (var j = 0; j < els.length; j++) io.observe(els[j]);
  }
  reveal();

  /* ---- count up the measured numbers ---- */
  var nums = d.querySelectorAll('[data-count]');
  if (nums.length && 'IntersectionObserver' in window && !reduce) {
    var nio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        nio.unobserve(e.target);
        var el = e.target, to = parseInt(el.getAttribute('data-count'), 10), t0 = 0;
        if (!to) { el.textContent = '0'; return; }
        function step(ts) {
          if (!t0) t0 = ts;
          var p = Math.min((ts - t0) / 1100, 1);
          var e2 = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(to * e2).toLocaleString();
          if (p < 1) requestAnimationFrame(step);
        }
        el.textContent = '0';
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    for (var k = 0; k < nums.length; k++) nio.observe(nums[k]);
  }

  /* ---- cards lean toward the pointer ---- */
  if (!reduce && matchMedia('(hover: hover)').matches) {
    var tilts = d.querySelectorAll('[data-tilt]');
    for (var t = 0; t < tilts.length; t++) (function (el) {
      var raf = null, nx = 0, ny = 0;
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        nx = ((ev.clientX - r.left) / r.width - 0.5) * 2;
        ny = ((ev.clientY - r.top) / r.height - 0.5) * 2;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          el.style.setProperty('--ry', (nx * 2.6).toFixed(2) + 'deg');
          el.style.setProperty('--rx', (-ny * 1.9).toFixed(2) + 'deg');
        });
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--ry', '0deg');
        el.style.setProperty('--rx', '0deg');
      });
    })(tilts[t]);
  }

  /* ---- buttons drift a little toward the cursor ---- */
  if (!reduce && matchMedia('(hover: hover)').matches) {
    var mags = d.querySelectorAll('[data-magnet]');
    for (var m = 0; m < mags.length; m++) (function (el) {
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        var x = ((ev.clientX - r.left) / r.width - 0.5) * 12;
        var y = ((ev.clientY - r.top) / r.height - 0.5) * 8;
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - 3).toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    })(mags[m]);
  }

  /* ---- website pins <-> findings ---- */
  function link(sel) {
    var items = d.querySelectorAll(sel);
    for (var i = 0; i < items.length; i++) (function (el) {
      var id = el.getAttribute('data-pin');
      function set(on) {
        var mates = d.querySelectorAll('[data-pin="' + id + '"]');
        for (var j = 0; j < mates.length; j++) mates[j].classList.toggle('on', on);
        var z = d.querySelector('[data-zone="' + id + '"]');
        if (z) z.classList.toggle('hot', on);
      }
      el.addEventListener('pointerenter', function () { set(true); });
      el.addEventListener('pointerleave', function () { set(false); });
      el.addEventListener('focus', function () { set(true); });
      el.addEventListener('blur', function () { set(false); });
      el.addEventListener('click', function () { set(true); });
    })(items[i]);
  }
  link('[data-pin]');
})();

/* ============================================================
   v7 — the things on this page that react
   ============================================================ */
(function () {
  var d = document;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverable = !window.matchMedia || matchMedia('(hover: hover)').matches;
  var fmt = function (n) { return n.toLocaleString('en-US'); };

  /* ---- 1. the fish drifts toward the pointer ---- */
  var fish = d.querySelector('.herofish'), hero = d.querySelector('.hero');
  if (fish && hero && !reduce && hoverable) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width - 0.5);
      var y = ((e.clientY - r.top) / r.height - 0.5);
      fish.style.setProperty('--fx', (x * -46).toFixed(1) + 'px');
      fish.style.setProperty('--fy', (y * -30).toFixed(1) + 'px');
    });
    hero.addEventListener('pointerleave', function () {
      fish.style.setProperty('--fx', '0px'); fish.style.setProperty('--fy', '0px');
    });
  }

  /* ---- 2. the hero demo runs a whole search, three markets deep ---- */
  var MARKETS = [
    { sell: 'online booking', to: 'dental clinics in Phoenix', n: 42, unit: 'clinics fit', read: 2778,
      feed: [['simplydentistry.com','fits',1],['desertridgedental.com','40 locations',0],
             ['cedarpointdental.com','site gone',0],['papagoparkdental.com','fits',1],
             ['agavedentalarts.com','already has it',0],['northvalleydental.com','no contact',0],
             ['cavecreekfamilydental.com','fits',1],['sonoransmile.co','phone only',0],
             ['vistafamilydentistry.com','site gone',0],['arcadiadentalaz.com','fits',1],
             ['camelbackdentalarts.com','already has it',0],['midtownsmilephx.com','fits',1],
             ['ahwatukeedental.net','no contact',0],['tempedentalgroup.com','12 locations',0]],
      name: 'Simply Dentistry', place: 'Scottsdale, AZ', tel: '(480) 429-9700',
      email: 'hello@simplydentistry.com', site: 'simplydentistry.com',
      mail: ['Your new-patient page asks people to call during office hours. That is the one time most of them are also at work.',
             'You are on Squarespace, so booking is an add-on rather than a rebuild. About a day.'] },
    { sell: 'AI receptionists', to: 'med spas in Dallas', n: 26, unit: 'med spas fit', read: 2440,
      feed: [['lumenmedspa.com','fits',1],['glowbardallas.com','site gone',0],
             ['stillwateraesthetics.com','fits',1],['renewaesthetics.co','already has it',0],
             ['bishopartsskin.com','fits',1],['uptownglowdfw.com','chain',0],
             ['aurelia-skin.com','no contact',0],['frisco-medspa.net','fits',1],
             ['plano-aesthetics.com','already has it',0],['deepellumskin.co','phone only',0],
             ['preston-hollow-med.com','fits',1],['oaklawnlaser.com','site gone',0],
             ['addisonskinbar.com','no contact',0],['knoxglow.com','fits',1]],
      name: 'Lumen Med Spa', place: 'Uptown, Dallas TX', tel: '(214) 555-0182',
      email: 'hello@lumenmedspa.com', site: 'lumenmedspa.com',
      mail: ['Eight treatments on your services page, and every one of them ends in "call to schedule".',
             'Your phone rings after six and nobody is there to pick it up. Worth fifteen minutes to see what those calls are worth?'] },
    { sell: 'website redesigns', to: 'HVAC companies in Tampa', n: 58, unit: 'companies fit', read: 2196,
      feed: [['gulfsideair.com','fits',1],['tampabayhvacpros.com','already has it',0],
             ['baysideheatingfl.com','fits',1],['sunstateair.net','site gone',0],
             ['brandoncooling.com','fits',1],['westshoreac.com','no quote form',1],
             ['palmriverhvac.com','chain',0],['ybor-air.com','no contact',0],
             ['carrollwoodac.com','fits',1],['seminoleheights-air.com','site gone',0],
             ['riverviewcomfort.com','already has it',0],['apollobeachac.com','fits',1],
             ['lutzairandheat.com','phone only',0],['temple-terrace-hvac.com','fits',1]],
      name: 'Gulfside Air & Heat', place: 'Tampa, FL', tel: '(813) 555-0147',
      email: 'service@gulfsideair.com', site: 'gulfsideair.com',
      mail: ['There is no way to ask for a quote on gulfsideair.com. The only route in is a phone number, during the hours your customers are on a job themselves.',
             'Three other Tampa shops added a quote form this year. Happy to show you what they did.'] }
  ];
  var demo = d.querySelector('[data-demo]');
  if (demo) {
    var S = {}, i = 0, clock = [], typer = null;
    ['sell','to','n','unit','name','place','tel','email','site','mail'].forEach(function (k) {
      S[k] = demo.querySelector('[data-h="' + k + '"]');
    });
    var bar = demo.querySelector('[data-d="bar"]'),
        readEl = demo.querySelector('[data-d="read"]'),
        totalEl = demo.querySelector('[data-d="total"]'),
        labelEl = demo.querySelector('[data-d="label"]'),
        ticks = demo.querySelectorAll('[data-d="ticks"] i'),
        feedEl = demo.querySelector('[data-d="feed"]'),
        hitsEl = demo.querySelector('[data-d="hits"]'),
        dots = demo.querySelectorAll('.hdot'),
        caret = demo.querySelector('.tcaret');

    function clear() { clock.forEach(clearTimeout); clock = []; clearInterval(typer); }
    function at(ms, fn) { clock.push(setTimeout(fn, ms)); }

    function type(text, done) {
      clearInterval(typer);
      while (S.to.firstChild && S.to.firstChild !== caret) S.to.removeChild(S.to.firstChild);
      if (reduce) { S.to.insertBefore(d.createTextNode(text), caret); done && done(); return; }
      S.to.classList.add('typing');
      var j2 = 0, node = d.createTextNode('');
      S.to.insertBefore(node, caret);
      typer = setInterval(function () {
        j2++; node.nodeValue = text.slice(0, j2);
        if (j2 >= text.length) { clearInterval(typer); S.to.classList.remove('typing'); done && done(); }
      }, 18);
    }

    function ramp(el, to, ms) {
      var t0 = 0;
      (function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / ms, 1), e2 = 1 - Math.pow(1 - p, 2.4);
        el.textContent = fmt(Math.round(to * e2));
        if (p < 1) requestAnimationFrame(step);
      })(performance.now());
    }

    var ROW_H = 19, WINDOW = 4;

    function buildFeed(m) {
      while (feedEl.firstChild) feedEl.removeChild(feedEl.firstChild);
      var list = m.feed.concat(m.feed.slice(0, WINDOW));
      list.forEach(function (f) {
        var row = d.createElement('div');
        row.className = 'sfrow' + (f[2] ? ' hit' : '');
        var dot = d.createElement('span'); dot.className = 'sfd';
        var u = d.createElement('span'); u.className = 'sfu'; u.textContent = f[0];
        var v = d.createElement('span'); v.className = 'sfv'; v.textContent = f[1];
        row.appendChild(dot); row.appendChild(u); row.appendChild(v);
        feedEl.appendChild(row);
      });
      feedEl.style.transform = 'translateY(0px)';
    }

    function sweepTicks(ms) {
      for (var t = 0; t < ticks.length; t++) ticks[t].className = '';
      var n = ticks.length, step = ms / n;
      for (var t2 = 0; t2 < n; t2++) (function (idx) {
        at(Math.round(step * idx), function () {
          ticks[idx].className = (idx % 7 === 3) ? 'hit' : 'on';
        });
      })(t2);
    }

    function rollFeed(ms) {
      var steps = Math.max(1, Math.round(ms / 190)), pos = 0;
      var max = feedEl.children.length - WINDOW;
      for (var s2 = 1; s2 <= steps; s2++) (function (n2) {
        at(190 * n2, function () {
          pos = n2 % max;
          feedEl.style.transform = 'translateY(-' + (pos * ROW_H) + 'px)';
        });
      })(s2);
    }

    function paint(m) {
      S.sell.textContent = m.sell;
      S.n.textContent = m.n;
      S.unit.textContent = m.unit;
      S.name.textContent = m.name;
      S.place.textContent = m.place;
      S.tel.textContent = m.tel;
      S.email.textContent = m.email;
      S.site.textContent = m.site;
      if (S.mail) {
        while (S.mail.firstChild) S.mail.removeChild(S.mail.firstChild);
        m.mail.forEach(function (line) {
          var p2 = d.createElement('p'); p2.textContent = line; S.mail.appendChild(p2);
        });
      }
    }

    function run(k) {
      clear(); i = k;
      var m = MARKETS[k];
      for (var x = 0; x < dots.length; x++) dots[x].classList.toggle('on', x === k);
      paint(m);
      buildFeed(m);
      totalEl.textContent = fmt(m.read);
      labelEl.textContent = m.to;
      if (S.mail) S.mail.classList.remove('ready');

      if (reduce) {
        demo.className = 'demo'; if (S.mail) S.mail.classList.add('ready'); type(m.to);
        readEl.textContent = fmt(m.read); hitsEl.textContent = fmt(m.n);
        for (var t3 = 0; t3 < ticks.length; t3++) ticks[t3].className = (t3 % 7 === 3) ? 'hit' : 'on';
        return;
      }

      demo.className = 'demo step0';
      bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)';
      readEl.textContent = '0'; hitsEl.textContent = '0';
      for (var t4 = 0; t4 < ticks.length; t4++) ticks[t4].className = '';

      var SWEEP = 1850;
      type(m.to, function () {
        at(140, function () {
          bar.style.transition = 'transform ' + (SWEEP / 1000) + 's cubic-bezier(.25,.75,.35,1)';
          bar.style.transform = 'scaleX(1)';
          ramp(readEl, m.read, SWEEP);
          ramp(hitsEl, m.n, SWEEP);
          sweepTicks(SWEEP);
          rollFeed(SWEEP);
        });
        at(SWEEP + 180, function () { demo.className = 'demo step1'; });
        at(SWEEP + 540, function () { demo.className = 'demo'; });
        at(SWEEP + 900, function () { if (S.mail) S.mail.classList.add('ready'); });
      });
    }

    function next() { run((i + 1) % MARKETS.length); }
    var loop = null;
    function arm() { clearInterval(loop); if (!reduce) loop = setInterval(next, 6800); }
    for (var x2 = 0; x2 < dots.length; x2++) (function (btn) {
      btn.addEventListener('click', function () { run(+btn.getAttribute('data-i')); arm(); });
    })(dots[x2]);
    demo.addEventListener('pointerenter', function () { clearInterval(loop); });
    demo.addEventListener('pointerleave', arm);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es, o) {
        es.forEach(function (e) { if (e.isIntersecting) { run(0); arm(); o.disconnect(); } });
      }, { threshold: 0.25 }).observe(demo);
    } else { run(0); arm(); }
  }

  /* ---- 3. the row card rewrites its own email ---- */
  var TONES = [
    "There's no online booking on simplydentistry.com, so every appointment has to be taken over the phone. Anyone who looks you up after hours waits for a call back.\n\nYou're on Squarespace, so this is usually an add-on rather than a rebuild. Worth a short reply?",
    "No online booking on simplydentistry.com, so every appointment goes through the phone.\n\nYou're on Squarespace, so it's an add-on, not a rebuild. Worth a look?",
    "I had a look through simplydentistry.com and the practice comes across really warmly, which is why the phone-only booking stood out to me.\n\nPeople who find you at ten at night have to wait until morning to do anything about it. You're on Squarespace, so this is an add-on rather than a rebuild. Happy to show you what it would look like on your own site.",
    "simplydentistry.com has no online booking. Every appointment is a phone call.\n\nYou're on Squarespace. This is an add-on, about a day of work. Can I show you?"
  ];
  var mail = d.querySelector('[data-mail]');
  if (mail) {
    var tones = d.querySelectorAll('.tone');
    for (var t = 0; t < tones.length; t++) (function (btn) {
      btn.addEventListener('click', function () {
        for (var q = 0; q < tones.length; q++) tones[q].classList.toggle('on', tones[q] === btn);
        var txt = TONES[+btn.getAttribute('data-tone')] || TONES[0];
        mail.classList.add('out');
        setTimeout(function () {
          while (mail.firstChild) mail.removeChild(mail.firstChild);
          txt.split('\n\n').forEach(function (para, pi) {
            if (pi) { mail.appendChild(d.createElement('br')); mail.appendChild(d.createElement('br')); }
            mail.appendChild(d.createTextNode(para));
          });
          mail.classList.remove('out');
        }, 300);
      });
    })(tones[t]);
  }

  /* ---- 4. the coverage reel: two spinning words and a live count ---- */
  var grid = d.querySelector('.reelgrid');
  if (grid) {
    var reels = {};
    ['trade', 'city'].forEach(function (g) {
      var btn = grid.querySelector('[data-reel="' + g + '"]');
      reels[g] = { btn: btn, track: btn.querySelector('.reeltrack'),
                   mask: btn.querySelector('.reelmask'),
                   items: btn.querySelectorAll('.reeltrack > span'), i: 0 };
    });
    var outN = grid.querySelector('[data-r="n"]'),
        outT = grid.querySelector('[data-r="total"]'),
        outNote = grid.querySelector('[data-r="note"]'),
        outLabel = grid.querySelector('[data-r="label"]'),
        bar = grid.querySelector('.reelbar');
    var shown = 42, raf = null;

    function roll(to) {
      if (reduce) { outN.textContent = fmt(to); shown = to; return; }
      cancelAnimationFrame(raf);
      var from = shown, t0 = 0;
      (function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / 520, 1), e2 = 1 - Math.pow(1 - p, 3);
        outN.textContent = fmt(Math.round(from + (to - from) * e2));
        if (p < 1) raf = requestAnimationFrame(step); else shown = to;
      })(performance.now());
      shown = to;
    }

    function update() {
      var tr = reels.trade.items[reels.trade.i], ci = reels.city.items[reels.city.i];
      var total = Math.round(+tr.getAttribute('data-base') * +ci.getAttribute('data-mult'));
      var fit = Math.max(6, Math.round(total * +tr.getAttribute('data-rate')));
      roll(fit);
      outT.textContent = fmt(total);
      var city = ci.textContent;
      outLabel.textContent = tr.textContent + 's in ' + city;
      outNote.textContent = 'answers come back the same day';
      lightCity();
      if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    }

    var cityNodes = grid.querySelectorAll('.usmap .city');

    function sizeMask(g) {
      var r = reels[g];
      r.mask.style.width = Math.ceil(r.items[r.i].getBoundingClientRect().width) + 'px';
    }

    function spin(g, step) {
      var r = reels[g];
      r.i = (r.i + (step || 1)) % r.items.length;
      r.track.style.transform = 'translateY(' + (-r.i * 1.2) + 'em)';
      sizeMask(g);
      update();
    }

    function lightCity() {
      var name = reels.city.items[reels.city.i].textContent;
      for (var c2 = 0; c2 < cityNodes.length; c2++) {
        cityNodes[c2].classList.toggle('on', cityNodes[c2].getAttribute('data-city') === name);
      }
    }

    ['trade', 'city'].forEach(function (g) {
      reels[g].btn.addEventListener('click', function () { spin(g, 1); arm2(); });
    });

    var turn = 0, spinner = null;
    function tick() {
      turn++;
      var r = reels.trade; r.i = (r.i + 1) % r.items.length;
      r.track.style.transform = 'translateY(' + (-r.i * 1.2) + 'em)'; sizeMask('trade');
      var c3 = reels.city; c3.i = (c3.i + (turn % 3 === 0 ? 2 : 1)) % c3.items.length;
      c3.track.style.transform = 'translateY(' + (-c3.i * 1.2) + 'em)'; sizeMask('city');
      update();
    }
    function arm2() { clearInterval(spinner); if (!reduce) spinner = setInterval(tick, 2100); }
    grid.addEventListener('pointerenter', function () { clearInterval(spinner); });
    grid.addEventListener('pointerleave', arm2);

    function sizeAll() { sizeMask('trade'); sizeMask('city'); }
    sizeAll();
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(sizeAll);
    window.addEventListener('resize', sizeAll);
    setTimeout(sizeAll, 600);
    lightCity();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es, o) {
        es.forEach(function (e) { if (e.isIntersecting) { arm2(); o.disconnect(); } });
      }, { threshold: 0.3 }).observe(grid);
    } else { arm2(); }
  }

  /* ---- 5. the pricing slider picks the plan ---- */
  var range = d.getElementById('plan-range');
  if (range) {
    var pn = d.querySelector('[data-p="n"]'), pline = d.querySelector('[data-p="line"]');
    var tiles = d.querySelectorAll('.price[data-plan]');
    var PRICE = ['$29', '$79', '$199'];
    function plan() {
      var v = +range.value;
      var idx = v <= 300 ? 0 : (v <= 1000 ? 1 : 2);
      pn.textContent = fmt(v);
      for (var q = 0; q < tiles.length; q++) tiles[q].classList.toggle('on', q === idx);
      while (pline.firstChild) pline.removeChild(pline.firstChild);
      pline.appendChild(d.createTextNode('At ' + fmt(v) + ' a month that is '));
      var b = d.createElement('b'); b.style.color = '#fff'; b.textContent = PRICE[idx];
      pline.appendChild(b);
      pline.appendChild(d.createTextNode(", and the ones that don't fit still cost nothing."));
    }
    range.addEventListener('input', plan);
    plan();
  }

  /* ---- 6. the marquee speeds up with the scroll ---- */
  var band = d.querySelector('.ticker .mq');
  if (band && !reduce) {
    band.style.animation = 'none';
    var x = 0, boost = 0, last = window.scrollY, half = 0;
    function measure() { half = band.scrollWidth / 2 || 1; }
    measure(); window.addEventListener('resize', measure);
    window.addEventListener('scroll', function () {
      boost += Math.min(Math.abs(window.scrollY - last) * 0.5, 26);
      last = window.scrollY;
    }, { passive: true });
    (function loop() {
      boost *= 0.92;
      x -= 0.6 + boost;
      if (x <= -half) x += half;
      band.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
      requestAnimationFrame(loop);
    })();
  }
})();


/* ============================================================
   GSAP — scroll reveals + the ContainerScroll 3D card arrival.
   Loads only if the CDN answered; otherwise the IntersectionObserver
   reveals above keep working untouched.
   ============================================================ */
(function () {
  if (!window.gsap || !window.ScrollTrigger) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  var gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);

  /* GSAP takes over the reveals: kill the CSS ones first */
  document.documentElement.classList.add('gsap');

  gsap.utils.toArray('.rise').forEach(function (el) {
    el.classList.add('in');
    gsap.fromTo(el, { y: 34, opacity: 0 }, {
      y: 0, opacity: 1, duration: .9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 86%', once: true }
    });
  });

  gsap.utils.toArray('.stagger').forEach(function (el) {
    el.classList.add('in');
    gsap.fromTo(el.children, { y: 22, opacity: 0 }, {
      y: 0, opacity: 1, duration: .7, ease: 'power3.out', stagger: .07,
      scrollTrigger: { trigger: el, start: 'top 86%', once: true }
    });
  });

  /* ContainerScroll, ported: the row card tilts up out of the page */
  var cs = document.querySelector('[data-cscroll]');
  if (cs) {
    gsap.set(cs.parentNode, { perspective: 1200 });
    gsap.fromTo(cs,
      { rotateX: 18, scale: 1.04, y: 40 },
      { rotateX: 0, scale: 1, y: 0, ease: 'none',
        scrollTrigger: { trigger: cs.parentNode, start: 'top 90%', end: 'top 35%', scrub: .6 } });
  }

  /* the ghost wordmark in the footer drifts as you reach the bottom */
  var ghost = document.querySelector('.ghostword');
  if (ghost) {
    gsap.fromTo(ghost, { xPercent: -6 }, { xPercent: 2, ease: 'none',
      scrollTrigger: { trigger: ghost, start: 'top bottom', end: 'bottom top', scrub: .8 } });
  }
})();


/* ============================================================
   Light through water — the SideRays shader, without ogl.
   Raw WebGL, one full-screen triangle. Bails silently if the
   context is unavailable, and never runs under reduced motion.
   ============================================================ */
(function () {
  var host = document.querySelector('.herorays');
  if (!host) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var canvas = document.createElement('canvas');
  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return;
  host.appendChild(canvas);

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    'precision highp float;',
    'uniform float iTime;uniform vec2 iResolution;uniform float iSpeed;',
    'uniform vec3 c1;uniform vec3 c2;uniform float iIntensity;uniform float iSpread;',
    'uniform float iTilt;uniform float iSaturation;uniform float iBlend;uniform float iFalloff;',
    'float rayStrength(vec2 src, vec2 dir, vec2 coord, float a, float b, float sp){',
    '  vec2 d = coord - src;',
    '  float ca = dot(normalize(d), dir);',
    '  return clamp((0.45 + 0.15*sin(ca*a + iTime*sp)) + (0.3 + 0.2*cos(-ca*b + iTime*sp)), 0.0, 1.0)',
    '    * clamp((iResolution.x - length(d)) / iResolution.x, 0.5, 1.0);',
    '}',
    'void main(){',
    '  vec2 f = gl_FragCoord.xy;',
    '  f.x = iResolution.x - f.x;',          // origin: top-right
    '  vec2 coord = vec2(f.x, iResolution.y - f.y);',
    '  vec2 rayPos = vec2(iResolution.x * 1.1, -0.5 * iResolution.y);',
    '  float t = iTilt * 3.14159265 / 180.0; float cs = cos(t), sn = sin(t);',
    '  vec2 rel = coord - rayPos;',
    '  vec2 tc = vec2(rel.x*cs - rel.y*sn, rel.x*sn + rel.y*cs) + rayPos;',
    '  float hs = iSpread * 0.275;',
    '  vec2 d1 = normalize(vec2(cos(0.785398 + hs), sin(0.785398 + hs)));',
    '  vec2 d2 = normalize(vec2(cos(0.785398 - hs), sin(0.785398 - hs)));',
    '  vec4 r1 = vec4(c1,1.0) * rayStrength(rayPos, d1, tc, 36.2214, 21.11349, iSpeed);',
    '  vec4 r2 = vec4(c2,1.0) * rayStrength(rayPos, d2, tc, 22.3991, 18.0234, iSpeed * 0.2);',
    '  vec4 col = r1 * (1.0 - iBlend) * 0.9 + r2 * iBlend * 0.9;',
    '  float dl = length(gl_FragCoord.xy - vec2(rayPos.x, iResolution.y - rayPos.y)) / iResolution.y;',
    '  col.rgb *= iIntensity * 0.4 / pow(max(dl, 0.001), iFalloff);',
    '  float g = dot(col.rgb, vec3(0.299,0.587,0.114));',
    '  col.rgb = mix(vec3(g), col.rgb, iSaturation);',
    '  col.a = max(col.r, max(col.g, col.b));',
    '  gl_FragColor = col;',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  var vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function U(n) { return gl.getUniformLocation(prog, n); }
  var uTime = U('iTime'), uRes = U('iResolution');
  gl.uniform1f(U('iSpeed'), 1.1);
  gl.uniform3f(U('c1'), 0.784, 0.941, 0.235);   // lure
  gl.uniform3f(U('c2'), 0.196, 0.447, 0.420);   // deep water
  gl.uniform1f(U('iIntensity'), 4.2);
  gl.uniform1f(U('iSpread'), 1.8);
  gl.uniform1f(U('iTilt'), -10.0);
  gl.uniform1f(U('iSaturation'), 1.15);
  gl.uniform1f(U('iBlend'), 0.55);
  gl.uniform1f(U('iFalloff'), 1.25);

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  function size() {
    var w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  window.addEventListener('resize', size);
  size();

  var running = true, raf = null;
  function loop(t) {
    if (!running) return;
    gl.uniform1f(uTime, t * 0.001);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  host.classList.add('lit');

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(loop); }
        else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
      });
    }, { threshold: 0 }).observe(host);
  }
})();
