# Hahn & Vo — Website und Bestand (hahn-vo.de)

Luxusuhren-Händler in Frankfurt (Hannes Hahn, Minh Vo). Diese Repo ist die
komplette Website: statisches HTML/CSS/JS plus drei Vercel-Funktionen. Der
Bestand kommt **live aus Shopify** (`tami1g-0j.myshopify.com`), die Kasse ist
die Shopify-Kasse unter `shop.hahn-vo.de`. Alles Weitere in `docs/SYSTEM.md`.

Sprache im Projekt: Deutsch — Code-Kommentare, Commit-Nachrichten, Berichte.
Auf der Website wird gesiezt. Antworten an den Betreiber kurz: Ergebnis, Link,
Unsicherheiten. Keine Methodik-Erzählung.

**Ein Satz ist ein ganzer Auftrag.** „<Link> hochladen für 3.250", „p567 auf verkauft",
„p567 löschen" — ausführen, nicht rückfragen, nicht bestätigen lassen, keine Optionen
anbieten. Entscheidungen triffst du nach den Regeln und begründest sie im Bericht.
Fragen nur, wenn wirklich etwas fehlt (Preis, interner Code) oder etwas unwiderruflich
ist (Löschen: genau eine Frage). Werkzeug-Erlaubnisse erteilt der Betreiber beim
ersten Aufruf mit „Immer erlauben" — danach läuft alles ohne Nachfrage, das ist Absicht.

## Skills — für Bestandsaufgaben IMMER zuerst den passenden Skill lesen

| Auftrag | Skill |
|---|---|
| Link/Ordner → Uhr auf die Website | `uhr-anlegen` |
| verkauft / reserviert / erhältlich / Preis / Sale | `uhr-status` |
| komplett löschen | `uhr-loeschen` |
| Bildreihenfolge, Cover, Hover, Bild raus/rein | `uhr-bilder` |
| Gestaltung, Texte, Rezensionen, Seiten | `website-aendern` |
| nach hochladen / reserviert / verkauft (automatisch) | `instagram-story` |

Die Skripte `tools/inserat.py` und `tools/uhr.py` führen; du liest, entscheidest und siehst hin.
Shopify-Aufrufe, die `tools/uhr.py` druckt, **wörtlich** ausführen und die Antwort
unverändert zurückgeben. Keine Mutationen freihändig, nie „nebenbei" an anderen Produkten.

## Regeln des Betreibers (Valentin/Hannes), die nicht verhandelbar sind

1. **Beschreibungen lesen.** Im Inserat stehen alle Angaben. Nichts erfinden, nichts schätzen — Baujahr, Kaliber, Glas nur, wenn sie dastehen.
2. **Jede Uhr unter „Marken" auffindbar.** Titel beginnt mit der Marke; mehrwortige Marken stehen in `api/_shop.js` (MARKEN). Neue Marke → dort eintragen.
3. **Zweites Bild = Uhr frontal in der Hand** (Handschuh/Hand, Zifferblatt gerade; Hannes, 07.10.2026). Nur wenn es so ein Bild nicht gibt: Set-Foto. Steile Schrägaufnahmen sind kein Frontbild. Immer den Kontaktbogen ansehen, nie nach IDs urteilen.
4. **Besteuerung, Dreistufenregel:** § 25a im Inseratstext → Differenzbesteuerung; sonst Code/Referenz in `daten/differenzbesteuerung.csv` → Differenzbesteuerung; sonst Regelbesteuerung. Es gibt beides — keine Pauschale. **Fehlt der Passus, ist das Absicht** — Hannes schreibt ihn immer hinein, wenn differenzbesteuert wird (bestätigt 13.09.2026). Also nicht nachfragen, nicht als Unsicherheit melden.
5. **Preise 1:1 aus dem Inserat**, außer der Auftrag nennt einen anderen.
6. **Interner Code = Hannes' Artikelnummer** (`427`, `567-26`), ohne Präfix. Er ist Überweisungszweck und Chrono24-Artikelnummer — nie erfinden, nie doppelt vergeben.
7. Produktseite ohne Abschnitt „Diese Uhr"; Kasse zählt keine Zahlarten auf; Rezensionen wörtlich; „Neu eingetroffen" leitet sich aus dem Bestand ab.
8. Feste Geschäftsaussagen: 12 Monate Garantie (Wasserdichtigkeit ausgenommen), 14 Tage Rückgabe, Versand in Deutschland kostenlos (Europa 79 €, Welt 150 €), Angebot beim Ankauf binnen 12 Stunden, Prüfung 1–3 Werktage, Auszahlung per Echtzeitüberweisung. Nicht umformulieren.

## Wie das System zusammenhängt (Kurzfassung)

- **Shopify** hält Produkte, Metafelder (`uhr.*`), Bestand, Kasse. Bestand 0 = „Verkauft"; Metafeld `uhr.reserviert = Ja` = „Reserviert". Verkauft schlägt reserviert.
- **`api/katalog.js`** liefert `/api/katalog.json` aus Shopify (Storefront-API, 5 min Edge-Cache). Kennung `pXXX` aus `window.SHOPIFY.products` in `js/data.js`, sonst Ersatz `s` + 7 Ziffern.
- **`js/data.js`** = Rückfalldatei (Shopify nicht erreichbar) + Zuordnung `pXXX → Shopify-ID` + Kundenstimmen/FAQ/Kontakt. Wird von `tools/fallback_bauen.py` erzeugt; die lokale Zuordnung gewinnt.
- **`assets/products/pXXX/N.jpg`** = eigene Kopie der Bilder; Shopify lädt neue Bilder von genau dort (öffentliche hahn-vo.de-Adresse).
- **Git push auf `main` → Vercel deployt** (~40 s). Kein Vercel-Zugang nötig.
- **`/chrono24.xml`** = Feed aus demselben Bestand (`api/chrono24.js`), Chrono24 zieht ihn 12–24-stündlich.
- **`api/anfrage.js`** schickt Suchauftrag/Ankauf per Resend an `info@hahntime.com`.

## Stolperfallen, die schon einmal Schaden angerichtet haben

Vollständig mit Ursache und Lösung: `docs/PROBLEME-UND-LOESUNGEN.md`. Die wichtigsten:

- Live-Prüfung mit `?frisch=`/`?t=` zeigt dir, was Besucher noch **nicht** sehen — immer auch ohne prüfen.
- `js/data.js` nie mit `re.sub` + JSON-Ersatztext bearbeiten (Backslash-Falle) — Slice-Ersetzung, danach `node -e require`.
- `fallback_bauen.py` holt Kennungen vom **deployten** Stand — deshalb gewinnt jetzt die lokale Zuordnung; nicht zurückbauen.
- Bild-URLs von Kleinanzeigen an Shopify: Tippfehler → Medium FAILED. Bilder liegen deshalb im Projekt.
- Kleinanzeigen: eigene Galerie = `$_59.AUTO`-Block vor dem Verkäufer-Avatar; danach fremde „ähnliche Anzeigen" (oft eigene andere Uhren!).
- Kleinanzeigen-Inserate können Vorlagenfehler enthalten (Omega mit „Rolex GMT-Master"-Text) — nicht übernehmen, melden.
- `publishableUnpublish` blockt der Connector — ausblenden über `AUSSCHLUSS` in `api/katalog.js`.
- Alte GoDaddy-Kennungen (p426, p2446 …) folgen keinem Schema; neue Kennungen = `p` + Code-Präfix, vorher `tools/uhr.py frei`.
- Deko-Ebenen (`::before` mit Verlauf) legen sich über Inhalt → milchige Bilder; Zähler brauchen den Endwert im HTML; GSAP + CSS-Transform addieren sich.

## Konten und Zugänge

Shopify gehört Hannes (info@hahntime.com). Connector: eigenes claude.ai → Connectors → Shopify.
Optional für den Direktmodus: `~/.hv-tokens` mit `SHOPIFY_ADMIN_TOKEN=shpat_…` oder
`SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET` (App im Dev-Dashboard des Shop-Inhabers).
GitHub-Push-Recht aufs Repo genügt zum Deployen. Alles Weitere: `docs/UEBERGABE.md`.

Umgebung prüfen: `tools/einrichten.sh`. Lokaler Server: `./serve.command` → http://localhost:8440.
