/* HAHN & VO — product detail page. Reads ?id= and renders from data.js. */
(window.HV && window.HV.wennKatalogBereit ? window.HV.wennKatalogBereit : function (f) { f(); })(function () {
  'use strict';
  var HV = window.HV;
  var id = new URLSearchParams(location.search).get('id');
  /* Unbekannte Kennung: in den Shop leiten, statt eine fremde Uhr unter dieser
   * Adresse zu zeigen. Ohne Kennung greift die erste Uhr als Einstieg. */
  var p = id ? HV.byId(id) : (window.PRODUCTS || [])[0];
  if (!p) { location.replace('/shop'); return; }

  document.title = p.brand + ' ' + p.name + ' — Hahn & Vo';

  /* Angaben fuer Suchmaschinen und geteilte Links auf diese Uhr umstellen.
     Google fuehrt JavaScript aus und uebernimmt das. WhatsApp und Facebook
     tun das nicht — dort greift weiterhin die Vorgabe aus produkt.html. */
  (function () {
    var adresse = location.origin + '/produkt?id=' + p.id;
    var titel = p.brand + ' ' + p.name + (p.ref ? ' · Ref. ' + p.ref : '') + ' — Hahn & Vo';
    var text = [p.brand, p.name, p.year, p.fullset, p.rating ? 'Zustand: ' + p.rating : null,
                HV.fmtEUR(p.price)].filter(Boolean).join(' · ');
    function setz(wahl, attr, wert) {
      var el = document.head.querySelector(wahl);
      if (el && wert) el.setAttribute(attr, wert);
    }
    setz('link[rel="canonical"]', 'href', adresse);
    setz('meta[property="og:url"]', 'content', adresse);
    setz('meta[property="og:type"]', 'content', 'product');
    setz('meta[property="og:title"]', 'content', titel);
    setz('meta[name="twitter:title"]', 'content', titel);
    setz('meta[property="og:description"]', 'content', text);
    setz('meta[name="twitter:description"]', 'content', text);
    var bild = (p.images || [])[0];
    if (bild) {
      if (bild.indexOf('http') !== 0) bild = location.origin + '/' + bild.replace(/^\//, '');
      setz('meta[property="og:image"]', 'content', bild);
      setz('meta[name="twitter:image"]', 'content', bild);
      var w = document.head.querySelector('meta[property="og:image:width"]');
      var h = document.head.querySelector('meta[property="og:image:height"]');
      if (w) w.remove();
      if (h) h.remove();
    }
    var d = document.head.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', text);
  })();
  document.getElementById('crumbName').textContent = p.name;
  document.getElementById('pdBrand').textContent = p.brand;
  document.getElementById('pdName').textContent = p.name;
  document.getElementById('pdPrice').textContent = HV.fmtEUR(p.price);
  /* Vorher-Preis (Shopify: Vergleichspreis) — durchgestrichen, dazu das
     Kennzeichen „Reduziert“. Verkaufte Uhren zeigen keine Reduzierung mehr. */
  if (p.listPrice && p.listPrice > p.price && p.status !== 'sold') {
    var lp = document.getElementById('pdList');
    lp.hidden = false;
    lp.innerHTML = '<s class="pd-was num">' + HV.fmtEUR(p.listPrice) + '</s><span class="pd-sale">Reduziert</span>';
  }

  /* status */
  var st = document.getElementById('pdStatus');
  st.classList.add('status-' + p.status);
  st.textContent = HV.statusLabel[p.status];

  /* gallery */
  var main = document.getElementById('mainImg');
  var mainWrap = document.getElementById('galleryMain');
  var thumbs = document.getElementById('thumbs');
  var current = 0;
  function show(i) {
    current = i;
    main.src = p.images[i];
    main.alt = p.brand + ' ' + p.name + ' — Bild ' + (i + 1);
    thumbs.querySelectorAll('button').forEach(function (b, bi) {
      b.classList.toggle('is-active', bi === i);
    });
  }
  thumbs.innerHTML = p.images.map(function (src, i) {
    return '<button aria-label="Bild ' + (i + 1) + '"><img src="' + src + '" alt="" loading="lazy"></button>';
  }).join('');
  thumbs.querySelectorAll('button').forEach(function (b, i) {
    b.addEventListener('click', function () { show(i); });
  });
  show(0);

  /* zoom: click toggles, cursor position steers transform-origin */
  mainWrap.addEventListener('click', function () {
    mainWrap.classList.toggle('is-zoom');
  });
  mainWrap.addEventListener('mousemove', function (e) {
    if (!mainWrap.classList.contains('is-zoom')) return;
    var r = mainWrap.getBoundingClientRect();
    main.style.transformOrigin =
      ((e.clientX - r.left) / r.width * 100) + '% ' + ((e.clientY - r.top) / r.height * 100) + '%';
  });

  /* keyboard gallery nav */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') show((current + 1) % p.images.length);
    if (e.key === 'ArrowLeft') show((current - 1 + p.images.length) % p.images.length);
  });

  /* CTAs by status */
  var add = document.getElementById('addToCart');
  var shopifyNode = document.getElementById('shopifyBuy');

  function syncCartBtn() {
    if (HV.cart.has(p.id)) {
      add.innerHTML = 'Im Warenkorb \u2713 &nbsp;\u00b7&nbsp; Zur Kasse <span class="arr">\u2192</span>';
      add.dataset.mode = 'checkout';
    } else {
      add.innerHTML = 'In den Warenkorb <span class="arr">\u2192</span>';
      add.dataset.mode = 'add';
    }
  }

  function setWhatsapp() {
    var wa = document.getElementById('pdWhatsapp');
    if (!wa) return;
    wa.href = window.SITE.whatsapp + '?text=' + encodeURIComponent(
      'Guten Tag, ich interessiere mich f\u00fcr die ' + p.brand + ' ' + p.name +
      (p.ref ? ' (Ref. ' + p.ref + ')' : '') + ' \u2014 ' + HV.fmtEUR(p.price));
  }

  /* Statuszeile in der Spec-Tabelle nachziehen (wird später gerendert) */
  function setSpecStatus(label) {
    document.querySelectorAll('.spec-table .row').forEach(function (row) {
      var dt = row.querySelector('dt');
      if (dt && dt.textContent === 'Status') row.querySelector('dd').textContent = label;
    });
  }

  if (p.status === 'available') {
    syncCartBtn();
    add.addEventListener('click', function () {
      if (add.dataset.mode === 'checkout') { location.href = '/checkout'; return; }
      HV.cart.add(p.id);
      syncCartBtn();
    });
    document.addEventListener('hv:cart', syncCartBtn);

    /* Live-Daten aus Shopify: Preis, Verfügbarkeit, Sofortkauf-Hinweis */
    if (HV.shopifySync) {
      HV.shopifySync().then(function () {
        if (p.price) document.getElementById('pdPrice').textContent = HV.fmtEUR(p.price);
        setWhatsapp();
        if (p.shopifyVariantId && p.shopifyAvailable) {
          var live = document.getElementById('pdLive');
          if (live) live.hidden = false;
        }
        if (p.status === 'sold') {
          st.className = 'pc-status status status-sold';
          st.textContent = HV.statusLabel.sold;
          setSpecStatus(HV.statusLabel.sold);
          add.disabled = true;
          add.textContent = 'Verkauft';
          document.getElementById('pdSoldNote').hidden = false;
        }
      });
    }
  } else if (p.status === 'anfrage') {
    /* Über ~10.000 USD (rund 8.500 €) verarbeitet Shopify Payments nicht —
       diese Uhren liegen in Shopify als Entwurf und werden per Banküberweisung
       verkauft. Der Kaufknopf öffnet WhatsApp, daneben Anruf und Showroom. */
    add.dataset.mode = 'anfrage';
    add.innerHTML = 'Per Überweisung kaufen <span class="arr">→</span>';
    add.addEventListener('click', function () {
      var wa = document.getElementById('pdWhatsapp');
      if (wa) window.open(wa.href, '_blank', 'noopener');
    });
    var sek = document.querySelector('.pd-secondary-ctas');
    if (sek) {
      sek.innerHTML = '<a class="btn btn-outline" href="tel:' + String(window.SITE.phone || '').replace(/\s/g, '') + '">Anrufen</a>' +
        '<a class="btn btn-outline" href="/ueber-uns#showroom">Im Showroom ansehen</a>';
    }
    document.getElementById('pdAnfrageNote').hidden = false;
  } else {
    add.disabled = true;
    add.textContent = p.status === 'reserved' ? 'Reserviert' : 'Verkauft';
    document.getElementById(p.status === 'reserved' ? 'pdReservedNote' : 'pdSoldNote').hidden = false;
    if (p.status === 'sold') {
      var sc = document.querySelector('.pd-secondary-ctas');
      sc.innerHTML = '<a class="btn btn-outline" href="/suchauftrag">Suchauftrag stellen</a>' +
        '<a class="btn btn-outline" href="' + window.SITE.whatsapp + '" target="_blank" rel="noopener">Per WhatsApp anfragen</a>';
    }
  }
  setWhatsapp();

  /* Feste Kaufleiste auf dem Handy: spiegelt Preis, Kaufknopf und WhatsApp,
     sobald die eigentlichen Knöpfe aus dem Bild gescrollt sind. */
  (function () {
    var bar = document.getElementById('pdBar');
    var ctas = document.getElementById('pdCtas');
    if (!bar || !ctas) return;
    document.getElementById('pdBarName').textContent = p.brand + ' ' + p.name;
    document.getElementById('pdBarPrice').textContent = HV.fmtEUR(p.price);
    var wa = document.getElementById('pdWhatsapp');
    var barWa = document.getElementById('pdBarWhatsapp');
    var barBuy = document.getElementById('pdBarBuy');
    function spiegeln() {
      if (wa && barWa) barWa.href = wa.href;
      barBuy.disabled = add.disabled;
      barBuy.textContent = add.dataset.mode === 'checkout' ? 'Zur Kasse'
        : add.dataset.mode === 'anfrage' ? 'Per Überweisung'
        : (add.disabled ? add.textContent.trim() : 'In den Warenkorb');
      if (barWa) barWa.hidden = add.dataset.mode === 'anfrage';
    }
    spiegeln();
    document.addEventListener('hv:cart', spiegeln);
    barBuy.addEventListener('click', function () { if (!add.disabled) add.click(); spiegeln(); });
    /* Beim Scrollen prüfen, nicht per IntersectionObserver: Der meldet nichts,
       wenn die Knöpfe bei einem Sprung (Anker, schneller Wisch) am Bild
       vorbeifliegen, ohne je darin gewesen zu sein. */
    var angefragt = false;
    function pruefen() {
      angefragt = false;
      var vorbei = ctas.getBoundingClientRect().bottom < 0;
      if (vorbei !== bar.classList.contains('is-on')) {
        bar.classList.toggle('is-on', vorbei);
        bar.setAttribute('aria-hidden', vorbei ? 'false' : 'true');
        spiegeln();
      }
    }
    window.addEventListener('scroll', function () {
      if (!angefragt) { angefragt = true; requestAnimationFrame(pruefen); }
    }, { passive: true });
    pruefen();
  })();

  /* Besteuerung: Es gibt beides im Bestand — der Satz unter dem Preis und die
     Zeile im Datenblatt richten sich nach der einzelnen Uhr. */
  var differenz = /^differenz/i.test(String(p.tax || ''));
  HV.steuerLabel = differenz
    ? 'Differenzbesteuerung nach § 25a UStG'
    : 'Regelbesteuerung, Mehrwertsteuer ausweisbar';
  var steuerEl = document.getElementById('pdTax');
  if (steuerEl) {
    steuerEl.textContent = differenz
      ? 'Endpreis. Differenzbesteuert nach § 25a UStG — die Mehrwertsteuer ist enthalten, wird auf der Rechnung aber nicht gesondert ausgewiesen.'
      : 'Endpreis inkl. gesetzlicher Mehrwertsteuer — auf der Rechnung gesondert ausgewiesen.';
  }

  /* spec table */
  var specs = [
    ['Marke', p.brand],
    ['Modell', p.name],
    ['Referenz', p.ref],
    ['Baujahr', p.year],
    ['Geschlecht', p.gender],
    ['Durchmesser', p.size],
    ['Gehäuse', p.material],
    ['Glas', p.glass],
    ['Zifferblatt', p.dial],
    ['Band', p.strap],
    ['Werk', p.movement],
    ['Kaliber', p.caliber],
    ['Lieferumfang', p.fullset],
    ['Zustand', p.rating ? p.rating : null],
    ['Interner Code', p.code],
    ['Status', HV.statusLabel[p.status]],
    ['Besteuerung', HV.steuerLabel],
  ].filter(function (row) { return row[1]; });
  document.getElementById('specTable').innerHTML = specs.map(function (row) {
    return '<div class="row"><dt>' + row[0] + '</dt><dd>' + row[1] + '</dd></div>';
  }).join('');

  /* Der Fliesstext aus Shopify wird nicht mehr gezeigt: Bei fast allen Uhren
     wiederholte er nur das Datenblatt darueber. Aus der Beschreibung bleibt
     allein die Zustandsliste — die steht sonst nirgends.
     Hinter dem Satz zu den Bildern folgt in den Altbestaenden das abgeschriebene
     Datenblatt samt Standardtext; ab dort wird abgeschnitten. Die Zustandsliste
     steht immer davor. */
  var BILDSATZ = /Unsere Bilder sind unbearbeitet/i;
  var roh = String(p.desc || '');
  var schnitt = roh.search(BILDSATZ);
  var intro = (schnitt >= 0 ? roh.slice(0, schnitt) : roh).replace(/\s+/g, ' ').trim();

  /* Garantie dieser Uhr in Monaten — üblich 12, einzelne Uhren mehr
     (Metafeld uhr.garantie). Steht in der Kachel oben und im Versprechen. */
  var monate = parseInt(p.warranty, 10) || 12;
  var kachel = document.getElementById('pdGarantie');
  if (kachel) kachel.querySelector('b').textContent = monate + ' Monate';

  /* Unser Versprechen — gleicher Text unter jeder Uhr */
  var VERSPRECHEN = [
    'Jeder Zeitmesser wird auf Echtheit, Funktion und Ganggenauigkeit überprüft. Sie bekommen also das Rundum-Sorglos-Paket und zusätzlich ' + monate + ' Monate Garantie, wobei die Wasserdichtigkeit ausgeschlossen ist.',
    'Unsere Zeitmesser können auch in unserem Showroom nach Terminvereinbarung im Frankfurter Bankenviertel besichtigt werden.',
    'Falls Sie wider Erwarten unsicher sind, ob dieser Zeitmesser zu Ihnen passt, bieten wir ein 14-tägiges Rückgaberecht an.',
    'Der Versand innerhalb Deutschlands ist kostenlos. Innerhalb Europas berechnen wir pauschal 80 €, weltweit 150 € — versichert und mit Sendungsverfolgung.',
    'Für weitere Fragen stehen wir jederzeit gerne zur Verfügung.',
    'Wir freuen uns auf Ihre Nachricht.',
  ];
  /* Manche Beschreibungen tragen eine Zustandsliste im Fliesstext mit —
     als Aufzaehlung ist sie deutlich besser zu lesen. */
  var MERKMAL = /(Gesamtbewertung|Gesamtzustand|Gehäuse|Glas|Lünette|Armband|Band|Schließe|Uhrwerk|Zifferblatt|Krone|Drücker)\s*:/g;
  var teile = intro.split(/Alle wichtigen Details auf einen Blick:\s*/i);
  var punkte = [];
  if (teile.length > 1) {
    punkte = teile[1]
      .replace(/^[-–]\s*/, '')
      .replace(/\s+[-–]\s+/g, '\n')
      .replace(MERKMAL, '\n$1:')
      .split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
  }

  /* Hinweis zu dieser einen Uhr (Metafeld uhr.hinweis). Steht bewusst als
     eigenes Feld da: Der Fliesstext aus Shopify wird oben abgeschnitten,
     ein Zusatz von Hannes soll aber sichtbar sein. Absätze mit Leerzeile. */
  /* Besonderheiten dieser Uhr (Metafeld uhr.hinweis) — eigener Block oben,
     direkt unter dem Preis. Unten in der Beschreibung wurde er uebersehen. */
  var extra = document.getElementById('pdExtra');
  if (extra) {
    if (p.note) {
      extra.innerHTML = '<h2>Besonderheiten</h2>' + String(p.note).split(/\n\s*\n|\n/)
        .map(function (t) { return t.trim(); }).filter(Boolean)
        .map(function (t) {
          return '<p>' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
        }).join('');
      extra.hidden = false;
    } else {
      extra.innerHTML = '';
      extra.hidden = true;
    }
  }

  document.getElementById('pdDesc').innerHTML =
    (punkte.length
      ? '<h2>Zustand im Detail</h2><ul class="pd-cond">' + punkte.map(function (t) {
          var k = t.indexOf(':');
          return k > 0
            ? '<li><b>' + t.slice(0, k) + '</b><span>' + t.slice(k + 1).trim().replace(/[\s.]+$/, '') + '</span></li>'
            : '<li><span>' + t + '</span></li>';
        }).join('') + '</ul>'
      : '') +
    '<h2 class="pd-promise">Unser Versprechen</h2>' +
    /* Steht ein Satz schon oben unter „Besonderheiten", hier nicht doppelt. */
    VERSPRECHEN.filter(function (t) { return String(p.note || '').indexOf(t) === -1; })
      .map(function (t) { return '<p>' + t + '</p>'; }).join('');

  /* related: same brand first, then price neighbours */
  var related = (window.PRODUCTS || [])
    .filter(function (x) { return x.id !== p.id; })
    .sort(function (a, b) {
      var ab = (a.brand === p.brand ? 0 : 1) - (b.brand === p.brand ? 0 : 1);
      if (ab !== 0) return ab;
      return Math.abs(a.price - p.price) - Math.abs(b.price - p.price);
    })
    .slice(0, 4);
  document.getElementById('relatedGrid').innerHTML = related.map(HV.renderCard).join('');
});
