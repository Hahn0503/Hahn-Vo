/* HAHN & VO — Produktseite, serverseitig vorbereitet.
 *
 * /produkt?id=p567 lief bisher rein im Browser: produkt.html kam leer, das
 * Skript holte die Uhr aus dem Katalog und füllte die Seite. Für Google und
 * Besucher war das in Ordnung, für alles andere nicht: WhatsApp, Facebook,
 * Chrono24-Verweise, KI-Suchmaschinen und jeder Crawler ohne JavaScript sahen
 * nur „Uhr — Hahn & Vo" mit dem Gründerfoto.
 *
 * Diese Funktion liefert dieselbe produkt.html aus, aber mit gefülltem Kopf
 * (Titel, Beschreibung, Vorschaubild, canonical, Product- und Breadcrumb-
 * Daten nach schema.org) und vorbefülltem Inhalt (Name, Preis, Datenblatt,
 * Hauptbild). js/product.js übernimmt danach wie bisher — es schreibt exakt
 * dieselben Werte, deshalb flackert nichts.
 *
 * Erreichbar unter /produkt (Umleitung in vercel.json). Fünf Minuten Edge-
 * Cache wie beim Katalog.
 */

var fs = require('fs');
var path = require('path');
var katalog = require('./katalog');

var SITE = 'https://hahn-vo.de';
var VORLAGE = null;

/* Die Vorlage heißt produkt-vorlage.html, nicht produkt.html: Läge eine
 * statische produkt.html im Projekt, würde Vercel sie vor dieser Funktion
 * ausliefern (Dateisystem schlägt Rewrite). Lokal bedient tools/serve.py
 * /produkt aus derselben Vorlage. */
function vorlage() {
  if (!VORLAGE) {
    VORLAGE = fs.readFileSync(path.join(__dirname, '..', 'produkt-vorlage.html'), 'utf8');
  }
  return VORLAGE;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absolut(url) {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  return SITE + '/' + String(url).replace(/^\//, '');
}

var EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

var STATUS = { available: 'Erhältlich', anfrage: 'Per Überweisung', reserved: 'Reserviert', sold: 'Verkauft' };

function kuerzen(text, max) {
  var t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  var schnitt = t.slice(0, max - 1);
  var k = schnitt.lastIndexOf(' ');
  return (k > max * 0.6 ? schnitt.slice(0, k) : schnitt) + '…';
}

/* Zustandsliste aus der Beschreibung — dieselbe Regel wie in js/product.js. */
function zustandsliste(desc) {
  var roh = String(desc || '');
  var schnitt = roh.search(/Unsere Bilder sind unbearbeitet/i);
  var intro = (schnitt >= 0 ? roh.slice(0, schnitt) : roh).replace(/\s+/g, ' ').trim();
  var teile = intro.split(/Alle wichtigen Details auf einen Blick:\s*/i);
  if (teile.length < 2) return [];
  var MERKMAL = /(Gesamtbewertung|Gesamtzustand|Gehäuse|Glas|Lünette|Armband|Band|Schließe|Uhrwerk|Zifferblatt|Krone|Drücker)\s*:/g;
  return teile[1]
    .replace(/^[-–]\s*/, '')
    .replace(/\s+[-–]\s+/g, '\n')
    .replace(MERKMAL, '\n$1:')
    .split('\n').map(function (t) { return t.trim(); }).filter(Boolean);
}

/* Garantie in Monaten: üblich 12, einzelne Uhren mehr (Metafeld uhr.garantie). */
function garantieMonate(p) { return parseInt(p.warranty, 10) || 12; }
function garantieSatz(monate) {
  return 'Jeder Zeitmesser wird auf Echtheit, Funktion und Ganggenauigkeit überprüft. Sie bekommen also das Rundum-Sorglos-Paket und zusätzlich ' + monate + ' Monate Garantie, wobei die Wasserdichtigkeit ausgeschlossen ist.';
}
var VERSPRECHEN = [
  garantieSatz(12),
  'Unsere Zeitmesser können auch in unserem Showroom nach Terminvereinbarung im Frankfurter Bankenviertel besichtigt werden.',
  'Falls Sie wider Erwarten unsicher sind, ob dieser Zeitmesser zu Ihnen passt, bieten wir ein 14-tägiges Rückgaberecht an.',
  'Der Versand innerhalb Deutschlands ist kostenlos. Innerhalb Europas berechnen wir pauschal 80 €, weltweit 150 € — versichert und mit Sendungsverfolgung.',
  'Für weitere Fragen stehen wir jederzeit gerne zur Verfügung.',
  'Wir freuen uns auf Ihre Nachricht.',
];

/* Erster Absatz der Beschreibung als Meta-Beschreibung — die Kurzfassung
 * dessen, was ein Kunde über die Uhr wissen will. */
function beschreibungKurz(p) {
  var roh = String(p.desc || '');
  var schnitt = roh.search(/Unsere Bilder sind unbearbeitet/i);
  var erster = (schnitt >= 0 ? roh.slice(0, schnitt) : roh.split(/\n\n/)[0]).replace(/\s+/g, ' ').trim();
  var fakten = [p.year ? 'Baujahr ' + p.year : null, p.fullset, p.rating ? 'Zustand ' + p.rating : null, EUR.format(p.price)]
    .filter(Boolean).join(' · ');
  var basis = erster ? erster + ' ' + fakten + '.' : (p.brand + ' ' + p.name + ' · ' + fakten + '.');
  return kuerzen(basis + ' Auf Echtheit geprüft, ' + garantieMonate(p) + ' Monate Garantie, Showroom Frankfurt.', 300);
}

function zustandSchema(rating) {
  var r = String(rating || '').toLowerCase();
  if (r === 'neu' || r === 'ungetragen') return 'https://schema.org/NewCondition';
  return 'https://schema.org/UsedCondition';
}

function verfuegbarkeitSchema(status) {
  if (status === 'available') return 'https://schema.org/InStock';
  if (status === 'anfrage') return 'https://schema.org/InStoreOnly';
  if (status === 'reserved') return 'https://schema.org/LimitedAvailability';
  return 'https://schema.org/SoldOut';
}

function produktSchema(p, adresse, bilder) {
  var schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': adresse + '#produkt',
    name: p.brand + ' ' + p.name,
    brand: { '@type': 'Brand', name: p.brand },
    image: bilder,
    description: beschreibungKurz(p),
    sku: 'HV-' + String(p.id).toUpperCase(),
    url: adresse,
    itemCondition: zustandSchema(p.rating),
    offers: {
      '@type': 'Offer',
      url: adresse,
      priceCurrency: 'EUR',
      price: String(p.price),
      availability: verfuegbarkeitSchema(p.status),
      itemCondition: zustandSchema(p.rating),
      seller: { '@id': SITE + '/#organisation' },
      priceValidUntil: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    },
  };
  if (p.ref) schema.mpn = p.ref;
  if (p.year) schema.productionDate = String(p.year);
  if (p.material) schema.material = p.material;
  if (p.category === 'zubehoer') schema.category = 'Uhrenzubehör';
  else schema.category = 'Luxusuhren';
  var props = [
    ['Referenz', p.ref], ['Baujahr', p.year], ['Durchmesser', p.size], ['Gehäuse', p.material],
    ['Zifferblatt', p.dial], ['Band', p.strap], ['Werk', p.movement], ['Kaliber', p.caliber],
    ['Glas', p.glass], ['Lieferumfang', p.fullset], ['Zustand', p.rating], ['Geschlecht', p.gender],
  ].filter(function (r) { return r[1]; });
  schema.additionalProperty = props.map(function (r) {
    return { '@type': 'PropertyValue', name: r[0], value: String(r[1]) };
  });
  if (p.gender === 'Herren') schema.audience = { '@type': 'PeopleAudience', suggestedGender: 'male' };
  if (p.gender === 'Damen') schema.audience = { '@type': 'PeopleAudience', suggestedGender: 'female' };
  return schema;
}

function breadcrumbSchema(p, adresse) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: SITE + '/shop' },
      { '@type': 'ListItem', position: 3, name: p.brand, item: SITE + '/shop?brand=' + encodeURIComponent(p.brand) },
      { '@type': 'ListItem', position: 4, name: p.brand + ' ' + p.name, item: adresse },
    ],
  };
}

function ersetzeTag(html, muster, neu) {
  return muster.test(html) ? html.replace(muster, neu) : html;
}

function rendern(p) {
  var html = vorlage();
  var adresse = SITE + '/produkt?id=' + p.id;
  var titel = p.brand + ' ' + p.name + (p.ref ? ' · Ref. ' + p.ref : '') + ' — Hahn & Vo';
  var meta = beschreibungKurz(p);
  var ogText = kuerzen([p.brand, p.name, p.year, p.fullset, p.rating ? 'Zustand: ' + p.rating : null, EUR.format(p.price)]
    .filter(Boolean).join(' · '), 200);
  var bilder = (p.images || []).map(absolut);
  var bild = bilder[0] || SITE + '/assets/img/founders.jpg';
  var altHaupt = p.brand + ' ' + p.name + ' — Bild 1';

  /* Kopf */
  html = ersetzeTag(html, /<title>[^<]*<\/title>/, '<title>' + esc(titel) + '</title>');
  html = ersetzeTag(html, /<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + esc(adresse) + '">');
  html = ersetzeTag(html, /<meta property="og:type" content="[^"]*">/, '<meta property="og:type" content="product">');
  html = ersetzeTag(html, /<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + esc(adresse) + '">');
  html = ersetzeTag(html, /<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + esc(titel) + '">');
  html = ersetzeTag(html, /<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + esc(ogText) + '">');
  html = ersetzeTag(html, /<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + esc(bild) + '">');
  html = html.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*">/g, '');
  html = ersetzeTag(html, /<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="' + esc(titel) + '">');
  html = ersetzeTag(html, /<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="' + esc(ogText) + '">');
  html = ersetzeTag(html, /<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + esc(bild) + '">');

  var kopfZusatz =
    '  <meta name="description" content="' + esc(meta) + '">\n' +
    '  <meta property="product:price:amount" content="' + esc(p.price) + '">\n' +
    '  <meta property="product:price:currency" content="EUR">\n' +
    '  <link rel="preload" as="image" href="' + esc(bild) + '" fetchpriority="high">\n' +
    '  <script type="application/ld+json">' + JSON.stringify(produktSchema(p, adresse, bilder)) + '</script>\n' +
    '  <script type="application/ld+json">' + JSON.stringify(breadcrumbSchema(p, adresse)) + '</script>\n';
  html = html.replace(/<meta property="og:type"/, kopfZusatz + '  <meta property="og:type"');

  /* Inhalt vorbefüllen — dieselben Werte, die js/product.js danach setzt */
  html = html.replace('<span id="crumbName"></span>', '<span id="crumbName">' + esc(p.name) + '</span>');
  html = html.replace('<span class="pd-brand" id="pdBrand"></span>', '<span class="pd-brand" id="pdBrand">' + esc(p.brand) + '</span>');
  html = html.replace('<h1 class="pd-name" id="pdName"></h1>', '<h1 class="pd-name" id="pdName">' + esc(p.name) + '</h1>');
  html = html.replace('<span class="pd-price num" id="pdPrice"></span>', '<span class="pd-price num" id="pdPrice">' + esc(EUR.format(p.price)) + '</span>');
  html = html.replace('<span class="pc-status status" id="pdStatus"></span>',
    '<span class="pc-status status status-' + esc(p.status) + '" id="pdStatus">' + esc(STATUS[p.status] || '') + '</span>');
  html = html.replace('<img id="mainImg" src="" alt="">',
    '<img id="mainImg" src="' + esc(bilder[0] || '') + '" alt="' + esc(altHaupt) + '" fetchpriority="high" decoding="async">');
  html = html.replace('<div class="gallery-thumbs" id="thumbs"></div>',
    '<div class="gallery-thumbs" id="thumbs">' + bilder.map(function (src, i) {
      return '<button aria-label="Bild ' + (i + 1) + '"' + (i === 0 ? ' class="is-active"' : '') + '><img src="' + esc(src) + '" alt="" loading="lazy"></button>';
    }).join('') + '</div>');

  var differenz = /^differenz/i.test(String(p.tax || ''));
  var steuerLabel = differenz ? 'Differenzbesteuerung nach § 25a UStG' : 'Regelbesteuerung, Mehrwertsteuer ausweisbar';
  var steuerSatz = differenz
    ? 'Endpreis. Differenzbesteuert nach § 25a UStG — die Mehrwertsteuer ist enthalten, wird auf der Rechnung aber nicht gesondert ausgewiesen.'
    : 'Endpreis inkl. gesetzlicher Mehrwertsteuer — auf der Rechnung gesondert ausgewiesen.';
  html = html.replace('<span id="pdTax">Endpreis inkl. gesetzlicher Mehrwertsteuer.</span>', '<span id="pdTax">' + esc(steuerSatz) + '</span>');

  var specs = [
    ['Marke', p.brand], ['Modell', p.name], ['Referenz', p.ref], ['Baujahr', p.year], ['Geschlecht', p.gender],
    ['Durchmesser', p.size], ['Gehäuse', p.material], ['Glas', p.glass], ['Zifferblatt', p.dial], ['Band', p.strap],
    ['Werk', p.movement], ['Kaliber', p.caliber], ['Lieferumfang', p.fullset], ['Zustand', p.rating || null],
    ['Interner Code', p.code], ['Status', STATUS[p.status]], ['Besteuerung', steuerLabel],
  ].filter(function (r) { return r[1]; });
  html = html.replace('<dl class="spec-table" id="specTable"></dl>',
    '<dl class="spec-table" id="specTable">' + specs.map(function (r) {
      return '<div class="row"><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
    }).join('') + '</dl>');

  var punkte = zustandsliste(p.desc);
  var descHtml = (punkte.length
    ? '<h2>Zustand im Detail</h2><ul class="pd-cond">' + punkte.map(function (t) {
        var k = t.indexOf(':');
        return k > 0
          ? '<li><b>' + esc(t.slice(0, k)) + '</b><span>' + esc(t.slice(k + 1).trim().replace(/[\s.]+$/, '')) + '</span></li>'
          : '<li><span>' + esc(t) + '</span></li>';
      }).join('') + '</ul>'
    : '') +
    '<h2 class="pd-promise">Unser Versprechen</h2>' +
    /* Garantiesatz mit den Monaten dieser Uhr; steht ein Satz schon oben
       unter „Besonderheiten", hier nicht doppelt. */
    [garantieSatz(garantieMonate(p))].concat(VERSPRECHEN.slice(1))
      .filter(function (t) { return String(p.note || '').indexOf(t) === -1; })
      .map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
  html = html.replace('<div id="pdGarantie"><b>12 Monate</b>',
    '<div id="pdGarantie"><b>' + garantieMonate(p) + ' Monate</b>');
  html = html.replace('<div class="pd-desc" id="pdDesc"></div>', '<div class="pd-desc" id="pdDesc">' + descHtml + '</div>');

  /* Besonderheiten dieser Uhr (Metafeld uhr.hinweis) — eigener Block oben,
     direkt unter dem Preis. Er steht schon im HTML, damit er auch ohne
     JavaScript und in der Vorschau von Google/WhatsApp dasteht. */
  if (p.note) {
    var extraHtml = '<h2>Besonderheiten</h2>' + String(p.note).split(/\n\s*\n|\n/)
      .map(function (t) { return t.trim(); }).filter(Boolean)
      .map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
    html = html.replace('<div class="pd-extra" id="pdExtra" hidden></div>',
      '<div class="pd-extra" id="pdExtra">' + extraHtml + '</div>');
  }

  /* Kauf per Überweisung: Kaufknopf öffnet WhatsApp, Hinweis sichtbar */
  if (p.status === 'anfrage') {
    html = html.replace('<button class="btn btn-solid" data-magnetic id="addToCart">In den Warenkorb <span class="arr">→</span></button>',
      '<button class="btn btn-solid" data-magnetic id="addToCart" data-mode="anfrage">Per Überweisung kaufen <span class="arr">→</span></button>');
    html = html.replace('id="pdAnfrageNote" hidden', 'id="pdAnfrageNote"');
  }
  /* Verkauft/Reserviert: Hinweis gleich sichtbar, Knopf gleich richtig beschriftet */
  if (p.status === 'reserved' || p.status === 'sold') {
    html = html.replace('<button class="btn btn-solid" data-magnetic id="addToCart">In den Warenkorb <span class="arr">→</span></button>',
      '<button class="btn btn-solid" data-magnetic id="addToCart" disabled>' + (p.status === 'reserved' ? 'Reserviert' : 'Verkauft') + '</button>');
    if (p.status === 'reserved') html = html.replace('id="pdReservedNote" hidden', 'id="pdReservedNote"');
    if (p.status === 'sold') html = html.replace('id="pdSoldNote" hidden', 'id="pdSoldNote"');
  }
  return html;
}

module.exports = async function handler(req, res) {
  var host = (req.headers['x-forwarded-host'] || req.headers.host || 'hahn-vo.de').split(',')[0];
  var id = String((req.query && req.query.id) || '').trim();
  try {
    var daten = await katalog.baueKatalog('https://' + host);
    var p = null;
    if (id) {
      p = daten.produkte.find(function (x) { return x.id === id; }) ||
          daten.produkte.find(function (x) { return x.code && x.code === id; }) || null;
    }
    if (!p) {
      /* Unbekannte oder fehlende Kennung: in den Shop, wie bisher im Browser. */
      res.setHeader('Cache-Control', 's-maxage=60');
      res.statusCode = 302;
      res.setHeader('Location', '/shop');
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.statusCode = 200;
    res.end(rendern(p));
  } catch (e) {
    /* Shopify nicht erreichbar: die leere Vorlage — das Skript im Browser
     * greift dann auf js/data.js zurück, wie bisher. */
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    res.end(vorlage());
  }
};

module.exports.rendern = rendern;
