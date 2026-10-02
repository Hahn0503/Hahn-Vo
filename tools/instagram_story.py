# -*- coding: utf-8 -*-
"""Instagram-Storys für Hahn & Vo: neu eingetroffen / reserviert / verkauft.

Läuft NICHT lokal, sondern in der Composio-Werkbank (Instagram-Connector).
Die Werkbank lädt diese Datei bei jedem Lauf frisch von
https://hahn-vo.de/tools/instagram_story.py — dadurch liegt die Vorlage
dauerhaft im Repo und nicht in einem Sandbox-Ordner, der mit der Sitzung
verschwindet (so ist die Automatik am 01./02.10.2026 stillschweigend
ausgefallen: /mnt/files/hahnvo/ gab es im nächsten Lauf nicht mehr).

Gedächtnis: Shopify-Metafeld uhr.story je Produkt
(„erhaeltlich" | „reserviert" | „verkauft"). Die Werkbank kommt nicht an
Shopify heran; der Cloud-Auftrag liest das Metafeld vorher über den
Shopify-Connector, übergibt es an run(zustand=…) und schreibt danach
zurück, was run() unter „zustand_neu" meldet.

Aufruf in der Werkbank:
    import json, requests
    exec(requests.get("https://hahn-vo.de/tools/instagram_story.py", timeout=30).text)
    print(json.dumps(run(zustand={...}, max_posts=3), ensure_ascii=False))

Nur eine Story erzeugen, ohne zu posten (Vorschau):
    pfad = render(uhr_nach_id("p3734"), "reserviert")
"""
import io
import json
import os
import re
import time
from datetime import datetime, timezone

import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASIS = "https://hahn-vo.de"
W, H = 1080, 1920
NAVY_OBEN = (13, 50, 77)
NAVY_UNTEN = (8, 33, 53)
HELLBLAU = (179, 200, 219)
WEISS = (255, 255, 255)
GRAU = (196, 208, 220)
ORDNER = "/tmp/hahnvo-story"
NEU_TAGE = 3          # „neu eingetroffen" nur für Uhren, die höchstens so alt sind

TEXT = {
    "neu": ("NEU EINGETROFFEN", "Neu eingetroffen"),
    "reserviert": ("RESERVIERT", "Reserviert"),
    "verkauft": ("VERKAUFT", "Verkauft"),
}


# ---------------------------------------------------------------- Bestand

def bestand():
    """Alle Uhren der Website: Katalog (Shopify live) plus Überweisungs-Uhren."""
    k = requests.get(BASIS + "/api/katalog.json?t=%d" % time.time(), timeout=40).json()
    uhren = {p["id"]: p for p in k["produkte"]}
    try:
        a = requests.get(BASIS + "/daten/anfrage-uhren.json?t=%d" % time.time(), timeout=30).json()
        for p in a.get("produkte", []):
            alt = uhren.get(p["id"], {})
            neu = dict(alt); neu.update(p)
            neu["shopifyId"] = p.get("shopifyId") or alt.get("shopifyId")
            uhren[p["id"]] = neu
    except Exception:
        pass
    return uhren


def uhr_nach_id(kennung):
    return bestand()[kennung]


def zustand_von(status):
    return {"sold": "verkauft", "reserved": "reserviert"}.get(status, "erhaeltlich")


# ---------------------------------------------------------------- Gestaltung

_schriften = {}


def schrift(name, groesse):
    """Marcellus/Inter von der Website; Rückfall auf Systemschriften."""
    if name not in _schriften:
        pfad = os.path.join(ORDNER, name + ".ttf")
        if not os.path.exists(pfad):
            os.makedirs(ORDNER, exist_ok=True)
            quelle = {"marcellus": "/vendor/fonts/marcellus.woff2", "inter": "/vendor/fonts/inter-var.woff2"}[name]
            try:
                try:
                    import brotli  # noqa: F401  (WOFF2 entpacken)
                except ImportError:
                    import subprocess, sys
                    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "brotli"], capture_output=True)
                from fontTools.ttLib import TTFont
                roh = requests.get(BASIS + quelle, timeout=30).content
                f = TTFont(io.BytesIO(roh)); f.flavor = None; f.save(pfad)
            except Exception:
                pfad = {"marcellus": "/usr/share/fonts/opentype/urw-base35/P052-Roman.otf",
                        "inter": "/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf"}[name]
        _schriften[name] = pfad
    f = ImageFont.truetype(_schriften[name], groesse)
    if name == "inter":
        try:
            f.set_variation_by_axes([500])
        except Exception:
            pass
    return f


def text_mittig(d, y, text, f, farbe, sperren=0):
    """Zentriert, optional gesperrt (Buchstabenabstand in px)."""
    if not sperren:
        b = d.textbbox((0, 0), text, font=f)
        d.text(((W - (b[2] - b[0])) / 2 - b[0], y), text, font=f, fill=farbe)
        return
    breiten = [d.textlength(c, font=f) for c in text]
    gesamt = sum(breiten) + sperren * (len(text) - 1)
    x = (W - gesamt) / 2
    for c, bw in zip(text, breiten):
        d.text((x, y), c, font=f, fill=farbe)
        x += bw + sperren


def zeilen(uhr):
    """Name in Modell und Zifferblatt teilen, „Jahr 2026" herausnehmen."""
    name = re.sub(r"\s*Jahr\s+\d{4}\s*$", "", uhr.get("name") or "").strip()
    m = re.search(r"\s+Zifferblatt\s+", name)
    if m:
        return name[:m.start()].strip(), "Zifferblatt " + name[m.end():].strip()
    return name, ""


def umbrechen(d, text, f, breite):
    worte, out, z = text.split(), [], ""
    for w in worte:
        t = (z + " " + w).strip()
        if d.textlength(t, font=f) <= breite or not z:
            z = t
        else:
            out.append(z); z = w
    if z:
        out.append(z)
    return out


def foto(uhr):
    for url in (uhr.get("images") or []):
        if url.startswith("/") or not url.startswith("http"):
            url = BASIS + "/" + url.lstrip("/")
        try:
            r = requests.get(url, timeout=40)
            if r.ok and r.content:
                return Image.open(io.BytesIO(r.content)).convert("RGB")
        except Exception:
            continue
    raise RuntimeError("kein Bild erreichbar")


def render(uhr, art):
    os.makedirs(ORDNER, exist_ok=True)
    bild = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(bild)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(int(NAVY_OBEN[i] + (NAVY_UNTEN[i] - NAVY_OBEN[i]) * t) for i in range(3)))

    # Kopf
    text_mittig(d, 150, "HAHN & VO", schrift("marcellus", 50), WEISS, sperren=10)
    gross, klein = TEXT[art]
    f = schrift("inter", 26)
    breite = sum(d.textlength(c, font=f) for c in gross) + 6 * (len(gross) - 1) + 80
    x0 = (W - breite) / 2
    if art == "neu":
        d.rounded_rectangle([x0, 240, x0 + breite, 300], radius=30, fill=HELLBLAU)
        text_mittig(d, 255, gross, f, NAVY_OBEN, sperren=6)
    else:
        d.rounded_rectangle([x0, 240, x0 + breite, 300], radius=30, outline=HELLBLAU, width=2)
        text_mittig(d, 255, gross, f, HELLBLAU, sperren=6)

    # Foto 900 × 890, abgerundet
    fw, fh, fx, fy = 900, 890, 90, 355
    f_img = foto(uhr)
    s = max(fw / f_img.width, fh / f_img.height)
    f_img = f_img.resize((int(f_img.width * s + 0.5), int(f_img.height * s + 0.5)), Image.LANCZOS)
    l, o = (f_img.width - fw) // 2, (f_img.height - fh) // 2
    f_img = f_img.crop((l, o, l + fw, o + fh))
    maske = Image.new("L", (fw, fh), 0)
    ImageDraw.Draw(maske).rounded_rectangle([0, 0, fw, fh], radius=28, fill=255)
    schatten = Image.new("L", (W, H), 0)
    ImageDraw.Draw(schatten).rounded_rectangle([fx, fy + 14, fx + fw, fy + fh + 14], radius=28, fill=110)
    schatten = schatten.filter(ImageFilter.GaussianBlur(22))
    bild.paste((4, 18, 30), (0, 0), schatten)
    bild.paste(f_img, (fx, fy), maske)
    d = ImageDraw.Draw(bild)

    # Text unter dem Foto
    y = 1300
    text_mittig(d, y, (uhr.get("brand") or "").upper(), schrift("inter", 28), HELLBLAU, sperren=7)
    y += 58
    modell, blatt = zeilen(uhr)
    f = schrift("marcellus", 64)
    for z in umbrechen(d, modell, f, 920)[:2]:
        text_mittig(d, y, z, f, WEISS)
        y += 90
    if blatt:
        text_mittig(d, y, blatt, schrift("inter", 32), GRAU)
        y += 56
    jahr = uhr.get("year")
    if not jahr:
        m = re.search(r"Jahr\s+(\d{4})", uhr.get("name") or "")
        jahr = m.group(1) if m else None
    teile = [("Ref. " + uhr["ref"]) if uhr.get("ref") else None, jahr, kurz_set(uhr.get("fullset"))]
    zeile = " · ".join(t for t in teile if t)
    if zeile:
        y += 6
        text_mittig(d, y, zeile, schrift("inter", 30), HELLBLAU)
        y += 56
    if art == "neu" and uhr.get("price"):
        y += 4
        text_mittig(d, y, ("%s €" % format(int(uhr["price"]), ",")).replace(",", "."), schrift("marcellus", 44), WEISS)
        y += 64

    # Abschluss
    y = max(y + 30, 1560)
    f = schrift("marcellus", 36)
    b = d.textbbox((0, 0), klein, font=f)
    tw = b[2] - b[0]
    text_mittig(d, y, klein, f, WEISS)
    mitte = y + (b[3] + b[1]) / 2
    d.line([(W / 2 - tw / 2 - 90, mitte), (W / 2 - tw / 2 - 24, mitte)], fill=HELLBLAU, width=2)
    d.line([(W / 2 + tw / 2 + 24, mitte), (W / 2 + tw / 2 + 90, mitte)], fill=HELLBLAU, width=2)
    text_mittig(d, 1790, "hahn-vo.de", schrift("inter", 28), GRAU, sperren=3)

    pfad = os.path.join(ORDNER, "%s-%s.jpg" % (uhr["id"], art))
    bild.save(pfad, "JPEG", quality=92)
    return pfad


def kurz_set(fs):
    if not fs:
        return None
    if fs.lower().startswith("full set"):
        return "Full Set"
    return fs


# ---------------------------------------------------------------- Posten

def posten(pfad):
    """Story veröffentlichen. Gibt die Medien-ID zurück oder wirft."""
    hoch, fehler = upload_local_file(pfad)  # noqa: F821 (Werkbank-Helfer)
    if fehler:
        raise RuntimeError("Upload: %s" % fehler)
    datei = {"name": os.path.basename(pfad), "mimetype": "image/jpeg", "s3key": hoch["s3key"]}
    r, fehler = run_composio_tool("INSTAGRAM_POST_IG_USER_MEDIA",  # noqa: F821
                                  {"ig_user_id": "me", "media_type": "STORIES", "image_file": datei})
    if fehler:
        raise RuntimeError("Container: %s" % fehler)
    cid = (r.get("data") or {}).get("id") or ((r.get("data") or {}).get("data") or {}).get("id")
    if not cid:
        raise RuntimeError("Container ohne ID: %s" % json.dumps(r)[:300])
    r, fehler = run_composio_tool("INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",  # noqa: F821
                                  {"ig_user_id": "me", "creation_id": cid, "max_wait_seconds": 60})
    if fehler:
        raise RuntimeError("Veröffentlichen: %s" % fehler)
    mid = (r.get("data") or {}).get("id") or ((r.get("data") or {}).get("data") or {}).get("id")
    return mid or cid


# ---------------------------------------------------------------- Lauf

def run(zustand, max_posts=3, posten_erlaubt=True):
    """zustand: {shopifyId (Zahl als Text): "erhaeltlich"|"reserviert"|"verkauft"}.

    Regeln:
    - Uhr ohne Gedächtnis: jünger als NEU_TAGE und erhältlich → Story „neu";
      sonst nur Gedächtnis anlegen (keine Story — sonst flutet der erste Lauf).
    - Wechsel nach reserviert/verkauft → Story. Wechsel zurück nach
      erhältlich (Reservierung aufgehoben) → nur Gedächtnis.
    Ergebnis: {"eintraege": [...], "zustand_neu": {shopifyId: wert}} — der
    Auftrag schreibt zustand_neu als Metafeld uhr.story nach Shopify.
    """
    jetzt = datetime.now(timezone.utc)
    eintraege, zustand_neu, gepostet = [], {}, 0
    for kennung, uhr in sorted(bestand().items(), key=lambda kv: kv[1].get("added") or ""):
        sid = str(uhr.get("shopifyId") or "")
        if not sid:
            continue
        ist = zustand_von(uhr.get("status"))
        war = zustand.get(sid)
        art = None
        if war is None:
            try:
                alter = (jetzt - datetime.fromisoformat(uhr["added"].replace("Z", "+00:00"))).days
            except Exception:
                alter = 999
            if ist == "erhaeltlich" and alter <= NEU_TAGE:
                art = "neu"
            else:
                zustand_neu[sid] = ist
                continue
        elif war != ist:
            if ist in ("reserviert", "verkauft"):
                art = ist
            else:
                zustand_neu[sid] = ist
                continue
        else:
            continue

        titel = "%s – %s %s" % (TEXT[art][1], uhr.get("brand") or "", zeilen(uhr)[0])
        link = "%s/produkt?id=%s" % (BASIS, kennung)
        if gepostet >= max_posts or not posten_erlaubt:
            eintraege.append({"status": "naechster Lauf", "uhr": titel, "link": link})
            continue
        try:
            pfad = render(uhr, art)
            mid = posten(pfad)
            gepostet += 1
            zustand_neu[sid] = ist
            eintraege.append({"status": "gepostet", "uhr": titel, "link": link, "media_id": mid})
            time.sleep(5)
        except Exception as e:  # beim nächsten Lauf erneut
            eintraege.append({"status": "FEHLER", "uhr": titel, "link": link, "fehler": str(e)[:300]})
    return {"eintraege": eintraege, "zustand_neu": zustand_neu}
