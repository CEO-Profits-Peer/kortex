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
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import Config                      # noqa: E402
from db import Database                        # noqa: E402
from laufbilanz import Laufbilanz, hauptprogramm  # noqa: E402
from sources.feeds import fetch_feed           # noqa: E402
from transform.generate import Generator       # noqa: E402
from transform.kinetic import make_script
from validate.checks import MIN_WORD_COVERAGE, validate
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

#: Nach wie vielen fertigen Karten zwischengespeichert wird. Klein genug,
#: dass ein Abbruch wenig kostet; gross genug, dass es nicht bei jeder
#: Karte eine Anfrage gibt.
WRITE_EVERY = 5


def build_row(item, card, *, embedding, approve: bool, script=None) -> dict:
    """Aus Rohartikel + Gemini-Karte eine Zeile fuer content_items.

    Mit Drehbuch wird daraus eine Erklaerkarte. Die Textbloecke bleiben
    trotzdem gefuellt: sie tragen die Suche, die Wiederholung - und den
    Fall, dass das Drehbuch einmal nicht abspielbar ist.
    """
    src = item.source

    # Nachricht oder Wissen. Die Einordnung entscheidet zwei Dinge, und
    # seit 0049 nicht mehr die Haltbarkeit - geloescht wird nichts:
    #
    #   * Die Mischung. get_feed teilt jeden Stapel in 40 Prozent news
    #     und 60 Prozent knowledge/interactive. Kaeme alles als news,
    #     bliebe die groessere Haelfte des Feeds den Demo-Karten
    #     ueberlassen. (Genau das war der Fall, solange hier fest "news"
    #     stand.)
    #   * Das Altern. Nachrichten verlieren im Ranking an Gewicht und
    #     werden in der App als "NICHT AKTUELL" angeschrieben; Wissen
    #     behaelt einen festen Wert, weil Zinseszins nicht schlechter
    #     wird, nur weil die Karte drei Monate alt ist.
    kind = card.get("content_type") if card.get("content_type") in ("news", "knowledge") else "news"
    return {
        "content_type": kind,
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
        # Kein Verfallsdatum mehr - fuer nichts. Siehe Migration 0049:
        # eine Nachricht von letztem Monat ist nicht wertlos, sie ist
        # veraltet. Das ist eine Eigenschaft, die man anschreibt (die App
        # zeigt "NICHT AKTUELL" samt Datum), kein Grund zum Verschwinden.
        #
        # Die Spalte bleibt fuer den Fall, dass es einmal wirklich
        # befristete Inhalte gibt - eine Frist, eine Aktion.
        "expires_at": None,
    }


def buffered_twin(
    embedding: list[float] | None, rows: list[dict], threshold: float
) -> dict | None:
    """Dublette gegen den EIGENEN Puffer - nicht gegen die Datenbank.

    db.similar_to() fragt, was schon gespeichert ist. Geschrieben wird aber
    erst alle WRITE_EVERY Karten; was seitdem entstanden ist, liegt im
    Puffer und ist fuer die Datenbankabfrage unsichtbar.

    Genau das ist passiert: im ersten echten Lauf steht "Duales Studium bei
    der Bundesbank" ZWEIMAL im Feed, aus zwei verschiedenen Meldungen
    desselben Hauses. Beide Karten waren korrekt, beide neu - und die
    Pruefung, die das haette merken sollen, hat die erste noch nicht
    gesehen.

    Die Kosinus-Aehnlichkeit hier von Hand: numpy nur fuer ein Skalarprodukt
    ueber hoechstens fuenf Vektoren mitzuschleppen, waere ein Paket mehr in
    jedem Lauf fuer nichts.
    """
    if not embedding:
        return None
    for row in rows:
        other = row.get("embedding")
        if not other or len(other) != len(embedding):
            continue
        punkt = sum(a * b for a, b in zip(embedding, other))
        betrag = (sum(a * a for a in embedding) ** 0.5) * (sum(b * b for b in other) ** 0.5)
        if betrag and punkt / betrag >= threshold:
            return {"title": row.get("title", "?"), "similarity": punkt / betrag}
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schreiben")
    parser.add_argument("--source", help="nur diese Quellen-ID")
    parser.add_argument("--limit", type=int, default=8, help="Eintraege pro Feed")
    args = parser.parse_args()

    cfg = Config.load()
    dry = args.dry_run or cfg.dry_run
    bilanz = Laufbilanz(cfg, "ingest", dry)

    db = Database(cfg)
    gen = Generator(cfg.gemini_api_keys, cfg.gemini_model)
    bilanz.beobachte(gen=gen)

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
    bilanz.beobachte(stats=stats)
    rows: list[dict] = []
    # Wortdeckung ALLER Karten, auch der bestandenen. Nur damit laesst sich
    # sagen, ob die Schwelle von 55 Prozent richtig sitzt - eine Schwelle,
    # von der man nur die Ablehnungen kennt, kann man nicht beurteilen.
    coverages: list[float] = []
    written = 0

    # Eigene Frist, kuerzer als die des Workflows.
    #
    # Der Job bricht nach zwanzig Minuten ab. Das ist ein Abschuss: der
    # Schritt ist weg, die noch nicht geschriebenen Karten im Puffer sind
    # weg, und die Bilanz, aus der man lernen wuerde, gibt es nicht. Vor
    # allem laufen Evergreen und Push danach gar nicht mehr - die
    # Wikipedia-Karten fallen also immer als erstes aus, obwohl sie die
    # sind, die bleiben.
    #
    # Mit eigener Frist hoert der Lauf von selbst auf, schreibt seinen
    # Puffer und gibt die Bilanz aus. Was liegen bleibt, holt der naechste
    # Lauf: Bekanntes faellt an der Hash-Pruefung raus, bevor das Modell
    # gefragt wird, und kostet nichts.
    frist = time.monotonic() + cfg.max_run_minutes * 60

    def zeit_um() -> bool:
        return time.monotonic() >= frist

    # 'link_only': nur Titel und Link erlaubt. In v1 wird das ganz
    # uebersprungen, statt halbe Karten zu bauen (docs/CONTENT-SOURCING.md).
    #
    # Aussortiert wird VOR dem Abruf, nicht danach - das ist eine Korrektur.
    # Vorher wurden diese Feeds geholt, gezaehlt und dann weggeworfen, und
    # ihre Artikel zaehlten dabei gegen MAX_ITEMS_PER_RUN. Solange zehn von
    # zweiundzwanzig Quellen link_only waren, ging das gerade noch auf. Mit
    # 0059 sind es einunddreissig Feeds, und die Obergrenze haette nun
    # zugeschlagen, bevor die hinteren Quellen ueberhaupt drankommen -
    # welche das sind, entscheidet die Reihenfolge aus der Datenbank, also
    # der Zufall. Ein Kontingent an etwas zu verbrauchen, das per Definition
    # nichts ergeben kann, ist in beiden Faellen falsch; es faellt nur erst
    # jetzt auf.
    nutzbar = [s for s in sources if s.may_store_fulltext]
    if len(nutzbar) < len(sources):
        log.info("%d Quellen uebersprungen (Lizenz erlaubt keinen Volltext)",
                 len(sources) - len(nutzbar))
        stats["skipped_license_sources"] = len(sources) - len(nutzbar)

    for src in nutzbar:
        if zeit_um():
            bilanz.stopp = "zeit"
            log.warning("Zeitbudget von %d Minuten aufgebraucht - Rest beim "
                        "naechsten Lauf", cfg.max_run_minutes)
            break
        if stats["seen"] >= cfg.max_items_per_run:
            bilanz.stopp = "artikel"
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

        # Scheitert das auch nach den Wiederholungen in db._get, nur diese
        # Quelle auslassen. Ohne Abgleich weiterzumachen hiesse, bekannte
        # Artikel erneut an Gemini zu schicken; den ganzen Lauf abzubrechen
        # hiess bisher, dass auch Evergreen danach ausfiel.
        try:
            known = db.known_hashes([i.hash for i in items])
        except Exception as exc:  # noqa: BLE001
            log.warning("%s: Abgleich mit der Datenbank gescheitert, Quelle ausgelassen: %s",
                        src.id, exc)
            continue
        fresh = [i for i in items if i.hash not in known]
        stats["already_known"] += len(items) - len(fresh)

        for item in fresh:
            if zeit_um():
                bilanz.stopp = "zeit"
                log.warning("Zeitbudget aufgebraucht, breche ab")
                break
            if gen.calls >= cfg.max_gemini_calls_per_run:
                bilanz.stopp = "aufrufe"
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
                #
                # Ausser das Tageskontingent ist schlicht alle. Das sieht
                # genauso aus und ist kein Fehler - "pruef deine
                # Konfiguration" waere dann eine Fehlleitung, die man
                # stundenlang verfolgt, waehrend man nur bis morgen
                # warten muesste.
                if gen.consecutive_failures >= 3:
                    if gen.exhausted:
                        log.warning(
                            'Tageskontingent aufgebraucht - alle %d Modelle, alle '
                            '%d Schluessel. Kein Fehler, nur Schluss fuer heute. '
                            'Ein zweiter Schluessel aus einem ZWEITEN Google-Projekt '
                            'waere ein zweiter Satz Kontingente (GEMINI_API_KEY_2).',
                            len(gen.models), len(gen.api_keys),
                        )
                        bilanz.stopp = "kontingent"
                        break
                    log.error(
                        'Drei Gemini-Aufrufe in Folge fehlgeschlagen. Abbruch.\n'
                        '  Ursache: %s\n'
                        '  Zum Eingrenzen:  python pipeline/probe_gemini.py',
                        gen.first_error,
                    )
                    bilanz.stopp = "gemini_fehler"
                    bilanz.fehler = gen.first_error
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

            # --- Erzaehlt das schon eine andere Karte? -------------------
            #
            # Erst hier, nicht frueher: der Vergleich braucht die
            # Einbettung, und die kostet einen eigenen Aufruf. Ihn fuer
            # jeden Rohartikel auszugeben - auch fuer die, die gleich
            # durch die Relevanz- oder Inhaltspruefung fallen - waere
            # teurer als die paar Modellaufrufe, die es spart.
            #
            # Verglichen wird der Quelltext, nicht die fertige Karte: zwei
            # Meldungen ueber denselben Start sind sich im Original
            # aehnlicher als in zwei verschieden formulierten Karten.
            twin = (db.similar_to(embedding, cfg.dedupe_threshold)
                    or buffered_twin(embedding, rows, cfg.dedupe_threshold))
            if twin:
                stats["duplicate"] += 1
                log.info(
                    "  Dublette: %s  (wie '%s', %.0f%%)",
                    item.title[:44], twin["title"][:34], twin["similarity"] * 100,
                )
                continue

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
                attempt = make_script(
                    gen,
                    text=item.text,
                    title=card["title"],
                    category=card["category_id"],
                    language=src.default_language,
                )
                script = attempt.script
                stats[f"kinetic_{attempt.outcome}"] += 1
                if attempt.outcome == "ok":
                    stats["kinetic"] += 1
                elif attempt.detail:
                    log.info("    Drehbuch verworfen: %s", attempt.detail)

            rows.append(
                build_row(item, card, embedding=embedding, approve=approve, script=script)
            )
            stats["accepted"] += 1
            if check.coverage is not None:
                coverages.append(check.coverage)

            # Zwischendurch schreiben, nicht erst am Schluss.
            #
            # Der Workflow bricht nach zwanzig Minuten ab, und ein Lauf
            # braucht bei ausgelasteten Modellen leicht laenger. Wer alles
            # bis zum Ende sammelt, verliert bei einem Abbruch ALLES - eine
            # halbe Stunde Modellaufrufe fuer nichts. In Bloecken zu
            # schreiben kostet ein paar zusaetzliche Anfragen und macht den
            # Abbruch harmlos.
            if not dry and len(rows) >= WRITE_EVERY:
                written += db.insert_items(rows)
                rows = []
            log.info("  ✓ %s%s", card["title"], "  [Erklaerkarte]" if script else "")

        if not dry:
            db.mark_fetched(src.id)

    if rows and not dry:
        written += db.insert_items(rows)

    if gen.first_error and stats["accepted"] == 0:
        log.error(
            'Kein einziger Gemini-Aufruf war erfolgreich.\n'
            '  Erster Fehler: %s\n'
            '  Zum Eingrenzen:  python pipeline/probe_gemini.py',
            gen.first_error,
        )

    # Der Bericht, fuer den der ganze Lauf gemacht wird.
    #
    # Er kam bisher nie an. Die Formatzeichenkette hatte dreizehn
    # Platzhalter und bekam vierzehn Werte - also verschob sich alles um
    # eins, und der letzte blieb uebrig. Python meldet das nicht als
    # Absturz, sondern schreibt "--- Logging error ---" samt Traceback
    # nach stderr und macht weiter. Wer den Lauf ueber GitHub Actions
    # ansieht, scrollt an einer Fehlermeldung vorbei und findet dort, wo
    # die Zusammenfassung stehen sollte, gar nichts.
    #
    # Deshalb jetzt eine Zeile pro Wert. Laenger, dafuer kann sich beim
    # naechsten neuen Zaehler nichts mehr verschieben.
    bilanz.karten = written
    log.info("Fertig.")
    for label, value in [
        ("gesehen", stats["seen"]),
        ("schon bekannt", stats["already_known"]),
        ("Quellen ohne Volltextrecht", stats["skipped_license_sources"]),
        ("ohne Lernwert", stats["irrelevant"]),
        ("Dublette", stats["duplicate"]),
        ("Gemini unbrauchbar", stats["gemini_unusable"]),
        ("Pruefung abgelehnt", stats["rejected"]),
        ("angenommen", stats["accepted"]),
        ("davon Erklaerkarten", stats["kinetic"]),
        # Aufgeschluesselt, weil "Drehbuch verworfen" allein nichts sagt.
        # Ob das Modell den Text fuer ungeeignet haelt oder ob die Pruefung
        # eine Form bemaengelt, sind zwei voellig verschiedene Baustellen -
        # die erste liegt im Prompt, die zweite im Schema.
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
        ("Wiederholungen", gen.retries),
    ]:
        log.info("  %-22s %d", label, value)
    log.info("  %-22s %s", "zuletzt genutztes Modell", gen.model)

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
    # Schliesst die Laufbilanz auch bei Absturz oder Abschuss.
    hauptprogramm(main)
