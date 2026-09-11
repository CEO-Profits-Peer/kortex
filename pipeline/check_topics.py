#!/usr/bin/env python3
"""Prueft die Themenliste, ohne einen einzigen Modellaufruf.

    python pipeline/check_topics.py

Beantwortet drei Fragen, die man sonst erst mitten im Lauf merkt:

  * Gibt es das Lemma ueberhaupt? Ein Tippfehler kostet sonst eine Zeile
    im Log und faellt nie auf.
  * Ist es eine Begriffsklaerungsseite? Die liefert eine Liste von Links
    und daraus wird eine Karte ohne Inhalt.
  * Ist der Artikel lang genug fuer eine Karte?

Kostet nur Wikipedia-Anfragen, also nichts. Gehoert vor jeden Lauf, bei
dem neue Themen dazugekommen sind.
"""

from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import httpx  # noqa: E402

from config import USER_AGENT  # noqa: E402
from topics import TOPICS  # noqa: E402


#: Titel pro Anfrage. Die MediaWiki-API nimmt bis zu 50 auf einmal.
#:
#: Einzeln abzufragen war der erste Versuch und endete bei knapp 300
#: Themen in einer Drosselung: ab irgendwann kommt kein JSON mehr
#: zurueck, sondern eine HTML-Fehlerseite, und dann sieht jede Zeile aus
#: wie ein kaputtes Lemma. Gebuendelt sind es statt 293 Anfragen noch 15.
BATCH = 20

#: Ab wann eine Einleitung nach Stummel aussieht.
#:
#: Bewusst NIEDRIG. Erst stand hier 30, und prompt meldete die Pruefung
#: "Zinseszins" als zu duenn - die Einleitung hat 28 Woerter, der Artikel
#: 4925. Eine knappe Definition am Anfang ist bei Fachbegriffen die Regel,
#: nicht der Mangel.
#:
#: Nicht zu verwechseln mit MIN_WORDS in sources/wikipedia.py: das misst
#: den GANZEN Artikel und entscheidet beim Erzeugen. Diese Zahl hier
#: entscheidet gar nichts, sie zeigt nur etwas an.
MIN_INTRO_WORDS = 12


def main() -> int:
    bad: list[str] = []
    thin: list[str] = []
    disambig: list[str] = []
    words_total = 0

    by_lang: dict[str, list[str]] = {}
    for topic in TOPICS:
        by_lang.setdefault(topic.language, []).append(topic.title)

    with httpx.Client(timeout=40.0, follow_redirects=True) as http:
        for lang, titles in by_lang.items():
            for start in range(0, len(titles), BATCH):
                chunk = titles[start:start + BATCH]
                params = {
                    "action": "query", "format": "json", "formatversion": "2",
                    "prop": "extracts|pageprops", "explaintext": "1",
                    # --- Warum nur die EINLEITUNG --------------------
                    #
                    # Gemessen an der echten API:
                    #
                    #   "exlimit was too large for a whole article
                    #    extracts request, lowered to 1."
                    #
                    # Volltext-Auszuege gibt es genau EINEN pro Anfrage,
                    # egal was man anfragt - gebuendelt geht das nicht.
                    # Einleitungen dagegen schon, zwanzig auf einmal.
                    #
                    # Fuer eine Pruefung reicht das: sie beantwortet "gibt
                    # es das Lemma, ist es eine Begriffsklaerung, steht
                    # ueberhaupt etwas drin". Wie lang der GANZE Artikel
                    # ist, prueft sources/wikipedia.py beim Erzeugen noch
                    # einmal selbst (MIN_WORDS) - und dort kostet es
                    # nichts, weil der Text dann ohnehin geholt wird.
                    "exintro": "1",
                    "exlimit": "max",
                    "redirects": "1", "titles": "|".join(chunk),
                }
                url = f"https://{lang}.wikipedia.org/w/api.php"

                # Weiterleitungen und Normalisierungen kommen getrennt von
                # den Seiten zurueck: gefragt haben wir nach "Zweiersystem",
                # geantwortet wird unter "Dualsystem". Ohne diese beiden
                # Tabellen findet man die eigene Anfrage nicht wieder.
                pages: dict[str, dict] = {}
                resolved: dict[str, str] = {}
                try:
                    data = http.get(
                        url, params=params, headers={"User-Agent": USER_AGENT}
                    ).json()
                    q = data.get("query", {})
                    for r in q.get("redirects", []):
                        resolved[r["from"]] = r["to"]
                    for n in q.get("normalized", []):
                        resolved.setdefault(n["from"], n["to"])
                    for pg in q.get("pages", []):
                        pages[pg.get("title")] = pg
                except Exception as exc:  # noqa: BLE001
                    bad.extend(f"{lang}:{t}  ({exc})" for t in chunk)
                    continue

                for title in chunk:
                    target = resolved.get(title, title)
                    target = resolved.get(target, target)
                    page = pages.get(target) or pages.get(title)
                    label = f"{lang}:{title}"
                    if page is None or page.get("missing"):
                        bad.append(label)
                        continue
                    if "disambiguation" in (page.get("pageprops") or {}):
                        disambig.append(label)
                        continue
                    n_words = len((page.get("extract") or "").split())
                    words_total += n_words
                    if n_words < MIN_INTRO_WORDS:
                        thin.append(f"{label}  (Einleitung nur {n_words} Woerter)")

    print(f"{len(TOPICS)} Themen geprueft")
    print(f"  Sprachen:   {dict(Counter(t.language for t in TOPICS))}")
    print(f"  Kategorien: {len(set(t.category_id for t in TOPICS))}")
    print(f"  Schnitt:    {words_total // max(1, len(TOPICS))} Woerter je Einleitung")

    for label, items in [
        ("GIBT ES NICHT", bad),
        ("BEGRIFFSKLAERUNG (unbrauchbar)", disambig),
        (f"STUMMEL (Einleitung < {MIN_INTRO_WORDS} Woerter)", thin),
    ]:
        if items:
            print(f"\n{label}: {len(items)}")
            for i in items:
                print(f"   {i}")

    return 1 if (bad or disambig) else 0


if __name__ == "__main__":
    raise SystemExit(main())
