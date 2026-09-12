"""Erklaerkarten erzeugen: aus einem Artikel ein Drehbuch.

Was eine Erklaerkarte ist und wie sie abgespielt wird, steht in
supabase/migrations/0027_kinetic_cards.sql und
app/src/features/kinetic/. Hier geht es nur darum, das Drehbuch zu
schreiben - und darum, WANN man es besser laesst.

Wo die Quote wirklich verloren ging - nachgemessen
--------------------------------------------------
Hier stand frueher, der Engpass sei die Quellenauswahl, und davor ein
harter Vorfilter: mindestens drei mehrstellige Zahlen im Quelltext, sonst
wird gar nicht erst gefragt. Beides war falsch. Gemessen an sechzig
Wikipedia-Artikeln und zwanzig echten Modellaufrufen:

    Vorfilter abgelehnt            2 von 60   (3 %)
    Modell: "suitable": false     12 von 20   (60 %)
    kaputtes/abgeschnittenes JSON  3 von 20
    Pruefung abgelehnt             3 von 20
    brauchbar                      2 von 20   (10 %)

Der Vorfilter kostete also fast nichts und brachte fast nichts. Der
Verlust lag beim Modell - und zwar mit gutem Grund: abgelehnt wurden
"Wissenschaftliche Methode", "Peer-Review", "Turing-Test", "Evolution",
"Impfung", "Plattentektonik", "Treibhauseffekt", "Filterblase". Das sind
keine schlechten Themen, das sind die BESTEN - nur haben sie keine
Zahlenreihe. Der Prompt bot Tabelle und Balken an, sonst nichts, und fuer
einen Vorgang ist beides das falsche Bild.

Deshalb jetzt sieben Bildarten statt vier. Neu sind:

    timeline   Punkte auf einer massstaeblichen Zeitachse
    quantity   Kaestchenraster fuer Anteile an einem Ganzen
    steps      ein Ablauf - die einzige Bildart OHNE Zahlen

Die Regel bleibt trotzdem: lieber eine gute Textkarte als eine
Erklaerkarte, in der sich nichts aendert. Was sich geaendert hat, ist nur
die Auffassung davon, was sich aendern KANN.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any

from google.genai import types

from validate.checks import validate_kinetic

log = logging.getLogger(__name__)

#: Grenzen des Drehbuchs. Unter vier Takten ist es keine Erklaerung,
#: ueber acht haelt im Feed niemand durch - das sind schon ueber vierzig
#: Sekunden Vortrag.
MIN_BEATS = 4
MAX_BEATS = 8

#: Wie viele verschiedene mehrstellige Zahlen den Vorfilter allein
#: bestehen lassen. Siehe Kopf: der Filter ist nicht mehr die Huerde,
#: fuer die er gehalten wurde, sondern nur noch die Notbremse gegen
#: offensichtlich leere Texte.
MIN_NUMBERS = 3

NUMBER_RE = re.compile(r"\d[\d.,]*")

#: Woerter, an denen ein Ablauf zu erkennen ist. Ein Text ohne jede Zahl,
#: aber mit "zuerst ... dann ... schliesslich" traegt eine steps-Karte -
#: genau die Faelle, die vorher am Zahlenfilter gestorben sind.
PROCESS_RE = re.compile(
    r"\b("
    r"zuerst|zunaechst|zunächst|danach|anschliessend|anschließend|"
    r"schliesslich|schließlich|daraufhin|Schritt|Phase|Stufe|Verfahren|"
    r"Vorgang|Prozess|Ablauf|Zyklus|besteht aus|gliedert sich|erfolgt|"
    r"first|then|next|afterwards|finally|subsequently|step|phase|stage|"
    r"process|procedure|cycle|consists of|is divided|results in|leads to"
    r")\b",
    re.IGNORECASE,
)

#: Eine Jahreszahl. Zwei verschiedene reichen fuer einen Zeitstrahl.
YEAR_RE = re.compile(r"\b(1[0-9]{3}|20[0-9]{2})\b")

#: Grenzen der neuen Bildarten. Sie stehen hier und nicht nur im Prompt,
#: weil die Pruefung sie durchsetzen muss - an Zahlenangaben im Fliesstext
#: haelt sich ein Modell nur ungefaehr.
MAX_POINTS = 6      # Zeitstrahl: mehr passt nicht auf die Karte
MAX_STEPS = 6       # Ablauf: desgleichen

_SHOW_PROPERTIES: dict[str, Any] = {
    "kind": {
        "type": "string",
        "enum": ["statement", "table", "bars", "timeline", "quantity", "steps",
                 "compare", "scale", "guess", "figure"],
    },
    "id": {"type": "string"},
    "text": {"type": "string"},
    "sub": {"type": "string"},
    "head": {"type": "array", "items": {"type": "string"}},
    "rows": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}},
    "labels": {"type": "array", "items": {"type": "string"}},
    "values": {"type": "array", "items": {"type": "number"}},
    "unit": {"type": "string"},
    "caption": {"type": "string"},
    "points": {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["at", "label"],
            "properties": {
                "at": {"type": "number"},
                "label": {"type": "string"},
                "note": {"type": "string"},
            },
        },
    },
    "total": {"type": "number"},
    "groups": {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["label", "value"],
            "properties": {
                "label": {"type": "string"},
                "value": {"type": "number"},
            },
        },
    },
    "steps": {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["label"],
            "properties": {
                "label": {"type": "string"},
                "note": {"type": "string"},
            },
        },
    },
    "left": {"type": "string"},
    "right": {"type": "string"},
    # Nicht "rows": der Name ist bei der Tabelle schon mit einem anderen Typ
    # belegt (Array aus String-Arrays), und ein Schema kann pro Feldname nur
    # einen Typ haben. Zwei Bedeutungen unter einem Namen waeren genau die
    # Sorte Kollision, die erst beim Abspielen auffaellt.
    "pairs": {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["label", "left", "right"],
            "properties": {
                "label": {"type": "string"},
                "left": {"type": "string"},
                "right": {"type": "string"},
            },
        },
    },
    "items": {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["label", "value"],
            "properties": {
                "label": {"type": "string"},
                "value": {"type": "number"},
            },
        },
    },
    "question": {"type": "string"},
    "answer": {"type": "string"},
}

# Das Schema kann nur ausdruecken, WELCHE Felder es geben darf - nicht
# "bei kind=bars muessen labels und values dabei sein". Dafuer braeuchte
# es oneOf, und das nimmt die API in response_schema nicht an. Genau
# daran sind in der Messung zwei von zwanzig Versuchen gescheitert
# (Balken ohne Werte). Die Bedingung steht deshalb im Prompt UND in
# validate_kinetic - und wird sie trotzdem verletzt, gibt es einen
# Verbesserungsversuch statt eines Abbruchs.
KINETIC_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["suitable", "beats"],
    "properties": {
        "suitable": {"type": "boolean"},
        "beats": {
            "type": "array",
            # KEIN maxItems hier. Das ist keine Schlamperei, sondern
            # gemessen - und es war der Grund, warum seit dem Commit
            # "compare, scale, guess" KEIN EINZIGES Drehbuch mehr entstanden
            # ist.
            #
            # Mit `maxItems: 8` antwortet die API auf jeden Aufruf mit
            # 400 INVALID_ARGUMENT, und zwar bei ALLEN acht Modellen:
            #
            #     Modell                    mit maxItems   ohne
            #     gemini-3.5-flash          400            OK
            #     gemini-3.8-flash          400            OK
            #     gemini-3-flash-preview    400            OK
            #     gemini-3.1-flash-lite     400            OK
            #     gemini-3.1-flash-lite-p.  400            OK
            #     gemini-3.6-flash          400            400
            #     gemini-3.5-flash-lite     400            400
            #
            # `minItems` allein ist dagegen in Ordnung, und das Karten-
            # Schema hat `maxItems` an drei Stellen ohne Probleme. Der
            # Unterschied ist die Groesse: die API baut aus dem Schema eine
            # Grammatik fuer die Dekodierung, und `maxItems` verlangt, den
            # Takt-Gegenstand achtmal auszurollen. Mit vier Bildarten ging
            # das; seit es zehn sind (points, groups, steps, pairs, items,
            # question, answer kamen dazu), ist die Grammatik zu gross.
            #
            # Die Obergrenze ist dadurch nicht weg, sie steht nur woanders:
            # der Prompt nennt sie, und _one_round lehnt alles ausserhalb
            # MIN_BEATS..MAX_BEATS ab. Eine Pruefung, die wir selbst machen,
            # statt einer, die die Anfrage unmoeglich macht.
            "items": {
                "type": "object",
                "required": ["say", "show"],
                "properties": {
                    "say": {"type": "string"},
                    "show": {
                        "type": "object",
                        "required": ["kind"],
                        "properties": _SHOW_PROPERTIES,
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
eine Tabellenzeile kommt dazu, ein Balken waechst, ein Schritt kommt hinzu.

WIE DU DIE BILDART WAEHLST
Nicht nach Geschmack, sondern nach der FRAGE, die dein Text beantwortet.
Genau eine Zeile trifft zu:

    Wann ist was passiert?          -> timeline
    Wie laeuft das ab?              -> steps
    Wie teilt sich das auf?         -> quantity
    Was ist der Unterschied?        -> compare
    Wie gross ist der Abstand?      -> bars  (aehnliche Groessen)
                                    -> scale (Faktor 100 oder mehr)
    Welcher Wert gehoert wozu?      -> table
    Kann man die Zahl schaetzen?    -> guess

Diese Liste ist verbindlich. Wenn "Wie teilt sich das auf?" zutrifft,
nimm quantity - auch dann, wenn sich der Text zusaetzlich als Ablauf
erzaehlen liesse. Fast alles laesst sich als Ablauf erzaehlen; das macht
steps nicht zur richtigen Wahl, sondern nur zur bequemsten.

DIE ZEHN BILDARTEN

1. statement - eine grosse Zahl oder Aussage.
   {{"kind":"statement","text":"1.000 EUR","sub":"Startkapital"}}
   Fuer den ersten und den letzten Takt.

2. table - Zeilen, die nacheinander erscheinen.
   {{"kind":"table","id":"t","head":["Jahr","Guthaben"],
     "rows":[["1","1.060 EUR"],["2","1.124 EUR"]]}}
   Fuer Wertepaare. Jeder Takt wiederholt alle bisherigen Zeilen und
   haengt die neue an.

3. bars - Balken, die auf ihren Wert wachsen.
   {{"kind":"bars","id":"b","unit":"%","labels":["vorher","nachher"],
     "values":[35,68]}}
   Fuer zwei bis vier AEHNLICH GROSSE Werte. "labels" und "values"
   muessen beide da und gleich lang sein - ein Balken ohne Wert wird
   verworfen. Liegt zwischen kleinstem und groesstem Wert mehr als
   Faktor 100, nimm scale: linear ist der kleine dann ein unsichtbarer
   Strich.

4. timeline - Punkte auf einer Zeitachse.
   {{"kind":"timeline","id":"tl","points":[
     {{"at":1943,"label":"Erstes kuenstliches Neuron"}},
     {{"at":1957,"label":"Perzeptron"}}]}}
   Fuer Jahreszahlen. Die Abstaende werden MASSSTAEBLICH gezeichnet:
   zwischen 1943 und 1957 liegt sichtbar mehr Platz als zwischen 2018 und
   2020. Sobald die linke Spalte einer Tabelle Jahre enthaelt, nimm
   timeline statt table - die Tabelle macht vierzehn Jahre und zwei Jahre
   gleich hoch und wirft damit die Aussage weg.
   Hoechstens {max_points} Punkte, aufsteigend.

5. quantity - ein Raster aus Kaestchen, das sich fuellt.
   {{"kind":"quantity","id":"q","total":100,"unit":"%","groups":[
     {{"label":"Miete","value":38}},{{"label":"Essen","value":22}}]}}
   Fuer die Aufteilung EINER Groesse: wovon besteht etwas, wohin geht es,
   wie verteilt es sich. Steuersaetze, Ausgaben, Anteile, Zusammen-
   setzungen. Jeder Takt wiederholt alle bisherigen Gruppen und haengt
   eine an. Die Summe der Gruppen darf "total" nicht ueberschreiten.
   Hoechstens sechs Gruppen. Bei Prozentanteilen ist "total" einfach 100
   und "unit" ist "%".

6. steps - ein Ablauf, Schritt fuer Schritt.
   {{"kind":"steps","id":"s","steps":[
     {{"label":"Antrag einbringen","note":"beim AMS"}},
     {{"label":"Frist laeuft","note":"vier Wochen"}}]}}
   Fuer Vorgaenge und Verfahren, bei denen die REIHENFOLGE die Aussage
   ist - wo Schritt zwei ohne Schritt eins nicht passieren kann. Braucht
   keine Zahlen. Jeder Takt wiederholt alle bisherigen Schritte und
   haengt einen an. Hoechstens {max_steps} Schritte.
   Jeder Schritt muss im Quelltext stehen. Nichts dazuerfinden, was
   plausibel klingt.
   Alle Schritte gehoeren zu EINEM Ablauf. Eine Gegenueberstellung ist
   kein Schritt: "aktive Impfung" und "passive Impfung" sind zwei Wege,
   nicht Schritt drei und vier desselben Wegs - dafuer gibt es compare.

7. compare - zwei Spalten nebeneinander.
   {{"kind":"compare","id":"c","left":"Miete","right":"Eigentum","pairs":[
     {{"label":"Einstieg","left":"0 EUR","right":"20 Prozent Anzahlung"}},
     {{"label":"Monatlich","left":"900 EUR","right":"1.100 EUR"}}]}}
   Fuer zwei Dinge, die in MEHREREN Eigenschaften verglichen werden.
   Balken vergleichen eine Groesse, hier sind es mehrere. Jeder Takt
   wiederholt alle bisherigen Zeilen und haengt eine an.

8. scale - Groessenordnungen auf logarithmischer Achse.
   {{"kind":"scale","id":"sc","unit":"m","items":[
     {{"label":"Bakterium","value":0.000001}},
     {{"label":"Mensch","value":1.7}},
     {{"label":"Blauwal","value":30}}]}}
   Wenn zwischen klein und gross Faktor 100 oder mehr liegt. Gezeigt
   wird, WIE VIELE Nullen dazwischenstehen. Aufsteigend, alle Werte
   groesser als null, mindestens zwei.

9. guess - fragen, warten, aufloesen.
   Takt:      {{"kind":"guess","id":"g","question":"Wie viel Prozent des
              Trinkwassers gehen in Oesterreich in die Toilette?"}}
   Takt danach: {{"kind":"guess","id":"g","question":"...dieselbe Frage...",
              "answer":"30 Prozent"}}
   Der erste Takt zeigt nur die Frage, der naechste loest sie auf. Nimm
   es fuer EINE ueberraschende Zahl - eine, bei der die meisten daneben
   liegen. Hoechstens einmal pro Drehbuch: zweimal ist kein Spiel mehr,
   sondern ein Quiz.
   Der Satz zum Fragetakt muss die Frage auch stellen ("Was schaetzt
   du?"), sonst steht die Stimme still, waehrend das Bild wartet.

10. figure - eine abstrakte Grafik ohne eigene Zahlen.
   {{"kind":"figure","caption":"..."}}
   Nur fuer einen Schlusstakt.

WAS IN EINE TABELLE, AUF BALKEN ODER INS RASTER GEHOERT
Nur GROESSEN, die man vergleichen kann: Betraege, Jahre, Anteile,
Entfernungen, Mengen, Zeiten.

NIEMALS Kennungen. Aktenzeichen, Dokumentnummern, Katalognummern,
Vertragsnummern, Artikelnummern, Paragraphen, Registriernummern. Sie sehen
aus wie Zahlen, sind aber Namen - man kann sie nicht vergleichen, nicht
addieren, und aus ihnen wird nichts sichtbar.

  Schlecht:  REGELUNG | EDMS-NUMMER
             SR-M     | 875606
             GSI-M-2  | 875610
  Das ist eine Aktenliste. Sie erklaert nichts, sie belegt nur, dass es
  Akten gibt.

WANN DU ABLEHNEN MUSST
Setze "suitable": false und gib keine Takte zurueck, wenn eines zutrifft:
- Auf keine der Fragen oben gibt der Text eine Antwort: keine Abfolge,
  kein Vorgang, keine vergleichbaren Groessen, keine Aufteilung, kein
  Unterschied zwischen zwei Dingen. Erst wenn nichts davon da ist, ist es
  keine Erklaerkarte.
- Die einzigen Zahlen im Text sind Kennungen (siehe oben).
- Das Bild aendert sich von Takt zu Takt nicht. Dann ist es der
  Fliesstext in Haeppchen, und das kann eine Textkarte besser.
Ablehnen bleibt ein gutes Ergebnis - aber geh vorher die Frageliste
durch. Ein Text ohne Zahlenreihe ist kein Grund zur Ablehnung,
solange er einen Ablauf beschreibt.

REGELN FUER DIE TAKTE
- {min_beats} bis {max_beats} Takte.
- Bleib bei EINEM bewegten Bild pro Drehbuch: ein Takt statement zum
  Einstieg, dann vier bis sechs Takte auf demselben Bild (dieselbe "id"),
  zum Schluss statement oder figure. Zwischen Bildarten hin- und
  herzuspringen zerstoert den Aufbau.
- EINE Ausnahme davon, und nur diese: statt des statement-Einstiegs
  duerfen die ersten ZWEI Takte ein guess sein - erst die Frage, dann die
  Aufloesung. Danach geht es wie gehabt auf einem bewegten Bild weiter.
  Nimm das, wenn der Text genau eine Zahl hat, bei der die meisten daneben
  liegen wuerden.
- "say": genau EIN Satz, hoechstens 140 Zeichen, gesprochene Sprache.
  Zahlen ausschreiben, wo man sie sprechen wuerde ("sechs Prozent").
- JEDE Zahl in Bild und Text muss im Quelltext stehen. Nichts hochrechnen,
  nichts runden, nichts ergaenzen. Keine Beispielwerte.
- Der erste Takt fuehrt ein, der letzte sagt, was daraus folgt.

KATEGORIE-HINWEIS: die Karte gehoert zu {category}.

TITEL: {title}

QUELLTEXT:
{text}
"""

#: Angehaengt an den zweiten Anlauf, wenn die Pruefung etwas Konkretes
#: bemaengelt hat. Ein zweiter Aufruf kostet Kontingent - aber weniger als
#: ein weggeworfener Artikel, fuer den Abruf, Karte und Einbettung schon
#: bezahlt sind.
REPAIR = """

ACHTUNG: Dein vorheriges Drehbuch wurde aus diesem Grund verworfen:
  {reason}
Schreibe es neu und behebe genau diesen Punkt. Alles andere darf bleiben.
"""


@dataclass(frozen=True)
class Attempt:
    """Ergebnis eines Versuchs - samt Grund, wenn keiner daraus wurde.

    Frueher gab diese Datei nur `dict | None` zurueck. Damit liess sich
    hinterher nicht beantworten, WO die Quote verloren geht: Vorfilter,
    Modellabsage und kaputtes JSON sahen alle gleich aus. Genau diese
    Frage musste dann mit einem Wegwerfskript beantwortet werden - und
    ihre Antwort hat die Richtung dieser Datei geaendert (siehe Kopf).
    """

    script: dict[str, Any] | None
    #: vorfilter · modellfehler · unbrauchbar · ungeeignet · abgelehnt · ok
    outcome: str
    detail: str = ""


def worth_trying(text: str) -> bool:
    """Lohnt sich ueberhaupt ein Modellaufruf?

    Die Notbremse, nicht die Auswahl. Durchgelassen wird, was genug
    Zahlen fuer einen Vergleich hat ODER zwei Jahreszahlen fuer einen
    Zeitstrahl ODER Woerter, an denen ein Ablauf erkennbar ist.

    Gemessen an sechzig Wikipedia-Artikeln hat der alte Filter - drei
    mehrstellige Zahlen, sonst nichts - genau zwei aufgehalten. Er war
    nie die Huerde, fuer die er gehalten wurde. Er bleibt trotzdem, weil
    ein Begriffsklaerungsstummel sonst einen Aufruf kostet.
    """
    if _distinct_numbers(text) >= MIN_NUMBERS:
        return True
    if len(set(YEAR_RE.findall(text))) >= 2:
        return True
    return len({m.lower() for m in PROCESS_RE.findall(text)}) >= 2


def _distinct_numbers(text: str) -> int:
    """Verschiedene mehrstellige Zahlen.

    Einstellige zaehlen nicht mit - das sind meistens Aufzaehlungen
    ("drei Gruende"), keine Groessen.
    """
    found = {
        n.rstrip(".,").replace(".", "").replace(",", "")
        for n in NUMBER_RE.findall(text)
    }
    return len({n for n in found if len(n) > 1})


def make_script(
    gen: Any,
    *,
    text: str,
    title: str,
    category: str,
    language: str,
    repair: bool = True,
) -> Attempt:
    """Drehbuch erzeugen, pruefen, notfalls einmal nachbessern lassen.

    `gen` ist der Generator aus generate.py; er bringt Wiederholung,
    Ausweichmodelle und das abgeschaltete Nachdenken schon mit. Hier
    nochmal dieselbe Logik zu bauen, hiesse sie zweimal pflegen.

    Die Pruefung liegt jetzt HIER und nicht mehr beim Aufrufer: nur so
    kennt der zweite Anlauf den Ablehnungsgrund, und nur so koennen
    run.py und evergreen.py nicht auseinanderlaufen.
    """
    if not worth_trying(text):
        return Attempt(None, "vorfilter")

    base = PROMPT.format(
        language="Deutsch" if language == "de" else "English",
        min_beats=MIN_BEATS,
        max_beats=MAX_BEATS,
        max_points=MAX_POINTS,
        max_steps=MAX_STEPS,
        category=category,
        title=title,
        text=text,
    )

    attempt = _one_round(gen, base, text)
    if attempt.outcome == "ok" or not repair:
        return attempt

    # Nachbessern lohnt nur bei einem konkreten Formfehler. Sagt das
    # Modell "ungeeignet", meint es das - ein zweites Nachfragen erzwingt
    # bloss ein schlechtes Drehbuch, und genau davor warnt der Kopf
    # dieser Datei.
    if attempt.outcome != "abgelehnt":
        return attempt

    second = _one_round(gen, base + REPAIR.format(reason=attempt.detail), text)
    return second if second.outcome == "ok" else attempt


def _one_round(gen: Any, prompt: str, source_text: str) -> Attempt:
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
                # Grosszuegig, und das ist teuer erkauft: jeder Takt
                # wiederholt sein Bild vollstaendig, eine sechszeilige
                # Tabelle ueber sechs Takte sind ueber zwanzigtausend
                # Zeichen. Bei 3000 Tokens war das abgeschnitten - drei von
                # zwanzig Versuchen kamen als kaputtes JSON zurueck.
                max_output_tokens=8000,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        # Die MELDUNG, nicht nur die Klasse des Fehlers.
        #
        # Hier stand `type(exc).__name__`, und der Text ging an log.debug,
        # also nirgendwohin. Der Zaehler in der Bilanz heisst "Modell nicht
        # erreichbar" - und so habe ich ein 400 auf mein eigenes Schema
        # fuer ein aufgebrauchtes Tageskontingent gehalten und die Ursache
        # zweimal am falschen Ende gesucht. Ein aufgebrauchtes Kontingent
        # und eine abgelehnte Anfrage sehen ohne den Text gleich aus,
        # fuehren aber zu voellig verschiedenen Schluessen: einmal warten,
        # einmal reparieren.
        grund = " ".join(str(exc).split())[:160]
        log.warning("Drehbuch fehlgeschlagen: %s", grund)
        return Attempt(None, "modellfehler", grund)

    raw = (response.text or "").strip()
    if not raw:
        return Attempt(None, "unbrauchbar", "leere Antwort")

    data = _parse(raw)
    if data is None:
        return Attempt(None, "unbrauchbar", "kaputtes JSON")

    if not data.get("suitable"):
        return Attempt(None, "ungeeignet")

    beats = data.get("beats")
    if not isinstance(beats, list) or not (MIN_BEATS <= len(beats) <= MAX_BEATS):
        return Attempt(
            None, "abgelehnt", f"{len(beats or [])} Takte statt {MIN_BEATS} bis {MAX_BEATS}"
        )

    script = {"beats": beats}
    check = validate_kinetic(script, source_text)
    if not check.ok:
        return Attempt(None, "abgelehnt", check.reason)
    return Attempt(script, "ok")


def _parse(raw: str) -> dict[str, Any] | None:
    """JSON lesen - und abgeschnittenes JSON retten, statt es wegzuwerfen.

    Ein abgeschnittenes Drehbuch ist fast immer ein vollstaendiges bis zum
    vorletzten Takt plus einem halben. Die Takte davor sind in Ordnung -
    jeder beschreibt sein Bild ja vollstaendig (Migration 0027), keiner
    haengt vom naechsten ab. Sie wegzuwerfen hiesse, den ganzen Artikel
    wegzuwerfen, obwohl das Ergebnis fertig dasteht.

    Gerettet wird nur die Struktur, ergaenzt wird nichts: geschlossen wird
    dort, wo der letzte vollstaendige Takt endet. Reichen die geretteten
    Takte nicht fuer ein Drehbuch, lehnt die Pruefung danach ohnehin ab.
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    start = raw.find('"beats"')
    if start < 0:
        return None
    open_bracket = raw.find("[", start)
    if open_bracket < 0:
        return None

    # Zeichenweise durch das Feld und sich merken, wo ein Takt endet - also
    # wo die Verschachtelung wieder auf eins faellt. Klammern INNERHALB von
    # Zeichenketten muessen dabei uebersprungen werden, sonst endet ein
    # Takt mitten in einem Satz mit eckiger Klammer.
    depth = 0
    in_string = False
    escaped = False
    ends: list[int] = []
    for i in range(open_bracket, len(raw)):
        ch = raw[i]
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 1:
                ends.append(i)
            elif depth == 0:
                break

    if not ends:
        return None
    try:
        beats = json.loads(raw[open_bracket : ends[-1] + 1] + "]")
    except json.JSONDecodeError:
        return None
    log.info("Drehbuch war abgeschnitten, %d vollstaendige Takte gerettet", len(beats))
    return {"suitable": True, "beats": beats}
