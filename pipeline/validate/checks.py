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

from .overclaim import overclaims

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
#:
#: Gemessen an 46 Karten aus einem echten Lauf: Median 67 Prozent, zehntes
#: Perzentil 48, Minimum 38. Bei 55 fielen 9 von 46 durch - also jede
#: fuenfte, und darunter mehrere im Bereich 48 bis 54, die nur umformuliert
#: hatten statt zu erfinden.
#:
#: 45 trennt sauberer: was darunter liegt, ist im Stichprobenvergleich
#: tatsaechlich neu geschrieben und nicht zusammengefasst. Umformulieren
#: soll erlaubt sein - es ist sogar erwuenscht, sonst waere die Karte ein
#: Zitat.
MIN_WORD_COVERAGE = 0.45

#: Wie viel von der richtigen Antwort im Kartentext wiederauftauchen muss.
#:
#: Die Pruefung soll verhindern, dass das Quiz Vorwissen abfragt statt der
#: Karte. Sie bestraft aber auch das Umformulieren: eine Antwort, die
#: denselben Sachverhalt mit anderen Woertern sagt, faellt durch, obwohl die
#: Karte sie traegt. Deshalb steht der Wert bewusst niedrig - und der
#: tatsaechliche Anteil landet bei jeder Ablehnung im Log.
MIN_ANSWER_OVERLAP = 0.5


@dataclass
class Result:
    ok: bool
    reason: str = ""
    #: Anteil der langen Inhaltswoerter, die aus der Quelle stammen.
    #: Wird auch bei bestandener Pruefung gefuellt - nur so laesst sich
    #: hinterher beantworten, ob die Schwelle richtig sitzt, statt darueber
    #: zu diskutieren.
    coverage: float | None = None


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


def _invented_words(name: str, haystack: str) -> list[str]:
    """Welche Woerter eines Namens stehen wirklich nicht in der Quelle?

    Ein vorangestelltes Gattungswort zaehlt nicht als Erfindung. Beobachtet
    an echten Ablehnungen:

        "Namen RYE"            - RYE steht im Text, "Namen" nicht
        "Wettbewerb Loesungen" - beides steht da, nur nicht nebeneinander
        "Thema Dienstzeitmodell"

    Das Modell stellt dem Namen erklaerend ein Wort voran. Das ist kein
    erfundener Name, das ist ein Satz. Deshalb: fehlt AUSSCHLIESSLICH am
    Anfang etwas und ist der Rest belegt, wird durchgelassen.

    Fehlt dagegen mittendrin oder am Ende etwas, bleibt es eine Ablehnung -
    "Physikerin Fabiola Gianotti" faellt weiter durch, weil der Name selbst
    nicht in der Quelle steht.
    """
    words = [w for w in name.split() if w]
    known = [_known_word(w, haystack) for w in words]

    # Ist NICHTS belegt, ist der ganze Name erfunden. Diesen Fall zuerst -
    # sonst schneidet die Regel unten alles weg und laesst genau das
    # durch, was sie fangen soll ("Physikerin Fabiola Gianotti").
    if not any(known):
        return words

    # Fuehrende unbelegte Woerter abschneiden: ein vorangestelltes
    # Gattungswort ist kein erfundener Name, sondern ein Satz.
    start = 0
    while not known[start]:
        start += 1

    # Was danach kommt, muss belegt sein. Fehlt mittendrin oder am Ende
    # etwas, ist es eine Erfindung.
    return [w for w, k in zip(words[start:], known[start:]) if not k]


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

    # --- Passt das ueberhaupt auf einen Bildschirm? --------------------------
    #
    # Der Prompt bittet um ein Budget, diese Pruefung setzt es durch. Ohne
    # sie haengt die Kartenlaenge an der Tagesform des Modells, und zu lange
    # Karten werden von der App entweder verkleinert oder auf eine zweite
    # Seite geschoben - beides schlechter als eine Karte, die passt.
    #
    # Die Grenzen liegen etwas weiter als im Prompt: er bittet um 50 bis 85
    # Woerter, abgelehnt wird erst ab 110. Eine Karte wegen fuenf Woertern
    # wegzuwerfen waere Verschwendung; das Budget soll lenken, nicht
    # schikanieren.
    title = (card.get("title") or "").strip()
    if len(title) > 70:
        return Result(False, f"Titel zu lang ({len(title)} Zeichen)")
    deck = (card.get("deck") or "").strip()
    if len(deck) > 130:
        return Result(False, f"Unterzeile zu lang ({len(deck)} Zeichen)")

    text = card_text(card)
    words = len(text.split())
    if not (35 <= words <= 110):
        return Result(False, f"Laenge {words} Woerter ausserhalb 35-110")

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
        missing = _invented_words(_norm(name), haystack)
        if missing:
            return Result(
                False,
                f"Eigenname '{name}' steht nicht im Quelltext "
                f"(unbekannt: {', '.join(missing)})",
            )

    # --- 3. Wortdeckung ------------------------------------------------------
    long_words = {_norm(w) for w in LONG_WORD_RE.findall(text)}
    long_words = {w for w in long_words if w}
    coverage: float | None = None
    if long_words:
        hits = sum(1 for w in long_words if w in haystack)
        coverage = hits / len(long_words)
        if coverage < MIN_WORD_COVERAGE:
            return Result(
                False,
                f"nur {coverage:.0%} der Inhaltswoerter aus der Quelle",
                coverage=coverage,
            )

    # --- 4. Nicht verschaerfen -----------------------------------------------
    #
    # Die haeufigste Art, eine Studie falsch wiederzugeben, ist nicht die
    # erfundene Zahl - es ist der Sprung von "haengt zusammen mit" zu
    # "fuehrt zu". Siehe validate/overclaim.py.
    too_much = overclaims(text, source_text)
    if too_much:
        return Result(False, too_much, coverage=coverage)

    # --- 5. Beantwortbarkeit -------------------------------------------------
    correct = options[quiz["correct_index"]]
    tokens = re.findall(r"\w{4,}", _norm(correct))
    if tokens:
        card_norm = _norm(text)
        hits = sum(1 for t in tokens if t in card_norm)
        share = hits / len(tokens)
        if share < MIN_ANSWER_OVERLAP:
            # Den Wert mitschreiben, nicht nur das Urteil. Diese Pruefung
            # war in den ersten Laeufen fuer 14 von 24 Ablehnungen
            # verantwortlich - mit Abstand die haerteste. Ob sie zu hart
            # ist, laesst sich nur an der Verteilung entscheiden, und die
            # bekommt man nur, wenn sie im Log steht.
            return Result(
                False,
                f"richtige Antwort nicht aus der Karte ableitbar ({share:.0%})",
                coverage=coverage,
            )

    return Result(True, coverage=coverage)


# =============================================================================
# Erklaerkarten
#
# Warum hier strenger geprueft wird als bei einer Textkarte:
#
# Eine erfundene Zahl in einem Absatz ist ein Fehler. Dieselbe Zahl in einer
# Tabelle, die sich Zeile fuer Zeile aufbaut, waehrend eine Stimme sie
# vorliest, ist ein ueberzeugender Fehler. Die Darstellung leiht der Zahl
# eine Glaubwuerdigkeit, die der Satz ihr nie geben koennte - und genau
# deshalb darf hier nichts durchrutschen, was im Quelltext nicht steht.
#
# Geprueft wird deshalb JEDE Zahl aus JEDEM Bild, nicht nur die im
# gesprochenen Satz.
# =============================================================================

#: Laenger gesprochen wird ein Takt zaeh, und der Untertitel braucht dann
#: drei Zeilen - die Buehne springt bei jedem Satzwechsel.
MAX_SAY_CHARS = 160

VALID_KINDS = {"statement", "table", "bars", "timeline", "quantity", "steps", "figure"}

#: Bildarten, in denen von Takt zu Takt etwas dazukommt. Mindestens eine
#: davon muss vorkommen - siehe das Ende von validate_kinetic.
BUILDING_KINDS = {"table", "bars", "timeline", "quantity", "steps"}

#: Grenzen der neuen Bildarten, gespiegelt aus transform/kinetic.py. Dort
#: stehen sie im Prompt, hier werden sie durchgesetzt - ein Modell haelt
#: sich an eine Zahl im Fliesstext nur ungefaehr.
MAX_POINTS = 6
MAX_STEPS = 6
# Eine Obergrenze fuer die Kaestchenzahl steht hier bewusst NICHT: "total"
# darf jede Groesse sein ("3,4 von 8,9 Millionen"), die Anzeige rechnet sie
# auf hundert Kaestchen herunter. Geprueft wird nur, dass die Anteile das
# Ganze nicht ueberschreiten.


def _show_numbers(show: dict[str, Any]) -> list[str]:
    """Alle Zahlen, die in einem Bild vorkommen - egal in welchem Feld."""
    parts: list[str] = []
    for key in ("text", "sub", "caption", "unit"):
        value = show.get(key)
        if isinstance(value, str):
            parts.append(value)
    for row in show.get("rows") or []:
        if isinstance(row, list):
            parts.extend(str(c) for c in row)
    for label in show.get("labels") or []:
        parts.append(str(label))
    for head in show.get("head") or []:
        parts.append(str(head))
    for point in show.get("points") or []:
        if isinstance(point, dict):
            parts.append(str(point.get("label") or ""))
            parts.append(str(point.get("note") or ""))
    for group in show.get("groups") or []:
        if isinstance(group, dict):
            parts.append(str(group.get("label") or ""))
    for step in show.get("steps") or []:
        if isinstance(step, dict):
            parts.append(str(step.get("label") or ""))
            parts.append(str(step.get("note") or ""))
    out: list[str] = []
    for p in parts:
        out.extend(_numbers(p))

    # Zahlen, die als Zahl und nicht als Zeichenkette ankommen: Balkenwerte,
    # Punkte auf der Zeitachse, Gruppenanteile, die Bezugsgroesse.
    numeric: list[float] = []
    numeric.extend(v for v in (show.get("values") or []) if isinstance(v, (int, float)))
    numeric.extend(
        p.get("at") for p in (show.get("points") or [])
        if isinstance(p, dict) and isinstance(p.get("at"), (int, float))
    )
    numeric.extend(
        g.get("value") for g in (show.get("groups") or [])
        if isinstance(g, dict) and isinstance(g.get("value"), (int, float))
    )
    if isinstance(show.get("total"), (int, float)):
        numeric.append(show["total"])
    for v in numeric:
        text = str(int(v)) if float(v).is_integer() else str(v)
        out.extend(_numbers(text))
    return out



def _picture_text(show: dict[str, Any]) -> str:
    """Der freie Text eines Bildes - der ohne Zahl daneben.

    Absichtlich NUR die neuen Bildarten. Tabellenzeilen und
    Balkenbeschriftungen haengen an einer Zahl, und die Zahlenpruefung
    bindet sie schon an die Quelle. Sie hier mitzunehmen hiesse, jede
    umformulierte Kopfzeile ("Guthaben" statt "Kontostand") zur Ablehnung
    zu machen - dieselbe Karte, die vorher durchging.
    """
    parts: list[str] = []
    for key in ("points", "steps"):
        for entry in show.get(key) or []:
            if isinstance(entry, dict):
                parts.append(str(entry.get("label") or ""))
                parts.append(str(entry.get("note") or ""))
    for group in show.get("groups") or []:
        if isinstance(group, dict):
            parts.append(str(group.get("label") or ""))
    return " ".join(p for p in parts if p)


#: Sieht aus wie ein Aktenzeichen: Grossbuchstaben, Bindestrich, Ziffern.
#: "GSI-M-2", "SSI-M-2-1", "SR-M".
CODE_RE = re.compile(r"^[A-Z]{2,}(?:[-–][A-Z0-9]+)+$")

#: Blanke Ganzzahl ab fuenf Stellen, ohne Einheit und ohne Trennzeichen.
#: "875606" ist eine Dokumentnummer; eine echte Groesse dieser Ordnung
#: schriebe das Modell als "875.606" oder mit Einheit.
BARE_ID_RE = re.compile(r"^\d{5,}$")


def _looks_like_ids(rows: list) -> bool:
    """Ist diese Tabelle eine Aktenliste statt einer Groessenreihe?

    Der Anlass war eine echte Karte: CERN-Sicherheitsregeln, vorgetragen
    als Tabelle aus Regelkuerzeln und EDMS-Dokumentnummern. Technisch
    fehlerfrei - jede Zahl stand im Quelltext -, und trotzdem erklaert sie
    nichts. Man sieht einer Aktennummer beim Wachsen nicht zu.

    Erkannt wird beides, was so eine Liste ausmacht: Kuerzel links,
    blanke lange Nummern rechts. Eines von beidem genuegt.
    """
    if len(rows) < 2:
        return False

    left = [str(r[0]).strip() for r in rows if isinstance(r, list) and len(r) == 2]
    right = [str(r[1]).strip() for r in rows if isinstance(r, list) and len(r) == 2]
    if len(left) < 2:
        return False

    codes = sum(1 for v in left if CODE_RE.match(v))
    bare = sum(1 for v in right if BARE_ID_RE.match(v))
    return codes >= 2 or bare >= 2


def validate_kinetic(script: dict[str, Any], source_text: str) -> Result:
    """Taugt dieses Drehbuch, oder wird es eine Textkarte?

    Ein "nein" ist hier billig: die Karte existiert schon, sie wird dann
    eben als Text ausgeliefert. Deshalb darf die Pruefung streng sein.
    """
    beats = script.get("beats")
    if not isinstance(beats, list) or not (4 <= len(beats) <= 8):
        return Result(False, "falsche Anzahl Takte")

    source_numbers = _numbers(source_text)
    haystack = _norm(source_text)
    kinds_seen: list[str] = []
    #: Wie gross ein Bild je (Art, id) im besten Takt geworden ist. Damit
    #: laesst sich am Ende beantworten, ob ueberhaupt etwas GEWACHSEN ist.
    grew: dict[tuple[str, Any], int] = {}
    #: Lange Woerter aus dem freien Bildtext, ueber alle Takte gesammelt.
    picture_words: set[str] = set()

    for i, beat in enumerate(beats, 1):
        say = (beat or {}).get("say")
        show = (beat or {}).get("show")
        if not isinstance(say, str) or not say.strip():
            return Result(False, f"Takt {i} ohne Satz")
        if len(say) > MAX_SAY_CHARS:
            return Result(False, f"Takt {i}: Satz zu lang ({len(say)} Zeichen)")
        if not isinstance(show, dict) or show.get("kind") not in VALID_KINDS:
            return Result(False, f"Takt {i}: unbekannte Bildart")

        kinds_seen.append(show["kind"])

        # Form der Bilder. Die App zeichnet Tabellen zweispaltig und
        # erwartet zu jedem Balken genau einen Wert - kommt etwas anderes
        # an, sieht die Karte kaputt aus, ohne dass irgendwo ein Fehler
        # auftaucht. Das Schema kann die Laengen nicht erzwingen, also hier.
        if show["kind"] == "table":
            rows = show.get("rows")
            if not isinstance(rows, list) or not rows:
                return Result(False, f"Takt {i}: Tabelle ohne Zeilen")
            if any(not isinstance(r, list) or len(r) != 2 for r in rows):
                return Result(False, f"Takt {i}: Tabellenzeile nicht zweispaltig")
            head = show.get("head")
            if head is not None and (not isinstance(head, list) or len(head) != 2):
                return Result(False, f"Takt {i}: Tabellenkopf nicht zweispaltig")
            if _looks_like_ids(rows):
                return Result(False, f"Takt {i}: Tabelle aus Kennungen statt Groessen")
            grew[("table", show.get("id"))] = max(
                grew.get(("table", show.get("id")), 0), len(rows)
            )
        if show["kind"] == "bars":
            labels, values = show.get("labels"), show.get("values")
            if not isinstance(labels, list) or not isinstance(values, list):
                return Result(False, f"Takt {i}: Balken ohne Beschriftung oder Werte")
            if len(labels) != len(values) or not (2 <= len(labels) <= 4):
                return Result(False, f"Takt {i}: {len(labels)} Beschriftungen, {len(values)} Werte")
            if any(not isinstance(v, (int, float)) for v in values):
                return Result(False, f"Takt {i}: Balkenwert ist keine Zahl")
            grew[("bars", show.get("id"))] = max(
                grew.get(("bars", show.get("id")), 0), len(values)
            )
        if show["kind"] == "timeline":
            points = show.get("points")
            if not isinstance(points, list) or not (1 <= len(points) <= MAX_POINTS):
                return Result(False, f"Takt {i}: Zeitstrahl mit {len(points or [])} Punkten")
            ats: list[float] = []
            for p in points:
                if not isinstance(p, dict) or not isinstance(p.get("at"), (int, float)):
                    return Result(False, f"Takt {i}: Punkt ohne Wert auf der Achse")
                if not str(p.get("label") or "").strip():
                    return Result(False, f"Takt {i}: Punkt ohne Beschriftung")
                ats.append(float(p["at"]))
            # Aufsteigend, weil die Achse von oben nach unten laeuft. Eine
            # unsortierte Liste sieht nicht falsch aus, sie sieht nur
            # zufaellig aus - und die Abstaende, die ganze Aussage dieser
            # Bildart, waeren Unsinn.
            if ats != sorted(ats):
                return Result(False, f"Takt {i}: Zeitstrahl nicht aufsteigend")
            grew[("timeline", show.get("id"))] = max(
                grew.get(("timeline", show.get("id")), 0), len(points)
            )

        if show["kind"] == "quantity":
            total, groups = show.get("total"), show.get("groups")
            # Mindestens zwei, nicht bloss groesser als null: ein Raster
            # aus einem Kaestchen ist kein Bild. Dieselbe Grenze steht in
            # app/src/features/kinetic/types.ts - laufen die beiden
            # auseinander, bleibt die Karte in der App leer.
            if not isinstance(total, (int, float)) or total < 2:
                return Result(False, f"Takt {i}: Raster ohne Bezugsgroesse")
            if not isinstance(groups, list) or not (1 <= len(groups) <= 4):
                return Result(False, f"Takt {i}: {len(groups or [])} Gruppen im Raster")
            total_value = 0.0
            for g in groups:
                if not isinstance(g, dict) or not isinstance(g.get("value"), (int, float)):
                    return Result(False, f"Takt {i}: Gruppe ohne Wert")
                if not str(g.get("label") or "").strip():
                    return Result(False, f"Takt {i}: Gruppe ohne Beschriftung")
                total_value += float(g["value"])
            # Mehr Anteile als Ganzes: das Raster liefe ueber, und die
            # Aussage waere schlicht falsch. Kleine Toleranz, weil sich
            # gerundete Prozentangaben auf 100,2 summieren duerfen.
            if total_value > float(total) * 1.02:
                return Result(False, f"Takt {i}: Anteile ergeben mehr als das Ganze")
            grew[("quantity", show.get("id"))] = max(
                grew.get(("quantity", show.get("id")), 0), len(groups)
            )

        if show["kind"] == "steps":
            steps = show.get("steps")
            if not isinstance(steps, list) or not (1 <= len(steps) <= MAX_STEPS):
                return Result(False, f"Takt {i}: Ablauf mit {len(steps or [])} Schritten")
            for s in steps:
                if not isinstance(s, dict) or not str(s.get("label") or "").strip():
                    return Result(False, f"Takt {i}: Schritt ohne Beschriftung")
            grew[("steps", show.get("id"))] = max(
                grew.get(("steps", show.get("id")), 0), len(steps)
            )

        if show["kind"] == "statement" and not (show.get("text") or "").strip():
            return Result(False, f"Takt {i}: Aussage ohne Text")

        # Freier Text IM BILD wird gesammelt und erst nach der Schleife
        # geprueft - siehe unten, warum nicht je Takt.
        picture_words.update(
            w for w in (_norm(w) for w in LONG_WORD_RE.findall(_picture_text(show))) if w
        )

        # Zahlen - im Satz wie im Bild.
        # list(): _numbers gibt eine Menge zurueck, _show_numbers eine
        # Liste. Ohne die Umwandlung wirft das Pluszeichen.
        for number in list(_numbers(say)) + _show_numbers(show):
            if len(number) > 1 and number not in source_numbers:
                return Result(False, f"Takt {i}: Zahl '{number}' steht nicht im Quelltext")

        # Eigennamen im gesprochenen Satz, nach derselben Regel wie bei
        # der Textkarte.
        for name in _proper_names(say):
            if _norm(name) in haystack:
                continue
            missing = [w for w in _norm(name).split() if w and not _known_word(w, haystack)]
            if missing:
                return Result(False, f"Takt {i}: Eigenname '{name}' nicht im Quelltext")

    # Bewegung ist die Daseinsberechtigung. Ein Drehbuch, das nur aus
    # Aussagen besteht, ist eine vorgelesene Textkarte - dafuer lohnt der
    # Aufwand nicht, und im Feed faellt es als leeres Versprechen auf.
    if not any(k in BUILDING_KINDS for k in kinds_seen):
        return Result(False, "kein Bild, das sich aufbaut")

    # ... und es muss auch tatsaechlich mehr als ein Eintrag werden. Eine
    # Tabelle mit einer einzigen Zeile ueber sechs Takte erfuellt die Regel
    # darueber, ist aber ein Standbild mit Vortrag.
    if max(grew.values(), default=0) < 2:
        return Result(False, "Bild bleibt bei einem einzigen Eintrag")

    # Freier Text IM BILD - Schritte, Punkte, Gruppen.
    #
    # Bei Tabelle und Balken war das nie noetig: dort steht neben jeder
    # Beschriftung eine Zahl, und die Zahlenpruefung oben haelt beides
    # zusammen. Ein Ablauf hat keine Zahlen. Ohne diese Pruefung waere
    # `steps` genau die Luecke, durch die ein erfundener Vorgang spazieren
    # koennte - und "nie aus dem Modellgedaechtnis" ist die erste Regel des
    # ganzen Projekts.
    #
    # Ueber das GANZE Drehbuch und nicht je Takt: ein einzelner Schritt
    # traegt oft nur ein langes Wort, und dann ist die Quote entweder null
    # oder eins. Der erste Versuch je Takt hat prompt "Antrag einbringen"
    # abgelehnt, weil in der Quelle "eingebracht" steht - der Stammvergleich
    # ueber fuenf Zeichen kommt an einer deutschen Vorsilbe nicht vorbei.
    # Ueber alle Takte gemittelt faellt das nicht mehr ins Gewicht, und was
    # die Pruefung fangen soll - ein frei erfundener Ablauf - hat gar keine
    # Treffer.
    if picture_words:
        hits = sum(1 for w in picture_words if _known_word(w, haystack))
        if hits / len(picture_words) < MIN_WORD_COVERAGE:
            return Result(
                False,
                f"Bildtext steht so nicht in der Quelle "
                f"({hits}/{len(picture_words)} Woerter)",
            )

    return Result(True)
