/* HAHN & VO — Chrono24-Warenfeed.
 *
 * Chrono24 ruft diese Adresse alle 12–24 Stunden ab und liest den Bestand
 * daraus. Die Datei wird bei jedem Abruf neu erzeugt, direkt aus Shopify —
 * es gibt also nichts hochzuladen und nichts, was veralten kann.
 *
 * Erreichbar unter /chrono24.xml (Umleitung in vercel.json).
 *
 * Was ihr hier einstellen könnt, steht direkt darunter unter EINSTELLUNGEN.
 */

var EINSTELLUNGEN = {
  /* Aufschlag auf den Website-Preis, nur für Chrono24.
   * Erst Prozent, dann Euro. 0 und 0 heißt: gleicher Preis wie auf der Website.
   * Beispiel 5 % und 0 €: aus 3.390 € werden 3.560 €. */
  aufschlagProzent: 0,
  aufschlagEuro: 0,

  /* Auf volle 10 € aufrunden, damit keine krummen Preise entstehen. */
  rundenAuf: 10,

  /* Eigener Chrono24-Preis für einzelne Uhren, nach internem Code.
   * Gilt statt Website-Preis und Aufschlag. Beispiel: { '642-26': 11890 }.
   * Wird die Uhr verkauft, kann der Eintrag stehen bleiben — sie fällt
   * ohnehin aus dem Feed. */
  preise: {
    '642-26': 11890,   // Rolex Datejust 41 126334, Website 11.250 € (Hannes, 06.11.2026)
    'K-7': 10690,      // Rolex Datejust II 116333, Website 9.990 € (Hannes, 06.11.2026)
    'K-8': 8490,       // Zenith Chronomaster Sport Titan, Website 7.990 € (Hannes, 06.11.2026)
    'K-9': 6790,       // Omega Aqua Terra Worldtimer, Website 6.390 € (Hannes, 06.11.2026)
    '647-26': 3790,    // IWC Mark XII IW324101, Website 3.490 € (Hannes, 09.11.2026)
  },

  /* Uhren ohne Bestand gar nicht erst ausliefern. Dadurch verschwindet eine
   * verkaufte Uhr beim nächsten Abruf von selbst aus Chrono24. */
  nurVerfuegbare: true,

  /* Einzelne Uhren dauerhaft heraushalten — interne Codes, z. B. ['426'].
   * Für einzelne Uhren geht es auch ohne Code-Änderung: In Shopify beim
   * Produkt das Feld „Chrono24" auf „nein" setzen. */
  ausschluss: [],

  /* Zubehör gehört nicht in einen Uhrenmarktplatz. Erkannt am fehlenden
   * Aufzug: Eine Faltschließe hat keinen, eine Taschenuhr ohne
   * Referenznummer sehr wohl. */
  nurUhren: true,
};

var shop = require('./_shop');

/* ---------- Übersetzung ins Chrono24-Vokabular ---------- */

var ZUSTAND = {
  'neu': 'brand new',
  'ungetragen': 'unworn',
  'sehr gut': 'very good (mint)',
  'gut': 'good (fine)',
  'befriedigend': 'fair',
  'defekt': 'scrap (incomplete/defect)',
};

var AUFZUG = {
  'automatik': 'automatic',
  'handaufzug': 'manual winding',
  'quarz': 'quartz',
};

var GLAS = {
  'saphirglas': 'sapphire glass',
  'mineralglas': 'mineral glass',
  'plexiglas': 'plexiglass',
  'kunststoff': 'plastic',
};

var GESCHLECHT = { 'herren': 'Mens', 'damen': 'Ladies' };

/* Materialien und Farben. Zusammensetzungen wie „Edelstahl/Gelbgold" werden
 * Bestandteil für Bestandteil übersetzt. */
var MATERIAL = {
  'edelstahl': 'Steel',
  'stahl': 'Steel',
  'titan': 'Titanium',
  'gelbgold': 'Yellow gold',
  'weißgold': 'White gold',
  'weissgold': 'White gold',
  'rotgold': 'Rose gold',
  'roségold': 'Rose gold',
  'rosegold': 'Rose gold',
  'gold': 'Gold',
  'keramik': 'Ceramic',
  'bronze': 'Bronze',
  'silber': 'Silver',
  'platin': 'Platinum',
  'leder': 'Leather',
  'kautschuk': 'Rubber',
  'kautschukband': 'Rubber',
  'textil': 'Textile',
  'stoff': 'Textile',
};

var FARBE = {
  'schwarz': 'Black',
  'blau': 'Blue',
  'weiß': 'White',
  'weiss': 'White',
  'silber': 'Silver',
  'grau': 'Grey',
  'grün': 'Green',
  'gruen': 'Green',
  'aqua green': 'Green',
  'braun': 'Brown',
  'hellbraun': 'Light brown',
  'burgunderrot': 'Bordeaux',
  'rot': 'Red',
  'gold': 'Gold',
  'champagner': 'Champagne',
  'anthrazit': 'Anthracite',
};

/* Lieferumfang → Papiere und Box getrennt. */
var LIEFERUMFANG = {
  'full set (box & papiere)': { papiere: true, box: true },
  /* Revisionspapiere sind keine Originalpapiere im Sinne von Chrono24 —
     das Feld meint Garantiekarte/Kaufbeleg ab Werk. */
  'box & revisionspapiere': { papiere: false, box: true },
  'nur papiere': { papiere: true, box: false },
  'nur box': { papiere: false, box: true },
  'nur uhr': { papiere: false, box: false },
};

/* Klammerzusätze wie „(siehe Bilder)" gehören nicht ins Datenfeld, sondern
 * allenfalls in die Beschreibung. */
function kern(wert) {
  return String(wert || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function uebersetze(wert, tabelle) {
  var k = kern(wert).toLowerCase();
  if (!k) return null;
  if (tabelle[k]) return tabelle[k];
  /* Zusammensetzungen: „Edelstahl/Gelbgold", „Leder / Kautschuk", „Edelstahl + Kautschukband" */
  var teile = k.split(/\s*[\/+,]\s*/).filter(Boolean);
  if (teile.length > 1) {
    var uebersetzt = teile.map(function (t) { return tabelle[t.trim()] || null; });
    if (uebersetzt.every(Boolean)) return uebersetzt.join('/');
  }
  /* „Edelstahl 904L" → führendes bekanntes Wort gewinnt */
  var erstes = k.split(/[\s,]/)[0];
  return tabelle[erstes] || null;
}

function zustandNachChrono24(wert) {
  var k = kern(wert).toLowerCase();
  if (ZUSTAND[k]) return ZUSTAND[k];
  var treffer = Object.keys(ZUSTAND).filter(function (s) { return k.indexOf(s) === 0; });
  return treffer.length ? ZUSTAND[treffer.sort(function (a, b) { return b.length - a.length; })[0]] : null;
}

function preisFuerChrono24(betrag) {
  var p = Number(betrag);
  if (!isFinite(p) || p <= 0) return null;
  p = p * (1 + EINSTELLUNGEN.aufschlagProzent / 100) + EINSTELLUNGEN.aufschlagEuro;
  var stufe = EINSTELLUNGEN.rundenAuf;
  if (stufe > 0) p = Math.round(p / stufe) * stufe;
  return Math.round(p);
}

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    /* Steuerzeichen entfernen, sonst ist die Datei nicht wohlgeformt */
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function tag(name, wert) {
  if (wert == null || wert === '') return '';
  return '      <' + name + '>' + xmlEscape(wert) + '</' + name + '>\n';
}

/* ---------- Feed bauen ---------- */

function baueArtikel(p, kennungen, basis) {
  var f = p.f;
  var code = f.code;
  if (!code) return null;
  if (EINSTELLUNGEN.ausschluss.indexOf(code) !== -1) return null;
  if (String(f.chrono24 || '').trim().toLowerCase().match(/^(nein|no|aus|false|0)$/)) return null;
  if (EINSTELLUNGEN.nurUhren && !f.aufzug) return null;
  if (EINSTELLUNGEN.nurVerfuegbare && !p.verfuegbar) return null;

  var eigener = Number(EINSTELLUNGEN.preise[code]);
  var preis = eigener > 0 ? Math.round(eigener) : preisFuerChrono24(p.preis);
  if (!preis) return null;

  var lieferumfang = LIEFERUMFANG[String(f.lieferumfang || '').toLowerCase()] || null;
  var uhrId = kennungen[p.shopifyId];

  var x = '  <article>\n    <basic_information>\n';
  x += tag('article_id', code);
  x += tag('price', preis);
  /* Chrono24 kennt reservierte Uhren — sie bleiben sichtbar, aber gekennzeichnet. */
  if (/^(ja|yes|1|true)$/i.test(String(f.reserviert || '').trim())) x += tag('on_hold', 'yes');
  x += tag('availability', 'in stock');
  x += tag('brand', p.marke);
  x += tag('model', p.modell);
  x += tag('product_name', p.titel);
  x += tag('reference_number', f.referenz);
  x += tag('gender', uebersetze(f.geschlecht, GESCHLECHT));
  x += tag('condition', zustandNachChrono24(f.zustand));
  x += tag('taxation_scheme',
    String(f.besteuerung || '').toLowerCase().indexOf('differenz') === 0 ? 'margin' : 'regular');
  if (uhrId) x += tag('link', basis + '/produkt?id=' + uhrId);
  x += tag('description', p.beschreibung);
  x += '    </basic_information>\n';

  var werk = tag('movement_type', uebersetze(f.aufzug, AUFZUG)) + tag('caliber', f.kaliber);
  if (werk) x += '    <caliber>\n' + werk + '    </caliber>\n';

  var gehaeuse = tag('case_material', uebersetze(f.gehaeuse, MATERIAL)) +
    tag('case_diameter', kern(f.durchmesser)) +
    tag('crystal', uebersetze(f.glas, GLAS)) +
    tag('dial_color', uebersetze(f.zifferblatt, FARBE));
  if (gehaeuse) x += '    <case>\n' + gehaeuse + '    </case>\n';

  var band = tag('bracelet_material', uebersetze(f.band, MATERIAL));
  if (band) x += '    <bracelet>\n' + band + '    </bracelet>\n';

  var sonst = '';
  if (lieferumfang) {
    sonst += tag('original_papers', lieferumfang.papiere ? 'yes' : 'no');
    sonst += tag('original_box', lieferumfang.box ? 'yes' : 'no');
  }
  sonst += tag('year', f.baujahr);
  if (sonst) x += '    <miscellaneous>\n' + sonst + '    </miscellaneous>\n';

  var bilder = (p.bilder || []).slice(0, 16);
  if (bilder.length) {
    x += '    <images>\n';
    bilder.forEach(function (u) { x += tag('image', u); });
    x += '    </images>\n';
  }

  return x + '  </article>\n';
}

async function baueFeed(basis) {
  var produkte = await shop.holeBestand();
  var kennungen = await shop.holeKennungen(basis);
  var artikel = [];
  var ausgelassen = [];
  produkte.forEach(function (p) {
    var a = baueArtikel(p, kennungen, basis);
    if (a) artikel.push(a); else ausgelassen.push(p.titel);
  });
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!-- Hahn & Vo OHG — Warenbestand, erzeugt am ' + new Date().toISOString() + ' -->\n' +
    '<!-- ' + artikel.length + ' Artikel von ' + produkte.length + ' im Shop -->\n' +
    '<articles>\n' + artikel.join('') + '</articles>\n';
  return { xml: xml, anzahl: artikel.length, gesamt: produkte.length, ausgelassen: ausgelassen };
}

module.exports = async function handler(req, res) {
  var host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
  var basis = 'https://' + host;
  try {
    var ergebnis = await baueFeed(basis);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    /* Chrono24 ruft alle 12–24 h ab; eine Stunde Zwischenspeicher genügt. */
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(ergebnis.xml);
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(500).send('Feed konnte nicht erzeugt werden: ' + e.message);
  }
};

module.exports.baueFeed = baueFeed;
module.exports.EINSTELLUNGEN = EINSTELLUNGEN;
