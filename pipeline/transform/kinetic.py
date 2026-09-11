"""Erklaerkarten erzeugen: aus einem Artikel ein Drehbuch.

Was eine Erklaerkarte ist und wie sie abgespielt wird, steht in
supabase/migrations/0027_kinetic_cards.sql und
app/src/features/kinetic/. Hier geht es nur darum, das Drehbuch zu
schreiben - und vor allem darum, WANN man es besser laesst.

Die Auswahl ist der schwierige Teil
-----------------------------------
Ziel sind rund fuenfzig Prozent Erklaerkarten. Die Versuchung ist gross,
das durch Zwang zu erreichen: aus jedem Artikel eins machen. Das Ergebnis
waeren Erklaerkarten, die nichts erklaeren - sieben Takte, die
nacheinander denselben Satz anders formulieren, mit einer Grafik ohne
Inhalt.

Deshalb eine harte Vorbedingung, bevor ueberhaupt ein Modell gefragt wird:
im Quelltext muessen genug Zahlen stehen, aus denen sich ein Verlauf oder
ein Vergleich bauen laesst. Ohne Zahlen keine wachsende Tabelle und keine
Balken - und ohne die ist eine Erklaerkarte nur eine Textkarte, die
langsamer liest.

Wo die Quote wirklich herkommt, ist also die QUELLENAUSWAHL, nicht der
Prompt. Forschungsmeldungen und Statistiken ergeben Erklaerkarten,
Terminankuendigungen nicht.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from google.genai import types

log = logging.getLogger(__name__)

#: Wie viele verschiedene mehrstellige Zahlen im Quelltext stehen muessen,
#: damit sich ein Drehbuch lohnt. Drei ist das Minimum fuer eine Aussage
#: der Form "von X ueber Y auf Z" oder einen Vergleich mit Bezugsgroesse.
MIN_NUMBERS = 3

#: Grenzen des Drehbuchs. Unter vier Takten ist es keine Erklaerung,
#: ueber acht haelt im Feed niemand durch - das sind schon ueber vierzig
#: Sekunden Vortrag.
MIN_BEATS = 4
MAX_BEATS = 8

NUMBER_RE = re.compile(r"\d[\d.,]*")

KINETIC_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["suitable", "beats"],
    "properties": {
        "suitable": {"type": "boolean"},
        "beats": {
            "type": "array",
            "minItems": 0,
            "maxItems": MAX_BEATS,
            "items": {
                "type": "object",
                "required": ["say", "show"],
                "properties": {
                    "say": {"type": "string"},
                    "show": {
                        "type": "object",
                        "required": ["kind"],
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": ["statement", "table", "bars", "figure"],
                            },
                            "id": {"type": "string"},
                            "text": {"type": "string"},
                            "sub": {"type": "string"},
                            "head": {"type": "array", "items": {"type": "string"}},
                            "rows": {
                                "type": "array",
                                "items": {"type": "array", "items": {"type": "string"}},
                            },
                            "labels": {"type": "array", "items": {"type": "string"}},
                            "values": {"type": "array", "items": {"type": "number"}},
                            "unit": {"type": "string"},
                            "caption": {"type": "string"},
                        },
                    },
                },
            },
        },
    },
}


PROMPT = """Du schreibst das Drehbuch einer Erklaerkarte fuer eine Lern-App.
Sprache: {language}.

WAS EINE ERKLAERKARTE IST
Eine Folge von Takten. Jeder Takt ist EIN gesprochener Satz und EIN Bild.
Die Stimme liest den Satz vor, das Bild baut sich dabei auf. Der Reiz
entsteht dadurch, dass sich von Takt zu Takt etwas SICHTBAR aendert -
eine Tabellenzeile kommt dazu, ein Balken waechst.

WANN DU ABLEHNEN MUSST
Setze "suitable": false und gib keine Takte zurueck, wenn eines zutrifft:
- Der Text enthaelt keinen Verlauf, keinen Vergleich und keine Groessen,
  die man nebeneinander stellen kann.
- Das Drehbuch waere nur der Fliesstext in Haeppchen. Wenn sich das Bild
  von Takt zu Takt nicht aendert, ist es keine Erklaerkarte.
- Die Zahlen im Text reichen nicht fuer mindestens eine Tabelle oder
  Balkengrafik.
Ablehnen ist ein gutes Ergebnis. Eine schlechte Erklaerkarte ist schlimmer
als eine gute Textkarte.

REGELN FUER DIE TAKTE
- {min_beats} bis {max_beats} Takte.
- "say": genau EIN Satz, hoechstens 140 Zeichen, gesprochene Sprache.
  Zahlen ausschreiben, wo man sie sprechen wuerde ("sechs Prozent").
- JEDE Zahl in Bild und Text muss im Quelltext stehen. Nichts hochrechnen,
  nichts runden, nichts ergaenzen. Keine Beispielwerte.
- Der erste Takt fuehrt die Groesse ein, der letzte sagt, was daraus folgt.

DIE VIER BILDARTEN
- statement: {{"kind":"statement","text":"1.000 €","sub":"Startkapital"}}
  Eine grosse Zahl oder Aussage. Fuer Anfang und Schluss.
- table: {{"kind":"table","id":"t","head":["Jahr","Guthaben"],
           "rows":[["1","1.060 €"],["2","1.124 €"]]}}
  Zeilen, die nacheinander erscheinen. WICHTIG: jeder Takt wiederholt alle
  bisherigen Zeilen und haengt die neue an. Dieselbe "id" ueber alle Takte,
  die dieselbe Tabelle meinen.
- bars: {{"kind":"bars","id":"b","unit":"%","labels":["vorher","nachher"],
          "values":[35,68]}}
  Balken fuer Groessenverhaeltnisse. "values" sind blanke Zahlen.
- figure: {{"kind":"figure","caption":"..."}}
  Nur fuer einen Schlusstakt ohne eigene Zahlen.

KATEGORIE-HINWEIS: die Karte gehoert zu {category}.

TITEL: {title}

QUELLTEXT:
{text}
"""


def enough_numbers(text: str) -> bool:
    """Genug Zahlen fuer einen Verlauf oder Vergleich?

    Der kostenlose Vorfilter. Einstellige Zahlen zaehlen nicht mit - das
    sind meistens Aufzaehlungen ("drei Gruende"), keine Groessen.
    """
    found = {
        n.rstrip(".,").replace(".", "").replace(",", "")
        for n in NUMBER_RE.findall(text)
    }
    return len({n for n in found if len(n) > 1}) >= MIN_NUMBERS


def make_script(
    gen: Any,
    *,
    text: str,
    title: str,
    category: str,
    language: str,
) -> dict[str, Any] | None:
    """Drehbuch erzeugen - oder None, wenn der Text keins hergibt.

    `gen` ist der Generator aus generate.py; er bringt Wiederholung,
    Ausweichmodelle und das abgeschaltete Nachdenken schon mit. Hier
    nochmal dieselbe Logik zu bauen, hiesse sie zweimal pflegen.
    """
    if not enough_numbers(text):
        return None

    prompt = PROMPT.format(
        language="Deutsch" if language == "de" else "English",
        min_beats=MIN_BEATS,
        max_beats=MAX_BEATS,
        category=category,
        title=title,
        text=text,
    )

    try:
        response = gen.generate_raw(
            prompt,
            types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=KINETIC_SCHEMA,
                # Etwas hoeher als bei der Textkarte: die Formulierung der
                # Saetze darf lebendiger sein. Die Zahlen sind durch die
                # Pruefung danach ohnehin gebunden.
                temperature=0.5,
                max_output_tokens=3000,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        log.debug("Drehbuch fehlgeschlagen: %s", exc)
        return None

    raw = (response.text or "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not data.get("suitable"):
        return None

    beats = data.get("beats")
    if not isinstance(beats, list) or not (MIN_BEATS <= len(beats) <= MAX_BEATS):
        return None

    return {"beats": beats}
