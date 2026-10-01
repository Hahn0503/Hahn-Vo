# Wie hahn-vo.de zusammenhängt

Stand 04.09.2026. Die Landkarte für jeden, der das System übernimmt — Mensch oder Claude.

## Die drei Teile

```
 Hannes / Claude Code                     Besucher
        │                                    │
        │ Skills + tools/uhr.py               │ hahn-vo.de
        ▼                                    ▼
   ┌─────────┐   Storefront-API   ┌──────────────────────┐   git push   ┌────────┐
   │ Shopify │ ◀────────────────  │ Vercel: Website +    │ ◀─────────── │ GitHub │
   │ Produkte│                    │ api/katalog.js       │  (deployt    │ Repo   │
   │ Bestand │  Kasse unter       │ api/chrono24.js      │   in ~40 s)  │        │
   │ Kasse   │  shop.hahn-vo.de   │ api/anfrage.js       │              └────────┘
   └─────────┘                    └──────────────────────┘
                                          │  Resend-Mail
                                          ▼
                                   info@hahntime.com
```

1. **Shopify** (`tami1g-0j.myshopify.com`, Inhaber info@hahntime.com) — hält jede Uhr als Produkt mit Metafeldern im Namensraum `uhr`, den Bestand (1 = erhältlich, 0 = verkauft), das Kennzeichen `uhr.reserviert`, und die Kasse. Der Bestand hier ist die einzige Wahrheit.
2. **Die Website** (dieses Repo, auf Vercel) — statisches HTML/CSS/JS ohne Build-Schritt. Drei Serverfunktionen: `/api/katalog.json` (Bestand aus Shopify, 5 min Edge-Cache), `/chrono24.xml` (derselbe Bestand als Feed), `/api/anfrage` (Formulare → Mail).
3. **GitHub** (`main`) — jeder Push wird von Vercel automatisch ausgeliefert. Wer pushen darf, deployt. Vercel-Zugang braucht nur, wer Analytics, Umgebungsvariablen oder Domain anfassen will.

## Der Weg einer Uhr

| Schritt | Wer | Wo |
|---|---|---|
| Inserat lesen, Bilder holen | `tools/inserat.py` | `arbeit/<name>/` |
| Felder entscheiden, Bilder ansehen | Claude (Skill `uhr-anlegen`) | `arbeit/<name>/uhr.json` |
| Bilder ins Projekt, pushen | `tools/uhr.py` | `assets/products/pXXX/N.jpg` → öffentlich auf hahn-vo.de |
| Produkt, Felder, Preis, Kanäle, Bestand, Bilder | Shopify-Aufrufe aus `tools/uhr.py`, ausgeführt über Connector oder direkt | Shopify |
| Kennung `pXXX` ↔ Shopify-ID | `tools/uhr.py` → `js/data.js` (`window.SHOPIFY.products`) | Repo |
| Rückfalldatei | `tools/fallback_bauen.py` → `js/data.js` (`window.PRODUCTS`) | Repo |
| Live prüfen, committen, pushen | `tools/uhr.py` | hahn-vo.de |

Danach: Website zeigt die Uhr binnen 5 Minuten, Chrono24 zieht sie beim nächsten Abruf (12–24 h).

## Status-Logik

`api/katalog.js`: `status = !verfuegbar ? 'sold' : (anfrage ? 'anfrage' : (reserviert ? 'reserved' : 'available'))`.
`verfuegbar` = Storefront `availableForSale` (Bestand > 0). Verkauft schlägt reserviert.
Ausblenden ohne Löschen: interner Code in `AUSSCHLUSS` (`api/katalog.js`).

**„Per Überweisung"** (scharfgeschaltet 06.09.2026): Shopify Payments verarbeitet keine Waren über 10.000 USD, rund 8.500 €. Die betroffenen Uhren liegen in Shopify als **Entwurf** — damit aus Storefront und allen Verkaufskanälen raus, wie Shopify Trust & Safety es verlangt (Ticket 8142a75a) — und werden aus `daten/anfrage-uhren.json` gepflegt; `api/_shop.js` hängt sie an den Bestand an (nur, wenn Shopify sie nicht selbst liefert). Website: Kennzeichen „Per Überweisung", Kaufknopf öffnet WhatsApp, kein Warenkorb, keine Kasse. Chrono24-Feed, Sitemap, Markenseiten: normal. Pflege (Preis, verkauft) in der JSON-Datei.

Interner Status heißt im Code weiterhin `anfrage` — nur die Beschriftung ist „Per Überweisung".

**Im Skript (seit 29.09.2026):** `tools/uhr.py anlegen` erkennt Preise über `GRENZE_UEBERWEISUNG` (8.500 €) und legt dann einen Entwurf ohne Veröffentlichung an, schreibt den Eintrag in `daten/anfrage-uhren.json` und prüft live auf Status `anfrage`. `status`/`preis`/`bilder`/`loeschen` erkennen die Uhr am JSON-Eintrag und ziehen ihn mit (Bilder mit neuer `?v=`-Nummer). Im JSON-Eintrag sind außerdem `note` (Besonderheiten), `warranty` (Garantie-Monate) und Status `reserved` möglich; `api/katalog.js` lässt „reserviert" vor „per Überweisung" gelten. Nicht automatisch: der Umzug einer Kassen-Uhr über die Grenze (Preis steigt über 8.500 €) — `preis` stoppt dann; von Hand: Produkt auf `DRAFT`, JSON-Eintrag anlegen (Form wie die übrigen), `fallback_bauen.py`, pushen.
**Rückweg**, sobald ein anderer Zahlungsanbieter aktiv ist: Produkte in Shopify wieder auf `ACTIVE` (`productUpdate(product:{id, status: ACTIVE})`), Eintrag aus `daten/anfrage-uhren.json` entfernen, `tools/fallback_bauen.py`, committen.

## Kennungen

- **`pXXX`** — Adresse der Uhr (`/produkt?id=p567`). Neue Uhren: `p` + Code-Präfix (`567-26` → `p567`). Alte Uhren aus dem GoDaddy-Shop haben historische Nummern (p426 …), die nichts mit dem Code zu tun haben — Kollisionen möglich, deshalb `tools/uhr.py frei`.
- **Interner Code** (`uhr.code`, z. B. `567-26`) — Hannes' Artikelnummer. Überweisungszweck, Chrono24-Artikelnummer.
- **SKU** `HV-P567`. **Handle** `<slug>-p567`.
- **Ersatzkennung** `s` + letzte 7 Ziffern der Shopify-ID — bekommt jede Uhr, die nur in Shopify angelegt wurde, ohne Eintrag in `js/data.js`. Funktioniert, ist nur weniger hübsch.

## Datei-Landkarte

| Datei | Aufgabe |
|---|---|
| `index.html`, `shop.html`, `produkt-vorlage.html` (Vorlage; `/produkt` liefert `api/produkt.js`), `ankauf.html`, `suchauftrag.html`, `ueber-uns.html`, `checkout.html`, `referenz-checker.html`, 4 Rechtsseiten | die Seiten |
| `css/base.css`, `home.css`, `pages.css`, `shop.css` … | Gestaltung; Petrol `#0E334F`, Creme `#FFFAE7`, Inter + Marcellus (Wortmarke) |
| `js/shell.js` | Header, Footer, Warenkorb-Drawer auf jeder Seite |
| `js/katalog.js` | holt `/api/katalog.json`, ersetzt `window.PRODUCTS` an Ort und Stelle, 2,5 s Zeitlimit, Ereignis `hv:katalog` |
| `js/data.js` | Rückfalldatei + `window.SHOPIFY.products` (pXXX → Shopify-ID) + `TESTIMONIALS`, `FAQ`, `SITE` |
| `js/home.js` | Startseite: Preloader, Schaufenster/„Neu eingetroffen" (aus Bestand), Kundenstimmen-Deck, Zähler |
| `js/shop.js`, `js/product.js` | Shop-Raster mit Filtern (Marke/Preis/Status), Produktseite mit Galerie und Datenblatt |
| `js/shopify.js`, `js/cart.js`, `js/checkout.js` | Storefront-API, Warenkorb, Übergabe an die Shopify-Kasse |
| `js/wizard.js` | Ankauf- und Suchauftrag-Leitfäden |
| `api/_shop.js` | Shopify-Abfrage, **MARKEN-Liste** (mehrwortige Marken), Kennungen aus data.js |
| `api/katalog.js` | Katalog-Schnittstelle, `AUSSCHLUSS` |
| `api/chrono24.js` | Feed, `EINSTELLUNGEN` (Aufschlag, Rundung, Ausschluss) |
| `api/anfrage.js` | Mailversand (Resend), Empfänger aus `ANFRAGE_AN` |
| `api/sitemap.js` | Sitemap aus dem Bestand |
| `api/produkt.js` | liefert `/produkt?id=…` serverseitig aus `produkt-vorlage.html`: Titel, Beschreibung, Vorschaubild, schema.org Product/Breadcrumb, vorbefüllter Inhalt (5 min Edge-Cache) |
| `api/marke.js` + `daten/marken.json` | Markenseiten `/marken` und `/marken/<slug>` aus `shop.html` als Vorlage: Kopf, Einleitungstext (aus der JSON, editierbar), vorbefülltes Raster, CollectionPage/ItemList |
| `ratgeber/index.html`, `ratgeber/<slug>.html` | Ratgeber: Übersicht und fünf Artikel als fertige statische Seiten (absolute Pfade, Article/FAQPage/Breadcrumb-Daten). Neuer Artikel = bestehende Datei kopieren, dann Übersicht, `api/sitemap.js` (SEITEN mit lastmod) und `llms.txt` ergänzen |
| `tools/serve.py` | lokaler Server (`serve.command`): saubere Adressen, `/produkt` aus der Vorlage |
| `llms.txt`, `robots.txt` | Kurzbeschreibung für KI-Suchmaschinen; Crawler-Freigaben, Kasse ausgenommen |
| `vercel.json` | saubere Adressen, Rewrites (`/api/katalog.json`, `/chrono24.xml`, `/sitemap.xml`), Weiterleitungen vom alten Shop |
| `assets/products/pXXX/` | eigene Bildkopien (Cover 0.jpg, Hover 1.jpg …) |
| `assets/img/reviews/` | Fotos der Kundenstimmen |
| `tools/inserat.py` | Inserat lesen (Kleinanzeigen, eBay, Chrono24, Ordner) |
| `tools/uhr.py` | anlegen / status / preis / loeschen / bilder / pruefen / frei |
| `tools/fallback_bauen.py` | Rückfalldatei aus Shopify, lokale Zuordnung gewinnt |
| `tools/einrichten.sh` | Umgebung prüfen |
| `daten/differenzbesteuerung.csv` | Hannes' Liste der differenzbesteuerten Uhren (ohne Seriennummern) |
| `daten/hinweise.json` | Rückfall für das Metafeld `uhr.hinweis` (Abschnitt „Besonderheiten" auf der Produktseite). Shopify gewinnt; die Datei greift nur, solange Shopify ein frisch angelegtes Metafeld noch nicht ausliefert |
| `.claude/skills/*` | die fünf Skills |
| `CLAUDE.md` | Regeln und Kurzfassung für jede Claude-Sitzung |

## Zeiten, die man kennen muss

| Was | Dauer |
|---|---|
| Push → live | ~40 s (statische Dateien, Bilder) |
| Shopify-Änderung → Website | bis 5 min (Edge-Cache von `/api/katalog.json`); `?frisch=1` umgeht ihn — nur für Tests |
| Kasse | immer sofort (rechnet direkt mit Shopify) |
| Chrono24 | 12–24 h |
| Kleinanzeigen-Sperre | 25 s warten, bis zu 6 Versuche |

## Konten (Stand 04.09.2026)

| Dienst | Konto | Aufgabe |
|---|---|---|
| Shopify | Hahn & Vo (info@hahntime.com) | Produkte, Bestand, Kasse, Zahlungen |
| GitHub | `Hahn0503/Hahn-Vo` (öffentlich), Hannes' Konto — seit 01.10.2026, vorher `valentinpueschel-ui/Hahn-Vo` | Code, Bilder |
| Vercel | Projekt `hahn-vo-df1c`, Team von Valentin (Hobby) — eigenes Team geplant | Hosting, Analytics, Env-Vars `RESEND_API_KEY`, `ANFRAGE_AN` |
| GoDaddy | Hahn & Vo | Domain hahn-vo.de, DNS (A → Vercel, `www` → Vercel, `shop` → Shopify) |
| Resend | Konto auf info@hahntime.com | Mailversand der Formulare |
| Chrono24 | Händlerkonto `hahnundvo` | Feed-Abnehmer (ob der Feed aktiv ist: mit Chrono24 klären) |

Suchmaschinen: Search Console, Bing Webmaster und Google-Unternehmensprofil gehören auf Hannes' Konto — Anleitung und Begründung in `docs/Hahn-Vo-Google-Bing-Anmeldung.pdf` (Quelle `docs/suchmaschinen-anmeldung.html`).
Details zur Übergabe: `docs/UEBERGABE.md`. Was schiefging und warum: `docs/PROBLEME-UND-LOESUNGEN.md`.
Ältere Anleitungen (Domainumzug, Kasse, Siezen, Feed, Anfragen) liegen als `*.md` im Hauptordner.
