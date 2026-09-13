"""Die Themenliste fuer Evergreen-Karten.

Seit topic_discovery.py ist diese Liste nicht mehr die Grenze, sondern die
Saat: der Lauf findet selbst neue Themen, sobald die offenen knapp werden, und
zwar aus dem Linkgraphen DIESER Themen. Was hier steht, bestimmt also weiter,
wonach der Feed aussieht - nur nicht mehr, wie lang er reicht. Der Absatz
unten gilt deshalb unveraendert fuer die Auswahl hier, und er ist der Grund,
warum die Entdeckung von hier ausgeht und nicht von Wikipedia-Kategorien.

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

    # =====================================================================
    # Zweite Staffel (zu Migration 0050). Schwerpunkt Englisch: der
    # Bestand stand 89 zu 61 zugunsten Deutsch, und das passt nicht zu
    # einer App, die Kanada mitbedienen soll.
    # =====================================================================

    # --- Neuer Oberpunkt: Alltag & Recht ---------------------------------
    ("life.rights", "de", "Grundrechte"),
    ("life.rights", "de", "Datenschutz-Grundverordnung"),
    ("life.rights", "en", "Human rights"),
    ("life.rights", "en", "General Data Protection Regulation"),
    ("life.housing", "de", "Mietvertrag (Deutschland)"),
    ("life.housing", "de", "Kaution"),
    ("life.housing", "de", "Nebenkosten"),
    ("life.housing", "en", "Lease"),
    ("life.housing", "en", "Security deposit"),
    ("life.housing", "en", "Renting"),
    ("life.mobility", "de", "Fahrerlaubnis"),
    ("life.mobility", "de", "Öffentlicher Personennahverkehr"),
    ("life.mobility", "en", "Driver licence"),
    ("life.mobility", "en", "Public transport"),
    ("life.mobility", "en", "Cycling infrastructure"),
    ("life.consumer", "de", "Gewährleistung"),
    ("life.consumer", "de", "Widerrufsrecht"),
    ("life.consumer", "de", "Verbraucherschutz"),
    ("life.consumer", "en", "Consumer protection"),
    ("life.consumer", "en", "Warranty"),
    ("life.consumer", "en", "Consumer Rights Directive 2011"),

    # --- Neue Unterkategorien --------------------------------------------
    ("tech.games", "de", "Spiel-Engine"),
    ("tech.games", "en", "Game engine"),
    ("tech.games", "en", "Procedural generation"),
    ("tech.games", "en", "Frame rate"),
    ("tech.web", "de", "Hypertext Transfer Protocol"),
    ("tech.web", "de", "Domain Name System"),
    ("tech.web", "en", "Hypertext Transfer Protocol"),
    ("tech.web", "en", "Domain Name System"),
    ("tech.web", "en", "HTTP cookie"),
    ("finance.taxes", "de", "Einkommensteuer (Österreich)"),
    ("finance.taxes", "de", "Umsatzsteuer"),
    ("finance.taxes", "en", "Income tax"),
    ("finance.taxes", "en", "Progressive tax"),
    ("finance.taxes", "en", "Sales taxes in Canada"),
    ("finance.work", "de", "Arbeitsvertrag"),
    ("finance.work", "de", "Kollektivvertrag"),
    ("finance.work", "en", "Employment contract"),
    ("finance.work", "en", "Minimum wage"),
    ("finance.work", "en", "Unemployment benefits"),
    ("science.chem", "de", "Periodensystem"),
    ("science.chem", "de", "Chemische Bindung"),
    ("science.chem", "en", "Periodic table"),
    ("science.chem", "en", "Chemical bond"),
    ("science.chem", "en", "Acid"),
    ("science.earth", "de", "Plattentektonik"),
    ("science.earth", "de", "Erdbeben"),
    ("science.earth", "en", "Plate tectonics"),
    ("science.earth", "en", "Earthquake"),
    ("science.earth", "en", "Ocean current"),
    ("science.math", "de", "Wahrscheinlichkeit"),
    ("science.math", "de", "Prozentrechnung"),
    ("science.math", "en", "Probability"),
    ("science.math", "en", "Exponential growth"),
    ("science.math", "en", "Normal distribution"),
    ("science.math", "en", "Bayesian inference"),
    ("body.health", "de", "Impfung"),
    ("body.health", "de", "Blutdruck"),
    ("body.health", "en", "Vaccine"),
    ("body.health", "en", "Blood pressure"),
    ("body.health", "en", "Placebo"),
    ("body.mental", "de", "Stress"),
    ("body.mental", "de", "Depression"),
    ("body.mental", "en", "Stress (biology)"),
    ("body.mental", "en", "Anxiety"),
    ("body.mental", "en", "Mindfulness"),
    ("mind.decisions", "de", "Opportunitätskosten"),
    ("mind.decisions", "en", "Opportunity cost"),
    ("mind.decisions", "en", "Sunk cost"),
    ("mind.decisions", "en", "Decision-making"),
    ("mind.creativity", "de", "Kreativität"),
    ("mind.creativity", "en", "Creativity"),
    ("mind.creativity", "en", "Divergent thinking"),
    ("mind.creativity", "en", "Lateral thinking"),
    ("world.history", "de", "Industrielle Revolution"),
    ("world.history", "de", "Berliner Mauer"),
    ("world.history", "en", "Industrial Revolution"),
    ("world.history", "en", "Cold War"),
    ("world.history", "en", "Silk Road"),
    ("world.culture", "de", "Sprachfamilie"),
    ("world.culture", "en", "Language family"),
    ("world.culture", "en", "Lingua franca"),
    ("world.culture", "en", "Writing system"),
    ("world.media", "de", "Pressefreiheit"),
    ("world.media", "de", "Filterblase"),
    ("world.media", "en", "Freedom of the press"),
    ("world.media", "en", "Misinformation"),
    ("world.media", "en", "Filter bubble"),

    # --- Mehr Englisch in den bestehenden Kategorien ----------------------
    ("tech.ai", "en", "Prompt engineering"),
    ("tech.ai", "en", "Neural network (machine learning)"),
    ("tech.code", "en", "Open-source software"),
    ("tech.code", "en", "Binary number"),
    ("tech.security", "en", "Password strength"),
    ("tech.security", "en", "Encryption"),
    ("tech.security", "en", "Social engineering (security)"),
    ("tech.hardware", "en", "Central processing unit"),
    ("finance.basics", "en", "Debt"),
    ("finance.compound", "en", "Interest"),
    ("finance.markets", "en", "Stock market index"),
    ("finance.markets", "en", "Dividend"),
    ("finance.macro", "en", "Interest rate"),
    ("finance.macro", "en", "Unemployment"),
    ("science.physics", "en", "Special relativity"),
    ("science.physics", "en", "Quantum mechanics"),
    ("science.physics", "en", "Thermodynamics"),
    ("science.bio", "en", "Immune system"),
    ("science.bio", "en", "Gene"),
    ("science.bio", "en", "Human microbiome"),
    ("science.bio", "en", "Evolution"),
    ("science.neuro", "en", "Neuron"),
    ("science.neuro", "en", "Synapse"),
    ("science.space", "en", "Solar System"),
    ("science.space", "en", "Gravity"),
    ("science.space", "en", "Light-year"),
    ("science.climate", "en", "Climate change"),
    ("science.climate", "en", "Renewable energy"),
    ("science.climate", "en", "Sea level rise"),
    ("body.training", "en", "Aerobic exercise"),
    ("body.training", "en", "Delayed onset muscle soreness"),
    ("body.training", "en", "Progressive overload"),
    ("body.nutrition", "en", "Vitamin D"),
    ("body.nutrition", "en", "Carbohydrate"),
    ("body.nutrition", "en", "Caffeine"),
    ("body.sleep", "en", "Sleep deprivation"),
    ("body.sleep", "en", "Melatonin"),
    ("body.sleep", "en", "Rapid eye movement sleep"),
    ("mind.learning", "en", "Active recall"),
    ("mind.learning", "en", "Metacognition"),
    ("mind.focus", "en", "Flow (psychology)"),
    ("mind.focus", "en", "Distraction"),
    ("mind.bias", "en", "Availability heuristic"),
    ("mind.bias", "en", "Hindsight bias"),
    ("mind.bias", "en", "Dunning–Kruger effect"),
    ("world.politics", "en", "Democracy"),
    ("world.politics", "en", "Federalism"),
    ("world.politics", "en", "Constitution"),
    ("world.economy", "en", "Globalization"),
    ("world.economy", "en", "International trade"),
    ("world.science", "en", "Replication crisis"),
    ("world.science", "en", "Randomized controlled trial"),
    ("local.ca", "en", "Provinces and territories of Canada"),
    ("local.ca", "en", "Canada Pension Plan"),

    # =================================================================
    # Nachtrag 2026-09-11: 67 Themen, davon 53 deutsch
    #
    # Anlass war ein Missverhaeltnis, nicht ein Wunsch nach mehr: die
    # deutsche Seite hatte 123 Themen, die englische 169 - und in der
    # Datenbank 78 gegen 69 Karten, bei deutlich weniger Erklaerkarten
    # (44 gegen 58 Prozent). Die schwaechere Sprache hatte den kleineren
    # Vorrat.
    #
    # Schwerpunkt sind die Bereiche, die im Konzept stehen und in der
    # Liste fehlten: Arbeit, Steuern, Miete, Schule. Genau dafuer gibt es
    # auch keine Nachrichtenquelle - AMS, Arbeiterkammer, WKO, Parlament
    # und Sozialministerium haben alle keinen RSS-Feed mehr (geprueft
    # 2026-09-11). Wikipedia ist fuer diese Themen nicht die zweite Wahl,
    # sondern die einzige.
    #
    # Jedes Lemma wurde vor dem Eintragen gegen die Wikipedia-API
    # geprueft: existiert es, ist es eine Begriffsklaerung, hat es eine
    # Einleitung? Von 118 Kandidaten sind 15 durchgefallen - und zwar
    # ausgerechnet die naheliegenden:
    #
    #   "Mietvertrag"       Begriffsklaerung -> "Mietvertrag (Deutschland)"
    #   "Pflichtschule"     Begriffsklaerung -> "Schulpflicht"
    #   "Mietrecht (Oesterreich)"  gibt es nicht -> "Mietrechtsgesetz"
    #   "Kaution (Recht)"   gibt es nicht
    #   "E-Card (Oesterreich)"     gibt es nicht -> "Elektronische
    #                              Gesundheitsakte"
    #   "Achtsamkeit"       Begriffsklaerung -> "Achtsamkeit
    #                       (Geistesgegenwart)"
    #
    # Von Hand haette ich sie alle so eingetragen, wie sie oben stehen.
    # check_topics.py haette sie gemeldet - aber erst danach.
    # =================================================================

    # --- Geld ----------------------------------------------------
    ("finance.basics", "de", "Dispositionskredit"),
    ("finance.basics", "de", "Privatinsolvenz"),
    ("finance.basics", "de", "Schufa"),
    ("finance.basics", "en", "Registered education savings plan"),
    ("finance.markets", "de", "Börsengehandelter Fonds"),
    ("finance.taxes", "de", "Arbeitnehmerveranlagung"),
    ("finance.taxes", "de", "Kalte Progression"),
    ("finance.taxes", "de", "Lohnsteuer"),
    ("finance.taxes", "de", "Sozialversicherung"),
    ("finance.taxes", "en", "Goods and services tax (Canada)"),
    ("finance.taxes", "en", "Income tax in Canada"),
    ("finance.taxes", "en", "Tax bracket"),
    ("finance.work", "de", "Arbeitslosengeld"),
    ("finance.work", "de", "Arbeitszeit"),
    ("finance.work", "de", "Berufsausbildung"),
    ("finance.work", "de", "Duale Ausbildung"),
    ("finance.work", "de", "Geringfügige Beschäftigung"),
    ("finance.work", "de", "Probezeit"),
    ("finance.work", "en", "Minimum wage in Canada"),

    # --- Alltag und Recht ----------------------------------------
    ("life.consumer", "de", "Abofalle"),
    ("life.consumer", "de", "Effektiver Jahreszins"),
    ("life.consumer", "en", "Annual percentage rate"),
    ("life.housing", "de", "Betriebskosten (Immobilien)"),
    ("life.housing", "de", "Mietrechtsgesetz"),
    ("life.housing", "de", "Wohngeld"),
    ("life.housing", "en", "Landlord–tenant law"),
    ("life.housing", "en", "Leasehold estate"),
    ("life.mobility", "de", "Führerschein"),
    ("life.mobility", "de", "Klimaticket"),
    ("life.mobility", "en", "Driver's license"),
    ("life.rights", "de", "Geschäftsfähigkeit"),
    ("life.rights", "de", "Rücktritt (Zivilrecht)"),
    ("life.rights", "de", "Urheberrecht"),

    # --- Vor Ort -------------------------------------------------
    ("local.at", "de", "Bildungssystem in Österreich"),
    ("local.at", "de", "Bundesheer"),
    ("local.at", "de", "Elektronische Gesundheitsakte"),
    ("local.at", "de", "Gemeindebau"),
    ("local.at", "de", "Matura"),
    ("local.at", "de", "Nationalrat (Österreich)"),
    ("local.at", "de", "Schulpflicht"),
    ("local.at", "de", "Zivildienst"),
    ("local.ca", "en", "Education in Canada"),
    ("local.ca", "en", "Parliament of Canada"),
    ("local.ch", "de", "Bundesrat (Schweiz)"),
    ("local.ch", "de", "Volksabstimmung (Schweiz)"),
    ("local.de", "de", "Bürgergeld-Gesetz"),
    ("local.de", "de", "Deutscher Bundestag"),

    # --- Koerper -------------------------------------------------
    ("body.health", "de", "Antibiotikum"),
    ("body.mental", "de", "Achtsamkeit (Geistesgegenwart)"),
    ("body.mental", "de", "Angststörung"),
    ("body.mental", "de", "Burn-out"),
    ("body.mental", "de", "Meditation"),

    # --- Denken --------------------------------------------------
    ("mind.creativity", "de", "Brainstorming"),
    ("mind.decisions", "de", "Spieltheorie"),
    ("mind.decisions", "de", "Versunkene Kosten"),

    # --- Wissenschaft --------------------------------------------
    ("science.chem", "de", "Katalysator"),
    ("science.chem", "en", "Catalysis"),
    ("science.earth", "de", "Vulkan"),
    ("science.math", "de", "Exponentielles Wachstum"),
    ("science.math", "de", "Normalverteilung"),

    # --- Technik -------------------------------------------------
    ("tech.games", "de", "Lootbox"),
    ("tech.games", "en", "Loot box"),
    ("tech.web", "de", "HTTP-Cookie"),

    # --- Themen, die eine BESTIMMTE Bildart hergeben -------------
    #
    # Gemessen an 114 Erklaerkarten: `quantity`, `scale` und `guess`
    # kamen in keiner einzigen vor. Der naheliegende Verdacht war der
    # Prompt, und er war falsch - nachgesehen an 40 Artikeln der Liste:
    # bei zwei stehen Prozentanteile, die sich zu einem Ganzen fuegen,
    # bei keinem einzigen Werte, die um Faktor 1000 auseinanderliegen.
    # Die Bildarten werden nicht uebergangen, das Material fehlt.
    #
    # Eine Wikipedia-Einleitung ueber "Photosynthese" erzaehlt einen
    # Vorgang, keine Aufteilung. Wer Kaestchenraster sehen will, muss
    # Themen aufnehmen, bei denen sich etwas AUFTEILT - und fuer die
    # logarithmische Achse solche, bei denen Groessenordnungen der
    # eigentliche Inhalt sind.
    #
    # Der Massstab aus dem Kopf dieser Datei gilt weiter: jede Zeile muss
    # fuer sich etwas erklaeren, das im Alltag vorkommt. "Zehnerpotenz"
    # steht hier nicht, weil es eine schoene Achse ergibt, sondern weil
    # Groessenordnungen zu verstehen im Alltag dauernd gebraucht wird.
    ("science.earth", "de", "Erdatmosphäre"),
    ("science.earth", "en", "Atmosphere of Earth"),
    ("science.earth", "de", "Meerwasser"),
    ("science.earth", "en", "Seawater"),
    ("science.earth", "de", "Erdbeben"),
    ("science.earth", "en", "Richter scale"),
    ("science.math", "de", "Zehnerpotenz"),
    ("science.math", "en", "Order of magnitude"),
    ("science.math", "de", "Prozentrechnung"),
    ("science.math", "en", "Percentage"),
    ("science.physics", "de", "Elektromagnetisches Spektrum"),
    ("science.physics", "en", "Electromagnetic spectrum"),
    ("science.physics", "de", "Schalldruck"),
    ("science.space", "de", "Lichtjahr"),
    ("science.space", "en", "Light-year"),
    ("science.bio", "de", "Blut"),
    ("science.bio", "en", "Blood"),
    ("body.nutrition", "de", "Nährstoff"),
    ("body.nutrition", "en", "Macronutrient"),
    ("finance.taxes", "de", "Umsatzsteuer"),
    ("finance.taxes", "en", "Value-added tax"),
    ("finance.taxes", "de", "Einkommensteuer (Österreich)"),
    ("finance.taxes", "en", "Income tax"),
    ("life.housing", "de", "Wasserverbrauch"),
    ("life.housing", "en", "Water footprint"),
    ("science.climate", "de", "Strommix"),
    ("science.climate", "en", "Electricity generation"),
    ("tech.hardware", "de", "Byte"),
    ("tech.hardware", "en", "Byte"),

    # --- Welt ----------------------------------------------------
    ("world.culture", "de", "UNESCO-Welterbe"),
    ("world.culture", "en", "World Heritage Site"),
    ("world.history", "de", "Kalter Krieg"),
    ("world.media", "de", "Desinformation"),
]

def _dedupe(raw: list[tuple[str, str, str]]) -> list[Topic]:
    """Dasselbe Lemma nur einmal, auch wenn es in zwei Kategorien passt.

    "Registered Retirement Savings Plan" stand unter finance.basics UND
    local.ca - beides vertretbar, aber es waere zweimal dieselbe Karte
    geworden. Die erste Nennung gewinnt; wer die Kategorie aendern will,
    verschiebt die Zeile nach oben.
    """
    seen: set[tuple[str, str]] = set()
    out: list[Topic] = []
    for category_id, language, title in raw:
        key = (language, title)
        if key in seen:
            continue
        seen.add(key)
        out.append(Topic(category_id=category_id, language=language, title=title))
    return out


TOPICS: list[Topic] = _dedupe(_RAW)


def topics_for(languages: tuple[str, ...]) -> list[Topic]:
    return [t for t in TOPICS if t.language in languages]


def order_by_scarcity(
    topics: list[Topic], counts: dict[tuple[str, str], int]
) -> list[Topic]:
    """Die duennsten Kategorien zuerst.

    Der Anlass war eine Frage, auf die die ehrliche Antwort "nein" war:
    wird darauf geachtet, dass von allen Kategorien ungefaehr gleich viel
    da ist? Gemessen bei 199 Karten:

        20 von 45 Unterkategorien hatten KEINE einzige Karte
        die fuenf groessten hatten 103 - mehr als die Haelfte

    Das war kein Zufall und keine Themenschwaeche, sondern die
    Reihenfolge dieser Datei. Evergreen laeuft die Liste von oben nach
    unten ab und hoert auf, wenn das Tageskontingent leer ist. Ganz oben
    stehen Technik, Geld und Wissenschaft - also wurden jeden Tag wieder
    Technik, Geld und Wissenschaft gebaut, waehrend "Wohnen", "Steuern"
    und "Rechte" seit Wochen auf ihren ersten Durchlauf warteten. Die
    Liste war als Vorrat gedacht und wirkte als Rangliste.

    Jetzt entscheidet der Bestand: eine Kategorie ohne Karte kommt vor
    einer mit siebzehn. Das kostet keinen einzigen Modellaufruf - es ist
    dieselbe Arbeit in einer anderen Reihenfolge.

    Sprache ist Teil des Schluessels, nicht nur die Kategorie. "science.bio
    hat 22 Karten" verdeckt, dass davon 9 deutsch und 13 englisch sind;
    eine Kategorie kann in einer Sprache voll und in der anderen leer
    sein.

    Bei Gleichstand entscheidet zuerst der Gesamtbestand der Kategorie
    (0 de / 17 en ist weniger duenn als 0 / 0) und dann die Reihenfolge in
    dieser Datei. Damit bleibt die Auswahl vorhersagbar: zwei Laeufe mit
    demselben Bestand bauen dasselbe.
    """
    je_kategorie: dict[str, int] = {}
    for (category_id, _language), n in counts.items():
        je_kategorie[category_id] = je_kategorie.get(category_id, 0) + n

    def rang(eintrag: tuple[int, Topic]) -> tuple[int, int, int]:
        stelle, topic = eintrag
        return (
            counts.get((topic.category_id, topic.language), 0),
            je_kategorie.get(topic.category_id, 0),
            stelle,
        )

    return [t for _, t in sorted(enumerate(topics), key=rang)]
