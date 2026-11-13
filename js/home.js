/* HAHN & VO — home page logic: preloader, hero logo, section content. */
(function () {
  'use strict';
  var HV = window.HV;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- hero mark + preloader ---------- */
  var pre = document.querySelector('.preloader');
  var heroMark = document.getElementById('heroMark');
  pre.querySelector('.pre-mark').innerHTML = HV.MARK.replace('class="brand-mark"', '');
  heroMark.innerHTML = HV.MARK.replace('class="brand-mark"', '');

  /* minute track: 60 ticks around the mark, quarters accented */
  var SVGNS = 'http://www.w3.org/2000/svg';
  var preRing = document.getElementById('preRing');
  var preTicks = [];
  for (var ti = 0; ti < 60; ti++) {
    var quarter = ti % 15 === 0;
    var ang = ti * 6 * Math.PI / 180;
    var r1 = quarter ? 85 : 90;
    var tickEl = document.createElementNS(SVGNS, 'line');
    tickEl.setAttribute('x1', 100 + r1 * Math.sin(ang));
    tickEl.setAttribute('y1', 100 - r1 * Math.cos(ang));
    tickEl.setAttribute('x2', 100 + 96 * Math.sin(ang));
    tickEl.setAttribute('y2', 100 - 96 * Math.cos(ang));
    tickEl.setAttribute('stroke-width', quarter ? 2.2 : 1);
    tickEl.setAttribute('class', 'pre-tick');
    tickEl.dataset.op = quarter ? 0.75 : 0.3;
    preRing.appendChild(tickEl);
    preTicks.push(tickEl);
  }
  var preHand = document.getElementById('preHand');

  /* slot-machine letter roll for the hero title (NAU-style odometer) */
  var titleSpan = document.querySelector('.hero-title .reveal-line > span') ||
                  document.querySelector('.hero-title span span') ||
                  document.querySelector('.hero-title');
  function buildRoll(el) {
    var text = el.textContent;
    el.textContent = '';
    el.classList.add('roll');
    var letters = [];
    Array.prototype.forEach.call(text, function (ch) {
      var cell = document.createElement('span');
      cell.className = 'rl';
      if (ch.trim() === '' || ch === ' ') {
        cell.innerHTML = '<i>&nbsp;</i>';
        cell.style.width = '0.22em';
      } else {
        cell.innerHTML = '<i>' + ch + '</i><i>' + ch + '</i>';
        letters.push(cell);
      }
      el.appendChild(cell);
    });
    return letters;
  }
  function rollOnce(letters, dur) {
    var tl = gsap.timeline();
    letters.forEach(function (cell, idx) {
      var a = cell.children[0], b = cell.children[1];
      tl.fromTo([a, b],
        { yPercent: 0 },
        { yPercent: 115, duration: dur || 0.9, ease: 'power3.inOut',
          onComplete: function () { gsap.set([a, b], { yPercent: 0 }); } },
        idx * 0.07);
    });
    return tl;
  }

  var heroLetters = [];
  if (titleSpan && !reduce) {
    // strip the default reveal-line handling: the roll replaces it
    var mask = titleSpan.parentElement;
    if (mask && mask.classList.contains('reveal-line')) {
      mask.classList.remove('reveal-line');
      mask.removeAttribute('data-delay');
      gsap.set(titleSpan, { y: 0 });
    }
    heroLetters = buildRoll(titleSpan);
    heroLetters.forEach(function (cell) {
      gsap.set(cell.children[0], { yPercent: 115 });
      gsap.set(cell.children[1], { yPercent: 0 });
    });
  }

  function heroEntrance() {
    var tl = gsap.timeline();
    // letters roll up into place
    heroLetters.forEach(function (cell, idx) {
      tl.to([cell.children[0], cell.children[1]], {
        yPercent: '+=115', duration: 1.0, ease: 'power4.out',
        onComplete: (function (a, b) { return function () { gsap.set([a, b], { yPercent: 0 }); }; })(cell.children[0], cell.children[1]),
      }, 0.25 + idx * 0.06);
    });
    // mark floats in
    tl.fromTo(heroMark,
      { opacity: 0, y: 56, scale: 0.86, filter: 'blur(10px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 1.4, ease: 'power3.out' }, 0.1);
    return tl;
  }

  /* Der Preloader läuft einmal je Sitzung: Wer die Startseite in derselben
     Sitzung erneut öffnet (Zurück aus dem Shop, zweiter Besuch), sieht sofort
     den Hero. Der erste Eindruck bleibt, die Wartezeit kommt nur einmal. */
  var preGesehen = false;
  try { preGesehen = sessionStorage.getItem('hv_pre') === '1'; } catch (e) {}

  /* preloader sequence — the hand starts on the real current second,
     flies back to 12 like a chronograph reset, recoils, then the page wipes in */
  if (!reduce && preGesehen) {
    pre.style.display = 'none';
    heroEntrance();
  } else if (!reduce) {
    try { sessionStorage.setItem('hv_pre', '1'); } catch (e) {}
    document.documentElement.style.overflow = 'hidden';
    var now = new Date();
    var startAngle = (now.getSeconds() + now.getMilliseconds() / 1000) * 6;
    if (startAngle < 40) startAngle += 360; /* always a visible sweep */
    gsap.set(preHand, { svgOrigin: '100 100', rotation: startAngle });

    var ptl = gsap.timeline({
      onComplete: function () { document.documentElement.style.overflow = ''; },
    });
    ptl
      /* dial assembles */
      .to('.pre-watch', { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0)
      .fromTo('.pre-mark', { scale: 0.7, rotate: -14 }, { scale: 1, rotate: 0, duration: 0.7, ease: 'back.out(1.6)' }, 0.05)
      .add(function () {
        preTicks.forEach(function (t, i) {
          gsap.to(t, { opacity: parseFloat(t.dataset.op), duration: 0.3, delay: i * 0.012, ease: 'power1.out' });
        });
      }, 0.1)
      .to('.pre-word', { opacity: 1, duration: 0.4 }, 0.35)
      /* flyback: sweep from the live second back up to 12 */
      .to(preHand, { rotation: 360 + 366, duration: 1.35, ease: 'power3.inOut' }, 0.25)
      /* mechanical recoil past 12, spring back onto the marker */
      .to(preHand, { rotation: 360 + 360, duration: 0.6, ease: 'elastic.out(1.6, 0.26)' }, '>-0.06')
      /* wipe into the hero */
      .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 0.85, ease: 'power4.inOut' }, '-=0.28')
      .set(pre, { display: 'none' })
      .add(heroEntrance(), '-=1.15');
  } else {
    pre.style.display = 'none';
    if (heroMark) heroMark.style.opacity = 1;
  }

  /* idle float + pointer tilt on the mark (schwebend & interaktiv) */
  if (!reduce) {
    gsap.to(heroMark, { y: -12, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2 });
    var hero = document.querySelector('.hero');
    if (window.matchMedia('(pointer: fine)').matches) {
      var qx = gsap.quickTo(heroMark, 'rotationY', { duration: 0.7, ease: 'power2.out' });
      var qy = gsap.quickTo(heroMark, 'rotationX', { duration: 0.7, ease: 'power2.out' });
      var qtx = gsap.quickTo(heroMark, 'x', { duration: 0.9, ease: 'power2.out' });
      gsap.set(heroMark, { transformPerspective: 700 });
      hero.addEventListener('mousemove', function (e) {
        var nx = (e.clientX / window.innerWidth) * 2 - 1;
        var ny = (e.clientY / window.innerHeight) * 2 - 1;
        qx(nx * 16); qy(ny * -12); qtx(nx * 14);
      });
      hero.addEventListener('mouseleave', function () { qx(0); qy(0); qtx(0); });
      heroMark.style.cursor = 'pointer';
      heroMark.addEventListener('click', function () { if (heroLetters.length) rollOnce(heroLetters); });
    }
    // periodic idle re-roll like NAU (every ~9s)
    if (heroLetters.length) {
      setInterval(function () {
        if (document.visibilityState === 'visible' && window.scrollY < window.innerHeight * 0.6) rollOnce(heroLetters);
      }, 9000);
    }
    // hero parallax out on scroll
    gsap.to('.hero-inner', {
      y: -70, opacity: 0.25, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero-video', {
      scale: 1.12, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
  }

  /* live clock — a watch dealer's homepage should tell the time */
  var clock = document.getElementById('heroClock');
  function tick() {
    var now = new Date();
    clock.textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' FRA';
  }
  if (clock) { tick(); setInterval(tick, 1000); }

  /* ---------- flagship showcase: rotates through the New-In pieces ---------- */
  var SHOWCASE_COPY = {
    p550: 'Das grüne Zifferblatt hat die Formula 1 aus dem Rennsport-Zubehör in die Vitrine gehoben — Edelstahl, Tachymeter-Lünette, 43 Millimeter Auftritt. Baujahr 2023, Full Set mit Box und Papieren.',
    p549: 'Schwarzes Blatt, weiße Hilfszifferblätter, roter Chronographenzeiger — die Formula 1 in ihrer bekanntesten Ausführung. Baujahr 2022, Full Set mit Box und Papieren, Zustand sehr gut.',
    p462: 'Max Büssers „horologisches Konzeptlabor“ baut rund 400 Uhren im Jahr — diese hier trägt ihre fliegende Unruh sichtbar über dem eisblauen Zifferblatt. Full Set von 2024, Zustand wie neu, sofort im Showroom zu besichtigen.',
    p461: 'Seit 1917 ist die Tank die Antwort auf die Frage nach der einen Uhr zum Anzug. Dieses Exemplar mit weißem, römischem Zifferblatt kommt mit Echtheitszertifikat — geöffnet und geprüft wie jede Uhr im Haus.',
    p460: 'Die Tank Solo im größeren Format mit dem gesuchten Piano-Zifferblatt — Baujahr 2010, im Full Set mit Echtheitszertifikat. Zeitlos vom Vormittagstermin bis zur Abendgarderobe.',
    p459: 'Blaues Zifferblatt auf Oysterband: die Datejust 36 in ihrer souveränsten Konfiguration. Baujahr 2009, Zustand sehr gut, im Full Set mit Box und Papieren.',
    p458: 'Blaues Blatt am Jubilé-Band — die meistgetragene Rolex-Linie in ihrer elegantesten Ausführung. Baujahr 2022, Full Set mit Box und Papieren.',
    p457: 'Moonwatch-DNA im 38-Millimeter-Gehäuse mit grauem Zifferblatt — die Speedmaster für schmalere Handgelenke. Baujahr 2018, komplettes Full Set.',
  };

  /* Aus der Beschreibung einen Schaufenster-Text bauen. Der Satz zu den
     Bildern steht unter jeder Uhr und fliegt raus, „Hier präsentieren wir
     die …“ wird zu „Die …“ gekürzt. Ein Punkt in einer Abkürzung wie
     „Ref.“ ist kein Satzende — daran ist die frühere Fassung gescheitert
     und hat den Text mitten im Satz abgeschnitten. */
  var BILDSATZ = /Unsere Bilder sind unbearbeitet[\s\S]*?wahrnimmt\.?/i;
  var ABKUERZUNG = /\b(?:Ref|Nr|ca|bzw|Kal|inkl|max|min|ggf|evtl|Abb|St|z|B|u|a)\.$/;

  function inSaetze(text) {
    var saetze = [], start = 0, re = /[.!?]\s+(?=[A-ZÄÖÜ0-9])/g, m;
    while ((m = re.exec(text)) !== null) {
      var kandidat = text.slice(start, m.index + 1).trim();
      if (ABKUERZUNG.test(kandidat)) continue;
      saetze.push(kandidat);
      start = m.index + m[0].length;
    }
    var rest = text.slice(start).trim();
    if (rest) saetze.push(rest);
    return saetze;
  }

  function schaufensterText(p) {
    var roh = String(p.desc || '').replace(BILDSATZ, '').replace(/\s+/g, ' ').trim();
    var saetze = inSaetze(roh);
    if (!saetze.length) return 'Geprüft und dokumentiert — jetzt im Showroom zu besichtigen.';
    saetze[0] = saetze[0].replace(/^Hier präsentieren wir (?:euch )?(die|den|das)\s+/i,
      function (_m, artikel) { return artikel.charAt(0).toUpperCase() + artikel.slice(1) + ' '; });
    var text = saetze[0];
    if (text.length < 150 && saetze[1]) text += ' ' + saetze[1];
    return text;
  }

  function slideData(p) {
    var chips = [];
    if (p.material && p.size) chips.push(p.material + ' · ' + p.size);
    else if (p.size || p.material) chips.push(p.size || p.material);
    if (p.ref) chips.push('Ref. ' + p.ref);
    if (p.fullset) chips.push(p.fullset.indexOf('Full Set') === 0 ? 'Full Set, Papiere, Box' : p.fullset);
    chips.push(HV.fmtEUR(p.price) + (p.listPrice && p.listPrice > p.price ? ' · vorher ' + HV.fmtEUR(p.listPrice) : ''));
    return {
      id: p.id,
      kicker: p.id === window.FLAGSHIP_ID ? 'Das Flaggschiff' : 'Neu eingetroffen',
      name: p.brand + ' ' + p.name,
      desc: SHOWCASE_COPY[p.id] || schaufensterText(p),
      chips: chips,
      avail: p.status === 'available' ? '1 von 1 · sofort verfügbar' : p.status === 'anfrage' ? '1 von 1 · Kauf per Überweisung' : '1 von 1 · aktuell reserviert',
      img: p.images[0],
    };
  }

  /* Die Auswahl leitet sich aus dem Bestand ab: zuletzt angelegt zuerst,
     nur erhältliche Uhren, kein Zubehör — dieselbe Regel wie die Reihe
     darunter. Früher stand hier eine von Hand gepflegte Liste
     (window.NEW_IN). Die veraltete bei jeder neuen Uhr und zeigte
     irgendwann verkaufte oder gelöschte Stücke. */
  var slides = (window.PRODUCTS || [])
    .filter(function (p) { return (p.status === 'available' || p.status === 'anfrage') && p.category !== 'zubehoer'; })
    .sort(function (a, b) { return String(b.added || '').localeCompare(String(a.added || '')); })
    .slice(0, 6)
    .map(slideData);

  var fsMedia = document.getElementById('fsMedia');
  var fsEls = {
    kicker: document.getElementById('fsKicker'),
    count: document.getElementById('fsCount'),
    name: document.getElementById('flagshipName'),
    desc: document.getElementById('flagshipDesc'),
    meta: document.getElementById('flagshipMeta'),
    link: document.getElementById('flagshipLink'),
    avail: document.getElementById('fsAvail'),
    bar: document.getElementById('fsBar'),
  };

  /* eine Medienebene je Uhr — das Bild muss zum Text darunter passen */
  fsMedia.innerHTML = '';
  var layers = slides.map(function (s, i) {
    var layer = document.createElement('div');
    layer.className = 'fs-layer' + (i === 0 ? ' is-active' : '');
    layer.innerHTML = '<img src="' + s.img + '" alt="' + s.name + '"' +
                      (i === 0 ? '' : ' loading="lazy"') + '>';
    fsMedia.appendChild(layer);
    return layer;
  });
  var fsVideo = null;

  function fill(s, idx) {
    fsEls.kicker.textContent = s.kicker;
    fsEls.count.textContent = ('0' + (idx + 1)).slice(-2) + ' / ' + ('0' + slides.length).slice(-2);
    fsEls.name.textContent = s.name;
    fsEls.desc.textContent = s.desc;
    fsEls.meta.innerHTML = s.chips.map(function (c, ci) {
      return '<span class="spec' + (ci === s.chips.length - 1 ? ' num' : '') + '">' + c + '</span>';
    }).join('');
    fsEls.avail.textContent = s.avail;
    fsEls.link.href = '/produkt?id=' + s.id;
  }

  var current = 0;
  var rotTimer = null;
  var barTween = null;
  var paused = false;
  var inView = true;
  var DWELL = 3;

  function kenBurns(layer) {
    var img = layer.querySelector('img');
    if (img) gsap.fromTo(img, { scale: 1.1 }, { scale: 1.0, duration: DWELL + 1.6, ease: 'none', overwrite: true });
  }

  function armBar() {
    if (!fsEls.bar || !window.gsap) return;
    if (barTween) barTween.kill();
    barTween = gsap.fromTo(fsEls.bar, { width: '0%' }, { width: '100%', duration: DWELL, ease: 'none' });
  }

  function schedule() {
    if (rotTimer) rotTimer.kill();
    rotTimer = gsap.delayedCall(DWELL, function () { goTo((current + 1) % slides.length); });
  }

  function goTo(idx) {
    if (idx === current || !window.gsap) return;
    var from = layers[current], to = layers[idx];
    var s = slides[idx];
    current = idx;

    /* media: curtain reveal from top over the old layer, then slow settle */
    gsap.set(to, { visibility: 'visible', opacity: 1, clipPath: 'inset(0% 0% 100% 0%)', zIndex: 2 });
    gsap.set(from, { zIndex: 1 });
    kenBurns(to);
    if (fsVideo) { if (idx === 0) fsVideo.play(); }
    gsap.to(to, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: 'power4.inOut',
      onComplete: function () {
        gsap.set(from, { opacity: 0, visibility: 'hidden' });
        from.classList.remove('is-active');
        to.classList.add('is-active');
        gsap.set(to, { clipPath: 'none' });
        if (fsVideo && idx !== 0) fsVideo.pause();
      },
    });

    /* text: staged out, swap, staged in */
    var parts = [fsEls.name, fsEls.desc, fsEls.meta, fsEls.avail];
    var tl = gsap.timeline();
    tl.to(parts, { y: -12, opacity: 0, duration: 0.38, stagger: 0.05, ease: 'power2.in' }, 0)
      .to(fsEls.kicker, { opacity: 0, duration: 0.3 }, 0)
      .add(function () { fill(s, idx); }, 0.45)
      .fromTo(fsEls.kicker, { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.55)
      .fromTo(parts, { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.75, stagger: 0.09, ease: 'power3.out' }, 0.55);

    armBar();
    schedule();
  }

  function pauseRotation() {
    paused = true;
    if (rotTimer) rotTimer.pause();
    if (barTween) barTween.pause();
  }
  function resumeRotation() {
    if (!inView || document.hidden) return;
    paused = false;
    if (rotTimer) rotTimer.resume();
    if (barTween) barTween.resume();
  }

  if (slides.length) {
    fill(slides[0], 0);
    if (slides.length > 1 && !reduce && window.gsap) {
      armBar();
      schedule();
      var flagshipEl = document.getElementById('flagship');
      /* kein Hover-Pause: Diashow läuft weiter, auch wenn die Maus auf Bild/Text steht */
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) pauseRotation(); else resumeRotation();
      });
      if (window.ScrollTrigger) {
        var fsST = ScrollTrigger.create({
          trigger: flagshipEl, start: 'top 95%', end: 'bottom 5%',
          onToggle: function (self) {
            inView = self.isActive;
            if (inView) resumeRotation(); else pauseRotation();
          },
        });
        inView = fsST.isActive;
        if (!inView) pauseRotation();
      }
    } else if (fsEls.bar) {
      fsEls.bar.parentElement.style.display = 'none';
    }
  }

  /* ---------- new-in rail ---------- */
  var rail = document.getElementById('newinRail');
  function raileFuellen() {
    var newest = (window.PRODUCTS || [])
      /* Nur Uhren — Zubehör (Etuis, Schließen) bleibt im Shop, aber nicht im Schaufenster. */
      .filter(function (p) { return p.status !== 'sold' && p.category !== 'zubehoer' && p.id !== window.FLAGSHIP_ID; })
      /* „Neu eingetroffen“ heißt zuletzt angelegt — nicht Katalogreihenfolge. */
      .sort(function (a, b) {
        return String(b.added || '').localeCompare(String(a.added || ''));
      })
      .slice(0, 8);
    rail.innerHTML = newest.map(HV.renderCard).join('');
    if (HV.initMotion) HV.initMotion(rail);
  }
  raileFuellen();

  /* Die Startseite wartet nicht auf Shopify — der Preloader soll sofort laufen.
   * Sobald der Katalog da ist, wird die Reihe mit dem aktuellen Bestand neu
   * gefüllt. */
  document.addEventListener('hv:katalog', function (e) {
    if (e.detail && e.detail.quelle === 'shopify') raileFuellen();
  });

  /* drag-scroll for rails */
  document.querySelectorAll('.rail-wrap').forEach(function (wrapEl) {
    var down = false, startX = 0, startScroll = 0, moved = false;
    wrapEl.addEventListener('pointerdown', function (e) {
      down = true; moved = false; startX = e.clientX; startScroll = wrapEl.scrollLeft;
      wrapEl.classList.add('is-dragging');
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 6) moved = true;
      wrapEl.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', function () {
      down = false; wrapEl.classList.remove('is-dragging');
    });
    wrapEl.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  });

  /* ---------- Kundenstimmen: gepinnte Bühne, vom Scrollen geblättert ----------
     Sechs Fotos liegen übereinander, sechs Zitate ebenso. Eine einzige
     Zeitleiste (Einheit 1 = eine Stimme) hängt am Scrollen: bei i beginnt
     der Wechsel zu Stimme i — Vorhang hoch, altes Zitat raus, neues rein.
     Alles läuft über transform/opacity; nichts wird nachgeladen oder
     neu berechnet, solange man scrollt. */
  (function () {
    var host = document.getElementById('stimmenBuehne');
    var stimmen = window.TESTIMONIALS || [];
    if (!host || !stimmen.length) return;
    var n = stimmen.length;

    function esc(t) {
      return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function pad(i) { return ('0' + i).slice(-2); }

    var kannBewegen = !!(window.gsap && window.ScrollTrigger) &&
      !document.documentElement.classList.contains('no-motion');

    /* Desktop: drei bis vier Karten nebeneinander, rechts wird geblättert.
       Die Anzahl pro Seite bestimmt das Stylesheet (--st-n) — hier wird nur
       um genau eine Fensterbreite weitergeschoben, damit die Seiten sauber
       aufeinander folgen. */
    function deck() {
      host.className = 'st-deck';
      var karten = stimmen.map(function (t) {
        return '<figure class="st-karte">' +
          '<img src="' + t.img + '" alt="' + esc(t.watch ? t.watch + ' von ' + t.name : 'Uhr von ' + t.name) + '" loading="lazy">' +
          '<div class="st-karte-text">' +
            '<blockquote>' + esc(t.text) + '</blockquote>' +
            '<figcaption><span class="st-name">' + esc(t.name) + '</span>' +
            (t.watch ? '<span class="st-watch">' + esc(t.watch) + '</span>' : '') + '</figcaption>' +
          '</div>' +
        '</figure>';
      }).join('');

      host.innerHTML =
        '<div class="st-deck-top">' +
          '<span class="st-count num"><b data-st-seite>01</b><span>/</span><span data-st-seiten>01</span></span>' +
          '<div class="st-nav">' +
            '<button class="st-btn" data-st-blatt="-1" aria-label="Vorherige Kundenstimmen">&#8592;</button>' +
            '<button class="st-btn" data-st-blatt="1" aria-label="Weitere Kundenstimmen">&#8594;</button>' +
          '</div>' +
        '</div>' +
        '<div class="st-spur" tabindex="0" role="group" aria-label="Kundenstimmen, seitlich blätterbar">' + karten + '</div>';

      var spur = host.querySelector('.st-spur');
      var top = host.querySelector('.st-deck-top');
      var jetzt = host.querySelector('[data-st-seite]');
      var gesamt = host.querySelector('[data-st-seiten]');
      var knoepfe = Array.prototype.slice.call(host.querySelectorAll('[data-st-blatt]'));

      /* Eine Seite ist genau die sichtbare Breite; die erste Karte der
         nächsten Seite steht eine Lücke weiter rechts. */
      function schritt() {
        var luecke = parseFloat(getComputedStyle(spur).columnGap) || 0;
        return spur.clientWidth + luecke;
      }
      function seiten() { return Math.max(1, Math.ceil(spur.scrollWidth / schritt())); }

      function stand() {
        var s = schritt();
        var seite = Math.min(seiten(), Math.round(spur.scrollLeft / s) + 1);
        jetzt.textContent = pad(seite);
        gesamt.textContent = pad(seiten());
        /* Rechenwerte sind auf ein, zwei Pixel ungenau — mit Spielraum prüfen. */
        var amAnfang = spur.scrollLeft < 4;
        var amEnde = spur.scrollLeft + spur.clientWidth >= spur.scrollWidth - 4;
        knoepfe[0].disabled = amAnfang;
        knoepfe[1].disabled = amEnde;
        top.hidden = amAnfang && amEnde;
      }

      function blaettern(richtung) {
        var ziel = spur.scrollLeft + richtung * schritt();
        if (spur.scrollTo) spur.scrollTo({ left: ziel, behavior: kannBewegen ? 'smooth' : 'auto' });
        else spur.scrollLeft = ziel;
      }

      knoepfe.forEach(function (b) {
        b.addEventListener('click', function () { blaettern(parseInt(b.dataset.stBlatt, 10)); });
      });
      spur.addEventListener('scroll', stand, { passive: true });
      stand();
      /* Bilder verschieben die Breite noch, sobald sie geladen sind. */
      host.querySelectorAll('img').forEach(function (im) {
        if (!im.complete) im.addEventListener('load', stand, { once: true });
      });
    }

    /* Zitat in Zeilen zerlegen, jede Zeile in eine Maske. Gemessen wird am
       fertigen Layout — deshalb erst nach dem Laden der Schriften. */
    function zeilenTeilen(el) {
      var worte = el.textContent.split(/\s+/).filter(Boolean);
      el.textContent = '';
      worte.forEach(function (w, i) {
        var s = document.createElement('span');
        s.textContent = w;
        el.appendChild(s);
        if (i < worte.length - 1) el.appendChild(document.createTextNode(' '));
      });
      var spans = Array.prototype.slice.call(el.children);
      var zeilen = [], letzteHoehe = null, aktuelle = null;
      spans.forEach(function (s) {
        var top = Math.round(s.getBoundingClientRect().top);
        if (top !== letzteHoehe) { aktuelle = []; zeilen.push(aktuelle); letzteHoehe = top; }
        aktuelle.push(s.textContent);
      });
      el.textContent = '';
      return zeilen.map(function (z) {
        var maske = document.createElement('span');
        maske.className = 'st-line';
        var innen = document.createElement('span');
        innen.textContent = z.join(' ');
        maske.appendChild(innen);
        el.appendChild(maske);
        return innen;
      });
    }

    var aktiv = null; /* { st, tl, ghost } */

    function abbauen() {
      if (!aktiv) return;
      if (aktiv.ende) aktiv.ende();
      if (aktiv.st) aktiv.st.kill();
      aktiv.tl.kill();
      if (aktiv.ghost) aktiv.ghost.kill();
      if (aktiv.scroll && window.HV && HV.lenis) HV.lenis.off('scroll', aktiv.scroll);
      aktiv = null;
    }

    function buehne() {
      /* Zwei Spielarten derselben Bühne:
         Desktop  — gepinnt, das Scrollen blättert, Rastpunkte fangen jede
                    Position ab.
         Touch    — nicht gepinnt. Auf dem Telefon ist Pinnen mit nativem
                    Scrollen wacklig (Adressleiste, Schwung). Deshalb steht
                    die Bühne im Fluss, und Wischen oder Tippen blättert;
                    die Zeitleiste fährt dann selbst. */
      var mobil = window.innerWidth <= 900 || window.matchMedia('(pointer: coarse)').matches;
      var HALT = 0.9; /* bei t = i + HALT steht Stimme i vollständig */

      var figuren = stimmen.map(function (t, i) {
        return '<figure class="st-fig">' +
          '<img src="' + t.img + '" alt="' + esc(t.watch ? t.watch + ' von ' + t.name : 'Uhr von ' + t.name) + '"' + (i ? ' loading="lazy"' : '') + '>' +
          '<span class="st-shade"></span>' +
        '</figure>';
      }).join('');
      var striche = stimmen.map(function (t, i) {
        var p = n > 1 ? (i / (n - 1) * 100) : 0;
        return '<button class="st-tick' + (i ? '' : ' is-on') + '" style="--p:' + p.toFixed(3) + '%" data-st-zu="' + i + '" aria-label="Stimme ' + (i + 1) + ': ' + esc(t.name) + '"></button>';
      }).join('');
      var zitate = stimmen.map(function (t) {
        return '<div class="st-q">' +
          '<blockquote>' + esc(t.text) + '</blockquote>' +
          '<div class="st-meta"><span class="st-name">' + esc(t.name) + '</span>' +
          (t.watch ? '<span class="st-watch">' + esc(t.watch) + '</span>' : '') + '</div>' +
        '</div>';
      }).join('');

      host.className = '';
      host.innerHTML =
        '<div class="st-pin' + (mobil ? ' is-frei' : '') + '">' +
          '<div class="wrap st-inner">' +
            '<div class="st-top">' +
              '<span class="st-count num"><b data-st-jetzt>01</b><span>/</span><span>' + pad(n) + '</span></span>' +
              '<div class="st-nav">' +
                '<button class="st-btn" data-st-schritt="-1" aria-label="Vorherige Stimme">←</button>' +
                '<button class="st-btn" data-st-schritt="1" aria-label="Nächste Stimme">→</button>' +
              '</div>' +
            '</div>' +
            '<div class="st-body">' +
              '<div class="st-stage" data-clip>' + figuren + '</div>' +
              '<div class="st-rail">' + striche + '<i class="st-marker"></i></div>' +
              '<div class="st-quote"><span class="st-ghost" aria-hidden="true">„</span>' + zitate + '</div>' +
            '</div>' +
            (mobil ? '<div class="st-hint" aria-hidden="true"><span>Wischen</span><i></i></div>' : '') +
          '</div>' +
          (mobil ? '' : '<div class="st-hint" aria-hidden="true"><span>Weiter scrollen</span><i></i></div>') +
        '</div>';

      var pin = host.querySelector('.st-pin');
      var figs = Array.prototype.slice.call(host.querySelectorAll('.st-fig'));
      var imgs = figs.map(function (f) { return f.querySelector('img'); });
      var shades = figs.map(function (f) { return f.querySelector('.st-shade'); });
      var qs = Array.prototype.slice.call(host.querySelectorAll('.st-q'));
      var zeilen = qs.map(function (q) { return zeilenTeilen(q.querySelector('blockquote')); });
      var metas = qs.map(function (q) { return q.querySelector('.st-meta'); });
      var ticks = Array.prototype.slice.call(host.querySelectorAll('.st-tick'));
      var marker = host.querySelector('.st-marker');
      var zaehler = host.querySelector('[data-st-jetzt]');
      var hint = host.querySelector('.st-hint');
      var achse = mobil ? 'left' : 'top';

      /* Ausgangslage */
      figs.forEach(function (f, i) { gsap.set(f, { y: 0, yPercent: i ? 101 : 0, scale: 1 }); });
      imgs.forEach(function (im, i) { gsap.set(im, { y: 0, yPercent: i ? -28 : 0 }); });
      zeilen.forEach(function (z) { gsap.set(z, { y: 0, yPercent: 110 }); });
      metas.forEach(function (m) { gsap.set(m, { opacity: 0, y: 10 }); });
      gsap.set(marker, achse === 'top' ? { top: '0%' } : { left: '0%' });

      /* Eine Zeitleiste, Einheit 1 = eine Stimme. Bei i beginnt der Wechsel zu
         Stimme i: erst steigt das alte Zitat komplett aus der Maske, dann erst
         kommt das neue — nie zwei Texte übereinander. */
      var tl = gsap.timeline({ paused: true });
      function rein(i, bei) {
        tl.to(zeilen[i], { yPercent: 0, duration: 0.26, ease: 'power3.out', stagger: 0.03 }, bei);
        tl.to(metas[i], { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' }, bei + 0.18);
      }
      function raus(i, bei) {
        tl.to(zeilen[i], { yPercent: -110, duration: 0.18, ease: 'power2.in', stagger: 0.02 }, bei);
        tl.to(metas[i], { opacity: 0, y: -8, duration: 0.12, ease: 'power1.in' }, bei);
      }
      rein(0, 0.03);
      for (var i = 1; i < n; i++) {
        var p = (i / (n - 1) * 100).toFixed(3) + '%';
        raus(i - 1, i);
        /* Vorhang: Rahmen hoch, Bild darin gegenläufig — das alte Foto weicht zurück */
        tl.to(figs[i], { yPercent: 0, duration: 0.45, ease: 'power3.inOut' }, i);
        tl.to(imgs[i], { yPercent: 0, duration: 0.45, ease: 'power3.inOut' }, i);
        tl.to(figs[i - 1], { scale: 1.08, duration: 0.45, ease: 'power2.inOut' }, i);
        tl.to(shades[i - 1], { opacity: 0.55, duration: 0.45, ease: 'power1.inOut' }, i);
        tl.to(marker, achse === 'top' ? { top: p, duration: 0.45, ease: 'power3.inOut' } : { left: p, duration: 0.45, ease: 'power3.inOut' }, i);
        rein(i, i + 0.38);
      }
      tl.set({}, {}, n); /* Gesamtlänge genau n Einheiten */

      function anzeigen(idx) {
        zaehler.textContent = pad(idx + 1);
        ticks.forEach(function (tk, k) { tk.classList.toggle('is-on', k === idx); });
      }
      if (HV.initMotion) HV.initMotion(host);

      if (mobil) { touchBuehne(); } else { scrollBuehne(); }

      /* ---- Desktop: gepinnt, Scrollen blättert, Rastpunkte ---- */
      function scrollBuehne() {
        /* Bei vielen Stimmen kürzere Kapitel — sonst wird die Strecke lang. */
        var kapitel = Math.round((n > 8 ? 0.62 : 0.8) * window.innerHeight);
        var st = ScrollTrigger.create({
          trigger: pin, start: 'top top', end: '+=' + (n * kapitel),
          pin: true, anticipatePin: 1, animation: tl, scrub: 0.3,
          onUpdate: function (self) {
            var t = self.progress * n;
            anzeigen(Math.max(0, Math.min(n - 1, Math.floor(t - 0.25))));
            hint.style.opacity = self.progress > 0.04 ? 0 : 1;
          },
        });
        hint.style.transition = 'opacity .5s';

        /* Das große Anführungszeichen driftet langsam über die ganze Strecke */
        var ghost = gsap.fromTo(host.querySelector('.st-ghost'), { yPercent: -8 }, {
          yPercent: 10, ease: 'none',
          scrollTrigger: { trigger: pin, start: 'top top', end: '+=' + (n * kapitel), scrub: true },
        });

        /* Rastpunkte: kommt das Scrollen zwischen zwei Stimmen zur Ruhe, zieht
           die Bühne auf die nächste oder vorherige — je nach Richtung; nichts
           bleibt halb stehen. Lenis übernimmt die Fahrt, sonst würden sich zwei
           Animationen streiten. */
        var lenis = window.HV && HV.lenis;
        var letzte = 0, schnappt = false, ruhe;
        function ruhepunkt(i) { return st.start + (i + HALT) * kapitel; }
        function gehe(i, dauer) {
          i = Math.max(0, Math.min(n - 1, i));
          letzte = i;
          var ziel = ruhepunkt(i);
          if (lenis) {
            schnappt = true;
            lenis.scrollTo(ziel, { duration: dauer || 1.1, onComplete: function () { schnappt = false; } });
          } else {
            window.scrollTo({ top: ziel, behavior: 'smooth' });
          }
        }
        function schnappen() {
          if (schnappt || !st.isActive) return;
          var p = st.progress;
          if (p < 0.005 || p >= (n - 1 + HALT + 0.05) / n) return; /* am Ende darf man hinaus */
          var t = p * n, ab = t - (letzte + HALT), i;
          if (Math.abs(ab) > 0.9) i = Math.round(t - HALT);           /* weit gesprungen: die nächstliegende */
          else i = ab > 0.12 ? letzte + 1 : ab < -0.12 ? letzte - 1 : letzte;
          i = Math.max(0, Math.min(n - 1, i));
          if (Math.abs((lenis ? lenis.scroll : window.scrollY) - ruhepunkt(i)) < 2) { letzte = i; return; }
          gehe(i, 0.85);
        }
        function beiScroll() {
          if (schnappt || !st.isActive) return;
          clearTimeout(ruhe);
          ruhe = setTimeout(schnappen, 130);
        }
        if (lenis) lenis.on('scroll', beiScroll);

        host.querySelectorAll('[data-st-schritt]').forEach(function (b) {
          b.addEventListener('click', function () { gehe(letzte + parseInt(b.dataset.stSchritt, 10)); });
        });
        ticks.forEach(function (tk) {
          tk.addEventListener('click', function () { gehe(parseInt(tk.dataset.stZu, 10)); });
        });
        aktiv = { st: st, tl: tl, ghost: ghost, scroll: lenis ? beiScroll : null };
      }

      /* ---- Touch: im Fluss, Wischen oder Tippen blättert ---- */
      function touchBuehne() {
        /* Die Zitate liegen übereinander — der Bereich braucht die Höhe des längsten. */
        var quote = host.querySelector('.st-quote'), hoechste = 0;
        qs.forEach(function (q) {
          q.classList.add('is-measure');
          hoechste = Math.max(hoechste, q.offsetHeight);
          q.classList.remove('is-measure');
        });
        quote.style.height = hoechste + 'px';

        var jetztI = -1, fahrt = null, takt = null;
        function zeige(i) {
          i = Math.max(0, Math.min(n - 1, i));
          if (i === jetztI) return;
          jetztI = i;
          if (fahrt) fahrt.kill();
          fahrt = tl.tweenTo(i + HALT, { duration: 1.15, ease: 'power2.inOut' });
          anzeigen(i);
        }
        function selbst() { /* erste Berührung beendet das Blättern von allein */
          if (takt) { clearInterval(takt); takt = null; }
          hint.style.opacity = 0;
        }
        hint.style.transition = 'opacity .5s';

        /* Sobald die Bühne im Bild ist: erste Stimme fährt ein, danach blättert
           sie gemächlich weiter, bis jemand selbst eingreift. */
        var beobachter = new IntersectionObserver(function (eintraege) {
          eintraege.forEach(function (e) {
            if (e.isIntersecting) {
              if (jetztI < 0) zeige(0);
              if (!takt && jetztI < n - 1) takt = setInterval(function () {
                if (jetztI >= n - 1) { clearInterval(takt); takt = null; return; }
                zeige(jetztI + 1);
              }, 6500);
            } else if (takt) { clearInterval(takt); takt = null; }
          });
        }, { threshold: 0.4 });
        beobachter.observe(host.querySelector('.st-stage'));

        /* Wischen — quer, deutlich, mehr quer als längs */
        var flaeche = host.querySelector('.st-body'), sx = 0, sy = 0, geste = false;
        flaeche.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; geste = true; });
        flaeche.addEventListener('pointerup', function (e) {
          if (!geste) return;
          geste = false;
          var dx = e.clientX - sx, dy = e.clientY - sy;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { selbst(); zeige(jetztI + (dx < 0 ? 1 : -1)); }
        });
        flaeche.addEventListener('pointercancel', function () { geste = false; });

        host.querySelectorAll('[data-st-schritt]').forEach(function (b) {
          b.addEventListener('click', function () { selbst(); zeige(jetztI + parseInt(b.dataset.stSchritt, 10)); });
        });
        ticks.forEach(function (tk) {
          tk.addEventListener('click', function () { selbst(); zeige(parseInt(tk.dataset.stZu, 10)); });
        });
        aktiv = { st: null, tl: tl, ghost: null, scroll: null,
                  ende: function () { beobachter.disconnect(); if (takt) clearInterval(takt); if (fahrt) fahrt.kill(); } };
      }
    }

    function bauen() {
      abbauen();
      var touch = window.innerWidth <= 900 || window.matchMedia('(pointer: coarse)').matches;
      /* Desktop: mehrere Stimmen nebeneinander, rechts wird geblättert
         (Hannes' Wunsch, 01.09.2026). Nur auf Touch-Geräten läuft die
         gewischte Bühne — dort ist die Fläche zu klein für mehrere Karten. */
      if (touch && kannBewegen) buehne();
      else deck();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }

    /* Zeilen und Kapitel hängen an der Größe — bei echter Größenänderung neu
       bauen. Die iOS-Adressleiste ändert nur die Höhe um wenige Pixel; das
       ignorieren wir, sonst springt die Bühne beim Scrollen. */
    var w0 = window.innerWidth, h0 = window.innerHeight, warten;
    window.addEventListener('resize', function () {
      clearTimeout(warten);
      warten = setTimeout(function () {
        if (Math.abs(window.innerWidth - w0) < 24 && Math.abs(window.innerHeight - h0) < 140) return;
        w0 = window.innerWidth; h0 = window.innerHeight;
        bauen();
      }, 220);
    });

    if (window.ScrollTrigger) ScrollTrigger.config({ ignoreMobileResize: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(bauen);
    else bauen();
  })();

  /* ---------- FAQ accordion ---------- */
  var acc = document.getElementById('faqAcc');
  acc.innerHTML = (window.FAQ || []).map(function (f, i) {
    return '<div class="acc-item">' +
      '<button class="acc-btn" aria-expanded="false" data-acc="' + i + '">' +
        '<span class="acc-q">' + f.q + '</span><span class="acc-icon">+</span>' +
      '</button>' +
      '<div class="acc-body"><p class="acc-a">' + f.a + '</p></div>' +
    '</div>';
  }).join('');
  acc.addEventListener('click', function (e) {
    var btn = e.target.closest('.acc-btn');
    if (!btn) return;
    var item = btn.parentElement;
    var body = item.querySelector('.acc-body');
    var isOpen = item.classList.contains('is-open');
    acc.querySelectorAll('.acc-item.is-open').forEach(function (other) {
      other.classList.remove('is-open');
      other.querySelector('.acc-body').style.maxHeight = '0px';
      other.querySelector('.acc-btn').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('is-open');
      body.style.maxHeight = body.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  /* ---------- links from SITE ---------- */
  document.getElementById('faqWhatsapp').href = window.SITE.whatsapp;
  document.getElementById('igLink').href = window.SITE.instagram;
  document.getElementById('igIdLink').href = window.SITE.instagram;
  document.getElementById('scTiktok').href = window.SITE.tiktok;
  document.getElementById('scChannel').href = window.SITE.whatsappChannel;
  document.getElementById('waChannelCta').href = window.SITE.whatsappChannel;
  var yt = document.getElementById('scYoutube');
  if (window.SITE.youtube) { yt.hidden = false; yt.href = window.SITE.youtube; }

  /* ---------- instagram tiles: echte Beitraege aus js/ig-posts.js ---------- */
  var posts = window.IG_POSTS || [];
  var PLAY = '<span class="ig-reel" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor">' +
             '<path d="M8 5.2v13.6L19 12 8 5.2Z"/></svg></span>';
  document.getElementById('igGrid').innerHTML = posts.map(function (p) {
    return '<a class="ig-tile' + (p.reel ? ' is-reel' : '') + '" href="' + p.url +
      '" target="_blank" rel="noopener">' +
      '<img src="' + p.img + '" alt="' + String(p.alt || '').replace(/"/g, '&quot;') + '" loading="lazy">' +
      (p.reel ? PLAY : '') + '</a>';
  }).join('');

})();
