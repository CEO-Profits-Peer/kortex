"""Eine fertige Karte in die andere Sprache bringen.

Warum uebersetzen statt neu bauen
---------------------------------
Eine Karte ist beim Erzeugen gegen den Quelltext geprueft worden. Eine
Uebersetzung stellt keine neue Behauptung auf - sie traegt dieselbe. Das
macht sie billiger (ein Aufruf statt Artikel holen, Karte bauen, pruefen)
UND sicherer als eine zweite Karte aus einem zweiten Artikel.

Genau daraus folgt aber die Regel fuer diesen Schritt: Uebersetzen heisst
UEBERSETZEN. Nichts dazu, nichts weg, keine Zahl anders, keine Antwort
verschoben. Was hier "schoener" wird, ist eine neue Behauptung ohne
Pruefung.

Deshalb steht unter dem Modellaufruf eine Pruefung, die genau das misst:
gleiche Bloecke, gleiche Antwortzahl, dieselbe richtige Antwort, dieselben
Zahlen. Faellt eine davon, wird die Uebersetzung verworfen.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from google.genai import types

from .generate import MAX_OUTPUT_TOKENS, Generator

log = logging.getLogger(__name__)

SPRACHE = {"de": "Deutsch", "en": "English"}

UEBERSETZUNG_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["title", "deck", "body_blocks", "quiz_items", "tags"],
    "properties": {
        "title": {"type": "string"},
        "deck": {"type": "string"},
        "body_blocks": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["type"],
                "properties": {
                    "type": {"type": "string", "enum": ["para", "bullet", "stat", "quote"]},
                    "text": {"type": "string"},
                    "items": {"type": "array", "items": {"type": "string"}},
                    "value": {"type": "string"},
                    "label": {"type": "string"},
                    "attribution": {"type": "string"},
                },
            },
        },
        "quiz_items": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["question", "options", "correct_index", "explanation"],
                "properties": {
                    "question": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "correct_index": {"type": "integer"},
                    "explanation": {"type": "string"},
                },
            },
        },
        "tags": {"type": "array", "items": {"type": "string"}},
    },
}

PROMPT = """Du uebersetzt eine Lernkarte von {von} nach {nach}.

Das ist eine UEBERSETZUNG, keine neue Karte. Halte dich streng daran:

* Keine Aussage dazuerfinden, keine weglassen, keine abschwaechen.
* Alle Zahlen, Einheiten, Jahreszahlen und Eigennamen EXAKT uebernehmen.
  Dezimaltrennzeichen und Tausendertrennzeichen der Zielsprache anpassen,
  aber nie den Wert.
* Namen von Gesetzen, Behoerden und Einrichtungen stehen lassen und beim
  ersten Vorkommen in Klammern kurz erklaeren, wenn sie sonst unverstaendlich
  waeren (z. B. "Bundesrat (upper house of parliament)").
* Die Struktur bleibt: gleich viele body_blocks, gleiche Reihenfolge,
  gleicher Typ je Block.
* Die Quizfragen bleiben in Reihenfolge und Anzahl. Die Antwortmoeglichkeiten
  behalten ihre REIHENFOLGE, und correct_index bleibt unveraendert. Auch
  falsche Antworten werden uebersetzt, nicht ersetzt.
* Ton wie im Original: knapp, klar, ohne Werbesprache.
* tags: dieselben Schlagworte, in der Zielsprache.

Die Karte als JSON:
{karte}
"""

#: Ziffernfolgen. Punkte, Kommata und schmale Leerzeichen zwischen Ziffern
#: fallen vorher weg, damit "1.500" und "1,500" dieselbe Zahl sind.
_ZAHL = re.compile(r"\d+")
_TRENNER = re.compile(r"(?<=\d)[.,   ](?=\d{3}\b)")
_KOMMA = re.compile(r"(?<=\d)[.,](?=\d)")


def _zahlen(text: str) -> list[str]:
    ohne = _KOMMA.sub("", _TRENNER.sub("", text))
    return sorted(_ZAHL.findall(ohne))


def _text_von(karte: dict[str, Any]) -> str:
    teile = [karte.get("title") or "", karte.get("deck") or ""]
    for b in karte.get("body_blocks") or []:
        teile += [b.get("text") or "", b.get("value") or "", b.get("label") or "",
                  b.get("attribution") or ""]
        teile += list(b.get("items") or [])
    for q in karte.get("quiz_items") or []:
        teile += [q.get("question") or "", q.get("explanation") or ""]
        teile += list(q.get("options") or [])
    return " ".join(teile)


def pruefe(original: dict[str, Any], neu: dict[str, Any]) -> str | None:
    """None = in Ordnung, sonst der Grund."""
    if not (neu.get("title") or "").strip():
        return "kein Titel"

    ab, nb = original.get("body_blocks") or [], neu.get("body_blocks") or []
    if len(ab) != len(nb):
        return f"{len(nb)} statt {len(ab)} Bloecke"
    for i, (a, b) in enumerate(zip(ab, nb)):
        if a.get("type") != b.get("type"):
            return f"Block {i + 1}: {b.get('type')} statt {a.get('type')}"
        if a.get("type") == "bullet" and len(a.get("items") or []) != len(b.get("items") or []):
            return f"Block {i + 1}: andere Anzahl Punkte"

    aq, nq = original.get("quiz_items") or [], neu.get("quiz_items") or []
    if len(aq) != len(nq):
        return f"{len(nq)} statt {len(aq)} Fragen"
    for i, (a, b) in enumerate(zip(aq, nq)):
        if len(a.get("options") or []) != len(b.get("options") or []):
            return f"Frage {i + 1}: andere Anzahl Antworten"
        if int(a.get("correct_index", -1)) != int(b.get("correct_index", -2)):
            return f"Frage {i + 1}: richtige Antwort verschoben"
        if not (b.get("question") or "").strip():
            return f"Frage {i + 1}: leer"

    fehlen = set(_zahlen(_text_von(original))) - set(_zahlen(_text_von(neu)))
    if fehlen:
        return "Zahlen fehlen: " + ", ".join(sorted(fehlen)[:5])

    alt_len = len(_text_von(original))
    neu_len = len(_text_von(neu))
    if alt_len and not (0.55 <= neu_len / alt_len <= 1.9):
        return f"Laenge {neu_len} zu {alt_len}"
    return None


def uebersetze(gen: Generator, karte: dict[str, Any], *, von: str, nach: str) -> dict[str, Any] | None:
    """Karte (title, deck, body_blocks, quiz_items, tags) in die andere Sprache."""
    eingabe = {
        "title": karte.get("title"),
        "deck": karte.get("deck"),
        "body_blocks": karte.get("body_blocks") or [],
        "quiz_items": karte.get("quiz_items") or [],
        "tags": karte.get("tags") or [],
    }
    prompt = PROMPT.format(
        von=SPRACHE.get(von, von),
        nach=SPRACHE.get(nach, nach),
        karte=json.dumps(eingabe, ensure_ascii=False, indent=1),
    )
    try:
        response = gen.generate_raw(
            prompt,
            types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=UEBERSETZUNG_SCHEMA,
                # Noch niedriger als beim Kartenbauen: hier ist jede
                # Eigenleistung ein Fehler.
                temperature=0.15,
                max_output_tokens=MAX_OUTPUT_TOKENS,
            ),
        )
    except Exception as exc:  # noqa: BLE001 - jede API kann alles werfen
        log.error("Uebersetzung fehlgeschlagen: %s", " ".join(str(exc).split())[:160])
        return None

    roh = (response.text or "").strip()
    if not roh:
        return None
    try:
        neu = json.loads(roh)
    except json.JSONDecodeError:
        log.warning("Uebersetzung: kein gueltiges JSON (%d Zeichen)", len(roh))
        return None
    return neu
