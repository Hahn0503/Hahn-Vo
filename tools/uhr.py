#!/usr/bin/env python3
"""Uhren in Shopify anlegen, umstellen, löschen — als geführter Ablauf.

Das Skript übernimmt alles Deterministische: Prüfen der Eingaben, Bilder
ablegen und hochladen, die Shopify-Aufrufe Wort für Wort vorbereiten, Antworten
prüfen, Kennungen merken, Rückfalldatei bauen, committen, live gegenprüfen.

Die Shopify-Aufrufe selbst führt entweder Claude über den Shopify-Connector aus
(Standard) oder das Skript direkt, wenn in ~/.hv-tokens Zugangsdaten liegen
(SHOPIFY_ADMIN_TOKEN=shpat_… oder SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET).

Der Ablauf ist immer derselbe:

    python3 tools/uhr.py anlegen  arbeit/<name>        # plant aus arbeit/<name>/uhr.json
    python3 tools/uhr.py weiter   arbeit/<name>        # arbeitet, bis Shopify dran ist, druckt den Aufruf
    python3 tools/uhr.py ergebnis arbeit/<name> --datei antwort.json   # Antwort zurück, dann weiter

    python3 tools/uhr.py status   p567 verkauft|reserviert|erhaeltlich
    python3 tools/uhr.py preis    p567 3250 [--listenpreis 3450]
    python3 tools/uhr.py loeschen p567
    python3 tools/uhr.py bilder   p567 --reihenfolge 0,3,1,2 | --entfernen 3 | --hinzufuegen foto.jpg --position 1
    python3 tools/uhr.py pruefen  p567                 # Live-Stand + Kontaktbogen der Live-Bilder
    python3 tools/uhr.py frei     p567                 # Kennung noch frei?

status/preis/loeschen/bilder legen ihren Arbeitsordner selbst an (arbeit/_<aktion>-<id>)
und werden mit denselben Befehlen weiter/ergebnis abgearbeitet.

Die Regeln, die hier erzwungen werden, stehen in CLAUDE.md und
docs/PROBLEME-UND-LOESUNGEN.md — jede ist die Folge eines echten Fehlers.
"""
import argparse, csv, io, json, os, re, shutil, subprocess, sys, time, urllib.request, urllib.error
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'js', 'data.js')
IMGDIR = os.path.join(ROOT, 'assets', 'products')
ARBEIT = os.path.join(ROOT, 'arbeit')
DIFF_CSV = os.path.join(ROOT, 'daten', 'differenzbesteuerung.csv')
HINWEISE_JSON = os.path.join(ROOT, 'daten', 'hinweise.json')
ANFRAGE_JSON = os.path.join(ROOT, 'daten', 'anfrage-uhren.json')
# Shopify Payments verarbeitet keine Ware über 10.000 USD. Uhren darüber liegen
# in Shopify als Entwurf und stehen auf der Website „Per Überweisung" (aus
# daten/anfrage-uhren.json). Seit 06.09.2026, siehe docs/SYSTEM.md.
GRENZE_UEBERWEISUNG = 8500
SHOP_JS = os.path.join(ROOT, 'api', '_shop.js')
KATALOG_JS = os.path.join(ROOT, 'api', 'katalog.js')

SITE = 'https://hahn-vo.de'
KATALOG = SITE + '/api/katalog.json'
SHOP = 'tami1g-0j.myshopify.com'
API_VERSION = '2024-10'
LOCATION = 'gid://shopify/Location/111547416904'          # Showroom Frankfurt
PUBLICATIONS = [                                            # alle vier Vertriebskanäle
    'gid://shopify/Publication/298012246344',  # Onlineshop
    'gid://shopify/Publication/298105143624',  # Schaltfläche „Kaufen"
    'gid://shopify/Publication/298012377416',  # Point of Sale
    'gid://shopify/Publication/298012344648',  # Shop
]
BILDSATZ = 'Unsere Bilder sind unbearbeitet und zeigen jedes Detail – mehr, als das bloße Auge wahrnimmt.'
LIEFERSATZ = 'Der vollständige Lieferumfang ist auf den Bildern ersichtlich.'

# Auswahlfelder in Shopify (Metafeld-Definitionen, Namensraum „uhr"). Andere
# Werte lehnt Shopify ab — deshalb hier prüfen, bevor etwas rausgeht.
WAHL = {
    'aufzug': ['Automatik', 'Handaufzug', 'Quarz', 'Solar'],
    'zustand': ['Neu', 'Ungetragen', 'Sehr gut', 'Gut', 'Befriedigend', 'Defekt oder unvollständig'],
    # „Box & Revisionspapiere": Box ja, aber statt Originalpapieren nur ein
    # Service-/Revisionsbeleg vom Hersteller. Nicht als Full Set ausgeben
    # (Korrektur vom 14.09.2026, p349 Aqua Terra).
    'lieferumfang': ['Full Set (Box & Papiere)', 'Box & Revisionspapiere', 'Nur Papiere', 'Nur Box', 'Nur Uhr'],
    'besteuerung': ['Differenzbesteuerung', 'Regelbesteuerung'],
    'geschlecht': ['Herren', 'Damen', 'Unisex'],
    'glas': ['Saphirglas', 'Mineralglas', 'Plexiglas', 'Kunststoff'],
}
TEXTFELDER = ['referenz', 'durchmesser', 'gehaeuse', 'zifferblatt', 'band', 'kaliber']
PFLICHT = ['referenz', 'durchmesser', 'gehaeuse', 'zifferblatt', 'band', 'aufzug', 'zustand', 'lieferumfang', 'geschlecht']


# ---------------------------------------------------------------- Grundhilfen

def sag(*a):
    print(*a, flush=True)


def fehler(msg):
    sag('\nFEHLER: ' + msg)
    sys.exit(1)


def lies_json(p):
    with io.open(p, encoding='utf-8') as f:
        return json.load(f)


def schreib_json(p, d):
    with io.open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)


def git(*args, ok_fail=False):
    r = subprocess.run(['git', '-C', ROOT] + list(args), capture_output=True, text=True)
    if r.returncode != 0 and not ok_fail:
        fehler('git %s: %s' % (' '.join(args), (r.stderr or r.stdout).strip()[:400]))
    return r.stdout.strip()


def commit_und_push(pfade, nachricht):
    git('add', '--', *pfade)
    if not git('status', '--porcelain', '--', *pfade):
        sag('  nichts zu committen')
        return None
    git('commit', '-q', '-m', nachricht + '\n\nCo-Authored-By: Claude <noreply@anthropic.com>')
    git('push', '-q', 'origin', 'HEAD')
    return git('rev-parse', '--short', 'HEAD')


def http_json(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': 'hahn-vo-uhr', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def katalog_live(frisch=True):
    url = KATALOG + ('?frisch=%d' % int(time.time() * 1000) if frisch else '')
    return http_json(url)


def warte_auf_url(url, sekunden=240):
    start = time.time()
    while time.time() - start < sekunden:
        try:
            req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'hahn-vo-uhr'})
            with urllib.request.urlopen(req, timeout=20) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(10)
    return False


def marken():
    """Die verbindliche Markenliste aus api/_shop.js — eine Quelle, kein Duplikat."""
    t = io.open(SHOP_JS, encoding='utf-8').read()
    liste = []
    for m in re.finditer(r"\{\s*name:\s*'([^']+)',\s*alias:\s*\[([^\]]*)\]", t):
        aliasse = re.findall(r"'([^']+)'", m.group(2))
        liste.append((m.group(1), aliasse))
    return liste


def marke_erkennen(titel):
    klein = titel.lower().strip()
    beste = None
    for name, aliasse in marken():
        for a in aliasse:
            if klein.startswith(a) and (beste is None or len(a) > beste[1]):
                beste = (name, len(a))
    if not beste:
        return None, titel
    rest = titel[beste[1]:].strip().lstrip('-–—·, ').strip()
    return beste[0], rest


def slug(s):
    s = s.lower()
    for a, b in (('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss'), ('&', 'und')):
        s = s.replace(a, b)
    # Restliche Akzente auf den Grundbuchstaben zurückführen — sonst wird aus
    # „Française" das Handle „fran-aise" (gesehen am 16.09.2026).
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s


def datajs_text():
    return io.open(DATA, encoding='utf-8').read()


def shopify_map():
    m = re.search(r'window\.SHOPIFY\s*=\s*(\{[\s\S]*?\n\});', datajs_text())
    return json.loads(m.group(1)) if m else {'products': {}}


def shopify_map_schreiben(karte):
    """Nur Slice-Ersetzung — nie re.sub mit JSON als Ersatztext (Backslash-Falle)."""
    t = datajs_text()
    m = re.search(r'window\.SHOPIFY\s*=\s*(\{[\s\S]*?\n\});', t)
    if not m:
        fehler('window.SHOPIFY in js/data.js nicht gefunden')
    neu = 'window.SHOPIFY = ' + json.dumps(karte, ensure_ascii=False, indent=1) + ';'
    io.open(DATA, 'w', encoding='utf-8').write(t[:m.start()] + neu + t[m.end():])


def datajs_syntax():
    """Prüft, dass js/data.js noch lädt. Mit Node echt; ohne Node wenigstens,
    dass die beiden Blöcke, die wir schreiben, gültiges JSON sind."""
    if shutil.which('node'):
        r = subprocess.run(['node', '-e', "global.window={};require(%s);console.log('ok')" % json.dumps(DATA)],
                           capture_output=True, text=True)
        if 'ok' not in r.stdout:
            fehler('js/data.js ist nach dem Umbau kaputt: ' + (r.stderr or r.stdout)[:300])
        return
    t = datajs_text()
    for name in ('PRODUCTS', 'SHOPIFY'):
        m = re.search(r'window\.' + name + r'\s*=\s*([\[{][\s\S]*?\n[\]}]);', t)
        if not m:
            fehler('window.%s in js/data.js nicht gefunden' % name)
        try:
            json.loads(m.group(1))
        except Exception as e:
            fehler('window.%s in js/data.js ist kein gültiges JSON mehr: %s' % (name, e))


def fallback_bauen():
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'fallback_bauen.py')], capture_output=True, text=True)
    if r.returncode != 0:
        fehler('fallback_bauen.py: ' + (r.stderr or r.stdout)[-400:])
    sag('  ' + r.stdout.strip().replace('\n', '\n  '))
    datajs_syntax()


def anfrage_laden():
    return lies_json(ANFRAGE_JSON)


def anfrage_schreiben(d):
    # Gleiche Formatierung wie die Datei selbst (indent=1), damit Diffs klein bleiben.
    with io.open(ANFRAGE_JSON, 'w', encoding='utf-8') as f:
        f.write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')


def anfrage_eintrag(kennung):
    """Eintrag einer Uhr „per Überweisung" oder None."""
    for e in anfrage_laden().get('produkte', []):
        if e.get('id') == kennung:
            return e
    return None


def anfrage_aendern(kennung, **felder):
    d = anfrage_laden()
    for e in d['produkte']:
        if e.get('id') == kennung:
            e.update(felder)
            anfrage_schreiben(d)
            return e
    fehler('%s steht nicht in daten/anfrage-uhren.json' % kennung)


def bild_version(pfade):
    """Höchste ?v=-Nummer in einer Bildliste (0, wenn keine)."""
    v = 0
    for p in pfade or []:
        m = re.search(r'\?v=(\d+)', p)
        if m:
            v = max(v, int(m.group(1)))
    return v


def warte_frisch(kennung, ok, sekunden=300):
    """Nach einem Push: warten, bis das Deployment den neuen Stand ausliefert."""
    start = time.time()
    while time.time() - start < sekunden:
        p, _ = produkt_live(kennung, frisch=True)
        if ok(p):
            return True
        time.sleep(15)
    return False


def diff_tabelle():
    codes, refs = set(), set()
    if os.path.exists(DIFF_CSV):
        with io.open(DIFF_CSV, encoding='utf-8') as f:
            for z in csv.DictReader(f, delimiter=';'):
                if z.get('code'):
                    codes.add(z['code'].strip())
                if z.get('referenz'):
                    refs.add(re.sub(r'\s', '', z['referenz']).lower())
    return codes, refs


def kennung_pruefen(uhr_id):
    if not re.match(r'^p\d{3,4}$', uhr_id):
        fehler('Kennung muss p + 3–4 Ziffern sein (p567), nicht %r' % uhr_id)


def kennung_frei(uhr_id):
    """Frei heißt: weder in js/data.js noch live im Katalog noch als Bildordner vergeben."""
    gruende = []
    if uhr_id in shopify_map().get('products', {}):
        gruende.append('steht in js/data.js (window.SHOPIFY)')
    if os.path.isdir(os.path.join(IMGDIR, uhr_id)) and os.listdir(os.path.join(IMGDIR, uhr_id)):
        gruende.append('Bildordner assets/products/%s existiert' % uhr_id)
    try:
        live = katalog_live(True)
        if any(p['id'] == uhr_id for p in live['produkte']):
            gruende.append('live im Katalog')
    except Exception as e:
        gruende.append('Live-Katalog nicht erreichbar (%s) — nicht sicher prüfbar' % str(e)[:60])
    return gruende


def produkt_live(kennung, frisch=True):
    """Findet eine Uhr im Live-Katalog über Kennung (p567) oder internen Code (567-26)."""
    kat = katalog_live(frisch)
    for p in kat['produkte']:
        if p['id'] == kennung or (p.get('code') and p['code'] == kennung):
            return p, kat
    return None, kat


# ---------------------------------------------------------------- Shopify-Zugang (direkt, optional)

def tokens_laden():
    p = os.path.expanduser('~/.hv-tokens')
    d = {}
    if os.path.exists(p):
        for zeile in io.open(p, encoding='utf-8'):
            zeile = zeile.strip()
            if '=' in zeile and not zeile.startswith('#'):
                k, v = zeile.split('=', 1)
                d[k.strip()] = v.strip().strip('"').strip("'")
    return d


_TOKEN = None


def admin_token():
    """shpat_-Token direkt, oder per Client-Credentials aus einer Dev-Dashboard-App
    (die App muss im Dev-Dashboard des Shop-Inhabers angelegt und im Shop
    installiert sein; das Token gilt 24 Stunden und wird je Lauf neu geholt)."""
    global _TOKEN
    if _TOKEN:
        return _TOKEN
    t = tokens_laden()
    if t.get('SHOPIFY_ADMIN_TOKEN', '').startswith('shpat_'):
        _TOKEN = t['SHOPIFY_ADMIN_TOKEN']
        return _TOKEN
    if t.get('SHOPIFY_CLIENT_ID') and t.get('SHOPIFY_CLIENT_SECRET'):
        body = json.dumps({'client_id': t['SHOPIFY_CLIENT_ID'], 'client_secret': t['SHOPIFY_CLIENT_SECRET'],
                           'grant_type': 'client_credentials'}).encode()
        req = urllib.request.Request('https://%s/admin/oauth/access_token' % SHOP, data=body,
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                _TOKEN = json.load(r)['access_token']
                return _TOKEN
        except urllib.error.HTTPError as e:
            fehler('Shopify-Token per Client-Credentials abgelehnt (HTTP %d): %s' % (e.code, e.read()[:200]))
    return None


def shopify_direkt(query):
    tok = admin_token()
    body = json.dumps({'query': query}).encode()
    req = urllib.request.Request('https://%s/admin/api/%s/graphql.json' % (SHOP, API_VERSION), data=body,
                                 headers={'Content-Type': 'application/json', 'X-Shopify-Access-Token': tok})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


# ---------------------------------------------------------------- GraphQL bauen

def gq(s):
    """String als GraphQL-Literal (JSON-Escaping ist kompatibel)."""
    return json.dumps(str(s), ensure_ascii=False)


def metafelder_literal(felder, code, besteuerung, hinweis=None, garantie=None):
    teile = []
    for k, v in felder.items():
        if v in (None, ''):
            continue
        typ = 'number_integer' if k == 'baujahr' else 'single_line_text_field'
        teile.append('{namespace: "uhr", key: %s, type: "%s", value: %s}' % (gq(k), typ, gq(v)))
    teile.append('{namespace: "uhr", key: "code", type: "single_line_text_field", value: %s}' % gq(code))
    teile.append('{namespace: "uhr", key: "besteuerung", type: "single_line_text_field", value: %s}' % gq(besteuerung))
    # Freier Zusatz von Hannes. Der Fliesstext aus Shopify wird auf der
    # Produktseite absichtlich nicht gezeigt — nur dieses Feld erscheint dort
    # sichtbar unter „Besonderheiten".
    if hinweis:
        teile.append('{namespace: "uhr", key: "hinweis", type: "multi_line_text_field", value: %s}' % gq(hinweis))
    # Garantie in Monaten, nur wenn sie von den üblichen 12 abweicht (Metafeld uhr.garantie).
    if garantie and int(garantie) != 12:
        teile.append('{namespace: "uhr", key: "garantie", type: "number_integer", value: "%d"}' % int(garantie))
    return '[' + ', '.join(teile) + ']'


def m_product_create(u):
    tags = '[' + ', '.join(gq(t) for t in u['tags']) + ']'
    # Uhren „per Überweisung" als Entwurf: nicht in Storefront und Kasse (Shopify Trust & Safety).
    status = 'DRAFT' if u.get('ueberweisung') else 'ACTIVE'
    vorlage = ('mutation { productCreate(product: { title: %s, vendor: %s, productType: %s, status: ' + status + ', tags: %s, '
               'descriptionHtml: %s, metafields: %s }) { product { id title variants(first: 1) { nodes { id inventoryItem { id } } } } '
               'userErrors { field message } } }')
    return (vorlage
            % (gq(u['titel']), gq(u['marke']), gq(u['produkttyp']), tags, gq(u['beschreibung_html']),
               metafelder_literal(u['felder'], u['code'], u['besteuerung'], u.get('hinweis'), u.get('garantie_monate'))))


def m_einrichten(u, ids):
    pubs = ', '.join('{publicationId: "%s"}' % p for p in PUBLICATIONS)
    listen = (', compareAtPrice: "%.2f"' % u['listenpreis']) if u.get('listenpreis') else ''
    return ('mutation {\n'
            '  h: productUpdate(product: {id: "%s", handle: %s}) { product { handle } userErrors { message } }\n'
            '  v: productVariantsBulkUpdate(productId: "%s", variants: [{id: "%s", price: "%.2f"%s, taxable: %s, '
            'inventoryItem: {sku: %s, tracked: true}, inventoryPolicy: DENY}]) { productVariants { sku price taxable } userErrors { message } }\n'
            '%s'
            '  i: %s\n}'
            % (ids['product'], gq(u['handle']), ids['product'], ids['variant'], u['preis'], listen,
               'true' if u['taxable'] else 'false', gq(u['sku']),
               # Uhren „per Überweisung" bleiben Entwurf: in keinen Verkaufskanal (Shopify Trust & Safety)
               '' if u.get('ueberweisung') else
               '  p: publishablePublish(id: "%s", input: [%s]) { userErrors { message } }\n' % (ids['product'], pubs),
               m_inventory(ids['inventoryItem'], 1)[len('mutation { '):-2]))


def m_create_media(product_id, eintraege):
    """Bilder anhängen — über productUpdate(media:), das nicht veraltet ist
    (productCreateMedia gilt als deprecated). Shopify lädt die Bilder von der
    angegebenen Adresse; die liegt auf hahn-vo.de, nicht bei Kleinanzeigen."""
    teile = ', '.join('{originalSource: %s, mediaContentType: IMAGE, alt: %s}' % (gq(url), gq(alt)) for url, alt in eintraege)
    return ('mutation { productUpdate(product: {id: "%s"}, media: [%s]) { product { media(first: 30) { nodes { id status alt } } } '
            'userErrors { field message } } }' % (product_id, teile))


def q_media(product_id):
    return ('{ product(id: "%s") { media(first: 30) { nodes { id status alt ... on MediaImage { image { url } } } } } }' % product_id)


def q_lager(product_id):
    return ('{ product(id: "%s") { id title variants(first: 1) { nodes { id sku price inventoryQuantity inventoryItem { id tracked } } } '
            'reserviert: metafield(namespace: "uhr", key: "reserviert") { value } } }' % product_id)


def q_bestellungen():
    return ('{ orders(first: 50, sortKey: CREATED_AT, reverse: true) { nodes { name lineItems(first: 10) { nodes { product { id } } } } } }')


def m_inventory(inventory_item_id, delta):
    """Bestand um delta verändern (nicht absolut setzen): inventoryAdjustQuantities
    ist über alle API-Versionen stabil, inventorySetQuantities hat seine
    Vergleichsfelder mehrfach umbenannt."""
    return ('mutation { inventoryAdjustQuantities(input: {name: "available", reason: "correction", '
            'changes: [{inventoryItemId: "%s", locationId: "%s", delta: %d}]}) '
            '{ inventoryAdjustmentGroup { changes { name delta quantityAfterChange } } userErrors { field message } } }'
            % (inventory_item_id, LOCATION, delta))


def m_reserviert_setzen(product_id):
    return ('mutation { metafieldsSet(metafields: [{ownerId: "%s", namespace: "uhr", key: "reserviert", '
            'type: "single_line_text_field", value: "Ja"}]) { metafields { key value } userErrors { field message } } }' % product_id)


def m_reserviert_loeschen(product_id):
    return ('mutation { metafieldsDelete(metafields: [{ownerId: "%s", namespace: "uhr", key: "reserviert"}]) '
            '{ deletedMetafields { key } userErrors { message } } }' % product_id)


def m_preis(product_id, variant_id, preis, listenpreis):
    listen = (', compareAtPrice: "%.2f"' % listenpreis) if listenpreis else ', compareAtPrice: null'
    return ('mutation { productVariantsBulkUpdate(productId: "%s", variants: [{id: "%s", price: "%.2f"%s}]) '
            '{ productVariants { price compareAtPrice } userErrors { message } } }' % (product_id, variant_id, preis, listen))


def m_delete(product_id):
    return 'mutation { productDelete(input: {id: "%s"}) { deletedProductId userErrors { message } } }' % product_id


def m_reorder(product_id, moves):
    mv = ', '.join('{id: "%s", newPosition: "%d"}' % (mid, pos) for mid, pos in moves)
    return 'mutation { productReorderMedia(id: "%s", moves: [%s]) { job { id done } mediaUserErrors { field message } } }' % (product_id, mv)


def m_delete_media(product_id, media_ids):
    """Medien löschen über fileDelete (productDeleteMedia ist deprecated)."""
    ids = ', '.join('"%s"' % m for m in media_ids)
    return 'mutation { fileDelete(fileIds: [%s]) { deletedFileIds userErrors { field message } } }' % ids


# ---------------------------------------------------------------- Antworten prüfen

def daten_von(antwort):
    if isinstance(antwort, dict) and 'data' in antwort and isinstance(antwort['data'], dict):
        if antwort.get('errors'):
            fehler('Shopify meldet Fehler: ' + json.dumps(antwort['errors'], ensure_ascii=False)[:500])
        return antwort['data']
    if isinstance(antwort, dict) and antwort.get('errors'):
        fehler('Shopify meldet Fehler: ' + json.dumps(antwort['errors'], ensure_ascii=False)[:500])
    return antwort


def user_errors(d):
    """Sammelt userErrors/mediaUserErrors aus allen Aliassen einer Antwort."""
    gefunden = []
    if isinstance(d, dict):
        for k, v in d.items():
            if k in ('userErrors', 'mediaUserErrors') and v:
                gefunden.extend(v)
            elif isinstance(v, (dict, list)):
                gefunden.extend(user_errors(v))
    elif isinstance(d, list):
        for x in d:
            gefunden.extend(user_errors(x))
    return gefunden


def pruefe_keine_fehler(d, wo):
    ue = user_errors(d)
    if ue:
        fehler('%s: Shopify lehnt ab — %s' % (wo, json.dumps(ue, ensure_ascii=False)[:500]))


# ---------------------------------------------------------------- Zustand / Ablauf

def zustand_laden(ordner):
    p = os.path.join(ordner, 'zustand.json')
    if not os.path.exists(p):
        fehler('Kein Ablauf in %s — erst „anlegen", „status", „loeschen" oder „bilder" ausführen.' % ordner)
    return lies_json(p)


def zustand_speichern(ordner, z):
    schreib_json(os.path.join(ordner, 'zustand.json'), z)


def schritt_anlegen(name, art, hinweis=''):
    return {'name': name, 'art': art, 'erledigt': False, 'hinweis': hinweis}


def naechster_offener(z):
    for s in z['schritte']:
        if not s['erledigt']:
            return s
    return None


def weiter(ordner, direkt=False):
    z = zustand_laden(ordner)
    while True:
        s = naechster_offener(z)
        if not s:
            sag('\nAlle Schritte erledigt. ' + z.get('abschluss', ''))
            return
        sag('\n── Schritt: %s' % s['name'])
        if s['art'] == 'skript':
            SCHRITTE[s['name']](ordner, z, s)
            s['erledigt'] = True
            zustand_speichern(ordner, z)
            continue
        # Shopify-Schritt: Aufruf bauen
        text = SCHRITTE[s['name']](ordner, z, s)
        if text is None:          # Schritt hat sich selbst als überflüssig erklärt
            s['erledigt'] = True
            zustand_speichern(ordner, z)
            continue
        s['graphql'] = text
        zustand_speichern(ordner, z)
        if direkt or os.environ.get('HV_DIREKT') == '1':
            if not admin_token():
                fehler('Direktmodus ohne Zugangsdaten in ~/.hv-tokens (SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET).')
            sag('  führe direkt aus …')
            antwort = shopify_direkt(text)
            ergebnis_verarbeiten(ordner, z, s, antwort)
            continue
        werkzeug = 'graphql_query' if s['art'] == 'query' else 'graphql_mutation'
        sag('\nJETZT ÜBER DEN SHOPIFY-CONNECTOR AUSFÜHREN (%s), Antwort unverändert als JSON in eine Datei schreiben und zurückgeben:' % werkzeug)
        sag('\n' + text + '\n')
        sag('Danach:  python3 tools/uhr.py ergebnis %s --datei antwort.json' % os.path.relpath(ordner, ROOT))
        if s.get('hinweis'):
            sag('Hinweis: ' + s['hinweis'])
        return


def ergebnis_verarbeiten(ordner, z, s, antwort):
    handler = ANTWORTEN.get(s['name'])
    offen = handler(ordner, z, s, daten_von(antwort)) if handler else False
    if offen:
        # Schritt bleibt offen (z. B. Medien noch in Verarbeitung)
        zustand_speichern(ordner, z)
        return
    s['antwort'] = antwort
    s['erledigt'] = True
    zustand_speichern(ordner, z)


def ergebnis(ordner, text=None, datei=None, direkt=False):
    z = zustand_laden(ordner)
    s = naechster_offener(z)
    if not s or s['art'] == 'skript':
        fehler('Es wartet gerade kein Shopify-Schritt auf eine Antwort.')
    if datei:
        roh = io.open(datei, encoding='utf-8').read()
    elif text:
        roh = text
    else:
        roh = sys.stdin.read()
    roh = roh.strip()
    try:
        antwort = json.loads(roh)
    except Exception:
        # Manche Werkzeuge liefern Text drumherum — den ersten JSON-Block herausschneiden
        m = re.search(r'\{[\s\S]*\}', roh)
        if not m:
            fehler('Antwort ist kein JSON.')
        antwort = json.loads(m.group(0))
    ergebnis_verarbeiten(ordner, z, s, antwort)
    weiter(ordner, direkt)


# ---------------------------------------------------------------- Anlegen: Eingabe prüfen

def uhr_laden_und_pruefen(ordner):
    inserat = lies_json(os.path.join(ordner, 'inserat.json'))
    pfad = os.path.join(ordner, 'uhr.json')
    if not os.path.exists(pfad):
        fehler('%s fehlt — Beschreibung lesen und die Felder ausfüllen (Vorlage: docs/uhr.beispiel.json).' % pfad)
    u = lies_json(pfad)
    probleme = []

    # Kennung, Code
    kennung_pruefen(u.get('id', ''))
    # Formate: „427", „567-26", seit 30.09.2026 auch „K-600" (von Hannes so vergeben)
    if not re.match(r'^(\d{3,4}(-\d{2})?|[A-Z]-\d{3,4})$', str(u.get('code', ''))):
        probleme.append('code muss Hannes\' Artikelnummer sein: „427", „567-26" oder „K-600", nicht %r' % u.get('code'))
    gruende = kennung_frei(u['id'])
    if gruende:
        probleme.append('Kennung %s ist nicht frei: %s' % (u['id'], '; '.join(gruende)))

    # Titel und Marke
    titel = (u.get('titel') or '').strip()
    if not titel:
        probleme.append('titel fehlt')
    marke, modell = marke_erkennen(titel)
    if not marke:
        probleme.append('Marke am Titelanfang nicht erkannt („%s"). Titel muss mit der Marke beginnen; '
                        'neue Marke zuerst in api/_shop.js (MARKEN) eintragen, sonst fehlt die Uhr im Markenfilter.' % titel[:40])
    u['marke'] = marke
    u['modell'] = modell

    # Preis
    try:
        u['preis'] = int(u['preis'])
        if u['preis'] <= 0:
            raise ValueError
    except Exception:
        probleme.append('preis muss eine ganze Zahl in Euro sein')
    if inserat.get('preis') and u.get('preis') and u['preis'] != inserat['preis'] and not u.get('preis_begruendung'):
        probleme.append('preis %s weicht vom Inserat (%s) ab — wenn gewollt, "preis_begruendung" eintragen' % (u['preis'], inserat['preis']))
    if u.get('listenpreis'):
        u['listenpreis'] = int(u['listenpreis'])
        if u['listenpreis'] <= u['preis']:
            probleme.append('listenpreis muss über dem Preis liegen (sonst weglassen)')

    # Felder
    felder = u.get('felder') or {}
    for k in PFLICHT:
        if not felder.get(k):
            probleme.append('felder.%s fehlt' % k)
    for k, erlaubt in WAHL.items():
        if k == 'besteuerung':
            continue
        v = felder.get(k)
        if v and v not in erlaubt:
            probleme.append('felder.%s = %r ist nicht erlaubt; erlaubt: %s' % (k, v, ' | '.join(erlaubt)))
    if felder.get('baujahr') not in (None, ''):
        try:
            felder['baujahr'] = int(felder['baujahr'])
            if not 1900 <= felder['baujahr'] <= 2030:
                probleme.append('felder.baujahr außerhalb 1900–2030')
        except Exception:
            probleme.append('felder.baujahr muss eine Jahreszahl sein — bei „ca." oder unbekannt: weglassen, nicht schätzen')
    u['felder'] = felder

    # Besteuerung: Dreistufenregel gegen die Angabe prüfen
    text = (inserat.get('beschreibung') or '') + ' ' + ' '.join(u.get('absaetze') or [])
    codes, refs = diff_tabelle()
    ref_norm = re.sub(r'\s', '', str(felder.get('referenz') or '')).lower()
    if re.search(r'§\s*25\s*a|differenzbesteuer', text, re.I):
        empfehlung, grund = 'Differenzbesteuerung', '§ 25a steht im Inseratstext'
    elif str(u.get('code')) in codes or (ref_norm and ref_norm in refs):
        empfehlung, grund = 'Differenzbesteuerung', 'Code/Referenz steht in daten/differenzbesteuerung.csv'
    else:
        empfehlung, grund = 'Regelbesteuerung', 'weder § 25a im Text noch in der Diff-Tabelle'
    if u.get('besteuerung') not in WAHL['besteuerung']:
        probleme.append('besteuerung muss Differenzbesteuerung oder Regelbesteuerung sein')
    elif u['besteuerung'] != empfehlung and not u.get('besteuerung_begruendung'):
        probleme.append('besteuerung %s widerspricht der Regel (%s → %s). Wenn bewusst: "besteuerung_begruendung" eintragen.'
                        % (u['besteuerung'], grund, empfehlung))
    u['besteuerung_regel'] = '%s (%s)' % (empfehlung, grund)
    u['taxable'] = (u.get('besteuerung') == 'Regelbesteuerung')

    # Beschreibung
    abs_ = [a.strip() for a in (u.get('absaetze') or []) if a and a.strip()]
    if not abs_:
        probleme.append('absaetze fehlen (1–2 Absätze in ganzen Sätzen, aus dem Inserat, ohne Erfindungen)')
    ganz = ' '.join(abs_)
    if re.search(r'\(Optional|Platzhalter|Lorem', ganz, re.I):
        probleme.append('Platzhaltertext in den Absätzen')
    if marke and marke.lower() not in ganz.lower():
        probleme.append('Die Marke „%s" kommt in der Beschreibung nicht vor — Text passt nicht zur Uhr?' % marke)
    fremde = [n for n, _ in marken() if n != marke and re.search(r'\b' + re.escape(n) + r'\b', ganz)]
    if fremde:
        sag('  WARNUNG: fremde Markennamen im Text: %s — bitte bewusst prüfen (Vorlagen-Fehler wie „Rolex GMT" bei einer Omega!)' % ', '.join(fremde))
    if BILDSATZ.split(' ')[0] in ganz and 'unbearbeitet' in ganz:
        probleme.append('Den Satz „Unsere Bilder sind unbearbeitet …" nicht selbst schreiben — das Skript hängt ihn an')
    if 'Verwendungszweck' in ganz:
        probleme.append('Die Überweisungszeile nicht selbst schreiben — das Skript hängt sie an')
    # "herstellerbild": true — das Inserat hat nur ein Werbebild des Herstellers.
    # Dann wären „Unsere Bilder sind unbearbeitet …" und „Lieferumfang auf den
    # Bildern" falsch; beide Sätze entfallen (30.09.2026, Tudor/Rolex K-600/601).
    if abs_ and not u.get('herstellerbild'):
        abs_[0] = abs_[0].rstrip() + ' ' + BILDSATZ
        if 'Lieferumfang' not in abs_[-1]:
            abs_[-1] = abs_[-1].rstrip() + ' ' + LIEFERSATZ
    u['beschreibung_html'] = ''.join('<p>%s</p>' % a for a in abs_) + \
        '<p><strong>Bei Zahlung per Überweisung bitte als Verwendungszweck angeben: %s</strong></p>' % u.get('code')

    # Bilder
    b = u.get('bilder') or {}
    reihe = b.get('reihenfolge')
    vorhanden = len(inserat.get('bilder') or [])
    if not isinstance(reihe, list) or len(reihe) < 1:
        probleme.append('bilder.reihenfolge fehlt (Liste der Positionen aus dem Kontaktbogen, Cover zuerst)')
    else:
        if any((not isinstance(x, int)) or x < 0 or x >= vorhanden for x in reihe):
            probleme.append('bilder.reihenfolge enthält Positionen, die es nicht gibt (0–%d)' % (vorhanden - 1))
        if len(set(reihe)) != len(reihe):
            probleme.append('bilder.reihenfolge enthält eine Position doppelt')
        if len(reihe) < 2:
            sag('  WARNUNG: nur ein Bild — kein Hover-Bild auf der Shop-Karte')
    if reihe and len(reihe) == 1:
        pass   # nur ein Bild: kein zweites, also nichts zu prüfen
    elif b.get('zweites') not in ('set', 'front'):
        probleme.append('bilder.zweites muss "set" oder "front" sein — die Regel: zweites Bild ist das Set-Foto oder ein weiteres Frontbild')
    if not b.get('cover_ist_front', False):
        probleme.append('bilder.cover_ist_front muss true sein — bestätige nach Blick auf den Kontaktbogen, dass Position %s eine frontale Zifferblattansicht ist' % (reihe[0] if reihe else '?'))
    if b.get('zweites') == 'front' and not b.get('zweites_ist_front', False):
        probleme.append('bilder.zweites_ist_front muss true sein — steile Schrägaufnahmen sind KEINE Frontbilder (Fehler vom 04.09.)')

    if probleme:
        fehler('uhr.json hat %d Problem(e):\n  - ' % len(probleme) + '\n  - '.join(probleme))

    # Abgeleitete Werte
    u['handle'] = slug(' '.join(titel.split()[:6])) + '-' + u['id']
    u['sku'] = 'HV-' + u['id'].upper()
    u['produkttyp'] = 'Armbanduhr' if felder.get('aufzug') else 'Zubehör'
    tags = [marke, felder.get('referenz'), str(felder.get('baujahr') or ''), felder.get('zustand')]
    u['tags'] = [t for t in tags if t]
    alts = b.get('alt') or {}
    kurz = ' '.join(titel.split()[:4])
    # Über der Grenze: Entwurf in Shopify, Website „Per Überweisung".
    # In uhr.json überschreibbar mit "ueberweisung": true/false.
    if 'ueberweisung' in u:
        u['ueberweisung'] = bool(u['ueberweisung'])
    else:
        u['ueberweisung'] = bool(u.get('preis')) and u['preis'] > GRENZE_UEBERWEISUNG

    u['alt_texte'] = []
    for neu, alt_pos in enumerate(reihe):
        if str(neu) in alts:
            bez = alts[str(neu)]
        elif neu == 0:
            bez = 'Frontansicht'
        elif neu == 1:
            bez = 'Set mit Box und Papieren' if b['zweites'] == 'set' else 'Frontansicht 2'
        else:
            bez = 'Ansicht %d' % neu
        u['alt_texte'].append('%s %s' % (kurz, bez))
    return u, inserat


# ---------------------------------------------------------------- Schritte: Anlegen

def s_eingabe(ordner, z, s):
    u, inserat = uhr_laden_und_pruefen(ordner)
    z['uhr'] = u
    sag('  Kennung %s · Code %s · %s · %d € · %s' % (u['id'], u['code'], u['titel'], u['preis'], u['besteuerung']))
    sag('  Besteuerungsregel: ' + u['besteuerung_regel'])
    sag('  Handle %s · SKU %s · %d Bilder' % (u['handle'], u['sku'], len(u['bilder']['reihenfolge'])))


def s_bilder_ablegen(ordner, z, s):
    from PIL import Image
    u = z['uhr']
    ziel = os.path.join(IMGDIR, u['id'])
    if os.path.isdir(ziel):
        shutil.rmtree(ziel)
    os.makedirs(ziel)
    for neu, alt_pos in enumerate(u['bilder']['reihenfolge']):
        quelle = os.path.join(ordner, 'bilder', '%02d.jpg' % alt_pos)
        im = Image.open(quelle).convert('RGB')
        im.thumbnail((1600, 1600), Image.LANCZOS)
        im.save(os.path.join(ziel, '%d.jpg' % neu), quality=86, optimize=True, progressive=True)
    z['bild_urls'] = ['%s/assets/products/%s/%d.jpg' % (SITE, u['id'], i) for i in range(len(u['bilder']['reihenfolge']))]
    sag('  %d Bilder in assets/products/%s/ (Cover = 0.jpg, Hover = 1.jpg)' % (len(z['bild_urls']), u['id']))


def s_bilder_pushen(ordner, z, s):
    u = z['uhr']
    rev = commit_und_push(['assets/products/' + u['id']], 'Bilder für %s (%s)' % (u['id'], u['titel'][:50]))
    sag('  gepusht' + (' (%s)' % rev if rev else ''))
    sag('  warte, bis Vercel die Bilder ausliefert …')
    if not warte_auf_url(z['bild_urls'][0], 300):
        fehler('Bild %s ist nach 5 Minuten nicht erreichbar — Vercel-Deployment prüfen (vercel.com → hahn-vo-df1c).' % z['bild_urls'][0])
    sag('  Bilder sind öffentlich erreichbar')


def s_product_create(ordner, z, s):
    return m_product_create(z['uhr'])


def a_product_create(ordner, z, s, d):
    pruefe_keine_fehler(d, 'productCreate')
    p = d['productCreate']['product']
    v = p['variants']['nodes'][0]
    z['ids'] = {'product': p['id'], 'variant': v['id'], 'inventoryItem': v['inventoryItem']['id']}
    z['uhr']['shopifyId'] = p['id'].split('/')[-1]
    sag('  angelegt: %s' % p['id'])


def s_einrichten(ordner, z, s):
    return m_einrichten(z['uhr'], z['ids'])


def a_einrichten(ordner, z, s, d):
    pruefe_keine_fehler(d, 'einrichten')
    v = (d.get('v') or {}).get('productVariants') or [{}]
    sag('  Handle %s · SKU %s · Preis %s · taxable %s' % ((d.get('h') or {}).get('product', {}).get('handle'),
                                                        v[0].get('sku'), v[0].get('price'), v[0].get('taxable')))


def s_medien(ordner, z, s):
    u = z['uhr']
    return m_create_media(z['ids']['product'], list(zip(z['bild_urls'], u['alt_texte'])))


def a_medien(ordner, z, s, d):
    pruefe_keine_fehler(d, 'Bilder anhängen')
    medien = d['productUpdate']['product']['media']['nodes']
    if len(medien) != len(z['bild_urls']):
        fehler('Shopify hat %d statt %d Medien angenommen' % (len(medien), len(z['bild_urls'])))
    sag('  %d Medien angenommen, Status: %s' % (len(medien), ', '.join(m.get('status', '?') for m in medien)))


def s_medien_pruefen(ordner, z, s):
    s['hinweis'] = 'Wenn noch PROCESSING gemeldet wird, wartet das Skript und bittet erneut um dieselbe Abfrage.'
    return q_media(z['ids']['product'])


def a_medien_pruefen(ordner, z, s, d):
    medien = d['product']['media']['nodes']
    stati = [m.get('status') for m in medien]
    if any(st == 'FAILED' for st in stati):
        kaputt = [m['id'] for m in medien if m.get('status') == 'FAILED']
        fehler('Medien FAILED: %s — Ursache meist eine falsche Bild-URL. Fehlgeschlagene löschen:\n%s\nund productCreateMedia für die betroffenen Bilder wiederholen.'
               % (kaputt, m_delete_media(z['ids']['product'], kaputt)))
    if any(st == 'PROCESSING' for st in stati):
        sag('  noch in Verarbeitung — 20 s warten, dann dieselbe Abfrage erneut')
        time.sleep(20)
        return True
    if len(medien) != len(z['bild_urls']):
        fehler('%d Medien am Produkt, erwartet %d' % (len(medien), len(z['bild_urls'])))
    z['media_ids'] = [m['id'] for m in medien]
    sag('  alle %d Medien READY' % len(medien))
    return False


def anfrage_eintrag_bauen(u, z):
    """Website-Eintrag einer Uhr „per Überweisung" — dieselbe Form wie die
    übrigen Einträge in daten/anfrage-uhren.json."""
    f = u['felder']
    absaetze = re.findall(r'<p>(.*?)</p>', u['beschreibung_html'], re.S)
    absaetze = [re.sub(r'<[^>]+>', '', a).strip() for a in absaetze]
    absaetze = [a for a in absaetze if a and 'Verwendungszweck' not in a]
    # Der Bildsatz steht in den übrigen Einträgen als eigener Absatz.
    text = '\n\n'.join(absaetze).replace(' ' + BILDSATZ, '\n\n' + BILDSATZ + '\n\n').replace('\n\n\n\n', '\n\n')
    return {
        'id': u['id'], 'brand': u['marke'], 'name': u['modell'], 'ref': f.get('referenz'),
        'price': u['preis'], 'listPrice': u.get('listenpreis'), 'status': 'anfrage',
        'category': 'uhren' if f.get('aufzug') else 'zubehoer',
        'fullset': f.get('lieferumfang'), 'rating': f.get('zustand'),
        'year': str(f['baujahr']) if f.get('baujahr') else None,
        'size': f.get('durchmesser'), 'material': f.get('gehaeuse'), 'dial': f.get('zifferblatt'),
        'strap': f.get('band'), 'movement': f.get('aufzug'), 'caliber': f.get('kaliber'), 'glass': f.get('glas'),
        'gender': f.get('geschlecht'), 'tax': u['besteuerung'], 'sku': u['sku'], 'code': u['code'],
        'added': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'desc': text.strip(),
        'note': u.get('hinweis') or None,
        'warranty': int(u['garantie_monate']) if u.get('garantie_monate') else None,
        'images': ['assets/products/%s/%d.jpg' % (u['id'], i) for i in range(len(z['bild_urls']))],
        'shopifyId': u['shopifyId'],
    }


def s_kennung(ordner, z, s):
    u = z['uhr']
    karte = shopify_map()
    karte.setdefault('products', {})[u['id']] = u['shopifyId']
    shopify_map_schreiben(karte)
    datajs_syntax()
    sag('  %s → %s in js/data.js eingetragen' % (u['id'], u['shopifyId']))
    pfade = ['js/data.js']
    if u.get('ueberweisung'):
        d = anfrage_laden()
        d['produkte'] = [e for e in d['produkte'] if e.get('id') != u['id']] + [anfrage_eintrag_bauen(u, z)]
        anfrage_schreiben(d)
        pfade.append('daten/anfrage-uhren.json')
        sag('  „Per Überweisung": Eintrag in daten/anfrage-uhren.json (Shopify bleibt Entwurf)')
    fallback_bauen()
    # fallback_bauen() baut js/data.js aus dem DEPLOYTEN Katalog neu. Der kennt
    # eine Überweisungs-Uhr erst nach dem Push — ihre Zuordnung fiele sonst
    # wieder heraus (gesehen 30.09.2026 bei p601). Deshalb danach erneut setzen.
    karte = shopify_map()
    if karte.get('products', {}).get(u['id']) != u['shopifyId']:
        karte.setdefault('products', {})[u['id']] = u['shopifyId']
        shopify_map_schreiben(karte)
        datajs_syntax()
    # Sofort pushen: Die Live-Prüfung liest die Zuordnung vom DEPLOYTEN Stand.
    # Früher fehlte die Uhr dort jedes Mal („Uhr fehlt") und musste von Hand nachgeschoben werden.
    rev = commit_und_push(pfade, 'Zuordnung %s (%s)' % (u['id'], u['titel'][:50]))
    sag('  gepusht (%s), warte auf das Deployment …' % (rev or '—'))


def live_pruefung(erwartet_id, pruef, max_sekunden=420):
    """Erst mit Cache-Umgehung (schnelle Bestätigung), dann so, wie Besucher es sehen."""
    start = time.time()
    p, _ = produkt_live(erwartet_id, frisch=True)
    if not pruef(p):
        fehler('Live-Katalog (ohne Zwischenspeicher) zeigt nicht den erwarteten Stand: %s' % (json.dumps({k: p.get(k) for k in ('id', 'status', 'price')}, ensure_ascii=False) if p else 'Uhr fehlt'))
    sag('  ohne Zwischenspeicher: passt')
    while time.time() - start < max_sekunden:
        p, _ = produkt_live(erwartet_id, frisch=False)
        if pruef(p):
            sag('  für Besucher sichtbar: passt')
            return p
        sag('  Besucher sehen noch den alten Stand (Zwischenspeicher bis 5 min) — warte 30 s')
        time.sleep(30)
    sag('  WARNUNG: Zwischenspeicher nach %d s noch alt — Stand ist gesetzt, wird aber verzögert sichtbar' % max_sekunden)
    return p


def s_live(ordner, z, s):
    u = z['uhr']
    erwartet = 'anfrage' if u.get('ueberweisung') else 'available'
    def ok(p):
        return bool(p) and p['status'] == erwartet and p['price'] == u['preis'] and len(p.get('images') or []) == len(z['bild_urls'])
    warte_frisch(u['id'], ok)
    p = live_pruefung(u['id'], ok)
    # Marke im Filter?
    _, kat = produkt_live(u['id'], frisch=True)
    marken_live = {x['brand'] for x in kat['produkte'] if x['status'] != 'sold'}
    if u['marke'] not in marken_live:
        fehler('Marke „%s" taucht im Live-Katalog nicht auf — MARKEN-Liste in api/_shop.js prüfen' % u['marke'])
    sag('  live: %s · %s · %d € · %d Bilder · Marke „%s" im Filter' % (p['id'], p['status'], p['price'], len(p['images']), p['brand']))


def s_abschluss(ordner, z, s):
    u = z['uhr']
    rev = commit_und_push(['js/data.js', 'daten/anfrage-uhren.json'], 'Neu: %s (%s), %d EUR' % (u['titel'][:60], u['id'], u['preis']))
    z['abschluss'] = ('%s ist live: %s/produkt?id=%s · %d € · %s' % (u['titel'], SITE, u['id'], u['preis'], u['besteuerung']) +
                      (' · PER ÜBERWEISUNG (über %d €: Shopify-Entwurf, kein Warenkorb)' % GRENZE_UEBERWEISUNG if u.get('ueberweisung') else '') +
                      ' · Commit %s. Hover-Bild und Cover jetzt auf der Live-Seite ansehen (python3 tools/uhr.py pruefen %s).'
                      % (rev or '—', u['id']))


# ---------------------------------------------------------------- Schritte: Status / Preis / Löschen / Bilder

def s_ids(ordner, z, s):
    p, _ = produkt_live(z['ziel'], frisch=True)
    if not p:
        fehler('%s nicht im Live-Katalog gefunden (Kennung p567 oder Code 567-26 angeben).' % z['ziel'])
    z['produkt'] = {k: p.get(k) for k in ('id', 'brand', 'name', 'status', 'price', 'code', 'shopifyId', 'shopifyVariantId', 'images')}
    z['ids'] = {'product': 'gid://shopify/Product/' + str(p['shopifyId']), 'variant': p.get('shopifyVariantId')}
    # Uhr „per Überweisung"? Dann liest die Website Status, Preis und Bilder aus
    # daten/anfrage-uhren.json — Shopify (Entwurf) wird trotzdem mitgeführt.
    z['ueberweisung'] = anfrage_eintrag(p['id']) is not None
    sag('  %s · %s %s · %s · %d €%s' % (p['id'], p['brand'], p['name'], p['status'], p['price'],
                                        ' · per Überweisung' if z['ueberweisung'] else ''))
    if z.get('aktion') == 'preis' and z.get('preis'):
        if not z['ueberweisung'] and z['preis'] > GRENZE_UEBERWEISUNG:
            fehler('Neuer Preis %d € liegt über %d € — Shopify Payments verarbeitet das nicht, die Uhr müsste '
                   'auf „Per Überweisung" umziehen (Shopify-Entwurf + Eintrag in daten/anfrage-uhren.json). '
                   'Das macht dieses Skript nicht automatisch; Ablauf in docs/SYSTEM.md, Abschnitt „Per Überweisung".'
                   % (z['preis'], GRENZE_UEBERWEISUNG))
        if z['ueberweisung'] and z['preis'] <= GRENZE_UEBERWEISUNG:
            sag('  HINWEIS: %d € liegt unter %d € — die Uhr könnte wieder in den Warenkorb (Rückweg in docs/SYSTEM.md). '
                'Sie bleibt vorerst „Per Überweisung".' % (z['preis'], GRENZE_UEBERWEISUNG))


def s_lager(ordner, z, s):
    return q_lager(z['ids']['product'])


def a_lager(ordner, z, s, d):
    p = d['product']
    v = p['variants']['nodes'][0]
    z['ids']['variant'] = v['id']
    z['ids']['inventoryItem'] = v['inventoryItem']['id']
    z['lager'] = {'menge': v.get('inventoryQuantity'), 'reserviert': (p.get('reserviert') or {}).get('value'), 'titel': p['title'], 'sku': v.get('sku')}
    erwartet = z['produkt']['name']
    if z['produkt']['brand'].lower() not in p['title'].lower():
        fehler('Sicherheitsstopp: Shopify-Titel „%s" passt nicht zu %s %s' % (p['title'], z['produkt']['brand'], erwartet))
    sag('  Shopify: „%s" · Bestand %s · reserviert=%s' % (p['title'], v.get('inventoryQuantity'), z['lager']['reserviert']))


def s_status_setzen(ordner, z, s):
    ziel = z['aktion']
    pid, inv = z['ids']['product'], z['ids']['inventoryItem']
    menge = z['lager'].get('menge') or 0
    teile = []
    if ziel == 'verkauft':
        if menge != 0:
            teile.append('a: ' + m_inventory(inv, 0 - menge)[len('mutation { '):-2])
        if z['lager'].get('reserviert'):
            teile.append('b: ' + m_reserviert_loeschen(pid)[len('mutation { '):-2])
    elif ziel == 'reserviert':
        if z['produkt']['status'] == 'sold':
            fehler('Uhr ist verkauft (Bestand 0). Erst „erhaeltlich" setzen, wenn sie wieder in den Verkauf soll.')
        if z['lager'].get('reserviert') != 'Ja':
            teile.append('a: ' + m_reserviert_setzen(pid)[len('mutation { '):-2])
    elif ziel == 'erhaeltlich':
        if z['lager'].get('reserviert'):
            teile.append('a: ' + m_reserviert_loeschen(pid)[len('mutation { '):-2])
        if menge < 1:
            teile.append('b: ' + m_inventory(inv, 1 - menge)[len('mutation { '):-2])
    elif ziel == 'preis':
        teile.append('a: ' + m_preis(pid, z['ids']['variant'], z['preis'], z.get('listenpreis'))[len('mutation { '):-2])
    if not teile:
        sag('  nichts zu ändern — Zustand ist schon so')
        return None
    return 'mutation {\n  ' + '\n  '.join(teile) + '\n}'


def a_status_setzen(ordner, z, s, d):
    pruefe_keine_fehler(d, 'status')
    sag('  gesetzt')


def s_ueberweisung_lokal(ordner, z, s):
    """Bei Uhren „per Überweisung" zeigt die Website den Stand aus
    daten/anfrage-uhren.json — den hier nachziehen und sofort pushen."""
    if not z.get('ueberweisung'):
        return
    kennung, ziel = z['produkt']['id'], z['aktion']
    if ziel == 'preis':
        e = anfrage_aendern(kennung, price=z['preis'], listPrice=z.get('listenpreis'))
    else:
        e = anfrage_aendern(kennung, status={'verkauft': 'sold', 'reserviert': 'reserved', 'erhaeltlich': 'anfrage'}[ziel])
    sag('  daten/anfrage-uhren.json: %s → %s · %s €' % (kennung, e['status'], e['price']))
    rev = commit_und_push(['daten/anfrage-uhren.json'], '%s (%s %s): %s' % (
        'Preis' if ziel == 'preis' else 'Bestand', kennung, z['produkt']['brand'],
        '%d EUR' % z['preis'] if ziel == 'preis' else ziel))
    sag('  gepusht (%s), warte auf das Deployment …' % (rev or '—'))


def s_status_live(ordner, z, s):
    ziel = z['aktion']
    erwartet = {'verkauft': 'sold', 'reserviert': 'reserved',
                'erhaeltlich': 'anfrage' if z.get('ueberweisung') else 'available'}.get(ziel)
    def ok(p):
        if not p:
            return False
        if ziel == 'preis':
            return p['price'] == z['preis']
        return p['status'] == erwartet
    if z.get('ueberweisung'):
        warte_frisch(z['produkt']['id'], ok)
    p = live_pruefung(z['produkt']['id'], ok)
    sag('  live: %s · %s · %d €' % (p['id'], p['status'], p['price']))


def s_status_abschluss(ordner, z, s):
    fallback_bauen()
    p = z['produkt']
    if z['aktion'] == 'preis':
        msg = 'Preis: %s (%s %s) auf %d EUR' % (p['id'], p['brand'], p['name'][:40], z['preis'])
    else:
        msg = 'Bestand: %s (%s %s) %s' % (p['id'], p['brand'], p['name'][:40], z['aktion'])
    rev = commit_und_push(['js/data.js'], msg)
    z['abschluss'] = '%s → %s. %s/produkt?id=%s · Commit %s' % (p['id'], z['aktion'] if z['aktion'] != 'preis' else '%d €' % z['preis'], SITE, p['id'], rev or '—')


def m_hinweis(product_id, text):
    if text:
        return ('mutation { metafieldsSet(metafields: [{ownerId: "%s", namespace: "uhr", key: "hinweis", '
                'type: "multi_line_text_field", value: %s}]) { metafields { key value } userErrors { field message } } }'
                % (product_id, gq(text)))
    return ('mutation { metafieldsDelete(metafields: [{ownerId: "%s", namespace: "uhr", key: "hinweis"}]) '
            '{ deletedMetafields { key } userErrors { field message } } }' % product_id)


def s_hinweis_setzen(ordner, z, s):
    return m_hinweis(z['ids']['product'], z.get('text'))


def a_hinweis_setzen(ordner, z, s, d):
    m = (d.get('metafieldsSet') or d.get('metafieldsDelete') or {})
    if m.get('userErrors'):
        fehler('Shopify: ' + json.dumps(m['userErrors'], ensure_ascii=False))
    sag('  Metafeld uhr.hinweis %s' % ('gesetzt' if z.get('text') else 'geloescht'))


def s_hinweis_lokal(ordner, z, s):
    """Zusatz zusaetzlich in daten/hinweise.json — damit er sofort auf der Seite
    steht. Shopify liefert ein frisch angelegtes Metafeld je nach Region bis zu
    einer Stunde lang nicht aus (14.09.2026); api/katalog.js nimmt deshalb den
    Text aus der Datei, solange Shopify nichts schickt."""
    kennung = z['produkt']['id']
    daten = {}
    if os.path.exists(HINWEISE_JSON):
        daten = lies_json(HINWEISE_JSON)
    if z.get('text'):
        daten[kennung] = z['text']
    else:
        daten.pop(kennung, None)
    schreib_json(HINWEISE_JSON, daten)
    sag('  daten/hinweise.json: %s %s' % (kennung, 'gesetzt' if z.get('text') else 'entfernt'))
    rev = commit_und_push(['daten/hinweise.json'], 'Besonderheiten: %s (%s %s)'
                          % (kennung, z['produkt']['brand'], z['produkt']['name'][:40]))
    sag('  gepusht (%s), warte auf die Live-Seite …' % (rev or '—'))

    # daten/hinweise.json steckt in der Vercel-Funktion — erst nach dem Deploy da.
    ziel = (z.get('text') or '').strip()
    def ok(p):
        return bool(p) and (p.get('note') or '').strip() == ziel
    start = time.time()
    while time.time() - start < 300:
        p, _ = produkt_live(kennung, frisch=True)
        if ok(p):
            break
        time.sleep(15)
    live_pruefung(kennung, ok)
    fallback_bauen()
    rev2 = commit_und_push(['js/data.js'], 'Rueckfalldatei nach Besonderheiten %s' % kennung)
    z['abschluss'] = ('%s: Besonderheiten %s. %s/produkt?id=%s · Commit %s'
                      % (kennung, 'stehen auf der Seite' if z.get('text') else 'entfernt',
                         SITE, kennung, rev2 or rev or '—'))


def s_bestellungen(ordner, z, s):
    s['hinweis'] = 'Prüft die letzten 50 Bestellungen auf diese Uhr — an einer Bestellung darf nichts gelöscht werden.'
    return q_bestellungen()


def a_bestellungen(ordner, z, s, d):
    pid = z['ids']['product']
    treffer = []
    for o in d['orders']['nodes']:
        for li in o['lineItems']['nodes']:
            if (li.get('product') or {}).get('id') == pid:
                treffer.append(o['name'])
    if treffer and not z.get('trotzdem'):
        fehler('Bestellung(en) %s enthalten diese Uhr. Nicht löschen — stattdessen „status … verkauft". '
               'Wer wirklich löschen will: loeschen … --trotzdem' % ', '.join(treffer))
    sag('  keine Bestellung hängt an der Uhr' if not treffer else '  Bestellungen %s — Löschen auf Anweisung' % treffer)


def s_delete(ordner, z, s):
    return m_delete(z['ids']['product'])


def a_delete(ordner, z, s, d):
    pruefe_keine_fehler(d, 'productDelete')
    sag('  gelöscht: %s' % d['productDelete'].get('deletedProductId'))


def s_loeschen_lokal(ordner, z, s):
    p = z['produkt']
    ordner_bilder = os.path.join(IMGDIR, p['id'])
    if os.path.isdir(ordner_bilder):
        shutil.rmtree(ordner_bilder)
        sag('  assets/products/%s entfernt' % p['id'])
    karte = shopify_map()
    if p['id'] in karte.get('products', {}):
        del karte['products'][p['id']]
        shopify_map_schreiben(karte)
        datajs_syntax()
    if anfrage_eintrag(p['id']):
        d = anfrage_laden()
        d['produkte'] = [e for e in d['produkte'] if e.get('id') != p['id']]
        anfrage_schreiben(d)
        sag('  aus daten/anfrage-uhren.json entfernt')
        commit_und_push(['daten/anfrage-uhren.json', 'js/data.js', 'assets/products/' + p['id']],
                        'Bestand: %s (%s %s) geloescht' % (p['id'], p['brand'], p['name'][:40]))
    fallback_bauen()
    # Live: weg?
    start = time.time()
    while time.time() - start < 420:
        q, _ = produkt_live(p['id'], frisch=(time.time() - start < 5))
        if not q:
            break
        sag('  Besucher sehen die Uhr noch (Zwischenspeicher) — warte 30 s')
        time.sleep(30)
    rev = commit_und_push(['js/data.js', 'assets/products/' + p['id']], 'Bestand: %s (%s %s) geloescht' % (p['id'], p['brand'], p['name'][:40]))
    z['abschluss'] = '%s gelöscht. %s/produkt?id=%s leitet jetzt in den Shop. Commit %s' % (p['id'], SITE, p['id'], rev or '—')


def s_medien_abfragen(ordner, z, s):
    return q_media(z['ids']['product'])


def a_medien_abfragen(ordner, z, s, d):
    medien = d['product']['media']['nodes']
    z['medien'] = [{'id': m['id'], 'url': (m.get('image') or {}).get('url'), 'alt': m.get('alt')} for m in medien]
    sag('  %d Medien am Produkt' % len(medien))
    for i, m in enumerate(z['medien']):
        sag('    %d  %s  %s' % (i, m['alt'] or '', (m['url'] or '')[-40:]))


def s_bilder_hochladen_lokal(ordner, z, s):
    """Neues Foto ins Projekt legen und pushen, damit Shopify es ziehen kann."""
    from PIL import Image
    p = z['produkt']
    ziel = os.path.join(IMGDIR, p['id'])
    os.makedirs(ziel, exist_ok=True)
    n = len([f for f in os.listdir(ziel) if f.endswith('.jpg')])
    name = 'neu-%d.jpg' % int(time.time())
    im = Image.open(os.path.expanduser(z['hinzufuegen'])).convert('RGB')
    im.thumbnail((1600, 1600), Image.LANCZOS)
    im.save(os.path.join(ziel, name), quality=86, optimize=True, progressive=True)
    commit_und_push(['assets/products/' + p['id']], 'Bild für %s hinzugefügt' % p['id'])
    url = '%s/assets/products/%s/%s' % (SITE, p['id'], name)
    if not warte_auf_url(url, 300):
        fehler('Bild %s nach 5 Minuten nicht erreichbar' % url)
    z['neu_url'] = url
    z['neu_datei'] = name
    sag('  %s ist öffentlich' % url)


def s_medien_hinzufuegen(ordner, z, s):
    p = z['produkt']
    return m_create_media(z['ids']['product'], [(z['neu_url'], '%s %s Ansicht' % (p['brand'], p['name'][:30]))])


def a_medien_hinzufuegen(ordner, z, s, d):
    pruefe_keine_fehler(d, 'Bild anhängen')
    bekannt = {m['id'] for m in z.get('medien', [])}
    neue = [m['id'] for m in d['productUpdate']['product']['media']['nodes'] if m['id'] not in bekannt]
    if not neue:
        fehler('Kein neues Medium in der Antwort gefunden')
    z['neu_media_id'] = neue[-1]
    sag('  Medium angelegt, wird verarbeitet …')
    time.sleep(15)


def s_medien_aendern(ordner, z, s):
    pid = z['ids']['product']
    medien = z['medien']
    if z.get('entfernen') is not None:
        idx = z['entfernen']
        if idx < 0 or idx >= len(medien):
            fehler('Position %d gibt es nicht (0–%d)' % (idx, len(medien) - 1))
        z['entfernt_id'] = medien[idx]['id']
        return m_delete_media(pid, [medien[idx]['id']])
    if z.get('reihenfolge'):
        reihe = z['reihenfolge']
        if sorted(reihe) != list(range(len(medien))):
            fehler('--reihenfolge muss jede Position 0–%d genau einmal nennen' % (len(medien) - 1))
        moves = [(medien[alt]['id'], neu) for neu, alt in enumerate(reihe) if alt != neu]
        if not moves:
            sag('  Reihenfolge ist schon so')
            return None
        return m_reorder(pid, moves)
    if z.get('hinzufuegen'):
        # neues Medium hängt hinten; an die gewünschte Position schieben
        pos = z.get('position', 1)
        return m_reorder(pid, [(z['neu_media_id'], pos)])
    return None


def a_medien_aendern(ordner, z, s, d):
    pruefe_keine_fehler(d, 'Medien ändern')
    sag('  in Shopify geändert')


def s_bilder_lokal(ordner, z, s):
    """Lokale Reservebilder in dieselbe Reihenfolge bringen."""
    p = z['produkt']
    ordner_bilder = os.path.join(IMGDIR, p['id'])
    if os.path.isdir(ordner_bilder):
        dateien = sorted((f for f in os.listdir(ordner_bilder) if f.endswith('.jpg') and not f.startswith('neu-')),
                         key=lambda f: (len(f), f))
        if z.get('entfernen') is not None and z['entfernen'] < len(dateien):
            os.remove(os.path.join(ordner_bilder, dateien[z['entfernen']]))
            dateien.pop(z['entfernen'])
            for i, f in enumerate(dateien):
                os.rename(os.path.join(ordner_bilder, f), os.path.join(ordner_bilder, 'tmp-%d.jpg' % i))
            for i in range(len(dateien)):
                os.rename(os.path.join(ordner_bilder, 'tmp-%d.jpg' % i), os.path.join(ordner_bilder, '%d.jpg' % i))
        elif z.get('reihenfolge') and len(dateien) == len(z['reihenfolge']):
            for neu, alt in enumerate(z['reihenfolge']):
                os.rename(os.path.join(ordner_bilder, dateien[alt]), os.path.join(ordner_bilder, 'tmp-%d.jpg' % neu))
            for neu in range(len(dateien)):
                os.rename(os.path.join(ordner_bilder, 'tmp-%d.jpg' % neu), os.path.join(ordner_bilder, '%d.jpg' % neu))
        elif z.get('hinzufuegen'):
            pos = z.get('position', 1)
            alle = dateien[:]
            alle.insert(pos, z['neu_datei'])
            for i, f in enumerate(alle):
                os.rename(os.path.join(ordner_bilder, f), os.path.join(ordner_bilder, 'tmp-%d.jpg' % i))
            for i in range(len(alle)):
                os.rename(os.path.join(ordner_bilder, 'tmp-%d.jpg' % i), os.path.join(ordner_bilder, '%d.jpg' % i))
        else:
            sag('  lokale Bilder passen nicht zur Shopify-Anzahl — Reservebilder nicht angefasst')
    pfade = ['js/data.js', 'assets/products/' + p['id']]
    e = anfrage_eintrag(p['id'])
    if e is not None and os.path.isdir(ordner_bilder):
        # Uhren „per Überweisung" zeigen die Bilder aus dem Projekt. Gleiche
        # Dateinamen, neuer Inhalt → neue ?v=-Nummer, sonst sehen Kunden bis zu
        # zwei Tage die alten Fotos (Browser-Zwischenspeicher, siehe PROBLEME L).
        anzahl = len([f for f in os.listdir(ordner_bilder) if re.match(r'^\d+\.jpg$', f)])
        v = bild_version(e.get('images')) + 1
        anfrage_aendern(p['id'], images=['assets/products/%s/%d.jpg?v=%d' % (p['id'], i, v) for i in range(anzahl)])
        pfade.append('daten/anfrage-uhren.json')
        sag('  daten/anfrage-uhren.json: %d Bilder, ?v=%d' % (anzahl, v))
    fallback_bauen()
    rev = commit_und_push(pfade, 'Bilder: %s (%s %s) neu geordnet' % (p['id'], p['brand'], p['name'][:40]))
    z['abschluss'] = ('Bilder von %s geändert · Commit %s. JETZT PFLICHT: python3 tools/uhr.py pruefen %s und den Live-Kontaktbogen ANSEHEN — '
                      'nicht nur IDs vergleichen (Fehler vom 31.08.).' % (p['id'], rev or '—', p['id']))


SCHRITTE = {
    'eingabe_pruefen': s_eingabe, 'bilder_ablegen': s_bilder_ablegen, 'bilder_pushen': s_bilder_pushen,
    'productCreate': s_product_create, 'einrichten': s_einrichten, 'productCreateMedia': s_medien,
    'medien_pruefen': s_medien_pruefen, 'kennung_eintragen': s_kennung, 'live_pruefen': s_live, 'abschluss': s_abschluss,
    'ids_aufloesen': s_ids, 'lager_abfragen': s_lager, 'status_setzen': s_status_setzen, 'status_live': s_status_live,
    'status_abschluss': s_status_abschluss, 'bestellungen_pruefen': s_bestellungen, 'productDelete': s_delete,
    'loeschen_lokal': s_loeschen_lokal, 'medien_abfragen': s_medien_abfragen, 'bild_hochladen': s_bilder_hochladen_lokal,
    'medien_hinzufuegen': s_medien_hinzufuegen, 'medien_aendern': s_medien_aendern, 'bilder_lokal': s_bilder_lokal,
    'hinweis_setzen': s_hinweis_setzen, 'hinweis_lokal': s_hinweis_lokal,
    'ueberweisung_lokal': s_ueberweisung_lokal,
}
ANTWORTEN = {
    'productCreate': a_product_create, 'einrichten': a_einrichten, 'productCreateMedia': a_medien,
    'medien_pruefen': a_medien_pruefen, 'lager_abfragen': a_lager, 'status_setzen': a_status_setzen,
    'bestellungen_pruefen': a_bestellungen, 'productDelete': a_delete, 'medien_abfragen': a_medien_abfragen,
    'medien_hinzufuegen': a_medien_hinzufuegen, 'medien_aendern': a_medien_aendern,
    'hinweis_setzen': a_hinweis_setzen,
}


# ---------------------------------------------------------------- Abläufe anlegen

def plan_anlegen(ordner):
    ordner = os.path.abspath(ordner)
    if not os.path.exists(os.path.join(ordner, 'inserat.json')):
        fehler('%s/inserat.json fehlt — erst tools/inserat.py ausführen' % ordner)
    z = {'aktion': 'anlegen', 'ordner': ordner, 'angelegt': time.strftime('%Y-%m-%d %H:%M'), 'schritte': [
        schritt_anlegen('eingabe_pruefen', 'skript'),
        schritt_anlegen('bilder_ablegen', 'skript'),
        schritt_anlegen('bilder_pushen', 'skript'),
        schritt_anlegen('productCreate', 'mutation'),
        schritt_anlegen('einrichten', 'mutation', 'Handle, Preis/SKU/Steuer, vier Vertriebskanäle, Bestand 1 — in einem Aufruf.'),
        schritt_anlegen('productCreateMedia', 'mutation'),
        schritt_anlegen('medien_pruefen', 'query'),
        schritt_anlegen('kennung_eintragen', 'skript'),
        schritt_anlegen('live_pruefen', 'skript'),
        schritt_anlegen('abschluss', 'skript'),
    ]}
    zustand_speichern(ordner, z)
    sag('Ablauf „anlegen" geplant in %s (%d Schritte).' % (os.path.relpath(ordner, ROOT), len(z['schritte'])))
    return ordner


def plan_status(ziel, aktion, preis=None, listenpreis=None):
    ordner = os.path.join(ARBEIT, '_%s-%s' % (aktion, ziel))
    if os.path.isdir(ordner):
        shutil.rmtree(ordner)
    os.makedirs(ordner)
    z = {'aktion': aktion, 'ziel': ziel, 'preis': preis, 'listenpreis': listenpreis, 'schritte': [
        schritt_anlegen('ids_aufloesen', 'skript'),
        schritt_anlegen('lager_abfragen', 'query', 'Sicherheitsprüfung: Titel muss zur Marke passen, sonst Stopp.'),
        schritt_anlegen('status_setzen', 'mutation'),
        schritt_anlegen('ueberweisung_lokal', 'skript'),
        schritt_anlegen('status_live', 'skript'),
        schritt_anlegen('status_abschluss', 'skript'),
    ]}
    zustand_speichern(ordner, z)
    sag('Ablauf „%s" für %s geplant in %s.' % (aktion, ziel, os.path.relpath(ordner, ROOT)))
    return ordner


def plan_loeschen(ziel, trotzdem=False):
    ordner = os.path.join(ARBEIT, '_loeschen-%s' % ziel)
    if os.path.isdir(ordner):
        shutil.rmtree(ordner)
    os.makedirs(ordner)
    z = {'aktion': 'loeschen', 'ziel': ziel, 'trotzdem': trotzdem, 'schritte': [
        schritt_anlegen('ids_aufloesen', 'skript'),
        schritt_anlegen('bestellungen_pruefen', 'query'),
        schritt_anlegen('productDelete', 'mutation', 'Unwiderruflich. Uhr, Bilder und Datenblatt sind danach in Shopify weg.'),
        schritt_anlegen('loeschen_lokal', 'skript'),
    ]}
    zustand_speichern(ordner, z)
    sag('Ablauf „loeschen" für %s geplant in %s.' % (ziel, os.path.relpath(ordner, ROOT)))
    return ordner


def plan_hinweis(ziel, text):
    ordner = os.path.join(ARBEIT, '_hinweis-%s' % ziel)
    if os.path.isdir(ordner):
        shutil.rmtree(ordner)
    os.makedirs(ordner)
    z = {'aktion': 'hinweis', 'ziel': ziel, 'text': text, 'schritte': [
        schritt_anlegen('ids_aufloesen', 'skript'),
        schritt_anlegen('hinweis_setzen', 'mutation'),
        schritt_anlegen('hinweis_lokal', 'skript'),
    ]}
    zustand_speichern(ordner, z)
    sag('Ablauf „hinweis" für %s geplant in %s.' % (ziel, os.path.relpath(ordner, ROOT)))
    return ordner


def plan_bilder(ziel, reihenfolge=None, entfernen=None, hinzufuegen=None, position=1):
    ordner = os.path.join(ARBEIT, '_bilder-%s' % ziel)
    if os.path.isdir(ordner):
        shutil.rmtree(ordner)
    os.makedirs(ordner)
    schritte = [schritt_anlegen('ids_aufloesen', 'skript'), schritt_anlegen('medien_abfragen', 'query')]
    if hinzufuegen:
        schritte += [schritt_anlegen('bild_hochladen', 'skript'), schritt_anlegen('medien_hinzufuegen', 'mutation')]
    schritte += [schritt_anlegen('medien_aendern', 'mutation'), schritt_anlegen('bilder_lokal', 'skript')]
    z = {'aktion': 'bilder', 'ziel': ziel, 'reihenfolge': reihenfolge, 'entfernen': entfernen,
         'hinzufuegen': hinzufuegen, 'position': position, 'schritte': schritte}
    zustand_speichern(ordner, z)
    sag('Ablauf „bilder" für %s geplant in %s.' % (ziel, os.path.relpath(ordner, ROOT)))
    return ordner


# ---------------------------------------------------------------- Prüfen

def pruefen(ziel):
    p, kat = produkt_live(ziel, frisch=True)
    if not p:
        sag('%s ist NICHT im Live-Katalog (Stand %s, %d Produkte).' % (ziel, kat.get('stand'), kat.get('anzahl')))
        return
    sag('%s · %s %s' % (p['id'], p['brand'], p['name']))
    sag('  Status %s · %d € · Code %s · %s · Bilder %d' % (p['status'], p['price'], p.get('code'), p.get('tax'), len(p.get('images') or [])))
    sag('  Ref %s · %s · %s · %s · %s' % (p.get('ref'), p.get('year'), p.get('size'), p.get('rating'), p.get('fullset')))
    sag('  %s/produkt?id=%s' % (SITE, p['id']))
    # Marke im Filter
    marken_live = {x['brand'] for x in kat['produkte']}
    sag('  Marke „%s" im Filter: %s' % (p['brand'], 'ja' if p['brand'] in marken_live else 'NEIN'))
    # Live-Bilder als Kontaktbogen — zum ANSEHEN, nicht nur zum Zählen
    try:
        from PIL import Image, ImageDraw
        ordner = os.path.join(ARBEIT, '_pruefen-%s' % p['id'])
        os.makedirs(ordner, exist_ok=True)
        bilder = (p.get('images') or [])[:6]
        ims = []
        for i, url in enumerate(bilder):
            pfad = os.path.join(ordner, 'live-%d.jpg' % i)
            if url.startswith('assets/'):
                url = SITE + '/' + url
            urllib.request.urlretrieve(url, pfad)
            ims.append(Image.open(pfad).convert('RGB'))
        if ims:
            w, h = 360, 320
            blatt = Image.new('RGB', (w * len(ims), h), 'white')
            zeichnen = ImageDraw.Draw(blatt)
            for i, im in enumerate(ims):
                im.thumbnail((w - 16, h - 40))
                blatt.paste(im, (i * w + (w - im.width) // 2, 32 + (h - 32 - im.height) // 2))
                zeichnen.rectangle([i * w + 2, 2, i * w + w - 2, 28], fill='black')
                zeichnen.text((i * w + 10, 9), ['COVER (Karte)', 'HOVER (Karte)'][i] if i < 2 else 'Bild %d' % i, fill='white')
            bogen = os.path.join(ordner, 'live-bogen.jpg')
            blatt.save(bogen, quality=88)
            sag('  Live-Kontaktbogen: %s  ← ANSEHEN: Cover frontal? Hover = Set oder Front?' % os.path.relpath(bogen, ROOT))
    except Exception as e:
        sag('  (Kontaktbogen nicht erstellt: %s)' % str(e)[:80])


# ---------------------------------------------------------------- CLI

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s1 = sub.add_parser('anlegen'); s1.add_argument('ordner'); s1.add_argument('--direkt', action='store_true')
    s2 = sub.add_parser('weiter'); s2.add_argument('ordner'); s2.add_argument('--direkt', action='store_true')
    s3 = sub.add_parser('ergebnis'); s3.add_argument('ordner'); s3.add_argument('--datei'); s3.add_argument('--text'); s3.add_argument('--direkt', action='store_true')
    s4 = sub.add_parser('status'); s4.add_argument('ziel'); s4.add_argument('aktion', choices=['verkauft', 'reserviert', 'erhaeltlich']); s4.add_argument('--direkt', action='store_true')
    s5 = sub.add_parser('preis'); s5.add_argument('ziel'); s5.add_argument('betrag', type=int); s5.add_argument('--listenpreis', type=int); s5.add_argument('--direkt', action='store_true')
    s6 = sub.add_parser('loeschen'); s6.add_argument('ziel'); s6.add_argument('--trotzdem', action='store_true'); s6.add_argument('--direkt', action='store_true')
    s7 = sub.add_parser('bilder'); s7.add_argument('ziel'); s7.add_argument('--reihenfolge'); s7.add_argument('--entfernen', type=int)
    s7.add_argument('--hinzufuegen'); s7.add_argument('--position', type=int, default=1); s7.add_argument('--direkt', action='store_true')
    s11 = sub.add_parser('hinweis', help='Besonderheiten dieser Uhr — erscheinen oben auf der Produktseite')
    s11.add_argument('ziel'); s11.add_argument('text', nargs='?', default=None,
                     help='Text; Absätze mit einer Leerzeile. Ohne Text wird der Hinweis entfernt.')
    s11.add_argument('--datei', help='Text stattdessen aus einer Datei lesen'); s11.add_argument('--direkt', action='store_true')
    s8 = sub.add_parser('pruefen'); s8.add_argument('ziel')
    s9 = sub.add_parser('frei'); s9.add_argument('ziel')
    s10 = sub.add_parser('vorschau', help='uhr.json prüfen und zeigen, was rausginge — ohne etwas zu ändern'); s10.add_argument('ordner')
    a = ap.parse_args()

    if a.cmd == 'vorschau':
        u, _ = uhr_laden_und_pruefen(os.path.abspath(a.ordner))
        sag('Eingabe in Ordnung.')
        sag('  Kennung %s · Code %s · SKU %s · Handle %s' % (u['id'], u['code'], u['sku'], u['handle']))
        sag('  %s · %d € · %s (Regel: %s)' % (u['titel'], u['preis'], u['besteuerung'], u['besteuerung_regel']))
        sag('  Marke „%s" · Modell „%s" · Tags %s' % (u['marke'], u['modell'], u['tags']))
        sag('  Bilder: %s · Alt-Texte: %s' % (u['bilder']['reihenfolge'], u['alt_texte']))
        sag('  Beschreibung:\n    ' + re.sub(r'</p>\s*<p>', '\n    ', u['beschreibung_html']).replace('<p>', '').replace('</p>', '').replace('<strong>', '').replace('</strong>', ''))
        sag('\n  Erster Shopify-Aufruf wäre:\n' + m_product_create(u)[:600] + ' …')
        return

    if a.cmd == 'anlegen':
        weiter(plan_anlegen(a.ordner), a.direkt)
    elif a.cmd == 'weiter':
        weiter(os.path.abspath(a.ordner), a.direkt)
    elif a.cmd == 'ergebnis':
        ergebnis(os.path.abspath(a.ordner), a.text, a.datei, a.direkt)
    elif a.cmd == 'status':
        weiter(plan_status(a.ziel, a.aktion), a.direkt)
    elif a.cmd == 'preis':
        weiter(plan_status(a.ziel, 'preis', a.betrag, a.listenpreis), a.direkt)
    elif a.cmd == 'loeschen':
        weiter(plan_loeschen(a.ziel, a.trotzdem), a.direkt)
    elif a.cmd == 'bilder':
        if not (a.reihenfolge or a.entfernen is not None or a.hinzufuegen):
            fehler('--reihenfolge 0,3,1,2 | --entfernen N | --hinzufuegen datei.jpg [--position N]')
        reihe = [int(x) for x in a.reihenfolge.split(',')] if a.reihenfolge else None
        weiter(plan_bilder(a.ziel, reihe, a.entfernen, a.hinzufuegen, a.position), a.direkt)
    elif a.cmd == 'hinweis':
        text = io.open(a.datei, encoding='utf-8').read().strip() if a.datei else (a.text or '').strip()
        weiter(plan_hinweis(a.ziel, text or None), a.direkt)
    elif a.cmd == 'pruefen':
        pruefen(a.ziel)
    elif a.cmd == 'frei':
        kennung_pruefen(a.ziel)
        g = kennung_frei(a.ziel)
        sag('%s: %s' % (a.ziel, 'FREI' if not g else 'VERGEBEN — ' + '; '.join(g)))


if __name__ == '__main__':
    main()
