# Chrono24-Warenfeed

Der Feed liegt unter **`/chrono24.xml`**, aktuell also

```
https://hahn-vo-df1c.vercel.app/chrono24.xml
```

Sobald die eigene Domain steht, wird daraus `https://shop.hahn-vo.de/chrono24.xml`.
**Dann die Adresse bei Chrono24 nachziehen.**

## Was das ist

Eine XML-Datei, die den kompletten verfügbaren Bestand aufzählt. Chrono24 ruft
sie alle 12 bis 24 Stunden von selbst ab. Es wird nichts hochgeladen, nichts
verschickt, nichts gespeichert: Die Datei entsteht **im Moment des Abrufs** aus
dem aktuellen Shopify-Bestand.

Damit reicht es, eine Uhr einmal in Shopify zu pflegen:

| In Shopify | Auf Chrono24 nach dem nächsten Abruf |
|---|---|
| Preis geändert | neuer Preis |
| Bestand auf 0 (verkauft) | Anzeige verschwindet |
| Neue Uhr angelegt | neue Anzeige |
| Bild oder Beschreibung getauscht | übernommen |

**Einbahnstraße:** Ein Verkauf *auf* Chrono24 verringert den Shopify-Bestand
**nicht**. Diese Richtung bleibt Handarbeit — dafür bietet Chrono24 keine
Schnittstelle an.

## Vor der Freischaltung klären — sonst Dubletten

Die derzeit 53 Anzeigen auf Chrono24 sind von Hand angelegt und tragen andere
Artikelnummern als der Feed (dort ist es der interne Code, z. B. `427`).
Importiert Chrono24 den Feed einfach zusätzlich, steht **jede dieser Uhren
danach zweimal** drin.

Das muss vor der Freischaltung mit dem Chrono24-Support geklärt werden. Am
besten schreibt Hannes aus dem Händlerkonto und stellt beide Fragen in einem:

> Guten Tag,
>
> wir möchten unseren Bestand künftig per XML-Feed übermitteln. Die Datei liegt
> unter https://…/chrono24.xml und wird bei jedem Abruf aktuell erzeugt.
>
> Wir haben derzeit 53 Inserate, die wir von Hand angelegt haben. Wie werden
> diese dem Feed zugeordnet, damit keine Dubletten entstehen? Als Artikelnummer
> (`article_id`) verwenden wir unseren internen Code, z. B. 427.
>
> Händlerkonto: hahnundvo

## Einstellungen

Alles Einstellbare steht ganz oben in `api/chrono24.js` im Block
`EINSTELLUNGEN`:

| Einstellung | Bedeutung | steht auf |
|---|---|---|
| `aufschlagProzent` | Aufschlag auf den Website-Preis in Prozent | `0` |
| `aufschlagEuro` | zusätzlicher Aufschlag in Euro | `0` |
| `rundenAuf` | auf volle x € runden | `10` |
| `nurVerfuegbare` | ausverkaufte Uhren weglassen | `true` |
| `ausschluss` | Liste interner Codes, die nie gemeldet werden | leer |
| `preise` | eigener Chrono24-Preis je internem Code, statt Website-Preis + Aufschlag | `642-26` → 11.890 €, `K-7` → 10.690 €, `K-8` → 8.490 €, `K-9` → 6.790 € |
| `nurUhren` | Zubehör weglassen (erkannt am fehlenden Aufzug) | `true` |

**Zum Preis:** Aktuell geht der Website-Preis unverändert an Chrono24. Von 46
vergleichbaren Anzeigen war Chrono24 bisher 33-mal teurer, im Mittel um 200 €.
Wenn das so bleiben soll, `aufschlagProzent` oder `aufschlagEuro` setzen — eine
Zahl, kein Code.

## Eine einzelne Uhr heraushalten

Ohne Programmieren: In Shopify beim Produkt das Feld **Chrono24** auf `nein`
setzen (Produkt öffnen → Metafelder → Chrono24). Leer heißt „wird gemeldet".
Beim nächsten Abruf verschwindet die Uhr.

## Was der Feed übermittelt

Aus den Shopify-Metafeldern des Namensraums `uhr`, übersetzt ins englische
Chrono24-Vokabular:

| Chrono24 | Quelle | Beispiel |
|---|---|---|
| `article_id` | `uhr.code` | 427 |
| `price` | Shopify-Preis (+ Aufschlag) | 3390 |
| `brand` / `model` | Produkttitel, erstes Wort ist die Marke | Tudor / Black Bay 36 |
| `reference_number` | `uhr.referenz` | 79503 |
| `condition` | `uhr.zustand` | Sehr gut → very good (mint) |
| `taxation_scheme` | `uhr.besteuerung` | Differenzbesteuerung → margin |
| `movement_type` | `uhr.aufzug` | Automatik → automatic |
| `caliber` | `uhr.kaliber` | 2824 |
| `case_material` | `uhr.gehaeuse` | Edelstahl/Gelbgold → Steel/Yellow gold |
| `case_diameter` | `uhr.durchmesser` | 36 mm |
| `crystal` | `uhr.glas` | Saphirglas → sapphire glass |
| `dial_color` | `uhr.zifferblatt` | Schwarz → Black |
| `bracelet_material` | `uhr.band` | Leder → Leather |
| `gender` | `uhr.geschlecht` | Herren → Mens |
| `original_papers` / `original_box` | `uhr.lieferumfang` | Full Set → beides yes |
| `year` | `uhr.baujahr` | 2022 |
| `description` | Shopify-Beschreibung, ohne HTML | |
| `link` | eigene Produktseite | produkt.html?id=… |
| `image` | Shopify-Bilder, bis zu 16 | |

Zusätze in Klammern werden aus den Datenfeldern entfernt: Aus
`Weiß (Außenring leichte Schäden, siehe Bilder)` wird im Feld `White`. Der
Hinweis selbst steht weiterhin in der Beschreibung.

## Marken

Mehrwortige Marken lassen sich nicht am ersten Leerzeichen abtrennen — sonst
stünde bei A. Lange & Söhne die Marke „A." in der Anzeige. Deshalb liegt in
`api/_shop.js` eine feste Markenliste, längster Treffer gewinnt. Kommt eine
neue Marke ins Sortiment, dort eintragen. Fehlt sie, nimmt der Feed das erste
Wort des Titels — die Anzeige entsteht trotzdem, nur mit ungenauer Marke.

`IWC Schaffhausen` wird zu Marke `IWC`, der Zusatz fällt auch aus dem
Modellnamen. `Tag Heuer` wird einheitlich zu `TAG Heuer`.

## Stand der Daten (26.08.2026)

**68 Uhren im Feed.** Die beiden Zubehörartikel bleiben draußen, dazu vier
Uhren, die Hannes am 26.08. als verkauft gemeldet hat (412, 335, 334,
4267) — deren Bestand steht auf 0.

Alle Pflichtfelder sind gefüllt. Die beiden optionalen bleiben teilweise leer:
**Baujahr** ist bei zwölf Uhren laut Hannes nicht bekannt und bleibt deshalb
leer statt geschätzt. **Kaliber** verlangt Chrono24 nicht — 52 Uhren haben
eines, die übrigen bleiben ohne. Beides ist abgeschlossen, nicht offen.

## Prüfen, ob der Feed stimmt

Adresse im Browser öffnen. Ganz oben stehen Erzeugungszeitpunkt und Anzahl:

```xml
<!-- Hahn & Vo OHG — Warenbestand, erzeugt am 2026-08-26T… -->
<!-- 72 Artikel von 74 im Shop -->
```

Kommt stattdessen `Feed konnte nicht erzeugt werden: …`, ist Shopify nicht
erreichbar oder der Storefront-Token wurde gelöscht. Der Token steht in
`api/chrono24.js` und ist derselbe wie in `js/data.js` — er ist öffentlich und
darf nur lesen.
