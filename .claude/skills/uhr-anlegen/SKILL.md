---
name: uhr-anlegen
description: Eine Uhr aus einem Inserat (Kleinanzeigen, eBay, Chrono24) oder einem Fotoordner in Shopify anlegen, damit sie auf hahn-vo.de erscheint. Auslöser sind Sätze wie „hochladen", „auf die Website", „inserieren", „Uhr anlegen" mit einem Link oder Ordner.
---

# Uhr anlegen

Du bekommst einen Link oder einen Ordner und sollst die Uhr auf hahn-vo.de bringen.
Alles Deterministische tun Skripte. Du liest, entscheidest und siehst hin.
Die Regeln unten sind aus echten Fehlern entstanden — jede einzelne hat schon
einmal eine falsche Uhr, ein falsches Bild oder eine falsche Steuer produziert.

## Bevor du anfängst

- **Der Auftrag ist ein Satz** („<Link> hochladen für 3.250"). Entscheidungen zu Bildern, Besteuerung, Feldern triffst du nach den Regeln hier und begründest sie im Bericht (siehe CLAUDE.md). Eine Frage stellst du nur, wenn Preis oder interner Code fehlen oder das Inserat nicht zum Link passt.
- **Preis:** Steht im Auftrag ein Preis? Sonst gilt 1:1 der Inseratspreis. „VB" ist ein Hinweis, kein Preis — dann nachfragen.
- **Über 8.500 € → „Per Überweisung".** Macht das Skript von selbst: Shopify-Entwurf ohne Verkaufskanäle, Eintrag in `daten/anfrage-uhren.json`, auf der Website Kaufknopf „Per Überweisung kaufen" statt Warenkorb. Grund: Shopify Payments verarbeitet keine Ware über 10.000 USD. Nichts von Hand anlegen. Nur wenn Hannes es ausdrücklich anders will: `"ueberweisung": false` bzw. `true` in `uhr.json`.
- **Sonderwünsche:** „das Set als zweites Bild", „dieses Bild als Hover" — merken, das entscheidet Phase 3.
- Mehrere Links? Jede Uhr einzeln, vollständig, nacheinander.

## Phase 1 — Inserat holen

```
python3 tools/inserat.py "<URL>" --name <kurzname>        # z. B. --name omega-constellation
python3 tools/inserat.py --ordner ~/Desktop/neue-uhr      # Rückfall: Fotos + beschreibung.txt
```

Ergebnis: `arbeit/<name>/inserat.json`, `bilder/`, `kontaktbogen.jpg`.
Ein sichtbarer Browser geht auf — das ist gewollt (Kleinanzeigen sperrt unsichtbare).
Meldet das Skript nach allen Versuchen eine Sperre: dem Nutzer sagen, später
erneut versuchen, oder er zieht die Fotos in einen Ordner (Ordner-Eingang).

## Phase 2 — Lesen und Felder füllen

Lies `inserat.json` **vollständig**, besonders `beschreibung`. Dort stehen alle
Angaben — Referenz, Baujahr, Durchmesser, Werk, Lieferumfang, Zustand, oft § 25a.
Lege `arbeit/<name>/uhr.json` an. Vorlage mit allen Regeln: `docs/uhr.beispiel.json`.

Feste Regeln:

- **Nichts erfinden.** Kein Baujahr, kein Kaliber, kein Glas, das nicht im Inserat steht. Weglassen ist richtig, schätzen ist falsch.
- **Kennung:** `p` + Nummer vor dem Bindestrich des internen Codes (`567-26` → `p567`). Vorher `python3 tools/uhr.py frei p567`. Alte GoDaddy-Kennungen kollidieren gelegentlich — dann die nächste freie Nummer nehmen und es im Bericht nennen.
- **Interner Code** = Hannes' Artikelnummer aus dem Inserat (Verwendungszweck, „Interner Code"). Fehlt er, nachfragen — nicht ausdenken; er ist Chrono24-Artikelnummer und Überweisungszweck.
- **Titel** beginnt mit der Marke in der Schreibweise aus `api/_shop.js` (MARKEN). Unbekannte Marke → dort eintragen, sonst fehlt die Uhr im Markenfilter.
- **Besteuerung, Dreistufenregel:** § 25a im Inseratstext → Differenzbesteuerung. Sonst Code/Referenz in `daten/differenzbesteuerung.csv` → Differenzbesteuerung. Sonst Regelbesteuerung. Das Skript prüft das nach und blockt Abweichungen ohne Begründung.
- **Lieferumfang** nach Text UND Bildern. „Full Set" nur mit Box und **Original**papieren. Sind es Service-/Revisionsbelege statt Garantiekarte → `Box & Revisionspapiere` (Fehler vom 14.09.2026 bei p349).
- **`hinweis`** (optional, oberste Ebene in `uhr.json`): Steht im Auftrag „das bitte noch als Zusatz hinzufügen", gehört der Satz **hierhin**, nicht nur in die Absätze. Er erscheint dann als Abschnitt **„Besonderheiten"** oben auf der Produktseite, direkt unter dem Preis. Der übrige Shopify-Fließtext wird auf der Seite bewusst nicht gezeigt — was der Kunde lesen soll, muss in `hinweis`. Absätze durch eine Leerzeile trennen.
  Bei einer Uhr, die schon online ist, geht das mit einem Befehl:
  ```
  python3 tools/uhr.py hinweis p349 "Erster Absatz.

Zweiter Absatz."     # ohne Text = Hinweis entfernen
  ```
  Der setzt das Shopify-Metafeld, schreibt `daten/hinweise.json`, pusht und **wartet, bis der Text live steht**. Danach nachsehen, nicht nur melden — genau das ist am 14.09.2026 zweimal schiefgegangen.
- **Geschlecht:** nennt das Inserat nichts, unter 34 mm eher Damen; 34–36 mm Unisex vertretbar; sonst Herren. Unsicherheit im Bericht nennen.
- **Absätze:** 1–2 Absätze in ganzen Sätzen aus dem Inserat. Ohne den Satz „Unsere Bilder sind unbearbeitet …" und ohne die Überweisungszeile — das hängt das Skript an. Steht im Inserat eine **fremde Marke** (Vorlagenfehler: „Rolex GMT-Master" bei einer Omega, Platzhalter „(Optional 1-2 Sätze …)"), den Text NICHT übernehmen, aus den Datenzeilen selbst schreiben und den Fehler im Bericht melden, damit Hannes das Inserat korrigiert.

## Phase 3 — Bilder ANSEHEN

Öffne `arbeit/<name>/kontaktbogen.jpg` mit dem Read-Werkzeug und sieh jedes Bild an.

- **Cover (Position 0):** frontale Zifferblattansicht. Nicht die schönste Aufnahme — die frontale.
- **Zweites Bild (Position 1) = Hover-Bild auf der Shop-Karte:** das **Set-Foto** (Box, Papiere), sonst ein **weiteres Frontbild** (Uhr in der Hand oder am Handgelenk, Zifferblatt frontal). Entweder oder — Regel von Valentin.
- **Steile Schrägaufnahmen** (Gehäuse dominiert, Zifferblatt verzerrt) sind KEIN Frontbild. Das ist am 04.09. bei drei Uhren schiefgegangen, weil die kleinen Vorschauen frontal wirkten. Im Zweifel die Einzeldatei `bilder/NN.jpg` öffnen.
- **Fremde Uhren** (Nachbaranzeigen, andere Referenz, andere Farbe) und Duplikate weglassen. Der Kleinanzeigen-Leser filtert schon, aber sieh trotzdem hin.
- Reihenfolge danach: Details, Band, Boden — wie ein Kunde die Uhr in die Hand nimmt.

Trag `bilder.reihenfolge`, `cover_ist_front: true`, `zweites: "set"|"front"` (bei front zusätzlich `zweites_ist_front: true`) und sprechende `alt`-Texte für 0 und 1 ein.

## Phase 4 — Anlegen

```
python3 tools/uhr.py vorschau arbeit/<name>     # prüft uhr.json, zeigt, was rausginge — bis „Eingabe in Ordnung"
python3 tools/uhr.py anlegen  arbeit/<name>     # startet den Ablauf
```

Das Skript arbeitet, bis Shopify dran ist, und druckt dann einen GraphQL-Aufruf. Dann:

1. Den Aufruf **wörtlich, unverändert** über den Shopify-Connector ausführen — `graphql_mutation` bei „mutation", `graphql_query` bei Abfragen. Nichts kürzen, keine IDs „verbessern".
2. Die Antwort **unverändert als JSON** in `arbeit/<name>/antwort.json` schreiben.
3. `python3 tools/uhr.py ergebnis arbeit/<name> --datei arbeit/<name>/antwort.json`

Wiederholen, bis „Alle Schritte erledigt" erscheint. Das Skript prüft jede Antwort,
merkt sich IDs, wartet auf Vercel, baut die Rückfalldatei, committet und pusht —
auch die Zuordnung in `js/data.js`, bevor es live prüft (Stand 29.09.2026; vorher
meldete die Live-Prüfung bei jeder neuen Uhr „Uhr fehlt").
Meldet es einen FEHLER: Meldung lesen, Ursache in `uhr.json` beheben, dann
`python3 tools/uhr.py weiter arbeit/<name>` — der Ablauf setzt dort fort, wo er stand.

Liegen Zugangsdaten in `~/.hv-tokens` (`SHOPIFY_ADMIN_TOKEN` oder `SHOPIFY_CLIENT_ID`/`SECRET`),
geht alles ohne Connector: `python3 tools/uhr.py anlegen arbeit/<name> --direkt`.

## Phase 5 — Live ansehen und berichten

```
python3 tools/uhr.py pruefen p567
```

Öffne `arbeit/_pruefen-p567/live-bogen.jpg` und **sieh hin**: Cover frontal? Hover = Set oder Front?
Nicht nach IDs urteilen — das war der Fehler vom 31.08. (Gehäuseboden stand als zweites Bild, die Kontrolle hatte nur die notierte ID verglichen).

Bericht in drei bis fünf Sätzen, mehr nicht: Link, Preis, Besteuerung mit Grund, was Cover und zweites Bild zeigen, und jede Unsicherheit (fehlendes Baujahr, Geschlecht geschätzt, Fehler im Inseratstext, Kennung abweichend vom Code). Keine Schrittliste, keine Erklärung des Ablaufs.

## Was du NIE tust

- Mutationen freihändig tippen oder an anderen Produkten „nebenbei" etwas ändern.
- `js/data.js` von Hand editieren — nur über `tools/uhr.py` und `tools/fallback_bauen.py`.
- Bild-URLs von Kleinanzeigen/eBay direkt an Shopify geben — die Bilder liegen im Projekt und werden von hahn-vo.de geladen (das Skript macht das).
- Live prüfen und dabei nur den Cache-Umgeher (`?frisch=`) benutzen — Besucher sehen den Stand bis zu fünf Minuten später. Das Skript prüft beides.
