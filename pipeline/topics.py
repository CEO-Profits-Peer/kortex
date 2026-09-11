"""Die Themenliste fuer Evergreen-Karten.

Warum eine Liste von Hand und kein Automatismus
-----------------------------------------------
Man koennte Wikipedia-Kategorien abgrasen und daraus Themen ziehen. Das
liefert dann "Liste der Staatsoberhaeupter 1974" und "Bahnhof
Wolfratshausen". Die Auswahl IST die Arbeit - sie entscheidet, ob der
Feed nach Lernstoff aussieht oder nach Lexikon-Zufall.

Der Massstab pro Zeile: Wuerde eine 17-jaehrige Person, die das Wort
noch nie gehoert hat, nach der Karte etwas verstanden haben, das ihr im
Alltag begegnet? "Zinseszins" ja. "Barwertformel" nein - zu eng.
"Mathematik" auch nein - zu weit, daraus wird nur Geraune.

Deutsch und Englisch sind KEINE Uebersetzungen voneinander. Der
deutschsprachige Teil hat Oesterreich-Bezug (AMS, Pflichtschule,
Wohnbeihilfe), der englische Kanada-Bezug (TFSA, RRSP, Provinzen) -
genau die Themen, bei denen eine uebersetzte Karte falsch waere.

Neue Zeile hinzufuegen: Kategorie-ID aus der categories-Tabelle, Sprache,
exaktes Wikipedia-Lemma. Weiterleitungen werden aufgeloest, Tippfehler
nicht - pipeline/check_topics.py prueft die ganze Liste ohne einen
einzigen Modellaufruf.
"""

from __future__ import annotations

from sources.wikipedia import Topic

#: (Kategorie, Sprache, Wikipedia-Lemma)
_RAW: list[tuple[str, str, str]] = [
    # --- Technik ------------------------------------------------------
    ("tech.ai", "de", "Künstliche Intelligenz"),
    ("tech.ai", "de", "Maschinelles Lernen"),
    ("tech.ai", "de", "Künstliches neuronales Netz"),
    ("tech.ai", "de", "Turing-Test"),
    ("tech.ai", "en", "Large language model"),
    ("tech.ai", "en", "Machine learning"),
    ("tech.ai", "en", "Turing test"),
    ("tech.code", "de", "Algorithmus"),
    ("tech.code", "de", "Open Source"),
    ("tech.code", "de", "Dualsystem"),
    ("tech.code", "en", "Algorithm"),
    ("tech.code", "en", "Version control"),
    ("tech.security", "de", "Phishing"),
    ("tech.security", "de", "Zwei-Faktor-Authentisierung"),
    ("tech.security", "de", "Ende-zu-Ende-Verschlüsselung"),
    ("tech.security", "de", "Passwort"),
    ("tech.security", "en", "Phishing"),
    ("tech.security", "en", "Multi-factor authentication"),
    ("tech.security", "en", "Ransomware"),
    ("tech.hardware", "de", "Halbleiter"),
    ("tech.hardware", "de", "Lithium-Ionen-Akkumulator"),
    ("tech.hardware", "de", "Mooresches Gesetz"),
    ("tech.hardware", "en", "Semiconductor"),
    ("tech.hardware", "en", "Lithium-ion battery"),

    # --- Geld ---------------------------------------------------------
    ("finance.basics", "de", "Budget"),
    ("finance.basics", "de", "Girokonto"),
    ("finance.basics", "de", "Kredit"),
    ("finance.basics", "de", "Bonität"),
    ("finance.basics", "en", "Budget"),
    ("finance.basics", "en", "Credit score"),
    ("finance.basics", "en", "Tax-Free Savings Account (Canada)"),
    ("finance.compound", "de", "Zinseszins"),
    ("finance.compound", "de", "Sparbuch"),
    ("finance.compound", "de", "Rendite"),
    ("finance.compound", "en", "Compound interest"),
    ("finance.compound", "en", "Rule of 72"),
    ("finance.markets", "de", "Aktie"),
    ("finance.markets", "de", "Exchange-traded fund"),
    ("finance.markets", "de", "Diversifikation (Wirtschaft)"),
    ("finance.markets", "de", "Anleihe"),
    ("finance.markets", "en", "Exchange-traded fund"),
    ("finance.markets", "en", "Diversification (finance)"),
    ("finance.markets", "en", "Index fund"),
    ("finance.macro", "de", "Inflation"),
    ("finance.macro", "de", "Leitzins"),
    ("finance.macro", "de", "Bruttoinlandsprodukt"),
    ("finance.macro", "de", "Rezession"),
    ("finance.macro", "en", "Inflation"),
    ("finance.macro", "en", "Gross domestic product"),
    ("finance.macro", "en", "Recession"),

    # --- Wissenschaft --------------------------------------------------
    ("science.physics", "de", "Energieerhaltungssatz"),
    ("science.physics", "de", "Entropie"),
    ("science.physics", "de", "Lichtgeschwindigkeit"),
    ("science.physics", "de", "Radioaktivität"),
    ("science.physics", "en", "Conservation of energy"),
    ("science.physics", "en", "Entropy"),
    ("science.physics", "en", "Half-life"),
    ("science.bio", "de", "Photosynthese"),
    ("science.bio", "de", "DNA"),
    ("science.bio", "de", "Antibiotikaresistenz"),
    ("science.bio", "de", "Evolution"),
    ("science.bio", "de", "Immunsystem"),
    ("science.bio", "en", "Photosynthesis"),
    ("science.bio", "en", "Antimicrobial resistance"),
    ("science.bio", "en", "CRISPR"),
    ("science.neuro", "de", "Neuron"),
    ("science.neuro", "de", "Gedächtnis"),
    ("science.neuro", "de", "Neuroplastizität"),
    ("science.neuro", "en", "Neuroplasticity"),
    ("science.neuro", "en", "Memory"),
    ("science.space", "de", "Schwarzes Loch"),
    ("science.space", "de", "Urknall"),
    ("science.space", "de", "Exoplanet"),
    ("science.space", "de", "Internationale Raumstation"),
    ("science.space", "en", "Black hole"),
    ("science.space", "en", "Exoplanet"),
    ("science.space", "en", "James Webb Space Telescope"),
    ("science.climate", "de", "Treibhauseffekt"),
    ("science.climate", "de", "Golfstrom"),
    ("science.climate", "de", "Erneuerbare Energie"),
    ("science.climate", "de", "Permafrost"),
    ("science.climate", "en", "Greenhouse effect"),
    ("science.climate", "en", "Carbon footprint"),
    ("science.climate", "en", "Permafrost"),

    # --- Körper --------------------------------------------------------
    ("body.training", "de", "Krafttraining"),
    ("body.training", "de", "Ausdauertraining"),
    ("body.training", "de", "Muskelkater"),
    ("body.training", "de", "Maximale Sauerstoffaufnahme"),
    ("body.training", "en", "Strength training"),
    ("body.training", "en", "VO2 max"),
    ("body.nutrition", "de", "Protein"),
    ("body.nutrition", "de", "Kohlenhydrate"),
    ("body.nutrition", "de", "Grundumsatz"),
    ("body.nutrition", "de", "Vitamin D"),
    ("body.nutrition", "en", "Protein"),
    ("body.nutrition", "en", "Basal metabolic rate"),
    ("body.nutrition", "en", "Dietary fiber"),
    ("body.sleep", "de", "Schlaf"),
    ("body.sleep", "de", "Circadiane Rhythmik"),
    ("body.sleep", "de", "Melatonin"),
    ("body.sleep", "en", "Sleep"),
    ("body.sleep", "en", "Circadian rhythm"),

    # --- Kopf -----------------------------------------------------------
    ("mind.learning", "de", "Lernkurve"),
    ("mind.learning", "de", "Vergessenskurve"),
    ("mind.learning", "de", "Lernen"),
    ("mind.learning", "en", "Spacing effect"),
    ("mind.learning", "en", "Testing effect"),
    ("mind.learning", "en", "Forgetting curve"),
    ("mind.focus", "de", "Aufmerksamkeit"),
    ("mind.focus", "de", "Prokrastination"),
    ("mind.focus", "de", "Multitasking"),
    ("mind.focus", "en", "Attention span"),
    ("mind.focus", "en", "Procrastination"),
    ("mind.bias", "de", "Kognitive Verzerrung"),
    ("mind.bias", "de", "Bestätigungsfehler"),
    ("mind.bias", "de", "Dunning-Kruger-Effekt"),
    ("mind.bias", "de", "Survivorship Bias"),
    ("mind.bias", "en", "Confirmation bias"),
    ("mind.bias", "en", "Survivorship bias"),
    ("mind.bias", "en", "Anchoring effect"),

    # --- Welt ------------------------------------------------------------
    ("world.politics", "de", "Demokratie"),
    ("world.politics", "de", "Gewaltenteilung"),
    ("world.politics", "de", "Verhältniswahl"),
    ("world.politics", "de", "Europäische Union"),
    ("world.politics", "en", "Separation of powers"),
    ("world.politics", "en", "Proportional representation"),
    ("world.economy", "de", "Angebot und Nachfrage"),
    ("world.economy", "de", "Lieferkette"),
    ("world.economy", "de", "Mindestlohn"),
    ("world.economy", "en", "Supply and demand"),
    ("world.economy", "en", "Supply chain"),
    ("world.science", "de", "Wissenschaftliche Methode"),
    ("world.science", "de", "Peer-Review"),
    ("world.science", "de", "Statistische Signifikanz"),
    ("world.science", "en", "Scientific method"),
    ("world.science", "en", "Peer review"),
    ("world.science", "en", "Statistical significance"),

    # --- Vor der Haustür --------------------------------------------------
    ("local.at", "de", "Politisches System Österreichs"),
    ("local.at", "de", "Bundespräsident (Österreich)"),
    ("local.at", "de", "Arbeitsmarktservice"),
    ("local.at", "de", "Schulsystem in Österreich"),
    ("local.at", "de", "Sozialversicherung (Österreich)"),
    ("local.de", "de", "Politisches System der Bundesrepublik Deutschland"),
    ("local.de", "de", "Bundesrat (Deutschland)"),
    ("local.ch", "de", "Politisches System der Schweiz"),
    ("local.ch", "de", "Volksinitiative (Schweiz)"),
    ("local.ca", "en", "Politics of Canada"),
    ("local.ca", "en", "Canadian Charter of Rights and Freedoms"),
    ("local.ca", "en", "Healthcare in Canada"),
    ("local.ca", "en", "Registered Retirement Savings Plan"),
]

TOPICS: list[Topic] = [Topic(category_id=c, language=l, title=t) for c, l, t in _RAW]


def topics_for(languages: tuple[str, ...]) -> list[Topic]:
    return [t for t in TOPICS if t.language in languages]
