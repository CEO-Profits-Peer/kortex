"""Behauptet die Karte mehr, als die Studie hergibt?

Das Problem
-----------
Die Zahlenpruefung in checks.py faengt Erfundenes. Sie faengt NICHT den
haeufigsten Fehler im Wissenschaftsjournalismus, und zwar den hier:

    Quelle:  "Die Untersuchung zeigt einen Zusammenhang zwischen
              Schlafdauer und Konzentration."
    Karte:   "Zu wenig Schlaf fuehrt zu schlechterer Konzentration."

Jede Zahl stimmt, jeder Eigenname steht im Text, die Wortdeckung ist hoch -
und die Aussage ist trotzdem falsch. Aus einem beobachteten Zusammenhang
ist eine Ursache geworden. Das passiert nicht aus boesem Willen, sondern
weil "fuehrt zu" sich besser liest als "haengt zusammen mit", und ein
Sprachmodell auf gut lesbare Saetze trainiert ist.

Bei einer Lern-App ist das schlimmer als anderswo. Wer hier etwas lernt,
lernt es als Tatsache.

Die Pruefung
------------
Deterministisch und eng:

    Steht in der Quelle ein Wort der Vorsicht ("Zusammenhang", "deutet
    darauf hin") und in der Karte ein Wort der Ursache ("fuehrt zu",
    "verursacht"), das in der Quelle NICHT vorkommt - dann wurde
    verschaerft.

Der Zusatz "das in der Quelle nicht vorkommt" ist das Entscheidende.
Schreibt die Studie selbst "verursacht", darf die Karte das auch. Abgelehnt
wird nur, was die Karte hinzuerfindet.

Was diese Pruefung NICHT kann: eine Karte, die von vornherein nur
vorsichtige Woerter benutzt und trotzdem Unsinn erzaehlt. Dafuer gibt es
keine Wortliste - dafuer gibt es die Freigabe durch Menschen bei Quellen
mit niedrigem Vertrauenswert.
"""

from __future__ import annotations

import re

#: Woerter, an denen man erkennt, dass die Quelle vorsichtig ist.
#: Beobachtungsstudien, Korrelationen, offene Fragen.
HEDGES = [
    # Deutsch
    r"zusammenhang", r"korrel\w*", r"assoziiert", r"assoziation",
    r"deutet darauf hin", r"legt nahe", r"hinweise? darauf",
    r"beobachtungsstudie", r"koennt\w+", r"könnt\w+", r"moeglicherweise",
    r"möglicherweise", r"vermutlich", r"scheint",
    r"nicht belegt", r"unklar", r"weitere untersuchungen",
    # Englisch
    r"correlat\w*", r"associat\w*", r"suggests?", r"may\b", r"might\b",
    r"observational", r"appears? to", r"further research", r"unclear",
]

#: Woerter, mit denen eine Karte eine Ursache behauptet.
CAUSAL = [
    # Deutsch
    r"fuehrt zu", r"führt zu", r"fuehren zu", r"führen zu",
    r"verursacht", r"verursachen", r"bewirkt", r"bewirken",
    r"sorgt dafuer", r"sorgt dafür", r"macht dich", r"macht einen",
    r"beweist", r"bewiesen", r"belegt eindeutig", r"zwangslaeufig",
    r"zwangsläufig", r"immer wenn", r"garantiert",
    # Englisch
    r"causes?", r"caused by", r"leads? to", r"results? in",
    r"proves?", r"proven", r"guarantees?", r"always\b",
]

HEDGE_RE = re.compile("|".join(HEDGES), re.IGNORECASE)
CAUSAL_RE = re.compile("|".join(CAUSAL), re.IGNORECASE)


def overclaims(card_text: str, source_text: str) -> str | None:
    """Gibt den Grund zurueck, wenn die Karte verschaerft - sonst None."""
    if not HEDGE_RE.search(source_text):
        # Die Quelle behauptet selbst etwas Festes. Dann ist eine feste
        # Aussage in der Karte kein Uebergriff.
        return None

    for match in CAUSAL_RE.finditer(card_text):
        phrase = match.group(0)
        # Kommt genau diese Formulierung auch in der Quelle vor? Dann hat
        # die Karte sie uebernommen, nicht erfunden.
        if re.search(re.escape(phrase), source_text, re.IGNORECASE):
            continue
        return (
            f"Karte behauptet eine Ursache ({phrase!r}), "
            f"die Quelle bleibt vorsichtig"
        )

    return None
