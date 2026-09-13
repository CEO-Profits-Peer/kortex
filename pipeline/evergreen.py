#!/usr/bin/env python3
"""Evergreen-Karten aus Wikipedia-Artikeln.

    python pipeline/evergreen.py              # normaler Lauf
    python pipeline/evergreen.py --dry-run    # nichts schreiben
    python pipeline/evergreen.py --limit 20   # hoechstens 20 Themen
    python pipeline/evergreen.py --category finance.compound
    python pipeline/evergreen.py --nur-entdecken  # nur neue Themen suchen, kein Gemini

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

Themen: Liste plus Entdeckung
-----------------------------
Die Handliste (topics.py) hatte 382 Themen und waere nach vier Tagen
aufgebraucht gewesen. Seit topic_discovery.py findet der Lauf selbst Nachschub,
sobald je Sprache weniger als NACHSCHUB_AB offene Themen uebrig sind - aus dem
Linkgraphen der Themen, die schon eine Karte haben. Jede neue Karte ist beim
naechsten Mal selbst Ausgangspunkt; die Liste ist damit Saat, nicht Grenze.

Damit dabei nichts endlos neu versucht wird, merkt sich die Tabelle
topic_memory (Migration 0073), wie jedes Thema ausgegangen ist.

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
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import Config                      # noqa: E402
from db import Database                        # noqa: E402
from laufbilanz import Laufbilanz, hauptprogramm  # noqa: E402
from run import (AUTO_APPROVE_MIN_TRUST, WRITE_EVERY, buffered_twin,  # noqa: E402
                 build_row)
from sources.wikipedia import fetch_article     # noqa: E402
from topic_discovery import entdecke             # noqa: E402
from topics import order_by_scarcity, topics_for  # noqa: E402
from sources.wikipedia import Topic               # noqa: E402
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

#: Unter so vielen offenen Themen je Sprache wird nach neuen gesucht. Hoch
#: genug, dass ein Lauf nie leerlaeuft (ein Lauf schafft gut 30 Themen), niedrig
#: genug, dass nicht bei jedem Lauf der Linkgraph neu geholt wird.
NACHSCHUB_AB = 60

#: So viele neue Themen je Kategorie pro Suche. Klein gehalten, damit die
#: Kategorien abwechselnd drankommen und keine den Nachschub allein bekommt.
NEU_JE_KATEGORIE = 6

#: Wie oft ein von der Pruefung abgelehntes Thema versucht wird. Die Pruefung
#: haengt am Wortlaut, ein zweiter Anlauf geht oft durch; ein dritter selten.
MAX_VERSUCHE = 2

#: Ausgaenge, nach denen ein Thema nie wieder versucht wird.
ENDGUELTIG = {"karte", "unbrauchbar", "kein_artikel", "dublette"}


def _noch_offen(eintrag: dict | None) -> bool:
    if not eintrag:
        return True
    if eintrag["status"] in ENDGUELTIG:
        return False
    if eintrag["status"] == "abgelehnt":
        return int(eintrag.get("versuche") or 0) < MAX_VERSUCHE
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schreiben")
    parser.add_argument("--limit", type=int, help="hoechstens so viele Themen")
    parser.add_argument("--category", help="nur diese Kategorie-ID")
    parser.add_argument("--nur-entdecken", action="store_true",
                        help="nur neue Themen suchen und merken - kein Gemini-Aufruf")
    args = parser.parse_args()

    cfg = Config.load()
    dry = args.dry_run or cfg.dry_run
    bilanz = Laufbilanz(cfg, "evergreen", dry)

    topics = topics_for(cfg.languages)
    if args.category:
        topics = [t for t in topics if t.category_id == args.category]
    if not topics:
        log.error("Keine Themen fuer Sprachen %s", cfg.languages)
        return 1

    stats: Counter[str] = Counter()
    bilanz.beobachte(stats=stats)
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
        bilanz.beobachte(gen=gen)

        # --- Gedaechtnis ---------------------------------------------------
        #
        # Was schon eine Karte hat, unbrauchbar war oder keinen Artikel hat,
        # faellt raus, BEVOR ein Artikel geholt wird. Ohne das wuerde jeder
        # Lauf die ganze wachsende Liste abklappern - und alles, was die
        # Pruefung verworfen hat, erneut mit Gemini versuchen.
        gedaechtnis = db.topic_memory()
        mit_gedaechtnis = gedaechtnis is not None
        if not mit_gedaechtnis:
            log.warning("topic_memory fehlt (Migration 0073) - ohne Gedaechtnis und "
                        "ohne Themensuche, wie bisher.")
            gedaechtnis = {}

        def eintrag(t: Topic) -> dict | None:
            return gedaechtnis.get((t.language, t.title.casefold()))

        liste = [t for t in topics if _noch_offen(eintrag(t))]
        entdeckt: list[Topic] = [
            Topic(category_id=e["category_id"], language=e["language"], title=e["title"])
            for e in gedaechtnis.values()
            if e["herkunft"] == "entdeckt" and e["language"] in cfg.languages
            and _noch_offen(e)
            and (not args.category or e["category_id"] == args.category)
        ]

        # --- Nachschub -----------------------------------------------------
        #
        # Nur mit Gedaechtnis: ohne es waeren die gefundenen Themen beim
        # naechsten Lauf wieder vergessen und wuerden jedes Mal neu gesucht.
        # Kostet Wikipedia- und Wikidata-Anfragen, kein Gemini-Kontingent.
        neu_gefunden = 0
        if mit_gedaechtnis:
            gueltig = set(category_ids)
            with httpx.Client(timeout=40.0, follow_redirects=True) as wiki:
                for sprache in cfg.languages:
                    offen = sum(1 for t in liste + entdeckt if t.language == sprache)
                    if offen >= NACHSCHUB_AB and not args.nur_entdecken:
                        continue
                    saat = [t for t in topics_for((sprache,))] + [
                        Topic(category_id=e["category_id"], language=e["language"], title=e["title"])
                        for e in gedaechtnis.values()
                        if e["language"] == sprache and e["herkunft"] == "entdeckt"
                        and e["status"] == "karte"
                    ]
                    bekannt = {e["title"] for e in gedaechtnis.values() if e["language"] == sprache}
                    try:
                        kandidaten = entdecke(wiki, saat, bekannt, NEU_JE_KATEGORIE, args.category)
                    except Exception as exc:  # noqa: BLE001 - Wikipedia darf den Lauf nicht kippen
                        log.warning("Themensuche %s gescheitert: %s", sprache, exc)
                        continue
                    zeilen = [
                        {"language": k.language, "title": k.title, "category_id": k.category_id,
                         "herkunft": "entdeckt", "status": "offen", "versuche": 0,
                         "score": round(k.score, 2)}
                        for k in kandidaten if k.category_id in gueltig
                    ]
                    if zeilen and not dry:
                        db.remember_topics(zeilen)
                    for z in zeilen:
                        gedaechtnis[(z["language"], z["title"].casefold())] = z
                        entdeckt.append(Topic(category_id=z["category_id"],
                                              language=z["language"], title=z["title"]))
                    neu_gefunden += len(zeilen)
                    log.info("Themensuche %s: %d offen, %d neu gefunden", sprache, offen, len(zeilen))

        if args.nur_entdecken:
            bilanz.stopp = "nur_entdecken"
            bilanz.extra["neu_gefunden"] = neu_gefunden
            log.info("Nur entdecken: %d neue Themen %s.", neu_gefunden,
                     "gemerkt" if not dry else "gefunden (Trockenlauf, nichts geschrieben)")
            return 0

        entdeckte_titel = {(t.language, t.title) for t in entdeckt}
        topics = liste + entdeckt
        ergebnisse: list[dict] = []

        def merken(t: Topic, status: str, versuch: bool) -> None:
            """Den Ausgang festhalten. Geschrieben wird zusammen mit den Karten."""
            if not mit_gedaechtnis:
                return
            alt = eintrag(t) or {}
            ergebnisse.append({
                "language": t.language, "title": t.title, "category_id": t.category_id,
                "herkunft": "entdeckt" if (t.language, t.title) in entdeckte_titel else "liste",
                "status": status,
                "versuche": int(alt.get("versuche") or 0) + (1 if versuch else 0),
                "score": alt.get("score"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

        # Reihenfolge nach Bestand, nicht nach Position in der Datei.
        # Begruendung und Messung stehen in topics.order_by_scarcity.
        bestand = db.card_counts()
        topics = order_by_scarcity(topics, bestand)
        leer = sorted(
            {t.category_id for t in topics if not bestand.get((t.category_id, t.language))}
        )

        log.info("%d Themen · Sprachen %s · %s · %d Schluessel",
                 len(topics), ",".join(cfg.languages),
                 "Trockenlauf" if dry else "schreibend", len(cfg.gemini_api_keys))
        if leer:
            # Sichtbar machen, woran der Lauf arbeitet. Ohne diese Zeile
            # sieht eine Bestandsluecke genauso aus wie eine Themenschwaeche
            # - und genau diese Verwechslung hat die Luecke wochenlang
            # ueberlebt.
            log.info("Zuerst ohne Karte (%d): %s", len(leer), ", ".join(leer[:12]))

        with httpx.Client(timeout=25.0, follow_redirects=True) as http:
            for topic in topics:
                if time.monotonic() >= frist:
                    bilanz.stopp = "zeit"
                    log.warning("Zeitbudget von %d Minuten aufgebraucht - der "
                                "naechste Lauf macht hier weiter",
                                cfg.max_run_minutes)
                    break
                if args.limit and stats["accepted"] >= args.limit:
                    bilanz.stopp = "limit"
                    log.info("Grenze von %d Karten erreicht", args.limit)
                    break
                if gen.calls >= cfg.max_gemini_calls_per_run:
                    bilanz.stopp = "aufrufe"
                    log.warning("Gemini-Limit erreicht, breche ab")
                    break

                src = sources.get(topic.language)
                if src is None:
                    continue

                item = fetch_article(topic, src, http)
                if item is None:
                    stats["kein_artikel"] += 1
                    merken(topic, "kein_artikel", versuch=False)
                    continue

                # Schon eine Karte zu diesem Lemma? Der Hash haengt an der
                # Artikeladresse, ist also je Thema stabil - anders als bei
                # Nachrichten, wo jeder Tag neue Adressen bringt. Genau
                # deshalb kostet ein zweiter Lauf ueber dieselbe Liste
                # nichts: alles Bekannte faellt hier raus, bevor das
                # Modell gefragt wird.
                if db.known_hashes([item.hash]):
                    stats["schon_da"] += 1
                    merken(topic, "karte", versuch=False)
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
                    # Nur festhalten, wenn das MODELL geantwortet hat. Ein
                    # leeres Kontingent sagt nichts ueber das Thema - wer das
                    # als "unbrauchbar" merkt, verliert gute Themen fuer immer.
                    if gen.last_reject and "usable=false" in gen.last_reject:
                        merken(topic, "unbrauchbar", versuch=True)
                    if gen.consecutive_failures >= 3:
                        if gen.exhausted:
                            bilanz.stopp = "kontingent"
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
                            bilanz.stopp = "gemini_fehler"
                            bilanz.fehler = gen.first_error
                        break
                    continue

                check = validate(card, item.text)
                if not check.ok:
                    stats["rejected"] += 1
                    log.info("  abgelehnt: %s  (%s)", item.title[:44], check.reason)
                    merken(topic, "abgelehnt", versuch=True)
                    continue

                # Die Kategorie kommt aus der Themenliste, nicht aus dem
                # Modell. Bei Nachrichten muss das Modell raten, hier wissen
                # wir es besser: wer "Zinseszins" auf die Liste setzt, hat
                # sich bei der Einordnung schon etwas gedacht.
                #
                # Bei GEFUNDENEN Themen ist es umgekehrt: die Kategorie dort
                # stammt aus dem Linkgraphen, und der hat im Trockenlauf
                # "Reelle Zahl" unter tech.code einsortiert. Das Modell sieht
                # den Artikel - es entscheidet.
                if (topic.language, topic.title) not in entdeckte_titel:
                    card["category_id"] = topic.category_id

                embedding = gen.embed(item.text, cfg.embedding_model)
                twin = (db.similar_to(embedding, cfg.dedupe_threshold)
                        or buffered_twin(embedding, rows, cfg.dedupe_threshold)
                        ) if embedding else None
                if twin:
                    stats["duplicate"] += 1
                    log.info("  Dublette: %s  (wie '%s', %.0f%%)",
                             item.title[:40], twin["title"][:30], twin["similarity"] * 100)
                    merken(topic, "dublette", versuch=True)
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
                merken(topic, "karte", versuch=True)
                log.info("  ✓ [%s] %s%s", topic.category_id, card["title"],
                         "  [Erklaerkarte]" if script else "")

                if not dry and len(rows) >= WRITE_EVERY:
                    written += db.insert_items(rows)
                    rows = []
                    # ERST nach den Karten. Stirbt der Lauf dazwischen, geht
                    # beides verloren und das Thema wird erneut versucht - das
                    # Gegenteil (Thema als "karte" gemerkt, Karte nie
                    # geschrieben) waere ein Thema, das fuer immer fehlt.
                    if ergebnisse:
                        db.remember_topics(ergebnisse)
                        ergebnisse = []

        if rows and not dry:
            written += db.insert_items(rows)
        if ergebnisse and not dry:
            db.remember_topics(ergebnisse)

    bilanz.karten = written
    bilanz.extra.update({"themen_offen": len(topics), "neu_gefunden": neu_gefunden})
    log.info("Fertig.")
    for label, value in [
        ("Themen offen", len(topics)),
        ("  davon neu gefunden", neu_gefunden),
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
        # Fehlte, und das war teuer: bei aufgebrauchtem Tageskontingent
        # wirft JEDER Drehbuchversuch, landet unter "modellfehler" - und
        # die Bilanz zeigte ueberall Null. Ein Lauf mit acht Karten und
        # null Erklaerkarten sah damit aus wie ein inhaltliches Problem
        # und war eine leere Quote. Eine Kategorie, die man nicht sehen
        # kann, ist genau die, die man sucht.
        ("  Modell nicht erreichbar", stats["kinetic_modellfehler"]),
        ("wartet auf Freigabe", stats["held_for_review"]),
        ("geschrieben", written),
        ("Gemini-Aufrufe", gen.calls),
    ]:
        log.info("  %-22s %d", label, value)
    return 0


if __name__ == "__main__":
    # Schliesst die Laufbilanz auch bei Absturz oder Abschuss.
    hauptprogramm(main)
