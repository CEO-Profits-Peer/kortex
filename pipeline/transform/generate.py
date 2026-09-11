"""Gemini: aus Artikeltext eine Karte machen.

Zwei Dinge sind hier nicht verhandelbar:

1. **Structured Output.** Das Schema wird per response_schema erzwungen, nicht
   im Prompt erbeten. "Bitte gib JSON zurueck" ist keine Garantie, ein Schema
   schon.

2. **Nichts erfinden.** Der Prompt sagt es, aber verlassen wir uns nicht
   darauf - validate/checks.py prueft danach deterministisch nach, ob jede
   Zahl aus dem Entwurf auch im Quelltext steht.
"""

from __future__ import annotations

import json
import logging
import random
import time
from typing import Any

from google import genai
from google.genai import types

log = logging.getLogger(__name__)

# --- Umgang mit voruebergehenden Ausfaellen -----------------------------------
#
# Der erste echte Lauf meldete "unbrauchbar 106, Gemini-Aufrufe 0". Die
# Diagnose ergab: 503 UNAVAILABLE, "This model is currently experiencing high
# demand". Kein Konfigurationsfehler, kein Schemaproblem - schlicht ein volles
# Modell.
#
# Daraus zwei Lehren:
#
# 1. Ein einzelner fehlgeschlagener Aufruf sagt nichts. Erst nach mehreren
#    Versuchen mit wachsender Wartezeit darf man ihn aufgeben.
# 2. Ein einzelnes Modell ist ein Klumpenrisiko. `gemini-flash-latest` zeigt
#    immer auf das neueste Flash-Modell - und das ist genau das, auf das sich
#    gerade alle stuerzen. Deshalb weicht die Pipeline nach genug Fehlschlaegen
#    auf ein aelteres, ruhigeres Modell aus.

#: Fehlercodes, bei denen sich Warten lohnt. Alles andere ist ein echter
#: Fehler und wird nicht wiederholt - ein falscher Schluessel wird durch
#: Geduld nicht richtig.
TRANSIENT_CODES = (429, 500, 502, 503, 504)

#: Ausweichmodelle in der Reihenfolge, in der sie probiert werden.
#:
#: Geprueft gegen das echte Konto: gemini-2.5-flash und -flash-lite stehen
#: zwar in der Modellliste, liefern beim Aufruf aber 404. Nur was tatsaechlich
#: geantwortet hat, steht hier. Namen, die es spaeter nicht mehr gibt, werden
#: beim ersten Versuch uebersprungen - siehe _is_missing_model.
# --- Warum hier zehn Modelle stehen und nicht drei ---------------------------
#
# Gemessen an der echten API, Fehlerdetail eines 429:
#
#     GenerateRequestsPerDayPerProjectPerModel-FreeTier
#     generate_content_free_tier_requests = 20
#
# Zwanzig Anfragen. Pro TAG. Das war die eigentliche Ursache dafuer, dass
# der Feed nie voll wurde - nicht die Feeds, nicht die Pruefung. Mit drei
# Modellen sind das 60 Karten am Tag, und davon geht noch ein Teil fuer
# Erklaerkarten und abgelehnte Versuche drauf.
#
# Das Kontingent gilt "PerProjectPerModel", also je Modell einzeln. Zehn
# Modelle sind zehn Toepfe. Das ist eine Kruecke und soll auch eine
# bleiben: der richtige Weg ist Abrechnung im Google-Konto zu aktivieren,
# dann kostet dieselbe Menge Karten ein paar Cent und die Liste hier
# koennte wieder auf ein Modell zusammenschrumpfen.
#
# Reihenfolge ist Qualitaetsreihenfolge: die grossen Flash-Modelle zuerst,
# die Lite-Varianten zuletzt. Was ein schwaecheres Modell schlechter
# macht, faengt die deterministische Pruefung ohnehin ab.
FALLBACK_MODELS = (
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
)

MAX_ATTEMPTS = 4
BASE_DELAY = 2.0

# --- Warum hier das Nachdenken abgeschaltet wird ------------------------------
#
# Die Gemini-3-Modelle denken standardmaessig vor, und dieses Nachdenken zaehlt
# gegen `max_output_tokens`. Gemessen an der echten API:
#
#   gemini-3-flash-preview, Budget 1400:  1341 Tokens fuers Nachdenken,
#                                           43 fuer die Antwort
#                                           -> finish_reason MAX_TOKENS,
#                                              abgeschnittenes JSON
#   gemini-3.5-flash,       Budget 3000:  1425 fuers Nachdenken
#   dieselben Modelle mit thinking_budget=0: sauberes, vollstaendiges JSON
#
# Das war die zweite Haelfte von "unbrauchbar 106". Die erste war die 503-
# Auslastung, die jetzt ausgesessen wird - aber selbst wenn der Aufruf
# durchging, kam eine halbe Karte zurueck.
#
# Nachdenken bringt hier auch nichts: die Aufgabe ist, aus einem vorliegenden
# Text die Fakten zu uebernehmen, nicht sie herzuleiten. Genau das soll das
# Modell ja NICHT tun.
THINKING_BUDGET = 0

#: Grosszuegig, seit das Nachdenken nicht mehr mitisst. Eine fertige Karte
#: braucht rund 400 Tokens; der Rest ist Sicherheitsabstand fuer lange Titel
#: und Zitate.
MAX_OUTPUT_TOKENS = 3000

#: Muss zur Spalte `content_items.embedding vector(768)` passen.
EMBEDDING_DIMS = 768


def _code(exc: Exception) -> int | None:
    code = getattr(exc, "code", None)
    if code is None:
        code = getattr(exc, "status_code", None)
    return code if isinstance(code, int) else None


def _is_missing_model(exc: Exception) -> bool:
    """Modell gibt es in diesem Konto nicht.

    Warten hilft dagegen nichts, das naechste Modell schon. Genau dieser Fall
    kam vor: zwei Ausweichmodelle standen in der Modellliste und antworteten
    trotzdem mit 404.
    """
    if _code(exc) == 404:
        return True
    text = str(exc).lower()
    return "not_found" in text or "is not found" in text


def _is_daily_quota(exc: Exception) -> bool:
    """Tageskontingent dieses Modells ist aufgebraucht.

    Sieht aus wie ein 429 und ist doch das Gegenteil: bei Ueberlastung
    hilft Warten, hier hilft es bis Mitternacht nicht. Der Unterschied
    steht im Fehlerdetail:

        GenerateRequestsPerDayPerProjectPerModel-FreeTier   -> Tag
        GenerateRequestsPerMinute...                        -> Minute

    Ohne diese Unterscheidung wartet die Pipeline vier Mal mit wachsender
    Pause auf ein Kontingent, das heute nicht wiederkommt - rund zwanzig
    verlorene Sekunden vor jedem Modellwechsel, zehn Mal hintereinander.
    """
    if _code(exc) != 429:
        return False
    text = str(exc)
    return "PerDay" in text or "free_tier_requests" in text


def _is_transient(exc: Exception) -> bool:
    if _is_missing_model(exc):
        return False
    # Aufgebrauchtes Tageskontingent ist kein voruebergehender Fehler -
    # aber ein Grund, sofort das naechste Modell zu nehmen.
    if _is_daily_quota(exc):
        return False
    if _code(exc) in TRANSIENT_CODES:
        return True
    # Nicht jede Ausnahme traegt einen Code. Der Text ist die zweite Chance.
    text = str(exc).lower()
    return (
        any(str(c) in text for c in TRANSIENT_CODES)
        or "unavailable" in text
        or "high demand" in text
        or "overloaded" in text
        or "exhausted" in text
    )

CARD_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["title", "deck", "body_blocks", "quiz", "category_id", "difficulty",
                 "tags", "content_type"],
    "properties": {
        "title": {"type": "string"},
        "deck": {"type": "string"},
        "body_blocks": {
            "type": "array",
            "minItems": 2,
            "maxItems": 4,
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
        "quiz": {
            "type": "object",
            "required": ["question", "options", "correct_index", "explanation"],
            "properties": {
                "question": {"type": "string"},
                "options": {"type": "array", "minItems": 3, "maxItems": 3,
                            "items": {"type": "string"}},
                "correct_index": {"type": "integer", "minimum": 0, "maximum": 2},
                "explanation": {"type": "string"},
            },
        },
        "category_id": {"type": "string"},
        "difficulty": {"type": "integer", "minimum": 1, "maximum": 5},
        "tags": {"type": "array", "minItems": 2, "maxItems": 4, "items": {"type": "string"}},
        "content_type": {"type": "string", "enum": ["news", "knowledge"]},
        "usable": {"type": "boolean"},
    },
}

PROMPT = """Du schreibst Karten fuer eine Lern-App. Zielgruppe: 14 bis 25 Jahre,
neugierig, nicht dumm. Sprache: {language}.

DIESE KARTE WIRD MASCHINELL GEPRUEFT.
Was die Pruefung ablehnt, ist verlorene Arbeit - deshalb stehen ihre
Regeln hier, damit du sie beim Schreiben schon einhaeltst. Sie sind nicht
verhandelbar und werden Wort fuer Wort nachgerechnet:

  1. ZAHLEN. Jede mehrstellige Zahl in der Karte muss im Quelltext
     vorkommen. Nicht umrechnen, nicht runden, nicht in andere Einheiten
     bringen. "1.500" und "1500" gelten als dieselbe Zahl, "1,5
     Millionen" nicht.

  2. NAMEN. Jede Folge aus zwei oder mehr grossgeschriebenen Woertern
     muss GENAU SO im Quelltext stehen. Das ist der haeufigste Grund, aus
     dem Karten abgelehnt werden.
       Quelle: "die Kommission" -> schreibe nicht "Europaeische Kommission"
       Quelle: "MARTIN AUER"    -> schreibe nicht "Baeckerei Martin Auer"
     Ein erklaerendes Wort DAVOR ist erlaubt ("Fotograf Ouriel
     Morgensztern" geht, wenn der Name im Text steht). Ein erfundenes
     Wort dahinter nicht.
     Im Zweifel: nur den Teil schreiben, der woertlich dasteht.

  3. EIGENE WORTE, aber nicht zu viele. Mindestens die Haelfte der langen
     Inhaltswoerter deiner Karte muss auch im Quelltext vorkommen.
     Umformulieren ist erwuenscht, Neuschreiben nicht. Wenn du merkst,
     dass du den Sachverhalt aus eigenem Wissen ergaenzt: hoer auf.

  4. NICHT VERSCHAERFEN. Bleibt die Quelle vorsichtig ("Zusammenhang",
     "deutet darauf hin", "koennte"), bleibst du es auch. Aus
     "haengt zusammen mit" darf nie "fuehrt zu" werden.

REGELN, die wichtiger sind als alles andere:
- Verwende AUSSCHLIESSLICH Fakten, die woertlich im Quelltext unten stehen.
  Kein Vorwissen, keine Einordnung, die nicht im Text steht, keine Zahlen,
  die du nicht im Text findest.
- Wenn der Text zu duenn fuer eine sinnvolle Karte ist, setze "usable": false
  und lass die uebrigen Felder leer. Das ist ein gutes Ergebnis, kein Fehler.
- "usable": false gilt AUCH dann, wenn der Text zwar lang genug ist, aber
  niemandem etwas beibringt: Terminankuendigungen, Personalien, Eroeffnungen,
  Preisverleihungen, Eigenwerbung, rein lokale Bauvorhaben, parteipolitische
  Zitate ohne pruefbaren Sachverhalt. Frage dich: Waere jemand mit 17 nach
  dieser Karte klueger als vorher? Wenn nein, "usable": false.
- Die richtige Antwort muss WOERTLICH auf der Karte stehen. Nicht sinngemaess,
  nicht umschrieben - dieselben tragenden Woerter, die auch in einem
  body_block vorkommen. Wer die Karte gelesen hat, soll die Antwort
  wiedererkennen, nicht herleiten muessen.
  Schlecht: Karte sagt "Zinsen werden selbst wieder verzinst",
            Antwort lautet "Weil sie sich multiplizieren statt zu addieren"
  Gut:      Antwort lautet "Sie werden selbst wieder verzinst"
- Die falschen Antworten duerfen NICHT auf der Karte stehen. Sonst gewinnt,
  wer am schnellsten sucht, statt wer verstanden hat.
- Die FRAGE muss aus sich heraus verstaendlich sein. Sie wird auch
  ausserhalb der Karte gezeigt - in der Tagesaufgabe und bei der
  Wiederholung. Nenne deshalb den Gegenstand in der Frage selbst.
  Schlecht: "Was ist ein wirksames Gegenmittel?"
  Gut:     "Was hilft gegen den Bestaetigungsfehler?"
  Schlecht: "Wie hoch war der Anteil?"
  Gut:     "Wie hoch war der Anteil der Ozeane an der Verdunstung?"
- Keine Superlative, keine Werbesprache, kein "revolutionaer", kein
  "bahnbrechend". Nuechtern und praezise.

WIE VIEL AUF EINE KARTE PASST
Eine Karte ist EIN Handybildschirm. Nicht anderthalb. Wer mehr
hineinschreibt, zwingt die App, den Text zu verkleinern oder eine zweite
Seite anzuhaengen - beides macht die Karte schlechter.

Das Budget, streng:
- title:       hoechstens 60 Zeichen
- deck:        hoechstens 110 Zeichen, EIN Satz
- body_blocks: 2 bis 4 Bloecke, zusammen 50 bis 85 Woerter
- ein 'para':  hoechstens 3 Saetze
- ein 'bullet': hoechstens 3 Punkte, jeder hoechstens 60 Zeichen
Im Zweifel weniger. Eine Karte, die einen Gedanken ganz bringt, ist besser
als eine, die drei anreisst.

WAS EINE KARTE INTERESSANT MACHT
Nicht der Anlass, sondern die Ueberraschung. Jede Karte braucht EINEN
Satz, bei dem jemand innehaelt - eine Zahl, die groesser ist als erwartet,
ein Vergleich, der sitzt, eine Folge, die nicht offensichtlich ist.

Die Probe: Wuerde ein Siebzehnjaehriger das jemandem weitererzaehlen?
- "Die Kommission hat Mittel bewilligt" -> nein, das ist Verwaltung.
- "Mit dem Geld koennte man jede Schule des Landes zwei Jahre heizen"
  -> ja, das ist eine Groessenordnung.
Steckt im Quelltext nichts dergleichen, nimm die konkreteste Zahl und
setze sie in ein Verhaeltnis, das im Text steht. Erfinde kein Verhaeltnis
dazu.

Keine Floskeln: "wichtiger Schritt", "zeigt einmal mehr", "in Zeiten von".
Sie kosten Platz und sagen nichts.

WENN MAN VORWISSEN BRAUCHT
Setze nichts voraus, was nicht im Quelltext erklaert wird. Steht dort ein
Fachbegriff, ohne den die Karte unverstaendlich bleibt, gehoert die
Erklaerung in den ERSTEN Block - in einem Halbsatz, nicht als Vorrede.

  Schlecht: "Der Perigaeumsdurchgang faellt diesmal mit Vollmond zusammen."
  Gut:      "Der Mond steht der Erde am naechsten - Perigaeum - und ist
             gleichzeitig voll."

Braeuchte es dafuer mehr als einen Halbsatz, ist der Text fuer eine Karte
ungeeignet: "usable": false.

FORM:
- title: konkret. Keine Frage, kein Clickbait.
- deck: sagt, warum das ueberrascht - nicht, worum es geht.
- body_blocks: 'para' fuer Fliesstext, 'bullet' fuer Aufzaehlungen, 'stat'
  fuer eine einzelne praegnante Zahl (value + label), 'quote' fuer ein
  Zitat aus dem Text.
- Genau 3 Antwortmoeglichkeiten. Die falschen muessen plausibel sein.
- difficulty: 1 = Grundschule, 3 = Oberstufe, 5 = Studium.

NACHRICHT ODER WISSEN - content_type:
- "news": es geht um ein Ereignis mit Datum. Wer das in einem Jahr liest,
  merkt, dass es veraltet ist. Beschluesse, Starts, Veroeffentlichungen,
  Zahlen eines bestimmten Quartals.
- "knowledge": der Sachverhalt gilt auch in fuenf Jahren noch.
  Zusammenhaenge, Verfahren, Groessenordnungen, Erklaerungen.
  Auch wenn der ANLASS aktuell ist: geht es um das Prinzip dahinter,
  ist es "knowledge".

KATEGORIE: waehle genau eine ID aus dieser Liste:
{categories}

QUELLE: {source_name}
TITEL: {title}

QUELLTEXT:
{text}
"""


def _shuffle_options(card: dict[str, Any]) -> None:
    """Die Antwortmoeglichkeiten mischen.

    Sprachmodelle haben eine Vorliebe fuer bestimmte Positionen. Beim
    Nachzaehlen im Demo-Bestand lag die richtige Antwort in 21 von 22 Faellen
    an derselben Stelle - in der Mitte.

    Das ist harmlos, solange nur jemand fuer sich lernt. Sobald es eine
    Rangliste gibt, ist es keine Marotte mehr, sondern eine Anleitung: immer
    die mittlere nehmen. Wer das nach drei Tagen merkt, steht oben, ohne
    etwas gelernt zu haben - und der Rest merkt, dass die Liste nichts wert
    ist.

    Deshalb wird hier gemischt, an der einzigen Stelle, durch die jede Karte
    muss. Nicht im Prompt darum bitten: eine Bitte ist keine Garantie, und
    ueberpruefen liesse sie sich nur, indem man wieder nachzaehlt.
    """
    quiz = card.get("quiz")
    if not isinstance(quiz, dict):
        return
    options = quiz.get("options")
    correct = quiz.get("correct_index")
    if not isinstance(options, list) or not isinstance(correct, int):
        return
    if not (0 <= correct < len(options)):
        return

    right = options[correct]
    shuffled = list(options)
    random.shuffle(shuffled)
    quiz["options"] = shuffled
    quiz["correct_index"] = shuffled.index(right)


class Generator:
    def __init__(self, api_key: str, model: str) -> None:
        self.client = genai.Client(api_key=api_key)
        # Das gewuenschte Modell zuerst, danach die Ausweichmodelle - ohne
        # Dubletten, falls das gewuenschte schon in der Liste steht.
        self.models: list[str] = [model] + [m for m in FALLBACK_MODELS if m != model]
        self.model_index = 0
        self.calls = 0
        self.retries = 0
        # Erster Fehler im Klartext. Ohne den steht am Ende nur eine Zahl,
        # und man weiss nicht, ob es am Schluessel, am Modell oder am
        # Schema lag.
        self.first_error: str | None = None
        self.consecutive_failures = 0
        # Warum die letzte Karte verworfen wurde. Ein Aufruf kann glatt
        # durchgehen und das Ergebnis trotzdem unbrauchbar sein - ohne diese
        # Notiz steht am Ende nur eine Zahl, und die sagt nichts.
        self.last_reject: str | None = None

    @property
    def model(self) -> str:
        return self.models[self.model_index]

    def _next_model(self) -> bool:
        """Auf das naechste Ausweichmodell wechseln. False, wenn keins mehr da ist."""
        if self.model_index + 1 >= len(self.models):
            return False
        self.model_index += 1
        log.warning('Wechsle auf Ausweichmodell: %s', self.model)
        return True

    def _generate(self, prompt: str, config: types.GenerateContentConfig):
        """Ein Aufruf, mit Geduld.

        Wiederholt nur bei voruebergehenden Fehlern, mit wachsender Wartezeit
        und einem Zufallsanteil. Der Zufallsanteil ist wichtig: laufen mehrere
        Anfragen im Gleichtakt, treffen sie das ueberlastete Modell sonst
        immer wieder gemeinsam.

        Sind alle Versuche mit einem Modell aufgebraucht, wird einmal das
        naechste Modell probiert, bevor aufgegeben wird.
        """
        last: Exception | None = None
        while True:
            for attempt in range(MAX_ATTEMPTS):
                try:
                    return self.client.models.generate_content(
                        model=self.model, contents=prompt, config=config
                    )
                except Exception as exc:  # noqa: BLE001 - jede API kann alles werfen
                    last = exc
                    # Aeltere Modelle kennen thinking_config nicht. Dann lieber
                    # ohne - eine Karte mit Nachdenken ist besser als keine.
                    if config.thinking_config is not None and 'thinking' in str(exc).lower():
                        log.info('%s kennt thinking_config nicht, versuche ohne', self.model)
                        config = config.model_copy(update={'thinking_config': None})
                        continue
                    if _is_missing_model(exc):
                        # Kein Grund zu warten - das Modell kommt nicht wieder.
                        break
                    if _is_daily_quota(exc):
                        # Auch kein Grund zu warten - das Kontingent kommt
                        # erst morgen wieder. Direkt zum naechsten Topf.
                        log.info('%s: Tageskontingent aufgebraucht', self.model)
                        break
                    if not _is_transient(exc) or attempt == MAX_ATTEMPTS - 1:
                        break
                    delay = BASE_DELAY * (2**attempt) + random.uniform(0, 1.5)
                    self.retries += 1
                    log.info(
                        'Gemini %s ausgelastet, warte %.1fs (Versuch %d/%d)',
                        self.model, delay, attempt + 2, MAX_ATTEMPTS,
                    )
                    time.sleep(delay)

            # Alle Versuche mit diesem Modell verbraucht.
            if last is not None and (
                _is_transient(last) or _is_missing_model(last) or _is_daily_quota(last)
            ) and self._next_model():
                continue
            raise last if last else RuntimeError('Gemini: unbekannter Fehler')

    def make_card(
        self,
        *,
        text: str,
        title: str,
        source_name: str,
        language: str,
        category_ids: list[str],
    ) -> dict[str, Any] | None:
        prompt = PROMPT.format(
            language="Deutsch" if language == "de" else "English",
            categories=", ".join(category_ids),
            source_name=source_name,
            title=title,
            text=text,
        )
        try:
            response = self._generate(
                prompt,
                types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=CARD_SCHEMA,
                    # Niedrig: wir wollen Treue zum Quelltext, keine Kreativitaet.
                    temperature=0.3,
                    max_output_tokens=MAX_OUTPUT_TOKENS,
                    thinking_config=types.ThinkingConfig(
                        thinking_budget=THINKING_BUDGET
                    ),
                ),
            )
            self.calls += 1
            self.consecutive_failures = 0
        except Exception as exc:  # noqa: BLE001 - jede API kann alles werfen
            self.consecutive_failures += 1
            if self.first_error is None:
                self.first_error = f'{type(exc).__name__}: {exc}'
                log.error('Gemini-Aufruf fehlgeschlagen: %s', self.first_error)
            return None

        raw = (response.text or "").strip()
        if not raw:
            # Leere Antwort heisst fast immer: das Ausgabebudget war weg,
            # bevor die Antwort anfing. Der Grund steht in finish_reason.
            reason = None
            try:
                reason = str(response.candidates[0].finish_reason)
            except Exception:  # noqa: BLE001
                pass
            self.last_reject = f"leere Antwort (finish_reason={reason})"
            return None
        try:
            card = json.loads(raw)
        except json.JSONDecodeError:
            reason = None
            try:
                reason = str(response.candidates[0].finish_reason)
            except Exception:  # noqa: BLE001
                pass
            # MAX_TOKENS heisst hier nicht "zu lang", sondern "abgeschnitten".
            self.last_reject = f"kein gueltiges JSON ({len(raw)} Zeichen, finish_reason={reason})"
            log.warning("Gemini lieferte kein gueltiges JSON: %s", self.last_reject)
            return None

        if card.get("usable") is False:
            self.last_reject = "Modell haelt den Text fuer zu duenn (usable=false)"
            return None
        if card.get("category_id") not in category_ids:
            self.last_reject = f"unbekannte Kategorie: {card.get('category_id')!r}"
            return None

        _shuffle_options(card)
        self.last_reject = None
        return card

    def generate_raw(self, prompt: str, config: "types.GenerateContentConfig"):
        """Ein Aufruf mit eigener Konfiguration, aber derselben Geduld.

        Damit kann kinetic.py die Wiederholungen, die Ausweichmodelle und
        das abgeschaltete Nachdenken mitbenutzen, ohne dass dieselbe Logik
        ein zweites Mal existiert - und ohne dass sie beim naechsten
        Modellwechsel an zwei Stellen angepasst werden muss.
        """
        if config.thinking_config is None:
            config = config.model_copy(update={
                "thinking_config": types.ThinkingConfig(thinking_budget=THINKING_BUDGET)
            })
        response = self._generate(prompt, config)
        self.calls += 1
        return response

    def embed(self, text: str, model: str) -> list[float] | None:
        """Embedding fuer die Duplikaterkennung.

        Dieselbe Meldung kommt oft von mehreren Agenturen. Ohne das sieht der
        Nutzer dieselbe Nachricht fuenfmal hintereinander.

        Die Laenge wird ausdruecklich auf 768 gestellt. gemini-embedding-001
        liefert von sich aus 3072 Werte, die Spalte in der Datenbank ist
        vector(768) - ohne diese Angabe passt kein einziges Embedding hinein,
        und zwar stillschweigend, weil der Fehler erst beim Schreiben kaeme.
        """
        # Auch hier Geduld, aber weniger: ohne Embedding faellt nur die
        # Duplikaterkennung fuer diese eine Karte aus. Das ist ein Schoenheits-
        # fehler, kein Grund, den Lauf aufzuhalten.
        for attempt in range(3):
            try:
                result = self.client.models.embed_content(
                    model=model,
                    contents=text[:8000],
                    config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMS),
                )
                self.calls += 1
                values = result.embeddings[0].values if result.embeddings else None
                return list(values) if values else None
            except Exception as exc:  # noqa: BLE001
                if not _is_transient(exc) or attempt == 2:
                    log.debug("Embedding fehlgeschlagen: %s", exc)
                    return None
                self.retries += 1
                time.sleep(BASE_DELAY * (2**attempt) + random.uniform(0, 1))
        return None
