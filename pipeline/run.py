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
from transform.kinetic import make_script
from validate.checks import MIN_WORD_COVERAGE, validate, validate_kinetic
from validate.relevance import is_worth_a_card           # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("pipeline")


#: Ab welchem Vertrauenswert eine Quelle ohne menschlichen Blick live geht.
#: 80 trennt die Institutionen und Forschungseinrichtungen (80-90) von den
#: Pressestellen und Agenturen mit Eigeninteresse (50-75).
AUTO_APPROVE_MIN_TRUST = 80


def build_row(item, card, *, embedding, approve: bool, script=None) -> dict:
    """Aus Rohartikel + Gemini-Karte eine Zeile fuer content_items.

    Mit Drehbuch wird daraus eine Erklaerkarte. Die Textbloecke bleiben
    trotzdem gefuellt: sie tragen die Suche, die Wiederholung - und den
    Fall, dass das Drehbuch einmal nicht abspielbar ist.
    """
    src = item.source
    return {
        "content_type": "news",
        "presentation_mode": "kinetic" if script else "text",
        "kinetic_script": script,
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
    # Wortdeckung ALLER Karten, auch der bestandenen. Nur damit laesst sich
    # sagen, ob die Schwelle von 55 Prozent richtig sitzt - eine Schwelle,
    # von der man nur die Ablehnungen kennt, kann man nicht beurteilen.
    coverages: list[float] = []

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
                if check.coverage is not None:
                    coverages.append(check.coverage)
                log.info("  abgelehnt: %s  (%s)", item.title[:52], check.reason)
                continue

            embedding = gen.embed(item.text, cfg.embedding_model)
            # Freigabe nicht pauschal, sondern nach Vertrauen in die Quelle.
            #
            # AUTO_APPROVE=true heisst nicht "alles durchwinken". Die
            # deterministische Pruefung hat gerade bestanden, aber sie faengt
            # nur Erfundenes mit Zahlen und Namen - eine plausibel klingende
            # falsche Aussage rutscht durch. Wie schlimm das ist, haengt an
            # der Quelle: bei einer Forschungseinrichtung steht im Quelltext
            # meist schon die richtige Aussage, bei einer Pressestelle mit
            # Eigeninteresse nicht unbedingt.
            #
            # Deshalb: hohe Vertrauenswerte gehen live, der Rest wartet auf
            # einen Blick. Das kostet nichts und haelt die Tuer zu fuer
            # genau den Fall, den die Pruefung nicht abdeckt.
            approve = cfg.auto_approve and src.trust_score >= AUTO_APPROVE_MIN_TRUST
            if cfg.auto_approve and not approve:
                stats["held_for_review"] += 1
            # --- Erklaerkarte versuchen ---------------------------------
            #
            # Erst NACH der Pruefung: ein Drehbuch fuer eine Karte zu
            # schreiben, die gleich abgelehnt wird, waere ein verschenkter
            # Modellaufruf. Scheitert es, bleibt es eine Textkarte - die
            # ist an dieser Stelle schon fertig und geprueft.
            script = None
            if gen.calls < cfg.max_gemini_calls_per_run:
                script = make_script(
                    gen,
                    text=item.text,
                    title=card["title"],
                    category=card["category_id"],
                    language=src.default_language,
                )
                if script:
                    kcheck = validate_kinetic(script, item.text)
                    if kcheck.ok:
                        stats["kinetic"] += 1
                    else:
                        log.info("    Drehbuch verworfen: %s", kcheck.reason)
                        stats["kinetic_rejected"] += 1
                        script = None

            rows.append(
                build_row(item, card, embedding=embedding, approve=approve, script=script)
            )
            stats["accepted"] += 1
            if check.coverage is not None:
                coverages.append(check.coverage)
            log.info("  ✓ %s%s", card["title"], "  [Erklaerkarte]" if script else "")

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
        "Erklaerkarten %d (%d verworfen) · "
        "geschrieben %d · Gemini-Aufrufe %d · Wiederholungen %d · Modell %s",
        stats["seen"], stats["already_known"], stats["skipped_license"],
        stats["irrelevant"], stats["gemini_unusable"], stats["rejected"],
        stats["accepted"], stats["held_for_review"],
        stats["kinetic"], stats["kinetic_rejected"],
        written, gen.calls, gen.retries, gen.model,
    )

    # Verteilung der Wortdeckung - damit die Schwelle in
    # validate/checks.py an Zahlen justiert wird und nicht an Gefuehl.
    if coverages:
        ordered = sorted(coverages)

        def q(p: float) -> float:
            return ordered[min(len(ordered) - 1, int(len(ordered) * p))]

        log.info(
            "Wortdeckung: min %.0f%% · 10%% %.0f%% · Median %.0f%% · max %.0f%% "
            "(Schwelle %.0f%%, darunter %d von %d)",
            ordered[0] * 100, q(0.1) * 100, q(0.5) * 100, ordered[-1] * 100,
            MIN_WORD_COVERAGE * 100,
            sum(1 for c in ordered if c < MIN_WORD_COVERAGE), len(ordered),
        )

    # Ein Ausweichmodell ist kein Fehler, aber es sollte nicht unbemerkt zur
    # Dauerloesung werden.
    if gen.model_index > 0:
        log.warning(
            'Gelaufen ist am Ende %s statt %s. Wenn das oefter vorkommt, '
            'trag es fest in pipeline/.env unter GEMINI_MODEL ein.',
            gen.model, gen.models[0],
        )

    if cfg.auto_approve and stats["held_for_review"]:
        log.info(
            "%d Karten warten trotz AUTO_APPROVE auf einen Blick "
            "(Quelle unter Vertrauenswert %d). Freigeben mit:  "
            "update public.content_items set status='approved' where status='pending';",
            stats["held_for_review"], AUTO_APPROVE_MIN_TRUST,
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
