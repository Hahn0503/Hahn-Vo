---
name: uhr-bilder
description: Bilder einer Uhr ändern — Reihenfolge, Cover/Hover-Bild, Bild entfernen oder ein neues Foto hinzufügen. Auslöser: „das Bild als zweites", „Coverbild falsch", „falsches Bild drin", „dieses Bild soll beim Drüberfahren kommen".
---

# Bilder einer Uhr ändern

Auf der Website gilt: **Bild 0 = Cover der Shop-Karte und erstes Galeriebild. Bild 1 = Hover-Bild
der Karte** (erscheint beim Überfahren mit der Maus). Regel von Valentin für Bild 1:
Uhr frontal in der Hand (Hannes, 07.10.2026); nur wenn es so ein Bild nicht gibt, das Set-Foto.

## Erst sehen, dann ändern

```
python3 tools/uhr.py pruefen p567
```

Öffne `arbeit/_pruefen-p567/live-bogen.jpg` mit dem Read-Werkzeug. Die Beschriftung
sagt, welches Bild Cover und welches Hover ist. **Erst ansehen, dann handeln** —
am 31.08. stand ein Gehäuseboden als zweites Bild, weil nur IDs verglichen wurden.

## Ändern

```
python3 tools/uhr.py bilder p567 --reihenfolge 0,3,1,2,4,5      # jede Position genau einmal, neue Reihenfolge
python3 tools/uhr.py bilder p567 --entfernen 3                   # Bild an Position 3 löschen (fremde Uhr, Duplikat)
python3 tools/uhr.py bilder p567 --hinzufuegen ~/Downloads/set.jpg --position 1   # neues Foto, an Position 1
```

Hat der Nutzer ein Bild angehängt, liegt es unter dem im Gespräch genannten
Upload-Pfad — diesen Pfad an `--hinzufuegen` geben. Das Skript legt es unter
`assets/products/p567/` ab, pusht, wartet auf Vercel und gibt Shopify die
hahn-vo.de-Adresse.

Shopify-Aufrufe wörtlich über den Connector ausführen, Antwort als JSON in
`arbeit/_bilder-p567/antwort.json`, dann
`python3 tools/uhr.py ergebnis arbeit/_bilder-p567 --datei arbeit/_bilder-p567/antwort.json`
bis „Alle Schritte erledigt". Das Skript ordnet die lokalen Reservebilder mit,
baut die Rückfalldatei und committet.

## Danach — Pflicht

```
python3 tools/uhr.py pruefen p567
```

und `live-bogen.jpg` **ansehen**. Berichten, was Cover und Hover jetzt zeigen.
Die Produktseite holt die Reihenfolge live — Besucher sehen sie nach spätestens fünf Minuten.

## Fremde Bilder

Kommt ein Bild einer anderen Uhr vor (Nachbaranzeige, falsche Referenz, andere
Farbe), entfernen und im Bericht erklären, wie es hineinkam. Bekannte Ursachen:
Kleinanzeigen zeigt „ähnliche Anzeigen" (eigene andere Uhren von Hahn & Vo);
alte GoDaddy-Uploads hatten Fotoserien benachbarter Uhren vermischt (DSC-Nummern).
