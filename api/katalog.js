/* HAHN & VO — Katalog der Website, live aus Shopify.
 *
 * Liefert unter /api/katalog.json dieselbe Struktur, die früher fest in
 * js/data.js stand. Dadurch reicht es, eine Uhr in Shopify anzulegen: Sie
 * erscheint beim nächsten Seitenaufruf im Shop, ohne dass jemand Code ändert.
 *
 * js/data.js bleibt als Rückfalllösung liegen. Antwortet Shopify nicht,
 * zeigt die Website weiter den dort hinterlegten Stand.
 */

var shop = require('./_shop');

/* Uhren, die nicht im Shop erscheinen sollen — interne Codes. */
var AUSSCHLUSS = ['570-26'];

/* Rückfall für das Metafeld uhr.hinweis. Nach dem Anlegen einer neuen
 * Metafeld-Definition dauert es je nach Region bis zu einer Stunde, bis die
 * Storefront-API sie ausliefert (14.09.2026: lokal sofort da, aus der
 * Vercel-Region eine Stunde lang nicht). Damit ein Zusatz von Hannes trotzdem
 * sofort auf der Seite steht, darf er zusätzlich in daten/hinweise.json
 * stehen. Shopify gewinnt immer. */
function hinweisRueckfall() {
  try { return require('../daten/hinweise.json'); } catch (e) { return {}; }
}

/* Garantie in Monaten je Uhr (Metafeld uhr.garantie), wenn sie von den
 * üblichen 12 Monaten abweicht. Rückfall daten/garantie.json aus demselben
 * Grund wie bei den Hinweisen. Shopify gewinnt. */
function garantieRueckfall() {
  try { return require('../daten/garantie.json'); } catch (e) { return {}; }
}

/* Aus einer Shopify-Kennung eine dauerhafte Uhren-Kennung bilden, falls die
 * Uhr noch nicht in js/data.js steht. „s" plus Kennung bleibt stabil. */
function ersatzKennung(shopifyId) {
  return 's' + String(shopifyId).slice(-7);
}

function nachWebsiteForm(p, kennungen, rueckfall, garantien) {
  var f = p.f;
  if (f.code && AUSSCHLUSS.indexOf(f.code) !== -1) return null;
  if (!p.preis) return null;

  /* Zubehör hat keinen Aufzug — dieselbe Unterscheidung wie im Chrono24-Feed. */
  var kategorie = f.aufzug ? 'uhren' : 'zubehoer';

  /* Verkauft schlägt reserviert: Was weg ist, ist weg. „anfrage" = zu haben,
   * aber nicht über die Kasse (siehe anfrageUhren in _shop.js). */
  var reserviert = /^(ja|yes|1|true)$/i.test(String(f.reserviert || '').trim());
  var status = !p.verfuegbar ? 'sold' : (p.anfrage ? 'anfrage' : (reserviert ? 'reserved' : 'available'));

  var kennung = kennungen[p.shopifyId] || ersatzKennung(p.shopifyId);

  return {
    id: kennung,
    brand: p.marke,
    name: p.modell,
    ref: f.referenz || null,
    price: p.preis,
    listPrice: p.listenpreis && p.listenpreis > p.preis ? p.listenpreis : null,
    status: status,
    category: kategorie,
    fullset: f.lieferumfang || null,
    rating: f.zustand || null,
    year: f.baujahr || null,
    size: f.durchmesser || null,
    material: f.gehaeuse || null,
    dial: f.zifferblatt || null,
    strap: f.band || null,
    movement: f.aufzug || null,
    caliber: f.kaliber || null,
    glass: f.glas || null,
    gender: f.geschlecht || null,
    tax: f.besteuerung || null,
    sku: null,
    code: f.code || null,
    /* Anlagedatum aus Shopify — Grundlage fuer „Neueste zuerst". */
    added: p.angelegt || null,
    desc: p.beschreibung || '',
    /* Freier Hinweis je Uhr (Metafeld uhr.hinweis) — wird auf der Produktseite
     * sichtbar unter der Beschreibung gezeigt. Der Fliesstext aus Shopify wird
     * dort absichtlich nicht angezeigt, deshalb dieses eigene Feld. */
    note: f.hinweis || (rueckfall || {})[kennung] || null,
    /* Garantie in Monaten; null = die üblichen 12 Monate. */
    warranty: parseInt(f.garantie, 10) || parseInt((garantien || {})[kennung], 10) || null,
    images: p.bilder,
    shopifyId: p.shopifyId,
    shopifyVariantId: p.variantId,
  };
}

async function baueKatalog(basis) {
  var bestand = await shop.holeBestand();
  var kennungen = await shop.holeKennungen(basis);
  var rueckfall = hinweisRueckfall();
  var garantien = garantieRueckfall();
  var uhren = [];
  var zuordnung = {};
  bestand.forEach(function (p) {
    var u = nachWebsiteForm(p, kennungen, rueckfall, garantien);
    if (!u) return;
    uhren.push(u);
    zuordnung[u.id] = u.shopifyId;
  });
  /* Erhältliche zuerst, dann reservierte, verkaufte ans Ende. */
  var RANG = { available: 0, anfrage: 0, reserved: 1, sold: 2 };
  uhren.sort(function (a, b) { return (RANG[a.status] || 0) - (RANG[b.status] || 0); });
  return {
    stand: new Date().toISOString(),
    anzahl: uhren.length,
    produkte: uhren,
    shopify: zuordnung,
  };
}

module.exports = async function handler(req, res) {
  var host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
  try {
    var katalog = await baueKatalog('https://' + host);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    /* Fünf Minuten am Rand zwischenspeichern: schnell für Besucher, und eine
     * Änderung in Shopify ist trotzdem zeitnah sichtbar. */
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(katalog);
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(502).json({ fehler: e.message });
  }
};

module.exports.baueKatalog = baueKatalog;
