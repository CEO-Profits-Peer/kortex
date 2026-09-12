"""Ist diese Meldung ueberhaupt eine Lernkarte wert?

Diese Pruefung laeuft VOR dem Modellaufruf und kostet nichts. Sie sortiert
nicht nach Wahrheit - das macht checks.py danach - sondern nach Zweck: taugt
der Text als Karte fuer jemanden zwischen 14 und 25?

Der Anlass war ein echter Lauf. Angenommen wurden unter anderem:

    "Autofreier Schulvorplatz Phorusgasse"
    "Neugestaltung Aumannplatz in Waehring"
    "Tiergestuetzte Aktivitaeten im PBZ Melk"
    "Termine am 10. September in der Rathauskorrespondenz"

Alles fehlerfrei, alles korrekt belegt, alles vollkommen wertlos zum Lernen.
Die Pressefeeds oesterreichischer Institutionen bestehen zu einem grossen
Teil aus Terminankuendigungen, Personalien und Eigenwerbung. Jede davon
kostet einen Modellaufruf und einen Platz im Feed.

Bewusst konservativ: im Zweifel durchlassen. Eine mittelmaessige Karte ist
ein kleineres Problem als eine fehlende gute. Deshalb wird nur abgewiesen,
was ziemlich eindeutig keine ist.
"""

from __future__ import annotations

import re

# --- Textsorten, die nie eine Lernkarte ergeben ------------------------------
#
# Jeweils als Wortanfang gebunden, damit "Termine" nicht auch
# "Determinante" trifft.
BLOCK_PATTERNS = [
    # Terminlisten und Ankuendigungen
    r"\btermine? (?:am|von|der|im)\b",
    r"\bterminaviso\b",
    r"\bwochenvorschau\b",
    r"\brathauskorrespondenz\b",
    r"\bmedieneinladung\b",
    r"\bpressekonferenz\b",
    r"\beinladung zur?\b",
    r"\blaedt (?:zu|ein)\b",
    r"\bfindet statt am\b",
    r"\bmedia advisory\b",
    r"\bphoto opportunity\b",
    # Personalien
    r"\bneuer? (?:gesch(?:ae|ä)ftsf(?:ue|ü)hrer|vorstand|leiter(?:in)?)\b",
    r"\bwechselt in den (?:vorstand|aufsichtsrat)\b",
    r"\bbestellt zum?\b",
    r"\bappointed (?:as )?(?:new )?(?:ceo|cfo|cto|director)\b",
    # Reine Eigenwerbung und Preisverleihungen
    r"\bausgezeichnet mit dem\b",
    r"\bgewinnt den\b.{0,30}\bpreis\b",
    r"\bzertifiziert nach\b",
    r"\bjubil(?:ae|ä)um\b",
    # Boersenmeldungen ohne Inhalt
    r"\bhandelsstart f(?:ue|ü)r\b",
    r"\bnotiert ab sofort\b",
    # Parteipolitisches Hin und Her: Zitatschlachten ohne pruefbaren Inhalt
    r"\b(?:fp(?:oe|ö)|(?:oe|ö)vp|sp(?:oe|ö)|neos|gr(?:ue|ü)ne)\s*[–—-]\s*\w+\s*:",
]

BLOCK_RE = re.compile("|".join(BLOCK_PATTERNS), re.IGNORECASE)


# --- Textsorten, die auch die Rettung unten NICHT retten darf ----------------
#
# Der Anlass war der erste echte Lauf mit den neuen Forschungsquellen. Von
# 27 Karten waren sechs Selbstauskunft der Einrichtung:
#
#     "Erweiterung der Institutsleitung am Fraunhofer IOSB"   (als SPEZIAL!)
#     "Professuren an der Universitaet Wien"
#     "Foerderung durch den Europaeischen Forschungsrat"
#     "Studieninformationstag bei der Bundesbank"
#     "Duales Studium bei der Bundesbank"
#     "Innovationskraft durch untergesetzliche Regelungen"    (Positionspapier)
#
# Dieselbe Gattung, die 0045 bei APA-OTS herausgeworfen hat: eine
# Einrichtung sagt etwas ueber sich selbst. Nur faellt sie hier nicht auf,
# weil sie aus einer VERTRAUENSWUERDIGEN Quelle kommt und deshalb
# automatisch freigegeben wird. Eine Personalmeldung als vorgetragene
# Erklaerkarte ist das genaue Gegenteil von dem, wofuer es die gibt.
#
# Warum die vorhandene Sperre nicht griff: RESCUE_RE laeuft zuerst und
# gewinnt. Eine Personalmeldung des Fraunhofer IOSB enthaelt garantiert
# "Forschung", eine Grant-Meldung garantiert "Forscher". Die Rettung war
# dafuer gedacht, dass eine STUDIE auf einer Pressekonferenz vorgestellt
# wird - bei diesen Texten rettet sie das Gegenteil.
#
# Deshalb eine zweite, kleine Liste, die VOR der Rettung greift. Bewusst
# eng: jedes Muster benennt die Gattung, nicht das Thema. Ueber Professuren
# zu lesen ist nicht verboten - eine Meldung, die AUS der Bestellung einer
# Professur besteht, ist nur keine Lernkarte.
HARD_BLOCK_PATTERNS = [
    r"\bverst(?:ae|ä)rkt (?:die |das |den )?(?:institutsleitung|leitung|vorstand)\b",
    r"\b(?:erweiterung der |neue[rns]? )?institutsleitung\b",
    r"\bneue professur(?:en)?\b",
    r"\bprofessuren an der\b",
    r"\bjoins the (?:board|leadership|management)\b",
    r"\bnew (?:group|team) leader\b",
    r"\b(?:erc[- ])?(?:starting|consolidator|advanced|synergy) grants?\b",
    r"\beingeworben\b",
    r"\bmillionenf(?:oe|ö)rderung\b",
    r"\bawarded (?:an? )?(?:grant|funding)\b",
    r"\bduales studium\b",
    r"\bstudieninformationstag\b",
    r"\btag der offenen t(?:ue|ü)r\b",
    r"\bopen day\b",
    r"\bbewerbungsfrist\b",
    r"\bpositionspapier\b",
    r"\bposition paper\b",
    r"\bstellungnahme (?:zu|zur|zum)\b",
]

HARD_BLOCK_RE = re.compile("|".join(HARD_BLOCK_PATTERNS), re.IGNORECASE)

# --- Was fuer eine Lernkarte spricht -----------------------------------------
#
# Trifft eins davon zu, wird NICHT abgewiesen, auch wenn oben etwas passt.
# Eine Studie, die auf einer Pressekonferenz vorgestellt wird, ist immer noch
# eine Studie.
RESCUE_PATTERNS = [
    r"\bstudie\b", r"\bforschung\b", r"\bforscher", r"\buntersuchung\b",
    r"\bergebnisse? (?:zeigen|zeigt)\b", r"\bnachgewiesen\b", r"\bentdeckt\b",
    r"\bexperiment\b", r"\bmessung(?:en)?\b", r"\btheorie\b",
    r"\bstudy\b", r"\bresearch(?:ers)?\b", r"\bfindings?\b", r"\bdiscovered\b",
    r"\bexperiment\b", r"\bpublished in\b",
]

RESCUE_RE = re.compile("|".join(RESCUE_PATTERNS), re.IGNORECASE)

#: Unter dieser Laenge steckt keine Karte drin. Der Extraktor liefert bei
#: Terminlisten oft nur zwei Saetze.
MIN_CHARS = 400


def is_worth_a_card(title: str, text: str) -> tuple[bool, str]:
    """(ja/nein, Begruendung). Die Begruendung landet im Log, nicht in der App."""
    if len(text) < MIN_CHARS:
        return False, f"zu kurz ({len(text)} Zeichen)"

    head = f"{title}\n{text[:1200]}"

    # Vor der Rettung, nicht danach: siehe HARD_BLOCK_PATTERNS.
    hard = HARD_BLOCK_RE.search(head)
    if hard:
        return False, f"Selbstauskunft der Einrichtung ({hard.group(0).strip()!r})"

    if RESCUE_RE.search(head):
        return True, ""

    hit = BLOCK_RE.search(head)
    if hit:
        return False, f"Textsorte ohne Lernwert ({hit.group(0).strip()!r})"

    return True, ""
