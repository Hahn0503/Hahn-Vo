---
name: uhr-status
description: Eine Uhr auf verkauft, reserviert oder wieder erhältlich setzen oder ihren Preis ändern (auch Sale mit Streichpreis). Auslöser sind Produktlinks von hahn-vo.de mit „verkauft", „reservieren", „Reservierung raus", „Preis ändern", „auf Sale".
---

# Status oder Preis einer Uhr ändern

Kennung steht im Link: `hahn-vo.de/produkt?id=p567` → `p567`. Alternativ der interne Code (`567-26`).

```
python3 tools/uhr.py status p567 verkauft       # Bestand 0, Reserviert-Kennzeichen weg → „Verkauft" bleibt sichtbar
python3 tools/uhr.py status p567 reserviert     # Kennzeichen uhr.reserviert = Ja, Bestand bleibt 1
python3 tools/uhr.py status p567 erhaeltlich    # Kennzeichen weg, Bestand 1
python3 tools/uhr.py preis  p567 3250           # neuer Preis
python3 tools/uhr.py preis  p567 9190 --listenpreis 9990   # Sale: Streichpreis über dem Preis
python3 tools/uhr.py hinweis p567 "Erster Absatz.

Zweiter Absatz."                                # Besonderheiten oben auf der Produktseite
python3 tools/uhr.py hinweis p567               # ohne Text: Besonderheiten wieder weg
```

**„2 Jahre Garantie" / „24 Monate statt 12" für eine Uhr** = Metafeld `uhr.garantie` (Zahl, Monate) setzen
und `daten/garantie.json` ergänzen (`"p564": 24`), pushen. Die Produktseite nimmt die Zahl dann in der
Kachel unter dem Kaufknopf, im Versprechen-Satz und in der Google-Beschreibung. Ohne Eintrag gilt 12.
Beim Anlegen geht es direkt über `"garantie_monate": 24` in `uhr.json`.

**„Das noch als Zusatz dazu", „bitte hinzufügen", „das soll draufstehen"** = `hinweis`.
Nicht in die Shopify-Beschreibung schreiben — die zeigt die Produktseite bewusst nicht.
Der Befehl setzt das Metafeld, schreibt `daten/hinweise.json`, pusht und wartet, bis der
Text live steht. Danach mit `pruefen` oder einem Blick auf die Seite bestätigen — am
14.09.2026 wurde zweimal „ist drin" gemeldet, ohne dass es sichtbar war.

Das Skript druckt Shopify-Aufrufe. Jeden **wörtlich** über den Connector ausführen
(`graphql_query` bei Abfragen, `graphql_mutation` bei „mutation"), Antwort
unverändert als JSON in `arbeit/_<aktion>-p567/antwort.json` schreiben, dann

```
python3 tools/uhr.py ergebnis arbeit/_<aktion>-p567 --datei arbeit/_<aktion>-p567/antwort.json
```

bis „Alle Schritte erledigt". Bei Uhren „Per Überweisung" (über 8.500 €) zieht das Skript
`daten/anfrage-uhren.json` selbst nach und wartet aufs Deployment — dieselben Befehle, nichts
von Hand. Soll eine Kassen-Uhr über 8.500 € steigen, stoppt `preis` mit Erklärung (Umzug auf
„Per Überweisung" siehe `docs/SYSTEM.md`).

Das Skript prüft vorher, dass der Shopify-Titel zur
Marke passt (Sicherheitsstopp), prüft danach live — erst ohne, dann mit dem
Besucher-Zwischenspeicher — baut die Rückfalldatei und committet.

## Wörter, die Missverständnisse erzeugen

- **„rausnehmen"** kann dreierlei heißen. Nicht nachfragen — als *verkauft* ausführen und im Bericht die beiden anderen Wege in einem Satz nennen:
  - *verkauft* — bleibt mit Kennzeichen „Verkauft" am Ende des Shops (Beleg, was durchgeht; Standard)
  - *löschen* — komplett weg, siehe Skill `uhr-loeschen`
  - *ausblenden* — Produkt bleibt in Shopify, verschwindet nur von der Website: Code in `AUSSCHLUSS` in `api/katalog.js` eintragen, committen, pushen (so wurde die IWC 570-26 am 02.09. behandelt)
- **„erhältlich machen"** einer verkauften Uhr setzt den Bestand wieder auf 1 — nur tun, wenn das gemeint ist.
- **„Sale"** heißt Streichpreis (`--listenpreis`), nicht nur Preissenkung. Die Website zeigt dann „Listenpreis neu".

## Zeitgesteuert („am Dienstag auf verkauft")

Geht nur über einen Cloud-Auftrag im eigenen claude.ai-Konto (`/schedule`). Vorlage: der
Auftrag vom 04.09. für p567 — erst Titel und SKU prüfen, dann Bestand 0 und
Kennzeichen löschen, dann live gegenprüfen. Danach `python3 tools/fallback_bauen.py`
nachziehen und committen, weil der Cloud-Auftrag die Rückfalldatei nicht kennt.

## Nachwirkungen, die du nennst

- Chrono24 zieht den Feed alle 12–24 h; verkaufte Uhren verschwinden dort von selbst, ein von Hand angelegtes Chrono24-Inserat muss Hannes selbst beenden.
- Besucher sehen den neuen Stand bis zu fünf Minuten später (Edge-Cache). Für den Kauf ist das egal — die Kasse rechnet immer mit Shopify.
- Der Preis in der Kasse kommt aus Shopify, nicht von der Seite: Preisänderung wirkt sofort auf Zahlungen.
