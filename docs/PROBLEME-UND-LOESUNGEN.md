# Was schiefging — und was daraus zur Regel wurde

Vollständige Liste aus dem Aufbau (09.08.–04.09.2026). Jeder Eintrag: was man sah,
woran es lag, was jetzt gilt. Die Skripte in `tools/` erzwingen die meisten Regeln;
diese Datei erklärt, warum sie da sind. Lesen, bevor man etwas „vereinfacht".

## A. Bestand und Shopify

**A1 · Falsche Datenquelle beim Aufbau (10./21.08.).** Der alte GoDaddy-Shop hatte zwei Schnittstellen; die erste lieferte einen eingefrorenen Juni-Stand: 28 längst verkaufte Uhren drin, 32 neue fehlten. Aufgeflogen erst durch Hannes („seit Wochen verkauft"). → Nie eine Schnittstelle als Wahrheit nehmen, die man nicht gegen die sichtbare Seite geprüft hat. Heute gilt nur Shopify.

**A2 · Alte Schnittstelle zeigt Verkauftes weiter (26.08.).** 66 in der API, 63 live. → Bestandsfragen nur gegen das, was Kunden sehen.

**A3 · Zuordnung per Namen kapert Produkte (21.08.).** „Carrera Calibre 16 Chronograph" griff nach „Carrera Calibre 16"; vier kurze Namen fielen durch eine Mindestlänge; fünf Uhren hießen gleich. → Zuordnung ist eine feste ID-Karte (`window.SHOPIFY.products`), nie ein Namensvergleich. Gleichnamige Uhren nach Größe/Baujahr unterscheiden.

**A4 · Falsche CSV importiert (25.08.).** Die alte Produktdatei statt der Metafeld-Datei: 23 Doppelgänger, 43 SKUs überschrieben. → Nur eine Import-Datei im Ordner; alte als `archiv-alt_…` benennen. „Bestehende überschreiben" bewusst setzen oder weglassen — beides hat Folgen.

**A5 · CSV-Import verlangt vollständige Variantenzeilen (25.08.).** Handle + Titel reichen nicht, sobald eine Variante berührt wird. → Werte aus dem Shop auslesen und unverändert zurückschreiben.

**A6 · Parser hat Felder verrutscht (25.08.).** „Gehäusematerial: Weißgold Armbandmaterial: Leder …" in einem Feld; acht Uhren mit einem Prüfsatz als Uhrwerk. → Werte vor dem Schreiben ansehen; Auswahlfelder gegen die erlaubten Werte prüfen (`tools/uhr.py` tut das).

**A7 · Nichts raten (25./26.08.).** Kaliber nur mit Beleg (Chrono24-Fremdanzeigen derselben Referenz), vier Funde verworfen, weil sie dem Aufzug widersprachen; ein falsches „3135" war schon einmal drin. Baujahr „n.b." bleibt leer. Vier Modellzusätze („175 Years", „Reverso Classic") waren erfunden und flogen raus. → Weglassen schlägt Schätzen. Unsicherheiten im Bericht nennen.

**A8 · Besteuerung pauschal (25./26.08.).** Erst „alle Differenzbesteuerung" auf Ansage, dann Hannes' Liste: 19 Differenz, 55 Regel. Der Shopify-Schalter „Steuer berechnen" muss zur Besteuerung passen (§ 25a → aus). → Dreistufenregel: § 25a im Inseratstext → Differenz; Code/Referenz in `daten/differenzbesteuerung.csv` → Differenz; sonst Regel. `taxable` folgt daraus.

**A9 · Interne Codes waren unsere Nummern, nicht Hannes' (26./27.08.).** 51 von 52 falsch; Kollision 458 (Bvlgari vs. Rolex) hätte Überweisungen falsch zugeordnet; 41 Beschreibungen nannten den alten Code im Überweisungssatz; `HV-`-Präfix und vergessenes `-26`-Suffix. → Code = Artikelnummer aus Hannes' Liste, ohne Präfix, mit Suffix; das Skript schreibt den Überweisungssatz aus dem Feld, nie von Hand.

**A10 · „Reserviert" gibt es in Shopify nicht (26.08.).** Bestand 0 hieße „verkauft". → Metafeld `uhr.reserviert = Ja`; verkauft schlägt reserviert; Chrono24 bekommt `on_hold` statt Rauswurf.

**A11 · Storefront-Token darf keine Bestandszahlen lesen (26.08.).** `totalInventory` → ACCESS_DENIED. → `availableForSale` genügt.

**A12 · Marke am ersten Leerzeichen abgetrennt (26.08.).** „A." statt „A. Lange & Söhne", „Tag"/„TAG" gemischt; Markenband verlinkte „Tag Heuer" auf einen leeren Shop; Markenmenü versteckte zwölf Marken hinter einem unsichtbaren macOS-Scrollbalken (28.08.). → Feste MARKEN-Liste mit Längster-Treffer-Regel in `api/_shop.js`; Menü zweispaltig ohne Höhenlimit; `?brand=` case-tolerant. Neue mehrwortige Marke → Liste erweitern.

**A13 · Kein Admin-Token über das Dev-Dashboard (21.08.).** `atkn_`-Tokens sind CI-Tokens, die Admin-API lehnt sie ab (401). → Connector (claude.ai → Shopify) oder Client-Credentials einer App aus dem Dev-Dashboard **des Shop-Inhabers** (`tools/uhr.py --direkt`).

**A14 · `publishableUnpublish` blockt der Connector (02.09.).** → Ausblenden über `AUSSCHLUSS` in `api/katalog.js` + Bestand 0. Umkehrbar, im Repo dokumentiert.

**A15 · Ersatzkennungen statt `pXXX` (31.08./04.09.).** `fallback_bauen.py` holt Kennungen vom deployten Stand — eine gerade eingetragene Uhr kam als `s1234567` zurück, Bildordner passten nicht. → Lokale Zuordnung gewinnt (im Skript eingebaut).

**A16 · Alte Kennungen kollidieren mit Code-Kennungen.** p427 ist die Royal (Code 428), Code 427 gehört zur Black Bay. → `tools/uhr.py frei pXXX` vor jeder Vergabe.

**A17 · „Rausnehmen" ist mehrdeutig (02.09.).** Verkauft (sichtbar bleiben) ≠ löschen ≠ ausblenden. → Nachfragen, wenn nicht eindeutig; Skill `uhr-status` erklärt die drei Wege.

**A18 · Löschen ohne Bestellprüfung.** → `tools/uhr.py loeschen` prüft die letzten 50 Bestellungen und stoppt.

**A19 · Fehlt in der Inventarliste ≠ verkauft (26.08.).** Neun Uhren im Wert von 175.340 € (MB&F!) fehlten in Hannes' Liste — alle noch im Verkauf. → Aus Abwesenheit nie einen Status ableiten. Listen altern innerhalb von Stunden.

**A20 · Vorlagenfehler im Inserat (03.09.).** Omega-Inserat begann mit „Rolex GMT-Master II … Full Set" plus Platzhalter „(Optional 1-2 Sätze …)". → Text nicht übernehmen, aus den Datenzeilen schreiben, Fehler melden. Das Skript warnt bei fremden Marken und Platzhaltern.

**A21 · Preisänderung und Zwischenspeicher (01.09.).** Kasse rechnet sofort mit Shopify, die Seite zeigt bis 5 min den alten Preis. → Beides im Bericht nennen; 1-€-Test besser als Entwurfsauftrag statt echtem Produkt.

## B. Bilder

**B1 · Fremde Fotos aus dem alten Shop (28.08.).** Fotoserien benachbarter Uhren (DSC06826–06880) wurden beim GoDaddy-Upload vermischt; zwei Uhren zeigten fremde Modelle. → Alle 401 Bilder geprüft; bei Übernahmen jede Galerie einzeln ansehen.

**B2 · Kleinanzeigen mischt „ähnliche Anzeigen" in die Bildliste (03.09.).** Teils Fotos der eigenen anderen Uhren, in niedriger Auflösung, doppelt. → Eigene Galerie = `$_59.AUTO`-Block **vor** dem Verkäufer-Avatar (`prod-user`); Download in `$_86.JPG` mit Referer. `tools/inserat.py` macht genau das.

**B3 · Tippfehler in einer Bild-URL → Medium FAILED (03.09.).** Handgetippte Kleinanzeigen-Adressen. → Bilder liegen im Projekt, Shopify lädt sie von hahn-vo.de; Aufrufe werden erzeugt, nicht getippt; `medien_pruefen` wartet auf READY.

**B4 · Zweites Bild falsch, Kontrolle per ID (31.08.).** Gehäuseboden stand als Hover-Bild; „passt" gemeldet, weil nur die notierte ID verglichen wurde; dann nur die lokale Kopie angesehen. → Live-Kontaktbogen (`tools/uhr.py pruefen`) ansehen. Bilder werden angesehen, nicht abgeglichen.

**B5 · Schrägaufnahmen als Frontbild (04.09.).** Drei Uhren mit steilen Detailaufnahmen an Position 2; auf Vorschaubildern wirkten sie frontal. → Regel: Cover frontal; zweites Set oder weiteres Frontbild (Hand/Handgelenk, Zifferblatt frontal); im Zweifel Einzeldatei öffnen. `uhr.json` verlangt die ausdrückliche Bestätigung.

**B6 · Rezensionsfotos ins Leere (21.08.).** Bestandsabgleich löschte Uhrenordner, 10 von 20 Stimmen ohne Bild. → Rezensionsfotos liegen getrennt in `assets/img/reviews/`; Skript warnt bei toten Verweisen.

**B7 · Rezensionsbilder zu stark beschnitten (04.09.).** 16:10-Rahmen auf quadratischen Fotos. → 1:1. Vorher: Cosmo-J.-Foto auf die Uhr zugeschnitten (01.09.).

## C. Website und Gestaltung

**C1 · Milchige Kartenfotos (01.09.).** Ein absolut positionierter Lichtverlauf (`.stimmen::before`, 55 % Deckkraft) lag über den Karten — nur links, wo der Verlauf sitzt. Gemessen: 177/147/134 → 118/114/118. → `position: relative; z-index: 1` auf den Inhalt. Bei „manche Bilder sehen komisch aus" zuerst Deko-Ebenen prüfen.

**C2 · „0 Monate Garantie" aus der Instagram-Story (29.08.).** Zahlen standen nur in der Animation; Instagram-Browser reicht Scroll nicht durch, „Bewegung reduzieren" schaltet Animationen ab. → Endwert im HTML, Animation zählt hoch, Auslöser IntersectionObserver. QC mit `reduced_motion`, ohne JS, mit Instagram-UA.

**C3 · Scroll-Bühne ruckelt / bleibt hängen (28.08.).** Zwei Glättungen (Lenis + Kopplung) stritten; Touch-Pinning wackelt mit iOS-Adressleiste; Bild-Ziehen bricht Wischgesten ab. → Desktop Rastpunkte über Lenis; Touch nicht pinnen, Wischen/Tippen/Selbstlauf; `img { pointer-events:none }`. Später (31.08./01.09.) durch Kartendeck ersetzt, weil Hannes mehrere Stimmen auf einen Blick will.

**C4 · GSAP + CSS-Transform addieren sich (28.08.).** 110 % + 110 % = 220 %. → Ausgangslage nur an einer Stelle setzen.

**C5 · Schaufenster „Neu eingetroffen" aktualisierte sich nicht (24.08./04.09.).** Erst ein fest verdrahteter MB&F-Film in Ebene 1, dann eine handgepflegte Liste (`window.NEW_IN`), die niemand nachzog. → Alles leitet sich aus dem Bestand ab (zuletzt angelegt, erhältlich, keine Zubehör). Keine handgepflegten Listen mehr.

**C6 · Kurztexte brachen bei „Ref." ab (04.09.).** Satztrennung an `. `. → `inSaetze` mit Abkürzungsliste in `js/home.js`.

**C7 · Gelber Streifen über der Seite (26.08.).** Regex fürs Einsetzen der Meta-Tags nahm das schließende `>` nicht mit; Descriptions auf sechs Seiten kaputt. → Nach programmatischen HTML-Änderungen die Seite rendern und die Head-Tags prüfen.

**C8 · Deutsche Anführungszeichen in Attributen (10.08.).** Ein globaler Quote-Fix setzte `class=”x”`; Karten unstyled, kein JS-Fehler. → Quote-Passes nur auf Textknoten; danach `grep '=”'`.

**C9 · Handy: Schaltfläche über den Rand, Markenfilter 100 px unsichtbar (24.08.).** → Unter 760 px Buttons unter die Überschrift; Filterlisten über die ganze Zeilenbreite. QC bei 360/390/768 px.

**C10 · Unbekannte Kennung zeigte die erste Uhr (26.08.).** → leitet in den Shop.

**C11 · www als zweite Website, keine Sitemap, keine robots.txt, keine Link-Vorschau (26.08.).** → 308 auf die Hauptadresse; `/sitemap.xml` aus dem Bestand; Open-Graph auf allen Seiten. Offen: Produktseiten zeigen beim Teilen noch das Gründerfoto statt der Uhr (serverseitig nötig).

**C12 · Weiterleitungen auf sich selbst (26.08.).** `/shop`, `/impressum`, `/agb` hießen im alten Shop genauso → Endlosschleife. → Weiterleitungen nach jedem Adress-Umbau durchklicken.

**C13 · Adressen ohne `.html` (27.08.).** `cleanUrls` in `vercel.json`; alte `.html`-Adressen leiten weiter. Verweise in 12 Seiten, 7 JS-Dateien, Sitemap, Feed mitgezogen.

**C14 · Preloader: Variablenname kollidierte mit Funktion (10.08.).** `tick` vs. `tick()` im selben Scope. → Sprechende Namen.

**C15 · „Diese Uhr"-Abschnitt doppelt zum Datenblatt (02.09.).** Auf Wunsch entfernt; nur „Zustand im Detail" + „Unser Versprechen" bleiben.

**C16 · Gedankenstriche.** Der Kunde streicht sie konsequent aus Texten. → sparsam.

## D. Kasse, Zahlung, Shopify-Einstellungen

**D1 · Shopify-Kasse ist nicht einbettbar (21.08.).** `x-frame-options: DENY`. → Eigene Schritte auf der Website, Zahlung in der Shopify-Kasse unter `shop.hahn-vo.de`, gebrandet.

**D2 · Passwortschutz bleibt ohne bezahlten Tarif (21.08.).** → Tarif buchen, dann Vertriebskanäle → Onlineshop → Passwortschutz aus.

**D3 · Abholung nicht wählbar (26.08.).** Standort hatte keine Adresse. → Showroom-Adresse eingetragen, Standort „Showroom Frankfurt". Abholzeit kennt nur feste Werte (27.08.) → „1 Stunde".

**D4 · BIC mit Null statt O, Du-Form, 24 Stunden (24.08.).** HELADEF1**O**FF. → Zahlungsanweisungen korrigiert, sieben Tage Frist (Tageslimits bei fünfstelligen Beträgen).

**D5 · Kasse siezen geht nicht per API (24.08.).** Deutsch ist Hauptsprache. → 27 relevante Textbausteine von Hand (`SHOPIFY-SIEZEN.md`).

**D6 · Zahlarten wirkten klickbar (26.08.), Liste veraltete (27.08./01.09.).** „Sofortüberweisung" gab es nie, Klarna fehlte. → Website zählt keine Zahlarten auf; Shopify zeigt sie selbst.

**D7 · PayPal über 10.000 € scheitert (01.09.).** Kein Fehler der Seite: Käuferlimit; zusätzlich blockt der WhatsApp-In-App-Browser das PayPal-Fenster. → Kunde in Safari, unten „Zahlung → PayPal", nicht der Express-Knopf; bei fünfstelligen Beträgen Überweisung anbieten. Empfangslimit des Shops: keins.

**D8 · 1-€-Testprodukt (01.09.).** Erscheint sofort vorn im Shop, erzeugt eine echte Bestellung (#1002, erstattet, noch offen). → Entwurfsauftrag mit Zahlungslink statt Produkt.

**D9 · Shopify-Statistik zeigt nur Kasse (30.08.).** Sitzungen/Conversion dort bedeutungslos. → Vercel Web Analytics auf allen Seiten, Datenschutz Abschnitt 4.

**D11 · Shopify Payments verarbeitet keine Waren über 10.000 USD (Trust & Safety, 04.09.).** Ein Käufer scheiterte mit PayPal (Käuferlimit), ein anderer zahlte 5.450 € per Karte (Order #1003, nach zwei Fehlversuchen erfolgreich) — und Shopify hielt die Auszahlung zurück: „High Value Goods" im Shop. Frist für die Rückmeldung: 06.09. → Uhren ab ~8.500 € (≈ 10.000 USD) sind in Shopify **Entwurf** und stehen in `daten/anfrage-uhren.json`; die Website zeigt sie als **„Auf Anfrage"** (WhatsApp, Telefon, Showroom, Überweisung), Chrono24-Feed und Sitemap führen sie weiter. Neue Uhren über der Grenze gehören in diese Liste, nicht in den Shopify-Verkauf. Alternative wäre ein anderer Zahlungsanbieter (z. B. Mollie) statt Shopify Payments.

**D10 · Versandzonen** (21.08.): Deutschland 0 €, Europa 79 €, Welt 150 € — sonst rechnet Shopify eigene Preise und die Kasse weicht von der Website ab.

## E. Anfragen und Mail

**E1 · Formulare gingen nirgendwohin (29.08.).** Suchauftrag und Ankauf speicherten nur im Browser; „eingegangen" war gelogen. → `api/anfrage.js` + Resend an `info@hahntime.com` (hahn-vo.de hat keinen Mailserver); bei Fehlschlag ehrliche Meldung mit WhatsApp-Knopf.

**E2 · Fotos beim Ankauf fehlten (30.08.).** Nur Dateinamen kamen an. → Browser verkleinert auf 1.400 px und hängt bis zu sechs Bilder an.

**E3 · Absender ist `onboarding@resend.dev`.** Domain nicht bei Resend verifiziert — Kosmetik, drei DNS-Einträge bei GoDaddy würden es lösen.

## F. Deploy, Domain, Infrastruktur

**F1 · Domainumzug (26.08.).** GoDaddys alte API-Schlüssel sind abgekündigt → Personal Access Token. Nach der Umstellung zeigte der eigene Rechner noch die alte Seite — DNS-Cache mit Stunden-TTL, nicht die Umstellung. → Vor dem Zurückdrehen öffentliche Auflöser fragen.

**F2 · Live-Prüfung mit Cache-Umgeher (01.09.).** `?t=` zeigte den neuen Stand, Besucher sahen fünf Minuten den alten — mehrere „ist live"-Meldungen waren zu früh. → Immer auch ohne Umgeher prüfen (`tools/uhr.py` tut beides).

**F3 · Vercel Hobby (04.09.).** Nur für nicht-kommerzielle Nutzung; 50.000 Analytics-Ereignisse/Monat für alle Projekte im Team; 1 Monat Verlauf; keine Team-Mitglieder. → Eigenes Pro-Team für Hahn & Vo, Hannes Owner (`docs/UEBERGABE.md`).

**F4 · Kleinanzeigen-Sperre (03.09.).** „IP-Bereich vorübergehend gesperrt" nach wenigen Abrufen, besonders unsichtbar/headless. → Sichtbarer Browser, Startseite + Cookies zuerst, warten, wiederholen. Von einem deutschen Anschluss vermutlich seltener.

**F5 · Chrono24 Händlerbereich-Links (29.08.)** brauchen Login; eBay und Chrono24 blocken schlichte Abrufe (04.09.). → Öffentliche Inseratsadresse nehmen; Ordner-Eingang als Rückfall.

**F6 · Screenshots aus dem falschen Verzeichnis (28.08.).** Relative Pfade → stale Bilder, „gefixte" Fehler tauchten wieder auf. → Absolute Pfade.

**F7 · `re.sub` mit JSON als Ersatztext (01.09.).** Backslashes als Gruppenverweise, 2374 Einschübe in `js/data.js`. Durch `git diff --stat` gefangen. → Slice-Ersetzung; `node -e require` als Syntaxprüfung; Diff ansehen, bevor committet wird.

**F8 · zsh teilt Wörter nicht (04.09.).** `set -- $ok` — kosmetisch, aber Prüfschleifen können deshalb Unsinn melden. → Python statt Shell für Prüfungen.

**F9 · Statische Datei schlägt Rewrite (04.09.).** Ein Rewrite `/produkt → /api/produkt` griff nicht, solange `produkt.html` im Projekt lag — Vercel liefert Dateien vor Rewrites aus. → Vorlage heißt `produkt-vorlage.html`; `/produkt` bedient `api/produkt.js`; lokal `tools/serve.py`. Nie wieder eine `produkt.html` anlegen.

**F10 · Produktseiten ohne Kopfdaten (bis 04.09.).** Titel, Beschreibung, Vorschaubild und schema.org kamen nur per JavaScript — WhatsApp-Vorschau zeigte das Gründerfoto, KI-Suchmaschinen sahen „Uhr — Hahn & Vo". → Serverseitig gefüllt (`api/produkt.js`): Product/Offer/Breadcrumb, Meta, OG; Lighthouse-SEO 92 → 100.

**F11 · Layout-Sprung im Shop, Wert 0,5 (04.09.).** Kam der Katalog erst nach dem ersten Bild, füllte sich das leere Raster und schob den Abschnitt darunter um 44.000 px. Timing-abhängig, deshalb nur manchmal messbar. → `.product-grid:empty { min-height: 120vh }`. Hero: das per JS eingesetzte HV-Zeichen hatte keine reservierte Höhe → `aspect-ratio` auf `.hero-mark`.

**F12 · Schriften ohne Preload.** Inter und Marcellus luden erst nach dem CSS. → `<link rel="preload">` in allen Seiten, Preconnect zu Shopify-CDN.

**F13 · Markenseite ohne Stil (05.09.).** `/marken/rolex` lud `css/style.css` relativ → `/marken/css/style.css` → 404; die Seite kam nackt. → `api/marke.js` macht alle `css/ js/ vendor/ assets/`-Pfade absolut. Gilt für jede Seite, die unter einem Unterpfad ausgeliefert wird.

**C17 · IntersectionObserver meldet Sprünge nicht (05.09.).** Die Kaufleiste sollte erscheinen, sobald die Knöpfe oben weggescrollt sind. Bei einem Sprung (Anker, schneller Wisch, `scrollTo`) fliegt das Element am Bild vorbei, ohne je darin zu sein — der Observer feuert nicht. → Scroll-Ereignis mit `requestAnimationFrame` und `getBoundingClientRect().bottom < 0`.

## G. Arbeitsweise

**G1 · Nur die lokale Kopie geprüft (31.08.).** Die hatte zufällig die richtige Reihenfolge. → Live ist die Wahrheit; lokale Kopie ist Reserve.

**G2 · Berichte zu lang (02./04.09.).** → Ergebnis, Link, Unsicherheiten. Drei bis fünf Sätze.

**G3 · Screenshots des Nutzers kommen manchmal nicht an.** → Kurz sagen, dass kein Bild angekommen ist, statt zu raten.

**G4 · Der Auftrag ist die Wahrheit, nicht die Vermutung.** „Bild als zweites nehmen" heißt: genau dieses Bild an Position 2 — in Shopify UND in der lokalen Kopie, dann live ansehen.

### H. Ratgeber und Kontrast (05.09.2026)

- **Fünf Karten in zwei Spalten lassen eine graue Lücke** (Raster-Hintergrund `--line` scheint durch). Lösung: `.ratgeber-karte:last-child:nth-child(odd) { grid-column: 1 / -1 }` — die letzte Karte allein in der Reihe füllt beide Spalten.
- **Statische Seiten in einem Unterordner (`ratgeber/`) brauchen absolute Pfade** (`/css/…`, `/js/…`, `/vendor/…`), sonst lädt nichts. Der `hv:kopf`-Block aus den Hauptseiten hat relative Preload-Pfade — beim Kopieren anpassen.
- **Akkordeon der Startseite hängt an `window.FAQ`.** Für statische FAQ-Blöcke gibt es in `js/shell.js` den Handler für `.acc[data-acc-statisch]` — gleiches Markup, kein JSON.
- **Lighthouse-Kontrast:** `--ink-60` (0,6) ergab 3,8:1 auf Creme, `--sold` #8B8B83 3,4:1 auf Weiß. Jetzt 0,72 bzw. #6C6C64 (≥ 4,5:1). Namen der Variablen unverändert gelassen, damit kein Selektor angefasst werden musste.
- **Lokaler Server meldet 404 für `/api/katalog.json` und `/_vercel/insights/script.js`** — normal, beides gibt es nur auf Vercel. Die Seiten fallen auf `js/data.js` zurück.

### I. Shopify Payments und Waren über 10.000 USD (06.09.2026)

- **Was passiert ist:** Shopify Trust & Safety hat die Auszahlungen des gesamten Shops eingefroren, weil Waren über 10.000 USD gelistet waren. Betroffen war auch eine bereits bezahlte Bestellung über 5.450 €.
- **Wo die Regel steht:** nirgends öffentlich. Die Shopify-Payments-AGB verweisen auf die Listen der Abwickler (in Deutschland Stripe, PayPal, Adyen); dort stehen Uhren als *genehmigungspflichtig*, nicht als verboten. Eine Freigabe ist jederzeit widerrufbar.
- **🚩 Nur EIN Kartenabwickler je Shop.** Shopify hat schriftlich bestätigt, dass sich Zahlungsanbieter nicht nach Produkt aufteilen lassen. Entweder Shopify Payments und keine Ware über 10.000 USD, oder vollständiger Wechsel.
- **PayPal, Klarna und Banküberweisung sind eigene Gateways** und von der Sperre nicht betroffen. Nachweisbar an `order.transactions.gateway`: `paypal` bzw. `shopify_payments`. Der Connector darf `shopifyPaymentsAccount` nicht lesen (fehlende Berechtigung) — Auszahlungsstatus nur im Adminbereich sichtbar.
- **Gelöst durch** `status: DRAFT` auf den zwölf betroffenen Produkten. Das nimmt sie aus Storefront und allen Verkaufskanälen, ist umkehrbar und erhält alle Daten. Nicht löschen.
- **Mollie hat dieselbe Wand:** Kreditkarte maximal 10.000 € je Transaktion („default limit"). PayPal über Mollie ohne Anbieterlimit. Vor jedem Wechsel schriftlich klären: Warenkategorie, Höchstbetrag, Sicherheitseinbehaltung, Auszahlungsfrist, Haftung bei Rückbuchung.

### J. Kleinanzeigen liefert Bilder nicht mehr unter $_86.JPG (07.09.2026)

- **Symptom:** `tools/inserat.py` meldet für jedes Bild „HTTP Error 404". Titel, Preis und Beschreibung kommen normal an.
- **Ursache:** Die Fassung `?rule=$_86.JPG` gibt es nicht mehr. Von allen geprüften Regeln ($_86, $_59.JPG, $_57, $_35, $_72, $_2, $_20, $_0, $_1, $_3, $_27, ohne Regel) antwortet nur noch **`$_59.AUTO`** mit einem Bild, 960×960.
- **Gelöst:** `KA_BILDREGELN` in `tools/inserat.py` — Kette `['$_86.JPG', '$_59.AUTO']`, größte zuerst, mit Rückfall. Kommt die große Fassung zurück, wird sie automatisch wieder genommen.
- **🚩 Davon getrennt:** Bei frisch eingestellten Inseraten liefert Kleinanzeigens Bildserver für einen Teil der Fotos dauerhaft 404, obwohl der Galeriezähler alle zeigt. Geprüft mit direktem Abruf, mit der Browser-Sitzung (Cookies) und an der gerenderten Seite — die Bilder sind auch im echten Browser 0×0. Das ist kein Sperrproblem und lässt sich nicht umgehen. Dann später erneut lesen oder die Fotos über den Ordner-Eingang (`--ordner`) einspielen.

### K. Shopify sieht den eigenen Laden nicht (07.09.2026)

- **Symptom:** Trust & Safety konnte nicht bestätigen, dass die Uhren über 10.000 USD entfernt sind, obwohl sie längst Entwürfe waren. Begründung: „Your store URL redirects away from your Shopify store."
- **Ursache:** `storefront-weiterleitung.js`. Die Datei liegt in **unserem** Repo und wird vom Shopify-Theme über `https://hahn-vo.de/storefront-weiterleitung.js` eingebunden. Sie wirft jeden Besucher von shop.hahn-vo.de auf hahn-vo.de — auch den Prüfer, der dort die teuren Uhren stehen sah.
- **Gelöst:** Schalter `AKTIV = false` im Kopf der Datei, pushen. Kein Zugriff auf das Shopify-Theme nötig, weil das Theme die Datei unverändert von uns lädt.
- **🚩 Nach der Prüfung wieder auf `true` setzen.** Sonst landen Kunden, die aus der Kasse zurückgehen, im nackten Shopify-Laden mit fremdem Aussehen und denselben Uhren.
- **Prüfen lässt sich das ohne Adminzugang:** `curl -o /dev/null -w "%{http_code}" https://shop.hahn-vo.de/products/<handle>` — Entwürfe geben 404, aktive Produkte 200.

### L. Ausgetauschte Bilder kommen beim Kunden nicht an (13.09.2026)

- **Symptom:** Nach einem Bildtausch zeigt die Produktseite bei manchen Besuchern weiter das alte Foto, obwohl Datei und Katalog live stimmen. Bei uns sah alles richtig aus, bei Hannes nicht.
- **Ursache:** `vercel.json` schickte für `/assets/products/(.*)` `max-age=86400, stale-while-revalidate=86400` mit. Da ein Austausch den **Dateinamen nicht ändert** (`0.jpg` bleibt `0.jpg`), behält der Browser die alte Datei bis zu **48 Stunden**. Prüfen mit `curl -sI <bild-url>` — `age:` und `x-vercel-cache: HIT` verraten es.
- **Gelöst, zweifach:**
  1. **Sofort:** versionierte Adresse. In `daten/anfrage-uhren.json` die Bildpfade mit `?v=2` versehen (beim nächsten Mal `?v=3`). Neue Adresse = neuer Zwischenspeicher, wirkt für alle sofort.
  2. **Dauerhaft:** Frist auf `/assets/products/` von 24 h auf **1 h** gesenkt. Der Edge-Cache bleibt über `stale-while-revalidate` erhalten, die Seite bleibt schnell.
- **🚩 Betrifft nur Uhren „per Überweisung".** Normale Uhren bekommen ihre Bilder von der Shopify-Adresse mit jedes Mal neuem Dateinamen — dort gibt es das Problem nicht. Beim Geben der Bilder an Shopify trotzdem ein `?v=` anhängen, sonst holt Shopify selbst eine alte Fassung.


### M. Ein Zusatztext steht in Shopify, aber niemand sieht ihn (14.09.2026)

- **Symptom:** Valentin gibt einen Satz vor („Die Uhr erhielt bei Omega eine vollständige Revision …"), der Satz steht nachweislich in der Shopify-Beschreibung und in `/api/katalog.json` — auf der Produktseite ist er trotzdem nicht zu finden.
- **Ursache:** Die Produktseite zeigt den Shopify-Fließtext **absichtlich nicht**. `js/product.js` schneidet die Beschreibung am Satz „Unsere Bilder sind unbearbeitet …" ab und rendert danach nur noch die Zustandsliste („Alle wichtigen Details auf einen Blick:") und den festen Block „Unser Versprechen". Dasselbe in `api/produkt.js` für die serverseitige Fassung. Das war 2026 eine bewusste Entscheidung, weil der Fließtext bei fast allen Uhren nur das Datenblatt darüber wiederholte.
- **Gelöst:** eigenes Metafeld **`uhr.hinweis`** (`multi_line_text_field`). Es kommt über `FELDER` in `api/_shop.js` und `note` in `api/katalog.js` auf die Seite und wird in `js/product.js` und `api/produkt.js` als Abschnitt **„Besonderheiten"** über „Unser Versprechen" gerendert. In `uhr.json` heißt das Feld `hinweis` (oberste Ebene), `tools/uhr.py` schreibt es beim Anlegen mit.
- **🚩 Merksatz:** Was der Kunde lesen soll, gehört in `hinweis` — nicht nur in `absaetze`. Die Absätze wirken auf Meta-Description, Chrono24-Feed und Shopify, nicht auf die sichtbare Produktseite.
- **🚩 Neue Metafeld-Definitionen brauchen bis zu einer Stunde.** Direkt nach `metafieldDefinitionCreate` lieferte die Storefront-API das Feld bei einer Abfrage vom Rechner sofort, aus der Vercel-Region aber über eine Stunde lang nicht — gleicher Token, gleiche Abfrage, gleiche API-Fassung. Das ist Shopifys Cache der storefront-sichtbaren Felder, kein Fehler bei uns. Neue Abfragetexte oder `?frisch=` helfen nicht. Deshalb gibt es `daten/hinweise.json`: dieselbe Kennung `pXXX` → derselbe Text, wird in `api/katalog.js` nur genommen, wenn Shopify nichts liefert. Shopify gewinnt immer.

### N. „Full Set" bei Revisionspapieren (14.09.2026)

- **Symptom:** p349 (Omega Aqua Terra) stand als „Full Set (Box & Papiere)" auf der Seite. Das Inserat nannte aber nur „Omega Revisionspapiere aus dem 31. August 2026" und die Box — keine Originalpapiere.
- **Gelöst:** neuer Auswahlwert **`Box & Revisionspapiere`** in der Shopify-Metafeld-Definition `uhr.lieferumfang` (`metafieldDefinitionUpdate`, Auswahlliste ergänzt), in `WAHL` in `tools/uhr.py` und in `LIEFERUMFANG` in `api/chrono24.js` (dort `original_papers: no`, `original_box: yes` — Chrono24 meint mit „Papiere" die Garantiekarte ab Werk).
- **🚩 Regel:** „Full Set" nur mit **Original**papieren. Service- oder Revisionsbelege sind keine.

### O. Garantie abweichend von 12 Monaten für eine einzelne Uhr (28.09.2026)

- **Auftrag:** p564 (Cartier Santos Galbée 2319) mit 2 Jahren Garantie statt 12 Monaten, „überall".
- **Wo die 12 standen:** Kachel „12 Monate" unter dem Kaufknopf (`produkt-vorlage.html`, jetzt `#pdGarantie`), erster Satz unter „Unser Versprechen" (`js/product.js` und `api/produkt.js`), Meta-Beschreibung (`beschreibungKurz` in `api/produkt.js`).
- **Gelöst:** Metafeld **`uhr.garantie`** (`number_integer`, Monate) → Feld `warranty` in `/api/katalog.json` → alle drei Stellen nehmen die Zahl der Uhr, sonst 12. Rückfall `daten/garantie.json` wie bei den Hinweisen (neue Metafelder brauchen bis zu einer Stunde).
- **Bewusst NICHT geändert:** die Firmenbeschreibung im schema.org-Block (`Organization`, „Jede Uhr … 12 Monate Garantie") und die Markenseiten — das sind Aussagen über den Laden, nicht über diese Uhr, und Regel 8 in `CLAUDE.md` bleibt 12 Monate.
- Steht ein Versprechen-Satz wortgleich unter „Besonderheiten", wird er unten nicht wiederholt.
