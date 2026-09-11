#!/usr/bin/env python3
"""Ingestion-Pipeline.

    python pipeline/run.py            # normaler Lauf
    python pipeline/run.py --dry-run  # nichts schreiben, nur berichten
    python pipeline/run.py --source nasa --limit 3

Ablauf pro Durchgang:

    Feeds abrufen
      -> Artikeltext saeubern (trafilatura)
      -> bekannte Hashes aussortieren        (spart Gemini-Aufrufe)
      -> Gemini: Karte mit Structured Output
      -> deterministische Pruefung            (Zahlen, Namen, Beantwortbarkeit)
      -> nach Supabase mit status='pending'

Nichts geht ungeprueft live: status bleibt 'pending', bis ein Mensch
freigibt - oder bis AUTO_APPROVE gesetzt ist, was erst sinnvoll ist, wenn die
Ablehnungsquote unter etwa 5 Prozent liegt.
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import Config                      # noqa: E402
from db import Database                        # noqa: E402
from sources.feeds import fetch_feed           # noqa: E402
from transform.generate import Generator       # noqa: E402
from validate.checks import validate
from validate.relevance import is_worth_a_card           # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline")


def build_row(item, card, *, embedding, approve: bool) -> dict:
    """Aus Rohartikel + Gemini-Karte eine Zeile fuer content_items."""
    src = item.source
    return {
        "content_type": "news",
        "presentation_mode": "text",
        "status": "approved" if approve else "pending",
        "title": card["title"],
        "deck": card.get("deck"),
        "body_blocks": card["body_blocks"],
        "source_ids": [src.id],
        "source_urls": [item.url],
        "primary_source_id": src.id,
        "published_at": item.published_at.isoformat() if item.published_at else None,
        "language": src.default_language,
        "region_code": src.default_region_code,
        "primary_category_id": card["category_id"],
        "category_ids": [card["category_id"]],
        "difficulty": card.get("difficulty", 2),
        "word_count": len(" ".join(
            b.get("text", "") or " ".join(b.get("items", []) or [])
            for b in card["body_blocks"]
        ).split()),
        "quiz_items": [card["quiz"]],
        "media": {"tags": card.get("tags", [])},
        "content_hash": item.hash,
        "embedding": embedding,
        # News verrottet. Nach zwei Wochen faellt die Karte von selbst aus
        # dem Feed (get_feed filtert auf expires_at), ohne Aufraeumjob.
        "expires_at": (
            (item.published_at or datetime.now(timezone.utc)) + timedelta(days=14)
        ).isoformat(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schreiben")
    parser.add_argument("--source", help="nur diese Quellen-ID")
    parser.add_argument("--limit", type=int, default=8, help="Eintraege pro Feed")
    args = parser.parse_args()

    cfg = Config.load()
    dry = args.dry_run or cfg.dry_run

    db = Database(cfg)
    gen = Generator(cfg.gemini_api_key, cfg.gemini_model)

    sources = db.fetchable_sources()
    if args.source:
        sources = [s for s in sources if s.id == args.source]
    if not sources:
        log.error("Keine Quellen mit Feeds gefunden. Ist Migration 0008 eingespielt?")
        return 1

    # Gemini darf nur Kategorien vergeben, die es wirklich gibt.
    category_ids = [c["id"] for c in db.categories() if c["parent_id"]]

    log.info("%d Quellen · Sprachen %s · %s",
             len(sources), ",".join(cfg.languages), "TROCKENLAUF" if dry else "schreibend")

    stats: Counter[str] = Counter()
    rows: list[dict] = []

    for src in sources:
        if stats["seen"] >= cfg.max_items_per_run:
            log.info("Limit von %d Artikeln erreicht", cfg.max_items_per_run)
            break

        try:
            items = fetch_feed(src, args.limit)
        except Exception as exc:  # noqa: BLE001
            log.warning("%s: %s", src.id, exc)
            if not dry:
                db.mark_fetched(src.id, str(exc)[:500])
            continue

        stats["seen"] += len(items)

        # 'link_only': nur Titel und Link erlaubt. In v1 ueberspringen wir das
        # ganz, statt halbe Karten zu bauen (docs/CONTENT-SOURCING.md).
        if not src.may_store_fulltext:
            stats["skipped_license"] += len(items)
            continue

        known = db.known_hashes([i.hash for i in items])
        fresh = [i for i in items if i.hash not in known]
        stats["already_known"] += len(items) - len(fresh)

        for item in fresh:
            if gen.calls >= cfg.max_gemini_calls_per_run:
                log.warning("Gemini-Limit erreicht, breche ab")
                break

            # Vor dem Modellaufruf: taugt der Text ueberhaupt als Karte?
            # Kostet nichts und spart ein Kontingent, das sonst fuer
            # Terminankuendigungen draufgeht.
            worth, why = is_worth_a_card(item.title, item.text)
            if not worth:
                stats["irrelevant"] += 1
                log.info("  uebersprungen: %s  (%s)", item.title[:52], why)
                continue

            card = gen.make_card(
                text=item.text,
                title=item.title,
                source_name=src.display_name,
                language=src.default_language,
                category_ids=category_ids,
            )
            if card is None:
                stats["gemini_unusable"] += 1
                # Drei Fehlschlaege in Folge sind kein Zufall, sondern ein
                # Konfigurationsfehler. Weiterzumachen kostet nur Zeit und
                # verdeckt die Ursache hinter einer grossen Zahl.
                if gen.consecutive_failures >= 3:
                    log.error(
                        'Drei Gemini-Aufrufe in Folge fehlgeschlagen. Abbruch.\n'
                        '  Ursache: %s\n'
                        '  Zum Eingrenzen:  python pipeline/probe_gemini.py',
                        gen.first_error,
                    )
                    return 2
                continue

            check = validate(card, item.text)
            if not check.ok:
                stats["rejected"] += 1
                log.info("  abgelehnt: %s  (%s)", item.title[:52], check.reason)
                continue

            embedding = gen.embed(item.text, cfg.embedding_model)
            rows.append(build_row(item, card, embedding=embedding, approve=cfg.auto_approve))
            stats["accepted"] += 1
            log.info("  ✓ %s", card["title"])

        if not dry:
            db.mark_fetched(src.id)

    written = 0
    if rows and not dry:
        written = db.insert_items(rows)

    if gen.first_error and stats["accepted"] == 0:
        log.error(
            'Kein einziger Gemini-Aufruf war erfolgreich.\n'
            '  Erster Fehler: %s\n'
            '  Zum Eingrenzen:  python pipeline/probe_gemini.py',
            gen.first_error,
        )

    log.info(
        "Fertig · gesehen %d · bekannt %d · Lizenz uebersprungen %d · "
        "ohne Lernwert %d · unbrauchbar %d · abgelehnt %d · angenommen %d · "
        "geschrieben %d · Gemini-Aufrufe %d · Wiederholungen %d · Modell %s",
        stats["seen"], stats["already_known"], stats["skipped_license"],
        stats["irrelevant"], stats["gemini_unusable"], stats["rejected"],
        stats["accepted"], written, gen.calls, gen.retries, gen.model,
    )

    # Ein Ausweichmodell ist kein Fehler, aber es sollte nicht unbemerkt zur
    # Dauerloesung werden.
    if gen.model_index > 0:
        log.warning(
            'Gelaufen ist am Ende %s statt %s. Wenn das oefter vorkommt, '
            'trag es fest in pipeline/.env unter GEMINI_MODEL ein.',
            gen.model, gen.models[0],
        )

    if not cfg.auto_approve and written:
        log.info(
            "Die %d neuen Karten stehen auf 'pending'. Freigeben mit:\n"
            "  update public.content_items set status='approved' where status='pending';",
            written,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
