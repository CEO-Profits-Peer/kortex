"""Deterministische Pruefung der Gemini-Ausgabe.

Kostet nichts und faengt den Grossteil der Halluzinationen, bevor ein zweiter
Modellaufruf noetig waere. Vier Pruefungen:

  1. Zahlen      - jede mehrstellige Zahl muss im Quelltext stehen.
                   Die staerkste Pruefung: erfundene Fakten haengen fast immer
                   an einer Zahl, und Zahlen lassen sich exakt vergleichen.
  2. Eigennamen  - Folgen aus zwei oder mehr grossgeschriebenen Woertern
                   ("Fabiola Gianotti", "Large Hadron Collider") muessen im
                   Quelltext vorkommen.
  3. Wortdeckung - ein Grossteil der langen Inhaltswoerter muss aus der Quelle
                   stammen. Faengt frei erfundene Absaetze, nicht einzelne
                   eingeschobene Halbsaetze.
  4. Beantwortbarkeit - die richtige Antwort muss aus dem Kartentext ableitbar
                   sein, sonst prueft die Frage Vorwissen oder Glueck.

WICHTIG, was das NICHT kann: eine einzelne, plausibel klingende, falsche
Aussage ohne Zahl und ohne Eigennamen rutscht durch. Deshalb bleibt
AUTO_APPROVE=false, bis die Ablehnungsquote zeigt, dass das Modell verlaesslich
arbeitet - ein Mensch ist die eigentliche letzte Instanz.

Warum kein einfacher Grossbuchstaben-Check: im Deutschen werden ALLE
Substantive grossgeschrieben. Ein naiver Eigennamen-Test wuerde jedes Hauptwort
als erfunden melden und damit jede deutsche Karte ablehnen.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

NUMBER_RE = re.compile(r"\d[\d.,]*")

# Zwei oder mehr grossgeschriebene Woerter in Folge. Im Deutschen wie im
# Englischen ein verlaessliches Signal fuer einen Eigennamen.
#
# Nur echte Leerzeichen als Trenner, nicht \s: sonst matcht die Folge ueber
# die Zeilengrenze zwischen zwei Feldern hinweg und erfindet Namen wie
# "Kilometern Der Beschleuniger" aus Titelende + Deckanfang.
MULTIWORD_RE = re.compile(r"\b[A-ZÄÖÜ][\wäöüß-]+(?:[ ]+[A-ZÄÖÜ][\wäöüß-]+)+")

LONG_WORD_RE = re.compile(r"\b[\wäöüßÄÖÜ-]{7,}\b")

# Satzanfaenge. Ein grossgeschriebenes Wort direkt nach einem Satzende, einem
# Doppelpunkt oder einem Zeilenumbruch ist grossgeschrieben, WEIL es am
# Satzanfang steht - nicht weil es ein Name ist.
#
# Das war die eigentliche Fehlerquelle: der Lauf lehnte reihenweise Karten ab
# mit Meldungen wie "Eigenname 'Transparente Dokumentation' steht nicht im
# Quelltext" oder "Eigenname 'Regionale Unterschiede'". Beides sind schlicht
# deutsche Saetze, die mit einem Adjektiv beginnen.
_SENT_BREAK = r"""(?:^|[.!?:;]["'’)\]]?\s+|\n\s*)"""
SENTENCE_START_RE = re.compile(_SENT_BREAK + r"([A-ZÄÖÜ][\wäöüß-]*)")

# Woerter, die am Satzanfang stehen koennen und keine Eigennamen sind. Werden
# vorne aus einer Mehrwortfolge abgeschnitten.
LEADING = {
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "eines",
    "dies", "diese", "dieser", "dieses", "dabei", "damit", "dadurch", "daher",
    "deshalb", "dann", "doch", "denn", "wenn", "weil", "wer", "wie", "was",
    "warum", "wo", "wird", "wurde", "nicht", "nur", "auch", "aber", "alle",
    "also", "beim", "bei", "durch", "für", "fuer", "mit", "nach", "von", "vom",
    "zum", "zur", "über", "unter", "seit", "ohne", "gegen", "im", "in", "an",
    "the", "this", "that", "these", "those", "there", "their", "they", "then",
    "with", "from", "into", "because", "while", "when", "what", "which",
    "where", "would", "could", "should", "about", "after", "before", "only",
    "its", "his", "her", "our", "and", "but", "for", "not", "now", "using",
    # Gattungswoerter, die vor einem Namen stehen koennen und selbst keiner
    # sind. Ohne diese Liste wird "Thema Dienstzeitmodell" als erfundener
    # Eigenname gemeldet, obwohl nur das Gattungswort neu ist.
    "thema", "bereich", "projekt", "programm", "initiative", "aktion",
    "veranstaltung", "konferenz", "studie", "bericht", "gesetz", "verordnung",
    "unternehmen", "firma", "verein", "stadt", "gemeinde", "land", "bund",
    "topic", "project", "programme", "program", "report", "study", "company",
    "city", "state", "council", "committee",
}

# Deckungsquote der langen Inhaltswoerter. Bewusst niedrig: Umformulieren ist
# erwuenscht und bringt zwangslaeufig neue Woerter ("Beschleuniger" statt
# "Collider"). Unter 55 Prozent hat das Modell nicht mehr zusammengefasst,
# sondern etwas Eigenes geschrieben.
MIN_WORD_COVERAGE = 0.55


@dataclass
class Result:
    ok: bool
    reason: str = ""


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^\w\s]+", " ", re.sub(r"\s+", " ", text)).lower()


def _numbers(text: str) -> set[str]:
    out: set[str] = set()
    for raw in NUMBER_RE.findall(text):
        cleaned = raw.rstrip(".,")
        # "1.500" und "1500" sollen als dieselbe Zahl gelten.
        out.add(cleaned.replace(".", "").replace(",", ""))
    return {n for n in out if n}


def _known_word(word: str, haystack: str) -> bool:
    """Kommt dieses Wort in der Quelle vor - auch in anderer Beugung?

    "Wiener" und "Wien", "Ozeanen" und "Ozeane": im Deutschen unterscheiden
    sich Formen desselben Worts oft nur in den letzten Buchstaben. Ein
    exakter Vergleich meldet daraus einen erfundenen Namen.

    Deshalb zaehlt auch der Wortstamm. Fuenf Zeichen sind der Kompromiss:
    lang genug, dass "Wien" nicht auf "Wiese" passt, kurz genug, dass die
    Beugung wegfaellt. Kuerzere Woerter werden ganz verglichen.
    """
    if word in haystack:
        return True
    return len(word) > 5 and word[:5] in haystack


def _sentence_starts(text: str) -> set[str]:
    """Woerter, die in diesem Text an einem Satzanfang stehen."""
    return {m.group(1) for m in SENTENCE_START_RE.finditer(text)}


def _proper_names(text: str) -> set[str]:
    """Mehrwortfolgen aus Grossbuchstaben, ohne fuehrende Fuellwoerter.

    Zwei Filter davor, beide gegen deutsche Fehlalarme:

      · das erste Wort faellt weg, wenn es an einem Satzanfang steht - dann
        sagt seine Grossschreibung nichts aus;
      · Fuellwoerter aus LEADING fallen ebenfalls weg.

    Bleibt danach nur noch ein Wort uebrig, ist es kein Mehrwortname und
    wird nicht geprueft. Ein einzelnes grossgeschriebenes deutsches Wort ist
    in aller Regel ein Substantiv, kein Eigenname.
    """
    starts = _sentence_starts(text)
    names: set[str] = set()
    for match in MULTIWORD_RE.findall(text):
        words = match.split()
        if words and words[0] in starts:
            words.pop(0)
        while words and words[0].lower() in LEADING:
            words.pop(0)
        if len(words) >= 2:
            names.add(" ".join(words))
    return names


def claim_text(card: dict[str, Any]) -> str:
    """Nur die Teile, die etwas BEHAUPTEN - ohne den Titel.

    Der Titel ist eine Beschriftung, kein Satz. Er wird im Englischen
    durchgaengig gross geschrieben ("Launch Services Contract Expansion"),
    und der Eigennamen-Test haelt dann jedes Wort darin fuer einen Namen.
    Genau daran scheiterten reihenweise korrekte NASA-Karten.

    Fuer Zahlen und Wortdeckung bleibt der Titel drin - dort ist er
    unproblematisch und eine erfundene Zahl im Titel waere schlimm.
    """
    parts = [card.get("deck", "")]
    for block in card.get("body_blocks", []):
        parts += [
            block.get("text", ""),
            block.get("value", ""),
            block.get("label", ""),
            *(block.get("items") or []),
        ]
    return chr(10).join(p for p in parts if p)


def card_text(card: dict[str, Any]) -> str:
    parts = [card.get("title", ""), card.get("deck", "")]
    for block in card.get("body_blocks", []):
        parts += [
            block.get("text", ""),
            block.get("value", ""),
            block.get("label", ""),
            *(block.get("items") or []),
        ]
    # Mit Zeilenumbruch verbinden, damit Feldgrenzen echte Grenzen sind.
    return "\n".join(p for p in parts if p)


def validate(card: dict[str, Any], source_text: str) -> Result:
    body = card.get("body_blocks") or []
    if not (2 <= len(body) <= 4):
        return Result(False, "falsche Anzahl Bloecke")

    text = card_text(card)
    words = len(text.split())
    if not (35 <= words <= 130):
        return Result(False, f"Laenge {words} Woerter ausserhalb 35-130")

    quiz = card.get("quiz") or {}
    options = quiz.get("options") or []
    if len(options) != 3:
        return Result(False, "nicht genau 3 Antwortoptionen")
    if len({o.strip().lower() for o in options}) != 3:
        return Result(False, "doppelte Antwortoptionen")
    if not (0 <= quiz.get("correct_index", -1) <= 2):
        return Result(False, "correct_index ausserhalb 0-2")

    haystack = _norm(source_text)

    # --- 1. Zahlen -----------------------------------------------------------
    source_numbers = _numbers(source_text)
    for number in _numbers(text):
        # Einstellige Zahlen sind meist Aufzaehlungen, keine Fakten.
        if len(number) > 1 and number not in source_numbers:
            return Result(False, f"Zahl '{number}' steht nicht im Quelltext")

    # --- 2. Eigennamen -------------------------------------------------------
    #
    # Fehlt die Wortfolge im Quelltext, ist das noch kein Beweis. Umstellen
    # ist erlaubt und erwuenscht: aus "Anna, ein Theaterstueck" darf
    # "Theaterstueck Anna" werden. Erfunden ist ein Name erst, wenn ein WORT
    # darin im Quelltext ueberhaupt nicht vorkommt.
    for name in _proper_names(claim_text(card)):
        if _norm(name) in haystack:
            continue
        missing = [w for w in _norm(name).split() if w and not _known_word(w, haystack)]
        if missing:
            return Result(
                False,
                f"Eigenname '{name}' steht nicht im Quelltext "
                f"(unbekannt: {', '.join(missing)})",
            )

    # --- 3. Wortdeckung ------------------------------------------------------
    long_words = {_norm(w) for w in LONG_WORD_RE.findall(text)}
    long_words = {w for w in long_words if w}
    if long_words:
        hits = sum(1 for w in long_words if w in haystack)
        coverage = hits / len(long_words)
        if coverage < MIN_WORD_COVERAGE:
            return Result(False, f"nur {coverage:.0%} der Inhaltswoerter aus der Quelle")

    # --- 4. Beantwortbarkeit -------------------------------------------------
    correct = options[quiz["correct_index"]]
    tokens = re.findall(r"\w{4,}", _norm(correct))
    if tokens:
        card_norm = _norm(text)
        hits = sum(1 for t in tokens if t in card_norm)
        if hits / len(tokens) < 0.5:
            return Result(False, "richtige Antwort nicht aus der Karte ableitbar")

    return Result(True)
