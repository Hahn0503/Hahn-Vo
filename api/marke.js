/* HAHN & VO — Markenseiten, serverseitig aus dem Bestand.
 *
 *   /marken            Übersicht aller Marken im Bestand
 *   /marken/rolex      alle Uhren einer Marke, mit kurzem Text (daten/marken.json)
 *
 * Trifft Suchen wie „Rolex kaufen Frankfurt". Als Vorlage dient shop.html; der
 * Kopf wird gefüllt, die Marke als Voreinstellung in <body data-marke> gesetzt,
 * das Raster mit den Karten vorbefüllt — js/shop.js übernimmt danach wie im
 * Shop (Filter, Sortierung), mit derselben Voreinstellung.
 */

var fs = require('fs');
var path = require('path');
var katalog = require('./katalog');
var MARKEN = require('../daten/marken.json');

var SITE = 'https://hahn-vo.de';
var VORLAGE = null;
var EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
var STATUS = { available: 'Erhältlich', anfrage: 'Per Überweisung', reserved: 'Reserviert', sold: 'Verkauft' };

function vorlage() {
  if (!VORLAGE) VORLAGE = fs.readFileSync(path.join(__dirname, '..', 'shop.html'), 'utf8');
  return VORLAGE;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Adresse einer Marke: „A. Lange & Söhne" → a-lange-soehne, „TAG Heuer" → tag-heuer. */
function slug(name) {
  var s = String(name || '').toLowerCase();
  [['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'], ['ß', 'ss'], ['é', 'e'], ['è', 'e']].forEach(function (p) { s = s.split(p[0]).join(p[1]); });
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* Dieselbe Karte wie HV.renderCard in js/catalog.js — Zeichen für Zeichen,
 * damit das Skript beim Neuzeichnen nichts verschiebt. */
function karte(p) {
  var imgA = (p.images || [])[0] || '';
  var imgB = (p.images || [])[1] || imgA;
  var soldCls = p.status === 'sold' ? ' is-sold' : '';
  var reduziert = p.status !== 'sold' && p.listPrice && p.listPrice > p.price;
  var preis = p.status === 'sold'
    ? '<span class="sold-label num">' + EUR.format(p.price) + '</span>'
    : '<span class="num">' + EUR.format(p.price) + '</span>' + (reduziert ? '<span class="was num">' + EUR.format(p.listPrice) + '</span>' +
      /* Ersparnis in Euro hinter dem Streichpreis, wie js/catalog.js */
      '<span class="spar num">\u2212' + EUR.format(p.listPrice - p.price) + '</span>' : '');
  var spec = [p.ref ? 'Ref. ' + p.ref : null, p.year, p.fullset, p.rating ? 'Zustand: ' + p.rating : null].filter(Boolean).join(' · ');
  return '<article class="product-card' + soldCls + '" data-id="' + esc(p.id) + '">' +
    '<div class="pc-media">' +
      '<span class="pc-status status status-' + esc(p.status) + '">' + STATUS[p.status] + '</span>' +
      (reduziert ? '<span class="pc-sale">Reduziert</span>' : '') +
      '<img class="img-a" src="' + esc(imgA) + '" alt="' + esc(p.brand + ' ' + p.name) + '" loading="lazy">' +
      '<img class="img-b" src="' + esc(imgB) + '" alt="" loading="lazy" aria-hidden="true">' +
    '</div>' +
    '<div class="pc-body">' +
      '<span class="pc-brand">' + esc(p.brand) + '</span>' +
      '<div class="pc-title-zone">' +
        '<h2 class="pc-name">' + esc(p.name) + '</h2>' +
        '<span class="pc-specline">' + esc(spec) + '</span>' +
      '</div>' +
      '<div class="pc-price">' + preis + '</div>' +
    '</div>' +
    '<a class="pc-link" href="/produkt?id=' + esc(p.id) + '" aria-label="' + esc(p.brand + ' ' + p.name) + '"></a>' +
  '</article>';
}

/* Sortierung „Neueste zuerst" wie im Shop: erhältlich vor verkauft, dann Anlagedatum. */
function neuesteZuerst(a, b) {
  var RANG = { available: 0, anfrage: 0, reserved: 1, sold: 2 };
  var r = (RANG[a.status] || 0) - (RANG[b.status] || 0);
  if (r) return r;
  return String(b.added || '').localeCompare(String(a.added || ''));
}

function kopf(html, titel, beschreibung, adresse) {
  /* shop.html verweist relativ auf css/, js/, vendor/, assets/ — unter
   * /marken/rolex zeigte das auf /marken/css/… (404, Seite ohne Stil). */
  html = html.replace(/(href|src)="(css|js|vendor|assets)\//g, '$1="/$2/');
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(titel) + '</title>');
  html = html.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + esc(beschreibung) + '">');
  html = html.replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + esc(adresse) + '">');
  html = html.replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + esc(adresse) + '">');
  html = html.replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + esc(titel) + '">');
  html = html.replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + esc(beschreibung) + '">');
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="' + esc(titel) + '">');
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="' + esc(beschreibung) + '">');
  return html;
}

function ld(obj) {
  return '<script type="application/ld+json">' + JSON.stringify(obj) + '</script>';
}

function markenSeite(marke, uhren) {
  var html = vorlage();
  var s = slug(marke);
  var eintrag = MARKEN.marken[s] || {};
  var adresse = SITE + '/marken/' + s;
  var erhaeltlich = uhren.filter(function (p) { return p.status !== 'sold'; }).length;
  var titel = (eintrag.titel || (marke + ' kaufen in Frankfurt — geprüft, mit Garantie')) + ' · Hahn & Vo';
  var text = eintrag.text || MARKEN._standard.replace(/\{marke\}/g, marke);
  var beschreibung = (erhaeltlich + ' ' + marke + '-' + (erhaeltlich === 1 ? 'Uhr' : 'Uhren') + ' aus Vorbesitz bei Hahn & Vo in Frankfurt — ' +
    'auf Echtheit geprüft, 12 Monate Garantie, versicherter Versand oder Übergabe im Showroom.');
  var bild = uhren.length && uhren[0].images && uhren[0].images[0] ? uhren[0].images[0] : SITE + '/assets/img/founders.jpg';
  if (bild.indexOf('http') !== 0) bild = SITE + '/' + bild.replace(/^\//, '');

  html = kopf(html, titel, beschreibung, adresse);
  html = html.replace(/<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + esc(bild) + '">');
  html = html.replace(/<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + esc(bild) + '">');
  html = html.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*">/g, '');

  var schema = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': adresse, url: adresse, name: marke + ' bei Hahn & Vo', description: beschreibung,
      isPartOf: { '@id': SITE + '/#website' }, about: { '@type': 'Brand', name: marke },
      mainEntity: { '@type': 'ItemList', numberOfItems: uhren.length, itemListElement: uhren.map(function (p, i) {
        return { '@type': 'ListItem', position: i + 1, url: SITE + '/produkt?id=' + p.id, name: p.brand + ' ' + p.name };
      }) } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Marken', item: SITE + '/marken' },
      { '@type': 'ListItem', position: 3, name: marke, item: adresse } ] },
  ];
  html = html.replace('  <link rel="icon"', '  ' + schema.map(ld).join('\n  ') + '\n  <link rel="icon"');

  html = html.replace('<body data-page="shop"', '<body data-page="shop" data-marke="' + esc(marke) + '"');
  html = html.replace('<span id="bandTitle">Shop</span>', '<span id="bandTitle">' + esc(marke) + '</span>');
  html = html.replace('<span class="count num" id="bandCount"></span>',
    '<span class="count num" id="bandCount">' + uhren.length + ' von ' + uhren.length + ' Referenzen</span>');
  html = html.replace('  <div class="toolbar">',
    '  <div class="wrap marke-intro"><p>' + esc(text) + '</p></div>\n\n  <div class="toolbar">');
  html = html.replace('<div class="product-grid" id="shopGrid"></div>',
    '<div class="product-grid" id="shopGrid">' + uhren.slice().sort(neuesteZuerst).map(karte).join('') + '</div>');
  return html;
}

function uebersicht(uhren) {
  var html = vorlage();
  var adresse = SITE + '/marken';
  var zaehler = {};
  uhren.forEach(function (p) { zaehler[p.brand] = (zaehler[p.brand] || 0) + 1; });
  var marken = Object.keys(zaehler).sort(function (a, b) { return a.localeCompare(b, 'de'); });
  var titel = 'Alle Marken — ' + marken.length + ' Uhrenmarken im Bestand · Hahn & Vo Frankfurt';
  var beschreibung = 'Luxusuhren nach Marke: ' + marken.slice(0, 8).join(', ') + ' und mehr — geprüft, mit 12 Monaten Garantie, aus dem Showroom in Frankfurt.';
  html = kopf(html, titel, beschreibung, adresse);
  var schema = { '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': adresse, url: adresse, name: 'Marken bei Hahn & Vo',
    isPartOf: { '@id': SITE + '/#website' },
    mainEntity: { '@type': 'ItemList', numberOfItems: marken.length, itemListElement: marken.map(function (m, i) {
      return { '@type': 'ListItem', position: i + 1, url: SITE + '/marken/' + slug(m), name: m }; }) } };
  html = html.replace('  <link rel="icon"', '  ' + ld(schema) + '\n  <link rel="icon"');
  html = html.replace('<body data-page="shop"', '<body data-page="shop" data-marken-uebersicht="1"');
  html = html.replace('<span id="bandTitle">Shop</span>', '<span id="bandTitle">Marken</span>');
  html = html.replace('<span class="count num" id="bandCount"></span>',
    '<span class="count num" id="bandCount">' + marken.length + ' Marken · ' + uhren.length + ' Referenzen</span>');
  /* Werkzeugleiste raus, Raster durch die Markenliste ersetzen */
  html = html.replace(/  <div class="toolbar">[\s\S]*?<\/div>\n  <\/div>\n/, '');
  html = html.replace(/<div class="active-chips" id="activeChips"><\/div>\s*<div class="product-grid" id="shopGrid"><\/div>\s*<div class="empty-result" id="emptyResult" hidden>[\s\S]*?<\/div>/,
    '<div class="marken-raster">' + marken.map(function (m) {
      var n = zaehler[m];
      return '<a class="marke-karte" href="/marken/' + slug(m) + '"><span class="marke-name">' + esc(m) + '</span>' +
        '<span class="marke-anzahl num">' + n + ' ' + (n === 1 ? 'Uhr' : 'Uhren') + '</span></a>';
    }).join('') + '</div>');
  return html;
}

module.exports = async function handler(req, res) {
  var host = (req.headers['x-forwarded-host'] || req.headers.host || 'hahn-vo.de').split(',')[0];
  var gesucht = String((req.query && req.query.slug) || '').trim().toLowerCase();
  try {
    var daten = await katalog.baueKatalog('https://' + host);
    var uhren = daten.produkte.filter(function (p) { return p.category !== 'zubehoer'; });
    var html;
    if (!gesucht) {
      html = uebersicht(uhren);
    } else {
      var marke = null;
      uhren.forEach(function (p) { if (!marke && slug(p.brand) === gesucht) marke = p.brand; });
      if (!marke) {
        res.setHeader('Cache-Control', 's-maxage=60');
        res.statusCode = 302; res.setHeader('Location', '/shop'); res.end(); return;
      }
      html = markenSeite(marke, uhren.filter(function (p) { return p.brand === marke; }));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.statusCode = 200;
    res.end(html);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 302; res.setHeader('Location', '/shop'); res.end();
  }
};

module.exports.slug = slug;
