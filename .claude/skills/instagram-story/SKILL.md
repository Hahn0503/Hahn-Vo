---
name: instagram-story
description: Nach jeder Bestandsänderung auf hahn-vo.de automatisch eine Instagram-Story für @hahn.vo posten — „Neu eingetroffen" nach dem Hochladen, „Reserviert" oder „Verkauft" nach dem Statuswechsel. Läuft immer als letzter Schritt von uhr-anlegen und uhr-status, ohne Rückfrage. Auch direkt auslösbar: „Story für p585", „auf Instagram hochladen".
---

# Instagram-Story nach Bestandsänderung

**Regel (Hannes, 10.10.2026):** Wird eine Uhr hochgeladen, reserviert oder verkauft, geht
**automatisch** eine Story raus. Nicht nachfragen, nicht auf den Cloud-Auftrag warten.
Einzige Ausnahme: der Auftrag sagt ausdrücklich „ohne Instagram" / „keine Story".

| Anlass | `art` | Story? |
|---|---|---|
| Uhr neu hochgeladen (`uhr-anlegen`) | `neu` | ja, mit Preis |
| auf reserviert gesetzt | `reserviert` | ja |
| auf verkauft gesetzt | `verkauft` | ja |
| wieder erhältlich, Preisänderung, Hinweis, Bilder | — | nein, nur `uhr.story` angleichen |
| gelöscht | — | nein |

Mehrere Uhren in einem Auftrag → je Uhr eine Story, nacheinander.

## Voraussetzung

Erst wenn der Website-Ablauf **„Alle Schritte erledigt"** gemeldet hat — die Werkbank liest den
Bestand live von `hahn-vo.de/api/katalog.json`. Steht dort noch der alte Status, ist es zu früh.

## Ablauf

1. **Gedächtnis lesen** (Shopify-Connector, `graphql_query`):
   ```
   { product(id: "gid://shopify/Product/<ID>") { story: metafield(namespace: "uhr", key: "story") { value } } }
   ```
   Steht dort schon der Zielzustand (`verkauft` bei verkauft, `reserviert`, bei neu irgendein Wert),
   hat der Cloud-Auftrag bereits gepostet → **nicht** doppelt posten, im Bericht sagen.

2. **Rendern** in der Composio-Werkbank (`COMPOSIO_REMOTE_WORKBENCH`):
   ```python
   import requests, time
   exec(requests.get(f"https://hahn-vo.de/tools/instagram_story.py?t={int(time.time())}").text)
   u = uhr_nach_id("p585")
   print(u["status"], u["brand"], u["name"])   # muss zum Anlass passen (sold / reserved / available)
   # Community-Preis (nur wenn der Auftrag einen Instagram-Preis nennt): u["price"] = 2390
   pfad = render(u, "verkauft")                # "neu" | "reserviert" | "verkauft"
   print(upload_local_file(pfad)[0]["s3_url"])
   ```

3. **Ansehen — Pflicht.** Vorschau lokal laden und mit Read öffnen:
   ```
   curl -sL -o <scratchpad>/p585-verkauft.jpg <s3_url>
   ```
   Prüfen: richtige Uhr im Bild, Marke/Modell/Ref./Jahr stimmen, Banner passt zum Anlass,
   bei `neu` der Preis. Stimmt etwas nicht → nicht posten, melden.

4. **Posten:**
   ```python
   print(posten(pfad))   # gibt die Medien-ID zurück
   ```

5. **Gedächtnis schreiben** (`graphql_mutation`), damit der Cloud-Auftrag nicht doppelt postet:
   ```
   mutation { metafieldsSet(metafields: [{ownerId: "gid://shopify/Product/<ID>", namespace: "uhr", key: "story", type: "single_line_text_field", value: "<erhaeltlich|reserviert|verkauft>"}]) { metafields { value } userErrors { field message } } }
   ```
   Nach `neu` wird `erhaeltlich` geschrieben.

Die Shopify-Produkt-ID steht in der Ausgabe von `tools/uhr.py` (Schritt `lager_abfragen`)
oder in `js/data.js` (`window.SHOPIFY.products`).

## Bericht

Ein Satz je Story, angehängt an den Website-Bericht: „Story veröffentlicht, Medien-ID …".
Fehler beim Posten (Instagram-Verbindung, Upload) → Fehlermeldung nennen; die Website-Änderung
bleibt gültig, der Cloud-Auftrag holt die Story beim nächsten Lauf nach, solange `uhr.story`
nicht gesetzt wurde.

## Was du nie tust

- Posten, bevor die Website den neuen Status zeigt.
- Posten, ohne die Vorschau angesehen zu haben.
- Website-Preis angleichen, weil die Story einen Community-Preis zeigt — der ist gewollt.
- Andere Formate (Feed-Post, Reel) — nur Storys.
