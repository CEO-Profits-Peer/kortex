#!/usr/bin/env python3
"""Evergreen-Karten aus Wikipedia-Artikeln.

    python pipeline/evergreen.py              # normaler Lauf
    python pipeline/evergreen.py --dry-run    # nichts schreiben
    python pipeline/evergreen.py --limit 20   # hoechstens 20 Themen
    python pipeline/evergreen.py --category finance.compound

Warum es das gibt
-----------------
run.py haengt an Nachrichten, und daran haengen drei Decken:

  1. Rund 60 Prozent aller geholten Artikel fallen aus Lizenzgruenden
     weg, bevor irgendetwas passiert - alle grossen Medien sind
     `link_only` (docs/CONTENT-SOURCING.md).
  2. Was uebrig bleibt, sind ueberwiegend Pressemitteilungen von
     Institutionen. Daraus wird "Sanierung von Schloss Friedenstein",
     keine Lernkarte.
  3. Nachrichtenkarten verfallen nach vierzehn Tagen. Der Feed leert
     sich also von selbst wieder - genau das Erlebnis "alle neuen Posts
     sind wieder weg".

Evergreen loest alle drei auf einmal: Wikipedia ist CC-BY-SA (Volltext
erlaubt), die Themenliste bestimmen wir selbst, und was dabei
herauskommt, hat kein Verfallsdatum.

Was es NICHT loest: das Gemini-Tageskontingent. Zwanzig Anfragen pro Tag
und Modell bleiben zwanzig. Evergreen sorgt dafuer, dass jede davon in
einer Karte landet, die bleibt - nicht in einer, die in zwei Wochen
verschwindet.

Der Weg ab dem Artikeltext ist bewusst derselbe wie bei Nachrichten:
dasselbe Modell, dieselbe Pruefung, dieselbe Dublettensuche, dieselbe
Zeile in der Tabelle. Ein zweiter Weg waere ein zweiter Ort, an dem
dieselben Fehler auftreten koennen.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections import Counter
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import Config                      # noqa: E402
from db import Database                        # noqa: E402
from run import (AUTO_APPROVE_MIN_TRUST, WRITE_EVERY, buffered_twin,  # noqa: E402
                 build_row)
from sources.wikipedia import fetch_article     # noqa: E402
from topics import topics_for                   # noqa: E402
from transform.generate import Generator        # noqa: E402
from transform.kinetic import make_script       # noqa: E402
from validate.checks import validate                    # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("evergreen")

#: Welche Quelle je Sprache. Beide sind `cc` - deshalb geht Volltext.
WIKI_SOURCE = {"de": "wikipedia-de", "en": "wikipedia-en"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schreiben")
    parser.add_argument("--limit", type=int, help="hoechstens so viele Themen")
    parser.add_argument("--category", help="nur diese Kategorie-ID")
    args = parser.parse_args()

    cfg = Config.load()
    dry = args.dry_run or cfg.dry_run

    topics = topics_for(cfg.languages)
    if args.category:
        topics = [t for t in topics if t.category_id == args.category]
    if not topics:
        log.error("Keine Themen fuer Sprachen %s", cfg.languages)
        return 1

    stats: Counter[str] = Counter()
    rows: list[dict] = []
    written = 0

    # Dieselbe Frist wie in run.py, aus demselben Grund - hier wiegt sie
    # sogar schwerer: Evergreen laeuft als ZWEITES und bekommt nur, was
    # vom Zeitlimit des Jobs uebrig ist. Ohne eigene Frist ist es das
    # erste, was abgeschnitten wird, obwohl seine Karten die sind, die
    # bleiben.
    frist = time.monotonic() + cfg.max_run_minutes * 60

    with Database(cfg) as db:
        sources = {}
        for lang in cfg.languages:
            src = db.source_by_id(WIKI_SOURCE.get(lang, ""))
            if src is None:
                log.warning("Quelle %s fehlt - %s wird uebersprungen",
                            WIKI_SOURCE.get(lang), lang)
                continue
            if not src.may_store_fulltext:
                # Waere ein Konfigurationsfehler, kein Zufall: Wikipedia
                # ist CC-BY-SA. Lieber laut abbrechen als still nichts tun.
                log.error("%s steht auf '%s' - Volltext waere nicht erlaubt. "
                          "In der sources-Tabelle auf 'cc' setzen.",
                          src.id, src.license_class)
                return 1
            sources[lang] = src
        if not sources:
            log.error("Keine Wikipedia-Quelle aktiv. Migration 0048 eingespielt?")
            return 1

        category_ids = [c["id"] for c in db.categories() if c["parent_id"]]
        gen = Generator(cfg.gemini_api_keys, cfg.gemini_model)

        log.info("%d Themen · Sprachen %s · %s · %d Schluessel",
                 len(topics), ",".join(cfg.languages),
                 "Trockenlauf" if dry else "schreibend", len(cfg.gemini_api_keys))

        with httpx.Client(timeout=25.0, follow_redirects=True) as http:
            for topic in topics:
                if time.monotonic() >= frist:
                    log.warning("Zeitbudget von %d Minuten aufgebraucht - der "
                                "naechste Lauf macht hier weiter",
                                cfg.max_run_minutes)
                    break
                if args.limit and stats["accepted"] >= args.limit:
                    log.info("Grenze von %d Karten erreicht", args.limit)
                    break
                if gen.calls >= cfg.max_gemini_calls_per_run:
                    log.warning("Gemini-Limit erreicht, breche ab")
                    break

                src = sources.get(topic.language)
                if src is None:
                    continue

                item = fetch_article(topic, src, http)
                if item is None:
                    stats["kein_artikel"] += 1
                    continue

                # Schon eine Karte zu diesem Lemma? Der Hash haengt an der
                # Artikeladresse, ist also je Thema stabil - anders als bei
                # Nachrichten, wo jeder Tag neue Adressen bringt. Genau
                # deshalb kostet ein zweiter Lauf ueber dieselbe Liste
                # nichts: alles Bekannte faellt hier raus, bevor das
                # Modell gefragt wird.
                if db.known_hashes([item.hash]):
                    stats["schon_da"] += 1
                    continue

                card = gen.make_card(
                    text=item.text,
                    title=item.title,
                    source_name=src.display_name,
                    language=topic.language,
                    category_ids=category_ids,
                )
                if card is None:
                    stats["gemini_unusable"] += 1
                    if gen.consecutive_failures >= 3:
                        if gen.exhausted:
                            log.warning(
                                "Tageskontingent aufgebraucht - alle %d Modelle, "
                                "alle %d Schluessel. Der naechste Lauf macht da "
                                "weiter, wo dieser aufhoert: was schon eine Karte "
                                "hat, faellt vorher raus und kostet nichts.",
                                len(gen.models), len(gen.api_keys),
                            )
                        else:
                            log.error("Drei Gemini-Aufrufe in Folge fehlgeschlagen.\n"
                                      "  Ursache: %s", gen.first_error)
                        break
                    continue

                check = validate(card, item.text)
                if not check.ok:
                    stats["rejected"] += 1
                    log.info("  abgelehnt: %s  (%s)", item.title[:44], check.reason)
                    continue

                # Die Kategorie kommt aus der Themenliste, nicht aus dem
                # Modell. Bei Nachrichten muss das Modell raten, hier wissen
                # wir es besser: wer "Zinseszins" auf die Liste setzt, hat
                # sich bei der Einordnung schon etwas gedacht.
                card["category_id"] = topic.category_id

                embedding = gen.embed(item.text, cfg.embedding_model)
                twin = (db.similar_to(embedding, cfg.dedupe_threshold)
                        or buffered_twin(embedding, rows, cfg.dedupe_threshold)
                        ) if embedding else None
                if twin:
                    stats["duplicate"] += 1
                    log.info("  Dublette: %s  (wie '%s', %.0f%%)",
                             item.title[:40], twin["title"][:30], twin["similarity"] * 100)
                    continue

                approve = cfg.auto_approve and src.trust_score >= AUTO_APPROVE_MIN_TRUST
                if cfg.auto_approve and not approve:
                    stats["held_for_review"] += 1

                script = None
                if gen.calls < cfg.max_gemini_calls_per_run:
                    attempt = make_script(
                        gen, text=item.text, title=card["title"],
                        category=card["category_id"], language=topic.language,
                    )
                    script = attempt.script
                    stats[f"kinetic_{attempt.outcome}"] += 1
                    if attempt.outcome == "ok":
                        stats["kinetic"] += 1

                row = build_row(item, card, embedding=embedding, approve=approve, script=script)
                # Wikipedia ist nie eine Nachricht. Das Modell darf hier
                # nicht klassifizieren - sonst bekaeme eine Karte ueber
                # Photosynthese ein Verfallsdatum, weil im Artikel zufaellig
                # eine Jahreszahl stand.
                row["content_type"] = "knowledge"
                row["expires_at"] = None
                rows.append(row)
                stats["accepted"] += 1
                log.info("  ✓ [%s] %s%s", topic.category_id, card["title"],
                         "  [Erklaerkarte]" if script else "")

                if not dry and len(rows) >= WRITE_EVERY:
                    written += db.insert_items(rows)
                    rows = []

        if rows and not dry:
            written += db.insert_items(rows)

    log.info("Fertig.")
    for label, value in [
        ("Themen", len(topics)),
        ("kein Artikel", stats["kein_artikel"]),
        ("schon vorhanden", stats["schon_da"]),
        ("Gemini unbrauchbar", stats["gemini_unusable"]),
        ("Pruefung abgelehnt", stats["rejected"]),
        ("Dublette", stats["duplicate"]),
        ("angenommen", stats["accepted"]),
        ("davon Erklaerkarten", stats["kinetic"]),
        # Aufgeschluesselt: "verworfen" allein sagt nicht, wo es klemmt.
        # Modellabsage heisst Prompt, Pruefung heisst Schema - zwei
        # verschiedene Baustellen, und genau diese Unterscheidung hat
        # gefehlt, als die Quote bei achtzehn Prozent haengenblieb.
        ("  Vorfilter", stats["kinetic_vorfilter"]),
        ("  Modell: ungeeignet", stats["kinetic_ungeeignet"]),
        ("  Antwort unbrauchbar", stats["kinetic_unbrauchbar"]),
        ("  Pruefung abgelehnt", stats["kinetic_abgelehnt"]),
        ("wartet auf Freigabe", stats["held_for_review"]),
        ("geschrieben", written),
        ("Gemini-Aufrufe", gen.calls),
    ]:
        log.info("  %-22s %d", label, value)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
