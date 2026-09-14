#!/usr/bin/env python3
"""Weitere Hashtags fuer Karten, die nur ihre Hauptkategorie haben.

    python pipeline/hashtags.py --dry-run          # nur zeigen
    python pipeline/hashtags.py                    # schreiben
    python pipeline/hashtags.py --alle             # auch schon gepruefte neu fragen

Warum es das gibt
-----------------
Seit 0081 zeigt jede Karte mehrere Hashtags, und das Modell vergibt beim
Schreiben bis zu zwei weitere Kategorien (transform/generate.py). Der Bestand
davor hat nur eine. Dieses Skript fragt sie nach.

Guenstig, weil gebuendelt: 25 Karten je Aufruf. Bei rund 350 Karten sind das
14 Aufrufe - weniger als ein einziger Evergreen-Lauf.

Kein Widerspruch zu "nie aus Modellwissen": hier entsteht kein Inhalt. Das
Modell ordnet eine fertige, gepruefte Karte zusaetzlichen Kategorien zu, und
nur IDs aus der Kategorienliste werden uebernommen.

Wer schon gefragt wurde, traegt `media.kategorien_geprueft` - auch wenn keine
weitere Kategorie passte. Sonst wuerde jede Karte mit genau einem guten
Hashtag bei jedem Lauf wieder gefragt.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import httpx
from google.genai import types

sys.path.insert(0, str(Path(__file__).parent))

from config import USER_AGENT, Config  # noqa: E402
from transform.generate import Generator  # noqa: E402

log = logging.getLogger("hashtags")

JE_AUFRUF = 25

SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["nr", "extra"],
        "properties": {
            "nr": {"type": "integer"},
            "extra": {"type": "array", "maxItems": 2, "items": {"type": "string"}},
        },
    },
}

PROMPT = """Du ordnest Lernkarten zusaetzlichen Kategorien zu.

Jede Karte hat schon eine Hauptkategorie. Gib fuer jede Karte 0 bis 2 WEITERE
Kategorie-IDs aus der Liste unten - nur wenn die Karte dort genauso gut
hingehoert. Beispiel: eine Karte ueber Zinseszins passt auch zu
finance.basics; eine ueber Schlaf nicht zu body.nutrition, nur weil beides
gesund ist. Im Zweifel eine leere Liste. Nie die Hauptkategorie wiederholen.

KATEGORIEN (ID - Name):
{kategorien}

KARTEN:
{karten}
"""


def _text(karte: dict) -> str:
    for b in karte.get("body_blocks") or []:
        t = b.get("text") or " ".join(b.get("items") or []) or b.get("label") or ""
        if t:
            return " ".join(t.split())[:220]
    return ""


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--alle", action="store_true", help="auch schon gepruefte Karten")
    parser.add_argument("--max-aufrufe", type=int, default=20)
    args = parser.parse_args()

    cfg = Config.load()
    http = httpx.Client(
        base_url=f"{cfg.supabase_url.rstrip('/')}/rest/v1",
        headers={
            "apikey": cfg.supabase_service_key,
            "Authorization": f"Bearer {cfg.supabase_service_key}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
        timeout=30.0,
    )

    kats = http.get("/categories", params={
        "select": "id,display_name,parent_id", "is_active": "eq.true", "order": "sort_order",
    }).json()
    gueltig = {k["id"]: k["display_name"] for k in kats if k["parent_id"]}
    liste = "\n".join(f"{i} - {n}" for i, n in gueltig.items())

    karten: list[dict] = []
    seite = 0
    while True:
        r = http.get("/content_items", params={
            "select": "id,title,deck,body_blocks,primary_category_id,category_ids,media",
            "status": "eq.approved", "order": "created_at", "limit": "1000",
            "offset": str(seite * 1000),
        })
        r.raise_for_status()
        teil = r.json()
        karten.extend(teil)
        if len(teil) < 1000:
            break
        seite += 1

    offen = [
        k for k in karten
        if args.alle or not (k.get("media") or {}).get("kategorien_geprueft")
    ]
    log.info("%d Karten, davon %d ohne Pruefung · %d Kategorien", len(karten), len(offen), len(gueltig))
    if not offen:
        return 0

    gen = Generator(cfg.gemini_api_keys, cfg.gemini_model)
    geschrieben = mit_extra = 0

    for start in range(0, len(offen), JE_AUFRUF):
        if gen.calls >= args.max_aufrufe:
            log.warning("Aufrufdeckel %d erreicht - der Rest beim naechsten Mal", args.max_aufrufe)
            break
        buendel = offen[start:start + JE_AUFRUF]
        zeilen = "\n".join(
            f"[{nr}] Hauptkategorie: {k['primary_category_id']} | {k['title']} | "
            f"{k.get('deck') or ''} | {_text(k)}"
            for nr, k in enumerate(buendel)
        )
        try:
            antwort = gen.generate_raw(
                PROMPT.format(kategorien=liste, karten=zeilen),
                types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=SCHEMA,
                    temperature=0.2,
                    max_output_tokens=4000,
                ),
            )
            ergebnis = json.loads((antwort.text or "").strip() or "[]")
        except Exception as exc:  # noqa: BLE001
            log.error("Aufruf fehlgeschlagen (%s) - breche ab", type(exc).__name__)
            break

        je_nr = {e.get("nr"): e.get("extra") or [] for e in ergebnis if isinstance(e, dict)}
        for nr, k in enumerate(buendel):
            if nr not in je_nr:
                # Keine Antwort fuer diese Karte: NICHT als geprueft markieren.
                continue
            haupt = k["primary_category_id"]
            extra: list[str] = []
            for c in je_nr[nr]:
                if c in gueltig and c != haupt and c not in extra:
                    extra.append(c)
            neu = [haupt] + extra[:2]
            media = dict(k.get("media") or {})
            media["kategorien_geprueft"] = True
            if extra:
                mit_extra += 1
                log.info("  %-28s %s  + %s", haupt, k["title"][:44], ", ".join(extra))
            if args.dry_run:
                continue
            p = http.patch("/content_items", params={"id": f"eq.{k['id']}"},
                           json={"category_ids": neu, "media": media},
                           headers={"Prefer": "return=minimal"})
            if p.status_code >= 400:
                log.warning("  nicht geschrieben (HTTP %d): %s", p.status_code, p.text[:160])
            else:
                geschrieben += 1

    log.info("Fertig: %d Aufrufe, %d Karten mit weiteren Hashtags, %d geschrieben%s",
             gen.calls, mit_extra, geschrieben, " (Trockenlauf)" if args.dry_run else "")
    http.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
