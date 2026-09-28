/* HAHN & VO — gemeinsamer Unterbau für /chrono24.xml und /api/katalog.json.
 *
 * Holt den Bestand aus der Shopify-Storefront-API und bringt ihn in eine
 * Form, mit der beide Ausgaben arbeiten können. Dateien mit Unterstrich
 * bedient Vercel nicht als eigene Adresse — das hier ist nur ein Baustein.
 */

var SHOP = 'tami1g-0j.myshopify.com';
var STOREFRONT_TOKEN = '89c87251e5d1f73c1302b1674ba75b69';
var API = 'https://' + SHOP + '/api/2024-10/graphql.json';

/* Die Metafelder im Namensraum „uhr". */
var FELDER = ['referenz', 'hinweis', 'baujahr', 'durchmesser', 'gehaeuse', 'zifferblatt',
  'band', 'aufzug', 'kaliber', 'zustand', 'lieferumfang', 'geschlecht', 'code',
  'besteuerung', 'glas', 'chrono24', 'reserviert', 'garantie'];

/* Marken mit mehreren Wörtern lassen sich nicht am ersten Leerzeichen
 * abtrennen — „A. Lange & Söhne" wäre sonst die Marke „A.". Deshalb eine
 * feste Liste, längster Treffer gewinnt. Schreibweise links ist die
 * verbindliche, die Aliasse fangen Varianten aus den Produkttiteln ab. */
var MARKEN = [
  { name: 'A. Lange & Söhne', alias: ['a. lange & söhne', 'a. lange und söhne', 'a.lange & söhne', 'lange & söhne'] },
  { name: 'Baume & Mercier', alias: ['baume & mercier', 'baume und mercier', 'baume mercier'] },
  { name: 'Girard Perregaux', alias: ['girard perregaux', 'girard-perregaux'] },
  { name: 'Jaeger-LeCoultre', alias: ['jaeger-lecoultre', 'jaeger le coultre', 'jaeger lecoultre'] },
  { name: 'Patek Philippe', alias: ['patek philippe'] },
  { name: 'TAG Heuer', alias: ['tag heuer'] },
  { name: 'Vacheron Constantin', alias: ['vacheron constantin'] },
  { name: 'Glashütte Original', alias: ['glashütte original', 'glashuette original', 'glashutte original'] },
  { name: 'Audemars Piguet', alias: ['audemars piguet'] },
  { name: 'Grand Seiko', alias: ['grand seiko'] },
  { name: 'Bell & Ross', alias: ['bell & ross', 'bell und ross'] },
  { name: 'Franck Muller', alias: ['franck muller'] },
  { name: 'Ulysse Nardin', alias: ['ulysse nardin'] },
  { name: 'Maurice Lacroix', alias: ['maurice lacroix'] },
  { name: 'Frederique Constant', alias: ['frederique constant', 'frédérique constant'] },
  { name: 'Roger Dubuis', alias: ['roger dubuis'] },
  { name: 'Carl F. Bucherer', alias: ['carl f. bucherer', 'carl f bucherer'] },
  { name: 'Raymond Weil', alias: ['raymond weil'] },
  { name: 'H. Moser & Cie', alias: ['h. moser & cie', 'h. moser'] },
  { name: 'Panerai', alias: ['officine panerai'] },
  { name: 'Zenith', alias: ['zenith'] },
  { name: 'Seiko', alias: ['seiko'] },
  { name: 'Oris', alias: ['oris'] },
  { name: 'Chopard', alias: ['chopard'] },
  { name: 'Breguet', alias: ['breguet'] },
  { name: 'Blancpain', alias: ['blancpain'] },
  { name: 'Piaget', alias: ['piaget'] },
  { name: 'Montblanc', alias: ['montblanc'] },
  { name: 'Junghans', alias: ['junghans'] },
  { name: 'Hamilton', alias: ['hamilton'] },
  { name: 'Tissot', alias: ['tissot'] },
  { name: 'Rado', alias: ['rado'] },
  /* „IWC Schaffhausen" ist derselbe Hersteller wie „IWC" — der Zusatz gehört
   * weder in die Marke noch in den Modellnamen. */
  { name: 'IWC', alias: ['iwc schaffhausen', 'iwc'] },
  { name: 'Breitling', alias: ['breitling'] },
  { name: 'Bvlgari', alias: ['bvlgari', 'bulgari'] },
  { name: 'Cartier', alias: ['cartier'] },
  { name: 'Hublot', alias: ['hublot'] },
  { name: 'Longines', alias: ['longines'] },
  { name: 'MB&F', alias: ['mb&f'] },
  { name: 'Nomos', alias: ['nomos'] },
  { name: 'Omega', alias: ['omega'] },
  { name: 'Panerai', alias: ['panerai'] },
  { name: 'Rolex', alias: ['rolex'] },
  { name: 'Sinn', alias: ['sinn'] },
  { name: 'Tudor', alias: ['tudor'] },
];

function markeUndModell(titel) {
  var t = String(titel || '').trim();
  var klein = t.toLowerCase();
  var beste = null;
  MARKEN.forEach(function (m) {
    m.alias.forEach(function (a) {
      if (klein.indexOf(a) === 0 && (!beste || a.length > beste.laenge)) {
        beste = { name: m.name, laenge: a.length };
      }
    });
  });
  if (!beste) {
    /* Unbekannte Marke: erstes Wort, damit trotzdem etwas Sinnvolles dasteht. */
    var erstes = t.split(' ')[0];
    return { marke: erstes, modell: t.slice(erstes.length).trim() || t };
  }
  var rest = t.slice(beste.laenge).trim().replace(/^[-–—·,]\s*/, '');
  return { marke: beste.name, modell: rest || t };
}

function abfrage(cursor) {
  var ids = FELDER.map(function (k) {
    return '{namespace:"uhr",key:"' + k + '"}';
  }).join(',');
  return '{products(first:50' + (cursor ? ',after:"' + cursor + '"' : '') + '){' +
    'pageInfo{hasNextPage endCursor}' +
    /* Bestandszahlen darf der öffentliche Token nicht lesen; availableForSale
     * genügt: Shopify setzt es auf false, sobald der Bestand 0 ist. */
    'edges{node{id title descriptionHtml availableForSale createdAt updatedAt ' +
    'images(first:16){edges{node{url}}} ' +
    'variants(first:1){edges{node{id price{amount} compareAtPrice{amount}}}} ' +
    'metafields(identifiers:[' + ids + ']){key value}}}}}';
}

function beschreibungAusHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* Liefert alle Produkte in einheitlicher Form. */
async function holeBestand() {
  var alle = [], cursor = null;
  for (var runde = 0; runde < 10; runde++) {
    var antwort = await fetch(API, {
      method: 'POST',
      headers: {
        'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: abfrage(cursor) }),
    });
    if (!antwort.ok) throw new Error('Shopify antwortet mit ' + antwort.status);
    var daten = await antwort.json();
    if (daten.errors) throw new Error('Shopify: ' + JSON.stringify(daten.errors).slice(0, 300));
    var seite = daten.data.products;
    seite.edges.forEach(function (e) {
      var n = e.node;
      var f = {};
      (n.metafields || []).forEach(function (m) { if (m && m.value) f[m.key] = m.value; });
      var v = ((n.variants.edges[0] || {}).node) || {};
      var mm = markeUndModell(n.title);
      alle.push({
        shopifyId: String(n.id).split('/').pop(),
        variantId: v.id || null,
        titel: n.title,
        marke: mm.marke,
        modell: mm.modell,
        beschreibung: beschreibungAusHtml(n.descriptionHtml),
        verfuegbar: !!n.availableForSale,
        /* Anlagedatum aus Shopify — daraus leitet die Startseite ab, was
         * wirklich neu eingetroffen ist. */
        angelegt: n.createdAt || null,
        geaendert: n.updatedAt || null,
        preis: v.price ? Math.round(parseFloat(v.price.amount)) : null,
        listenpreis: v.compareAtPrice ? Math.round(parseFloat(v.compareAtPrice.amount)) : null,
        bilder: (n.images.edges || []).map(function (b) { return b.node.url; }),
        f: f,
      });
    });
    if (!seite.pageInfo.hasNextPage) break;
    cursor = seite.pageInfo.endCursor;
  }
  return alle.concat(anfrageUhren(alle));
}

/* Uhren „per Überweisung": Shopify Payments verarbeitet keine Waren über
 * 10.000 USD, rund 8.500 € (Trust & Safety, 04.09.2026; Entwurf gesetzt am
 * 06.09.2026). Diese Uhren liegen in Shopify als Entwurf — unsichtbar für
 * Storefront, Kasse und alle Verkaufskanäle — und werden aus
 * daten/anfrage-uhren.json gepflegt. Sie erscheinen auf der Website, im
 * Chrono24-Feed und in der Sitemap wie alle anderen, nur ohne Kaufknopf.
 * Solange eine Uhr in Shopify noch aktiv ist, gewinnt Shopify (kein Doppel). */
function anfrageUhren(shopify) {
  var liste;
  try { liste = require('../daten/anfrage-uhren.json').produkte || []; } catch (e) { return []; }
  var vorhanden = {};
  shopify.forEach(function (p) { vorhanden[String(p.shopifyId)] = true; });
  return liste.filter(function (u) { return !vorhanden[String(u.shopifyId)]; }).map(function (u) {
    var f = {
      referenz: u.ref, baujahr: u.year, durchmesser: u.size, gehaeuse: u.material, zifferblatt: u.dial,
      band: u.strap, aufzug: u.movement, kaliber: u.caliber, zustand: u.rating, lieferumfang: u.fullset,
      geschlecht: u.gender, code: u.code, besteuerung: u.tax, glas: u.glass,
    };
    Object.keys(f).forEach(function (k) { if (f[k] == null || f[k] === '') delete f[k]; else f[k] = String(f[k]); });
    return {
      shopifyId: String(u.shopifyId), variantId: null,
      titel: u.brand + ' ' + u.name, marke: u.brand, modell: u.name,
      beschreibung: u.desc || '', verfuegbar: u.status !== 'sold', anfrage: u.status !== 'sold',
      angelegt: u.added || null, preis: u.price, listenpreis: u.listPrice || null,
      bilder: u.images || [], f: f,
    };
  });
}

/* Zuordnung Shopify-Produkt → Uhren-Kennung der Website, aus js/data.js.
 * So behalten bestehende Uhren ihre Adresse (produkt.html?id=p426), auch wenn
 * der Katalog aus Shopify kommt. */
async function holeKennungen(basis) {
  try {
    var antwort = await fetch(basis + '/js/data.js');
    if (!antwort.ok) return {};
    var text = await antwort.text();
    var treffer = text.match(/window\.SHOPIFY\s*=\s*(\{[\s\S]*?\n\});/);
    if (!treffer) return {};
    var karte = JSON.parse(treffer[1]).products || {};
    var umgekehrt = {};
    Object.keys(karte).forEach(function (uhrId) {
      umgekehrt[String(karte[uhrId])] = uhrId;
    });
    return umgekehrt;
  } catch (e) {
    return {};
  }
}

module.exports = {
  SHOP: SHOP,
  STOREFRONT_TOKEN: STOREFRONT_TOKEN,
  FELDER: FELDER,
  MARKEN: MARKEN,
  markeUndModell: markeUndModell,
  beschreibungAusHtml: beschreibungAusHtml,
  holeBestand: holeBestand,
  holeKennungen: holeKennungen,
  anfrageUhren: anfrageUhren,
};
