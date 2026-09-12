#!/usr/bin/env python3
"""Bestehenden Textkarten nachtraeglich ein Drehbuch geben.

    python pipeline/kinetic_backfill.py --dry-run
    python pipeline/kinetic_backfill.py                 # bis 50 % erreicht sind
    python pipeline/kinetic_backfill.py --target 0.6
    python pipeline/kinetic_backfill.py --language de
    python pipeline/kinetic_backfill.py --revert        # alles zurueck

Warum es das gibt
-----------------
Der Anteil an Erklaerkarten ist eine Quote ueber den BESTAND, nicht ueber
den Zulauf. Bei 147 freigegebenen Karten und 26 Erklaerkarten waeren fuer
die Haelfte 74 noetig - also 48 zusaetzliche. Selbst wenn ab sofort jede
neue Karte eine Erklaerkarte waere, dauerte das Wochen, und die 121
Textkarten blieben Textkarten.

Dabei sind die meisten davon nicht ungeeignet, sondern nur zu frueh
entstanden: als sie erzeugt wurden, gab es vier Bildarten (statement,
table, bars, figure). Ein Artikel ueber einen VORGANG konnte damals
nichts werden - heute wird er eine `steps`-Karte. Siehe den Kopf von
transform/kinetic.py.

Was hier NICHT passiert
-----------------------
Es wird nichts aus dem Gedaechtnis ergaenzt. Das Quelldokument wird neu
geholt und das Drehbuch dagegen geprueft, genau wie beim ersten Mal -
Regel 1 aus docs/CONTENT-SOURCING.md gilt auch fuer eine Nachruestung.
Karten, deren Quelle `link_only` ist oder deren Adresse nicht mehr
antwortet, bleiben deshalb Textkarten.

Der Kartentext selbst bleibt unangetastet. Nur presentation_mode und
kinetic_script aendern sich; Titel, Bloecke, Quiz und Einbettung sind
schon geprueft und gut. Eine Karte, die hier durchlaeuft, ist danach
dieselbe Karte - sie wird nur vorgetragen statt gelesen.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
import urllib.parse
from collections import Counter
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import USER_AGENT, Config          # noqa: E402
from db import Database, Source                # noqa: E402
# Privat, und trotzdem hier benutzt: das ist dieselbe Aufgabe wie beim
# Erstabruf - Adresse rein, sauberer Artikeltext raus. Eine zweite Fassung
# waere eine zweite Stelle, an der sich trafilatura-Eigenheiten zeigen.
from sources.feeds import _extract             # noqa: E402
from sources.wikipedia import Topic, fetch_article  # noqa: E402
from transform.generate import Generator       # noqa: E402
from transform.kinetic import make_script      # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill")

# httpx meldet jeden Abruf auf INFO. Hier sind das zwei Zeilen pro Karte -
# die Meldungen, auf die es ankommt, gingen darin unter. Die anderen
# Skripte holen je Lauf ein paar Feeds und koennen es sich leisten.
logging.getLogger("httpx").setLevel(logging.WARNING)


def reference_text(
    card: dict, source: Source, http: httpx.Client
) -> str:
    """Das Quelldokument einer Karte neu holen.

    Wikipedia geht ueber die API und nicht ueber die Seite: der Abruf
    liefert denselben Ausschnitt wie beim ersten Mal (MAX_WORDS aus
    sources/wikipedia.py), und nur dann kann die Zahlenpruefung
    ueberhaupt bestehen. Holte man die HTML-Seite, stuenden dort
    Navigation, Infobox und Belege mit drin - andere Zahlen, anderes
    Ergebnis.
    """
    urls = card.get("source_urls") or []
    if not urls:
        return ""
    url = urls[0]

    if source.id.startswith("wikipedia"):
        lemma = urllib.parse.unquote(url.rsplit("/", 1)[-1]).replace("_", " ")
        topic = Topic(
            category_id=card["primary_category_id"],
            language=card.get("language") or source.default_language,
            title=lemma,
        )
        item = fetch_article(topic, source, http)
        return item.text if item else ""

    return _extract(http, url, None)


def revert(cfg: Config, journal: Path) -> int:
    """Alles aus der Mitschrift zurueckdrehen.

    Damit ist ein Lauf keine Einbahnstrasse. Das Drehbuch selbst geht dabei
    verloren - es steht nur in der Spalte, nicht in der Mitschrift -, aber
    erzeugen laesst es sich wieder; eine Karte, die im Feed stoert, soll man
    in einem Befehl los sein und nicht erst in einer SQL-Konsole.
    """
    if not journal.exists():
        log.error("Keine Mitschrift unter %s", journal)
        return 1
    ids = [
        line.split("	")[0]
        for line in journal.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    with Database(cfg) as db:
        for item_id in ids:
            db.detach_script(item_id)
    log.info("%d Karten sind wieder Textkarten. Mitschrift bleibt liegen.", len(ids))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schreiben")
    parser.add_argument("--limit", type=int, default=60, help="hoechstens so viele Versuche")
    parser.add_argument("--language", help="nur diese Sprache")
    parser.add_argument(
        "--target", type=float, default=0.5,
        help="gewuenschter Anteil Erklaerkarten am Bestand (Standard 0.5)",
    )
    parser.add_argument(
        "--journal", default=str(Path(__file__).parent / "kinetic-backfill.log"),
        help="wohin die Liste der umgewandelten Karten geschrieben wird",
    )
    parser.add_argument(
        "--revert", action="store_true",
        help="alle Karten aus der Mitschrift wieder zu Textkarten machen",
    )
    args = parser.parse_args()

    if args.revert:
        return revert(Config.load(), Path(args.journal))

    cfg = Config.load()
    dry = args.dry_run or cfg.dry_run

    stats: Counter[str] = Counter()
    with Database(cfg) as db:
        # Wie viele fehlen ueberhaupt noch?
        #
        # Der Anteil ist das Ziel, nicht die Anzahl. Alles umzuwandeln, was
        # sich umwandeln laesst, waere der naheliegende und falsche Weg:
        # arrange.ts zeigt hoechstens jede zweite Karte als Erklaerkarte,
        # also braucht der Feed genauso viele Textkarten wie Erklaerkarten.
        # Bei neunzig Prozent Erklaerkarten hat er sie nicht mehr und muss
        # sich wiederholen.
        total, kinetic = db.presentation_counts()
        needed = max(0, round(args.target * total) - kinetic)
        log.info("Bestand: %d freigegeben, davon %d Erklaerkarten (%.0f %%). "
                 "Fuer %.0f %% fehlen %d.",
                 total, kinetic, 100 * kinetic / max(1, total), 100 * args.target, needed)
        if needed == 0:
            log.info("Ziel schon erreicht - nichts zu tun.")
            return 0

        cards = db.text_cards(args.limit, args.language)
        if not cards:
            log.info("Keine Textkarten offen - nichts zu tun.")
            return 0

        gen = Generator(cfg.gemini_api_keys, cfg.gemini_model)
        sources: dict[str, Source | None] = {}

        log.info("%d Textkarten · %s · %d Schluessel",
                 len(cards), "Trockenlauf" if dry else "schreibend",
                 len(cfg.gemini_api_keys))

        # Mitschrift der Umwandlungen, angehaengt. Endung .log, damit sie
        # nicht im Git landet (.gitignore).
        journal = Path(args.journal)
        changed = journal.open("a", encoding="utf-8")

        # Dieselbe Frist wie in run.py und evergreen.py.
        #
        # Neu, weil dieses Skript jetzt im Zeitplan mitlaeuft und dort als
        # LETZTES kommt. Ohne eigene Frist ist es das erste, was das
        # Zeitlimit des Jobs abschneidet - und abgeschossen zu werden heisst
        # hier: die Bilanz fehlt, und man weiss nicht, ob nichts ging oder
        # nur die Zeit fehlte.
        frist = time.monotonic() + cfg.max_run_minutes * 60

        with httpx.Client(
            timeout=25.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}
        ) as http:
            for card in cards:
                if stats["ok"] >= needed:
                    log.info("Ziel erreicht.")
                    break
                if time.monotonic() >= frist:
                    log.warning("Zeitbudget von %d Minuten aufgebraucht - der "
                                "naechste Lauf macht bei den aeltesten "
                                "Textkarten weiter", cfg.max_run_minutes)
                    break
                if gen.calls >= cfg.max_gemini_calls_per_run:
                    log.warning("Gemini-Limit erreicht, breche ab")
                    break

                source_id = card.get("primary_source_id") or ""
                if source_id not in sources:
                    sources[source_id] = db.source_by_id(source_id)
                source = sources[source_id]

                if source is None:
                    stats["ohne_quelle"] += 1
                    continue
                if not source.may_store_fulltext:
                    # Ohne Volltext gibt es kein Referenzdokument, gegen das
                    # geprueft werden koennte. Solche Karten sind ueberhaupt
                    # nur als Anriss entstanden.
                    stats["lizenz"] += 1
                    continue

                text = reference_text(card, source, http)
                if len(text.split()) < 120:
                    stats["quelle_weg"] += 1
                    log.info("  keine Quelle mehr: %s", card["title"][:50])
                    continue

                attempt = make_script(
                    gen,
                    text=text,
                    title=card["title"],
                    category=card["primary_category_id"],
                    language=card.get("language") or source.default_language,
                )
                stats[attempt.outcome] += 1

                if attempt.script is None:
                    log.info("  %-12s %s%s", attempt.outcome, card["title"][:44],
                             f"  ({attempt.detail})" if attempt.detail else "")
                    if gen.exhausted:
                        log.warning("Tageskontingent aufgebraucht. Der naechste Lauf "
                                    "faengt wieder bei den aeltesten Textkarten an - "
                                    "die hier bereits umgewandelten sind dann raus.")
                        break
                    continue

                kinds = sorted({b["show"]["kind"] for b in attempt.script["beats"]})
                log.info("  ✓ %s  [%s]", card["title"][:44], "+".join(kinds))
                if not dry:
                    db.attach_script(card["id"], attempt.script)
                    stats["geschrieben"] += 1
                    # Jede Umwandlung mit ID mitschreiben. Eine Nachruestung
                    # ist umkehrbar - aber nur, solange man weiss, WELCHE
                    # Karten betroffen waren.
                    changed.write(f"{card['id']}\t{card['title']}\n")
                    changed.flush()

        changed.close()

    log.info("Fertig.")
    for label, key in [
        ("umgewandelt", "ok"),
        ("geschrieben", "geschrieben"),
        ("Modell: ungeeignet", "ungeeignet"),
        ("Pruefung abgelehnt", "abgelehnt"),
        ("Antwort unbrauchbar", "unbrauchbar"),
        ("Modellfehler", "modellfehler"),
        ("Vorfilter", "vorfilter"),
        ("Quelle nicht mehr da", "quelle_weg"),
        ("Lizenz verbietet es", "lizenz"),
        ("Quelle unbekannt", "ohne_quelle"),
    ]:
        log.info("  %-22s %d", label, stats[key])
    if stats["geschrieben"]:
        log.info("  Mitschrift: %s", args.journal)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
