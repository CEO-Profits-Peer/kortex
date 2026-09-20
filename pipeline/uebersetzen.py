#!/usr/bin/env python3
"""Fertige Karten in die andere Sprache bringen (Migration 0121).

    python pipeline/uebersetzen.py --dry-run        # zeigt, was uebersetzt wuerde
    python pipeline/uebersetzen.py --anzahl 5       # fuenf Karten
    python pipeline/uebersetzen.py --nach en        # nur ins Englische

Warum es das gibt
-----------------
Der Bestand ist zweisprachig, aber nicht doppelt: eine Karte ueber den
Zinseszins gibt es auf Deutsch, eine ueber "time value of money" auf
Englisch - und wer den Regler auf halb stellt, bekommt in beiden Sprachen
etwas anderes. Eine Uebersetzung kostet EINEN Modellaufruf und macht aus
jeder gepruefen Karte eine zweite, ohne neue Recherche und ohne neue
Behauptung.

Was nicht uebersetzt wird
-------------------------
  * Nachrichten. Sie sind in zwei Tagen alt; der Aufwand lohnt nicht, und
    eine uebersetzte Meldung von gestern ist keine Nachricht mehr.
  * Kurslektionen. Die haengen an einem Kurs, der als Ganzes uebersetzt
    werden muesste - sonst steht Lektion 3 auf Englisch in einem deutschen
    Kurs.
  * Karten, die schon eine Uebersetzung haben (auch eine verworfene: der
    Versuch bleibt als 'rejected' stehen, damit der naechste Lauf nicht
    dasselbe nochmal probiert).

Regionale Wissenskarten dagegen SCHON: "Wiener Linien" auf Englisch ist
genau das, was Zugezogene brauchen. Der Regionsfilter des Feeds bleibt ja.

Reihenfolge: beliebte Karten zuerst (Likes), dann die neuesten. Wenn
uebersetzt wird, dann das, was Leute wirklich lesen.

Die Pruefung
------------
transform/uebersetzung.pruefe() vergleicht Struktur, Antworten und Zahlen.
Danach laeuft die Uebersetzung noch durch dieselbe Aehnlichkeitspruefung
wie jede neue Karte (Embedding): gibt es in der Zielsprache schon eine
Karte, die dasselbe erzaehlt, wird die Uebersetzung verworfen.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from config import Config                             # noqa: E402
from db import Database, content_hash                 # noqa: E402
from laufbilanz import Laufbilanz, hauptprogramm      # noqa: E402
from transform.generate import Generator              # noqa: E402
from transform.uebersetzung import pruefe, uebersetze  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("uebersetzen")

#: Was uebersetzt werden darf. 'interactive' bleibt draussen: dort haengt
#: die Aufgabe an interaction_data, und eine halb uebersetzte Aufgabe ist
#: schlimmer als keine.
TYPEN = ("knowledge",)

#: Hoechstens so viele je Lauf. Ein Aufruf je Karte plus ein Embedding -
#: der Deckel steht trotzdem, damit ein Lauf nicht das ganze Tageskontingent
#: in Uebersetzungen steckt, waehrend neue Karten warten.
STANDARD_ANZAHL = 5


def _kandidaten(db: Database, nach: str, limit: int) -> list[dict[str, Any]]:
    """Karten der anderen Sprache, die noch keine Uebersetzung haben."""
    von = "de" if nach == "en" else "en"
    schon: set[str] = set()
    seite = 0
    while True:
        rows = db._get("/content_items", {  # noqa: SLF001 - dieselbe Familie
            "select": "uebersetzt_aus",
            "uebersetzt_aus": "not.is.null",
            "language": f"eq.{nach}",
            "limit": "1000",
            "offset": str(seite * 1000),
        })
        schon.update(r["uebersetzt_aus"] for r in rows if r.get("uebersetzt_aus"))
        if len(rows) < 1000:
            break
        seite += 1

    roh = db._get("/content_items", {  # noqa: SLF001
        "select": ("id,title,deck,body_blocks,quiz_items,language,primary_category_id,"
                   "category_ids,difficulty,region_code,source_ids,source_urls,"
                   "primary_source_id,published_at,content_type,media,like_count"),
        "status": "eq.approved",
        "language": f"eq.{von}",
        "content_type": f"in.({','.join(TYPEN)})",
        "uebersetzt_aus": "is.null",
        "order": "like_count.desc,created_at.desc",
        "limit": "500",
    })
    return [r for r in roh if r["id"] not in schon][:limit]


def _zeile(karte: dict[str, Any], neu: dict[str, Any], *, nach: str, status: str,
           grund: str | None, embedding: list[float] | None) -> dict[str, Any]:
    """Die Uebersetzung als Zeile fuer content_items."""
    quelle = (karte.get("source_urls") or [""])[0]
    return {
        "content_type": karte["content_type"],
        "presentation_mode": "text",
        "status": status,
        "reject_reason": grund,
        "title": neu["title"],
        "deck": neu.get("deck"),
        "body_blocks": neu.get("body_blocks") or [],
        "quiz_items": neu.get("quiz_items") or [],
        "source_ids": karte.get("source_ids") or [],
        "source_urls": karte.get("source_urls") or [],
        "primary_source_id": karte.get("primary_source_id"),
        "published_at": karte.get("published_at"),
        "language": nach,
        "region_code": karte.get("region_code"),
        "primary_category_id": karte["primary_category_id"],
        "category_ids": karte.get("category_ids") or [karte["primary_category_id"]],
        "difficulty": karte.get("difficulty") or 2,
        "word_count": len(" ".join(
            [neu.get("title") or "", neu.get("deck") or ""]
            + [b.get("text") or "" for b in (neu.get("body_blocks") or [])]
        ).split()),
        "media": karte.get("media") or {},
        # Eigener Fingerabdruck: dieselbe Quelle, andere Sprache.
        "content_hash": content_hash(f"{quelle}#uebersetzung-{nach}", neu["title"]),
        "embedding": embedding,
        "uebersetzt_aus": karte["id"],
        "expires_at": None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schreiben")
    parser.add_argument("--anzahl", type=int, default=STANDARD_ANZAHL, help="hoechstens so viele Karten")
    parser.add_argument("--nach", help="nur in diese Sprache (de oder en)")
    args = parser.parse_args()

    cfg = Config.load()
    dry = args.dry_run or cfg.dry_run
    bilanz = Laufbilanz(cfg, "uebersetzen", dry)
    stats: Counter[str] = Counter()
    bilanz.beobachte(stats=stats)

    ziele = [args.nach] if args.nach else [s for s in cfg.languages]
    ziele = [z for z in ziele if z in ("de", "en")]
    if not ziele:
        log.error("Keine Zielsprache. INGEST_LANGUAGES=%s", ",".join(cfg.languages))
        return 1

    frist = time.monotonic() + cfg.max_run_minutes * 60
    geschrieben = 0

    with Database(cfg) as db:
        gen = Generator(cfg.gemini_api_keys, cfg.gemini_model)
        bilanz.beobachte(gen=gen)

        # Abwechselnd je Zielsprache, damit nicht eine Sprache alles bekommt.
        offen: list[tuple[str, dict[str, Any]]] = []
        for nach in ziele:
            for k in _kandidaten(db, nach, args.anzahl):
                offen.append((nach, k))
        offen.sort(key=lambda p: -(p[1].get("like_count") or 0))

        if not offen:
            log.info("Nichts zu uebersetzen - jede Karte hat ihre Fassung.")
            bilanz.stopp = "nichts_offen"
            return 0
        log.info("%d Karten offen · Ziel %s · %s", len(offen), ",".join(ziele),
                 "Trockenlauf" if dry else "schreibend")

        for nach, karte in offen:
            if stats["uebersetzt"] >= args.anzahl:
                bilanz.stopp = "ziel"
                break
            if time.monotonic() >= frist:
                bilanz.stopp = "zeit"
                log.warning("Zeitbudget aufgebraucht.")
                break
            if gen.calls + 1 > cfg.max_gemini_calls_per_run:
                bilanz.stopp = "aufrufe"
                log.warning("Aufrufdeckel erreicht.")
                break

            von = karte["language"]
            neu = uebersetze(gen, karte, von=von, nach=nach)
            gen.calls += 1
            if neu is None:
                stats["modell_fehler"] += 1
                if gen.exhausted:
                    bilanz.stopp = "kontingent"
                    log.warning("Tageskontingent aufgebraucht.")
                    break
                continue

            grund = pruefe(karte, neu)
            if grund:
                stats["verworfen"] += 1
                log.info("  ✗ %s → %s: %s", karte["title"][:48], nach, grund)
                if not dry:
                    db.insert_rows("content_items",
                                   [_zeile(karte, neu, nach=nach, status="rejected",
                                           grund=f"Uebersetzung: {grund}", embedding=None)],
                                   antwort=False)
                continue

            # Dieselbe Aehnlichkeitspruefung wie bei jeder neuen Karte.
            text = " ".join([neu["title"], neu.get("deck") or ""]
                            + [b.get("text") or "" for b in (neu.get("body_blocks") or [])])
            embedding = gen.embed(text, cfg.embedding_model)
            zwilling = db.similar_to(embedding, cfg.dedupe_threshold) if embedding else None
            if zwilling:
                stats["dublette"] += 1
                log.info("  ✗ %s → %s: sagt dasselbe wie %r", karte["title"][:40], nach,
                         (zwilling.get("title") or "")[:40])
                if not dry:
                    db.insert_rows("content_items",
                                   [_zeile(karte, neu, nach=nach, status="rejected",
                                           grund="Uebersetzung: Dublette", embedding=embedding)],
                                   antwort=False)
                continue

            stats["uebersetzt"] += 1
            log.info("  ✓ %s → %s: %s", karte["title"][:40], nach, neu["title"][:48])
            if dry:
                continue
            db.insert_rows("content_items",
                           [_zeile(karte, neu, nach=nach, status="approved", grund=None,
                                   embedding=embedding)],
                           antwort=False)
            geschrieben += 1

    bilanz.karten = geschrieben
    log.info("Fertig.")
    for label, key in [("Uebersetzt", "uebersetzt"), ("Pruefung verworfen", "verworfen"),
                       ("Dubletten", "dublette"), ("Modellfehler", "modell_fehler")]:
        log.info("  %-20s %d", label, stats[key])
    return 0


if __name__ == "__main__":
    hauptprogramm(main)
