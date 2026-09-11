# Content-Sourcing: die Regel, nach der die Pipeline arbeitet

## Die entscheidende Unterscheidung

> **Fakten sind nicht geschützt. Formulierungen sind es.**

Das ist keine Feinheit, das ist die ganze Rechtslage in einem Satz — und sie
sagt genau, was erlaubt ist und was nicht:

| Vorgang | Zulässig? | Warum |
|---|---|---|
| 5 Quellen lesen, die zugrundeliegenden **Fakten** in **eigenen Worten** neu schreiben | ✅ | Genau das tun Journalisten seit 200 Jahren. Fakten sind gemeinfrei. |
| **Einen** Artikel durch die KI komprimieren lassen | ❌ | Das übernimmt Auswahl, Reihenfolge und Struktur — also die geschützte Leistung. |
| Quelle weglassen, damit es niemand merkt | ❌❌ | Ändert an der Rechtslage **nichts** (Leistungsschutzrecht § 76f UrhG fragt nicht nach Attribution, sondern nach Nutzung) — nimmt uns aber jede Verteidigung und zerstört das Produkt. |

### Warum Quellen verstecken das Produkt kaputtmacht

Die Frage war: *„Macht KI nicht dauernd das, dass sie aus allen Quellen Infos
nimmt? Wir sagen einfach nicht, wo es herkommt."*

Der erste Teil stimmt — Synthese aus vielen Quellen ist legitim. Der zweite Teil
ist der teuerste Fehler, den wir machen könnten:

1. **Rechtlich** bringt es nichts. Wer wegen Leistungsschutzrecht abgemahnt wird,
   wird nicht wegen fehlender Fußnote abgemahnt, sondern wegen der Nutzung.
   Ohne Quellenangabe fällt aber unser bestes Argument weg: *„Wir sind
   Traffic-Zubringer, kein Konkurrent."*
2. **Produktseitig** ist die antippbare Quelle unser gesamter Vertrauensanker.
   Eine App, die faktische Behauptungen ohne Herkunft in ein Feed-Format kippt,
   **ist** genau das, wogegen wir antreten: AI Slop.
3. **Store-seitig**: Apple Review Guideline 4.1/5.2 und Google Play kippen Apps,
   die fremde Inhalte ohne Rechte aggregieren. Ein Rauswurf nach 6 Monaten
   Arbeit ist der teuerste denkbare Ausgang.
4. **Zielgruppe**: 13–20-Jährige, teils im Schulkontext. „Woher weiß die App
   das?" ist die erste Frage jeder Lehrkraft. Wir wollen darauf eine Antwort haben.

**Fazit: Quellenangabe ist ein Feature, kein Kostenpunkt.** Wir zeigen nicht eine
Quelle, wir zeigen *alle* — das sieht souveräner aus als jedes Einzel-Logo.

---

## Die Pipeline-Regel (im Code erzwungen, nicht im Kopf)

`sources.license_class` ist ein Datenbankfeld. Die Pipeline liest es und darf
gar nichts anderes tun:

| `license_class` | Was gespeichert werden darf | Beispiele |
|---|---|---|
| `owned` | Volles Card-Deck, Quiz, Interaktion | Von uns generierte Evergreen-Cards |
| `cc` | Volltext-Card + Quiz, **Attribution + Lizenz-Link Pflicht** | Wikipedia/Wikinews (CC-BY-SA), arXiv (je nach Paper), Statistik Austria (CC-BY) |
| `press_free` | Volltext-Card + Quiz | APA-OTS, EU-Kommission, Ministerien, EurekAlert-PMs, ESA/NASA |
| `link_only` | **Nur** Titel + Deck-Zeile aus eigener Feder + Link. Keine Zusammenfassung, kein Quiz. | Standard, ORF, Presse, Zeit, FAZ, BBC, Reuters |

Ein `link_only`-Item mit gefülltem `body_blocks` ist ein Bug, kein Feature —
die Validierungsstufe der Pipeline lehnt es ab.

### Multi-Source-Synthese (der Normalfall für News)

Der Embedding-Cluster, den wir ohnehin für die Dedup brauchen, liefert die
Synthese gratis:

```
1. Ingest    → N Items zum selben Ereignis aus verschiedenen Quellen
2. Cluster   → Embedding-Ähnlichkeit > 0.86 → gleiche cluster_id
3. Synthese  → Gemini bekommt ALLE N Texte und schreibt EINEN neuen,
               kürzeren Text über die Fakten, die in >= 2 Quellen stehen
4. Publish   → source_ids = alle N, source_urls = alle N Links
```

Das ist gleichzeitig:
- die rechtlich sauberste Variante (Fakten-Synthese statt Einzeltext-Derivat),
- die faktisch verlässlichste (was nur eine Quelle behauptet, fliegt raus),
- und die, die den Nutzer am meisten beeindruckt (5 Quellen-Badges pro Card).

---

## Startaufstellung der Quellen

**Deutschsprachig, `press_free` / `cc`:**
APA-OTS · Bundeskanzleramt & Ministerien AT · Land Wien/Steiermark/Kärnten ·
Statistik Austria · EU-Kommission (DE) · Europäisches Parlament · Deutscher
Bundestag hib · Wikinews DE · Wikipedia „Aktuelles"

**Wissenschaft, `press_free` / `cc`:**
arXiv · bioRxiv/medRxiv · EurekAlert · Nature/Science Press Releases · ESA ·
NASA (public domain) · Max-Planck-Gesellschaft · CERN · Fraunhofer · IDW-online

**`link_only` (Headline + Link, als Ergänzung im Feed):**
Der Standard · ORF.at · Die Presse · Zeit · FAZ · SRF · BBC · Reuters

**`owned` (das Rückgrat):**
Selbst erzeugte Evergreen-Cards. Siehe unten.

---

## Qualität der Evergreen-Cards („MUSS von hoher Qualität sein")

Das ist der Teil, der über „gut" oder „AI Slop" entscheidet. Vier Regeln:

1. **Nie aus dem Modellgedächtnis generieren.** Jede Evergreen-Card wird gegen
   ein konkretes, zitierfähiges Referenzdokument erzeugt (Lehrbuchkapitel,
   Wikipedia-Artikel, Paper, Statistik-Datensatz). Kein Quellendokument →
   keine Card.
2. **Zwei-Modell-Prüfung.** Modell A schreibt, Modell B bekommt ausschließlich
   Referenzdokument + Entwurf und beantwortet: *Steht jede Behauptung im
   Dokument? Ist die Quizantwort daraus eindeutig ableitbar?* Ein Nein → `rejected`.
3. **Deterministische Checks** vor dem Modell-Review, weil sie 0 € kosten:
   jede Zahl, jedes Datum, jeder Eigenname aus dem Entwurf muss im
   Referenztext vorkommen. Fängt den Großteil der Halluzinationen.
4. **Manuelles Gate für die ersten 500.** `status = 'approved'` setzt am Anfang
   ein Mensch. Erst wenn die Ablehnungsquote unter ~5 % liegt, gehen die
   Kategorien mit der besten Quote auf Auto-Approve.

Das klingt aufwendig — es sind drei API-Calls und ein Regex-Durchlauf pro Card.
Und es ist der einzige Grund, warum jemand der App mehr glaubt als einem
beliebigen KI-Feed.

## Bilder

Pressefotos sind separat lizenziert, og:image-Hotlinking ist ebenfalls heikel.
Der Blueprint-Stil löst das: **generierte Vektor-/Typo-Visuals statt Fotos.**
Ästhetik und Rechtslage zeigen hier zufällig in dieselbe Richtung — wir nutzen
das als bewusste Designentscheidung, nicht als Notlösung.
