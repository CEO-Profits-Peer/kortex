#!/usr/bin/env python3
"""Kurse aus Wikipedia-Artikeln.

    python pipeline/courses.py --dry-run             # zeigt Bogen und Lektionen, schreibt nichts
    python pipeline/courses.py                       # ein Kurs
    python pipeline/courses.py --anzahl 2 --language en
    python pipeline/courses.py --category science.bio

Warum es das gibt
-----------------
Der Feed ist Zufall mit Abwechslung. Ein Kurs ist das Gegenteil: eine
Reihenfolge, in der Lektion 5 ohne die vier davor nicht verstaendlich waere.
Bisher gab es genau einen, von Hand geschrieben (seed/0005_demo_course.sql).

Wie ein Kurs entsteht
---------------------
  1. Ein Artikel, der schon eine freigegebene Wissenskarte getragen hat. Er
     hat damit bewiesen, dass die Pruefung an ihm bestehen kann - ein Kurs
     aus einem Artikel, an dem schon eine einzelne Karte scheitert, waere
     fuenfmal verlorenes Kontingent.
  2. make_course_arc: EIN kleiner Aufruf fuer den Bogen - Kurstitel,
     Beschreibung, fuenf Lektionen mit je einem Satz Auftrag.
  3. Je Lektion ein ganz normaler make_card-Aufruf mit diesem Auftrag, gegen
     denselben Artikel, durch dieselbe Pruefung wie jede Karte im Feed.
     Regel 1 aus docs/CONTENT-SOURCING.md gilt unveraendert: nichts aus dem
     Gedaechtnis des Modells, alles gegen den Quelltext geprueft.
  4. Mit uebrigem Kontingent: Drehbuecher, damit Lektionen vorgetragen werden.

Eine Reihenfolge darf keine Luecke haben
----------------------------------------
Faellt Lektion 3 durch die Pruefung, wird sie einmal neu versucht. Faellt sie
wieder durch, endet der Kurs VOR ihr. Die Alternative - Lektion 4 und 5
trotzdem nehmen - ergaebe einen Kurs, dessen spaetere Lektionen etwas
voraussetzen, das nie kam. Genau das, was einen Kurs vom Feed unterscheidet,
waere dann kaputt. Mindestens drei Lektionen am Stueck, sonst kein Kurs.

Kosten
------
Ein Kurs: 1 Bogen + 5 Lektionen, bei Ablehnungen bis zu 5 mehr, plus
Drehbuecher. Deshalb laeuft das im Workflow nur zweimal am Tag und mit
eigenem Deckel - neue Karten fuer den Feed gehen vor.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import logging
import re
import sys
import time
import unicodedata
import urllib.parse
from collections import Counter
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import USER_AGENT, Config            # noqa: E402
from db import Database, content_hash            # noqa: E402
from laufbilanz import Laufbilanz, hauptprogramm  # noqa: E402
from run import AUTO_APPROVE_MIN_TRUST, build_row  # noqa: E402
from sources.wikipedia import Topic, fetch_article  # noqa: E402
from transform.generate import Generator, make_course_arc  # noqa: E402
from transform.kinetic import make_script        # noqa: E402
from validate.checks import validate             # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("kurse")
logging.getLogger("httpx").setLevel(logging.WARNING)

WIKI_SOURCE = {"de": "wikipedia-de", "en": "wikipedia-en"}

LEKTIONEN = 5
MIN_LEKTIONEN = 3

#: Darunter traegt ein Artikel keine fuenf verschiedenen Lektionen. Eine
#: Karte braucht 50 bis 85 Woerter und soll aus eigenem Material kommen -
#: fuenf davon aus 400 Woertern wuerden sich zwangslaeufig wiederholen.
MIN_WOERTER = 600

#: Hoechstens so viele Boegen je Lauf. Ein Artikel ohne Reihenfolge kostet
#: einen Aufruf und ergibt nichts; drei davon in Folge heissen eher, dass
#: die Kandidaten schlecht sind, als dass der vierte klappt.
MAX_BOEGEN = 3

#: Was ein Kurs mindestens kostet: Bogen plus Lektionen, ohne Wiederholungen.
#: Reicht der Rest des Aufrufdeckels nicht einmal dafuer, wird gar nicht erst
#: angefangen - ein halber Kurs wird ohnehin nicht geschrieben.
MIN_AUFRUFE = 1 + MIN_LEKTIONEN


def kurs_slug(titel: str, sprache: str, url: str) -> str:
    """Lesbar und eindeutig: Titel in ASCII plus ein kurzer Fingerabdruck der Quelle."""
    s = unicodedata.normalize("NFKD", titel).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40].strip("-") or "kurs"
    return f"{s}-{hashlib.sha1(f'{sprache}:{url}'.encode()).hexdigest()[:6]}"


def auftrag(kurs: str, lektionen: list[dict], nr: int) -> str:
    """Der Auftrag fuer Lektion `nr` (1-basiert) - steht im Prompt vor dem Quelltext."""
    lektion = lektionen[nr - 1]
    if nr == 1:
        davor = "Das ist die erste Lektion. Sie setzt nichts voraus."
    else:
        liste = "; ".join(f"{i}. {l['title']}" for i, l in enumerate(lektionen[: nr - 1], start=1))
        davor = (f"Vorher kamen: {liste}. Setze genau das voraus und wiederhole es nicht - "
                 "baue darauf auf.")
    return (
        f'AUFTRAG - LEKTION {nr} VON {len(lektionen)} IM KURS "{kurs}":\n'
        f"Diese Karte behandelt NUR: {lektion['focus']}\n"
        f"{davor}\n"
        f'Der Titel der Karte ist "{lektion["title"]}" oder sehr nah daran.\n'
        "Alle Regeln unten gelten unveraendert - auch fuer eine Lektion zaehlt nur, "
        "was im Quelltext steht.\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schreiben")
    parser.add_argument("--anzahl", type=int, default=1, help="so viele Kurse je Lauf")
    parser.add_argument("--language", help="nur diese Sprache")
    parser.add_argument("--category", help="nur diese Kategorie-ID")
    parser.add_argument("--ohne-drehbuch", action="store_true", help="keine Erklaerkarten")
    parser.add_argument("--url", help="genau diesen Wikipedia-Artikel (braucht --language und --category)")
    args = parser.parse_args()
    if args.url and not (args.language and args.category):
        parser.error("--url braucht --language und --category")

    cfg = Config.load()
    dry = args.dry_run or cfg.dry_run
    bilanz = Laufbilanz(cfg, "kurse", dry)
    stats: Counter[str] = Counter()
    bilanz.beobachte(stats=stats)
    geschrieben = 0

    sprachen = (args.language,) if args.language else cfg.languages
    frist = time.monotonic() + cfg.max_run_minutes * 60

    with Database(cfg) as db:
        quellen = {}
        for sprache in sprachen:
            src = db.source_by_id(WIKI_SOURCE.get(sprache, ""))
            if src is not None and src.may_store_fulltext:
                quellen[sprache] = src
        if not quellen:
            log.error("Keine Wikipedia-Quelle fuer %s aktiv.", ",".join(sprachen))
            return 1

        if args.url:
            # Von Hand gewaehlt: ohne Kandidatensuche, also auch ohne die
            # Pruefung, ob es den Kurs schon gibt. Zum Ausprobieren gedacht -
            # schreibend verhindert der eindeutige Index eine Dublette.
            kandidaten = [{"category_id": args.category, "language": args.language, "url": args.url}]
        else:
            kandidaten = db.course_candidates(tuple(quellen), args.category)
        if kandidaten is None:
            log.error("courses.source_url fehlt - Migration 0075 eingespielt?")
            bilanz.fehler = "Migration 0075 fehlt"
            return 1
        if not kandidaten:
            log.info("Keine Artikel ohne Kurs uebrig.")
            bilanz.stopp = "nichts_offen"
            return 0
        log.info("%d moegliche Artikel · %s · %s", len(kandidaten), ",".join(quellen),
                 "Trockenlauf" if dry else "schreibend")

        gen = Generator(cfg.gemini_api_keys, cfg.gemini_model)
        bilanz.beobachte(gen=gen)
        boegen = 0

        with httpx.Client(timeout=25.0, follow_redirects=True,
                          headers={"User-Agent": USER_AGENT}) as http:
            for kandidat in kandidaten:
                if stats["kurse"] >= args.anzahl:
                    bilanz.stopp = "ziel"
                    break
                if boegen >= MAX_BOEGEN:
                    bilanz.stopp = "limit"
                    log.info("%d Boegen versucht - Schluss fuer diesen Lauf.", boegen)
                    break
                if time.monotonic() >= frist:
                    bilanz.stopp = "zeit"
                    log.warning("Zeitbudget aufgebraucht.")
                    break
                if gen.calls + MIN_AUFRUFE > cfg.max_gemini_calls_per_run:
                    bilanz.stopp = "aufrufe"
                    log.warning("Aufrufdeckel reicht fuer keinen weiteren Kurs.")
                    break

                sprache, kategorie, url = kandidat["language"], kandidat["category_id"], kandidat["url"]
                src = quellen[sprache]
                lemma = urllib.parse.unquote(url.rsplit("/", 1)[-1]).replace("_", " ")
                item = fetch_article(Topic(category_id=kategorie, language=sprache, title=lemma), src, http)
                if item is None or len(item.text.split()) < MIN_WOERTER:
                    stats["zu_kurz"] += 1
                    log.info("  zu kurz fuer einen Kurs: %s", lemma)
                    continue

                boegen += 1
                bogen = make_course_arc(gen, text=item.text, title=item.title,
                                        language=sprache, count=LEKTIONEN)
                if bogen is None:
                    if gen.exhausted:
                        bilanz.stopp = "kontingent"
                        log.warning("Tageskontingent aufgebraucht.")
                        break
                    stats["bogen_ungeeignet"] += 1
                    log.info("  kein Bogen: %s", lemma)
                    continue

                plan = bogen["lessons"]
                log.info("Bogen [%s/%s] %s", sprache, kategorie, bogen["title"])
                for i, l in enumerate(plan, start=1):
                    log.info("    %d. %s - %s", i, l["title"], l["focus"])

                # --- Lektionen, in Reihenfolge und ohne Luecke --------------
                fertig: list[dict] = []
                for nr in range(1, len(plan) + 1):
                    karte = None
                    for versuch in range(2):
                        if gen.calls >= cfg.max_gemini_calls_per_run:
                            break
                        c = gen.make_card(
                            text=item.text,
                            title=plan[nr - 1]["title"],
                            source_name=src.display_name,
                            language=sprache,
                            category_ids=[kategorie],
                            auftrag=auftrag(bogen["title"], plan, nr),
                        )
                        if c is None:
                            stats["lektion_unbrauchbar"] += 1
                            log.info("    %d. unbrauchbar (%s)", nr, gen.last_reject or gen.first_error)
                            if gen.exhausted:
                                break
                            continue
                        check = validate(c, item.text)
                        if check.ok:
                            karte = c
                            break
                        stats["lektion_abgelehnt"] += 1
                        log.info("    %d. abgelehnt (Versuch %d): %s", nr, versuch + 1, check.reason)
                    if karte is None:
                        break
                    karte["category_id"] = kategorie
                    fertig.append(karte)
                    log.info("    %d. ✓ %s", nr, karte["title"])
                    if dry:
                        # Im Trockenlauf will man den Inhalt sehen, nicht nur,
                        # dass es geklappt hat - sonst ist er als Vorschau wertlos.
                        log.info("         %s", karte.get("deck") or "")
                        log.info("         Frage: %s", (karte.get("quiz") or {}).get("question", ""))

                if len(fertig) < MIN_LEKTIONEN:
                    stats["kurs_zu_kurz"] += 1
                    log.info("  nur %d Lektionen am Stueck - kein Kurs.", len(fertig))
                    if gen.exhausted:
                        bilanz.stopp = "kontingent"
                        break
                    continue

                # --- Drehbuecher mit dem, was uebrig ist --------------------
                #
                # Erst jetzt: fuer einen Kurs, der gar nicht zustande kommt,
                # waere jedes Drehbuch verschenkt.
                drehbuecher: list[dict | None] = []
                for karte in fertig:
                    script = None
                    if not args.ohne_drehbuch and gen.calls < cfg.max_gemini_calls_per_run:
                        versuch = make_script(gen, text=item.text, title=karte["title"],
                                              category=kategorie, language=sprache)
                        script = versuch.script
                        stats[f"drehbuch_{versuch.outcome}"] += 1
                    drehbuecher.append(script)

                freigeben = cfg.auto_approve and src.trust_score >= AUTO_APPROVE_MIN_TRUST
                zeilen = []
                for pos, (karte, script) in enumerate(zip(fertig, drehbuecher), start=1):
                    # Eigener Fingerabdruck je Lektion. Alle stammen aus
                    # DEMSELBEN Artikel und haetten sonst denselben
                    # content_hash - der Index ist eindeutig, und insert_items
                    # verwirft Dubletten still. Lektion 2 bis 5 waeren
                    # einfach nicht da gewesen.
                    einzeln = dataclasses.replace(
                        item, hash=content_hash(f"{url}#kurs-{pos}", karte["title"])
                    )
                    zeile = build_row(einzeln, karte, embedding=None, approve=freigeben, script=script)
                    zeile["content_type"] = "course_lesson"
                    zeile["expires_at"] = None
                    zeilen.append(zeile)

                kurs = {
                    "slug": kurs_slug(bogen["title"], sprache, url),
                    "title": bogen["title"].strip()[:80],
                    "description": (bogen.get("description") or "").strip()[:200],
                    "category_id": kategorie,
                    "difficulty": max(1, min(5, int(bogen.get("difficulty") or 2))),
                    "language": sprache,
                    "cover": {"quelle": url},
                    "is_published": freigeben,
                    "source_url": url,
                    "generated": True,
                }

                if dry:
                    stats["kurse"] += 1
                    log.info("  Trockenlauf: Kurs '%s' mit %d Lektionen waere geschrieben worden.",
                             kurs["title"], len(zeilen))
                    continue

                db.insert_items(zeilen)
                ids = db.ids_for_hashes([z["content_hash"] for z in zeilen])
                if len(ids) != len(zeilen):
                    stats["schreibfehler"] += 1
                    log.error("  %d von %d Lektionen nicht auffindbar - Kurs nicht angelegt.",
                              len(zeilen) - len(ids), len(zeilen))
                    continue
                angelegt = db.insert_rows("courses", [kurs])
                db.insert_rows("course_lessons", [
                    {"course_id": angelegt[0]["id"], "position": pos, "content_id": ids[z["content_hash"]]}
                    for pos, z in enumerate(zeilen, start=1)
                ], antwort=False)
                stats["kurse"] += 1
                geschrieben += len(zeilen)
                log.info("  ✓ Kurs '%s' · %d Lektionen · %s", kurs["title"], len(zeilen),
                         "live" if freigeben else "wartet auf Freigabe")

    bilanz.karten = geschrieben
    log.info("Fertig.")
    for label, key in [
        ("Kurse", "kurse"),
        ("Artikel zu kurz", "zu_kurz"),
        ("kein Bogen", "bogen_ungeeignet"),
        ("Lektion abgelehnt", "lektion_abgelehnt"),
        ("Lektion unbrauchbar", "lektion_unbrauchbar"),
        ("zu wenig Lektionen", "kurs_zu_kurz"),
        ("Drehbuch ok", "drehbuch_ok"),
        ("Schreibfehler", "schreibfehler"),
    ]:
        log.info("  %-22s %d", label, stats[key])
    log.info("  %-22s %d", "Lektionen geschrieben", geschrieben)
    log.info("  %-22s %d", "Gemini-Aufrufe", gen.calls if "gen" in locals() else 0)
    return 0


if __name__ == "__main__":
    # Schliesst die Laufbilanz auch bei Absturz oder Abschuss.
    hauptprogramm(main)
