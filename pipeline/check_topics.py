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
from sources.wikipedia import MIN_WORDS  # noqa: E402
from topics import TOPICS  # noqa: E402


def main() -> int:
    bad: list[str] = []
    thin: list[str] = []
    disambig: list[str] = []
    words_total = 0

    with httpx.Client(timeout=20.0, follow_redirects=True) as http:
        for topic in TOPICS:
            params = {
                "action": "query", "format": "json", "formatversion": "2",
                "prop": "extracts|pageprops", "explaintext": "1",
                "redirects": "1", "titles": topic.title,
            }
            url = f"https://{topic.language}.wikipedia.org/w/api.php"
            try:
                pages = http.get(
                    url, params=params, headers={"User-Agent": USER_AGENT}
                ).json().get("query", {}).get("pages", [])
            except Exception as exc:  # noqa: BLE001
                bad.append(f"{topic.language}:{topic.title}  ({exc})")
                continue

            label = f"{topic.language}:{topic.title}"
            if not pages or pages[0].get("missing"):
                bad.append(label)
                continue
            page = pages[0]
            if "disambiguation" in (page.get("pageprops") or {}):
                disambig.append(label)
                continue
            n = len((page.get("extract") or "").split())
            words_total += n
            if n < MIN_WORDS:
                thin.append(f"{label}  ({n} Woerter)")

    print(f"{len(TOPICS)} Themen geprueft")
    print(f"  Sprachen:   {dict(Counter(t.language for t in TOPICS))}")
    print(f"  Kategorien: {len(set(t.category_id for t in TOPICS))}")
    print(f"  Schnitt:    {words_total // max(1, len(TOPICS))} Woerter je Artikel")

    for label, items in [
        ("GIBT ES NICHT", bad),
        ("BEGRIFFSKLAERUNG (unbrauchbar)", disambig),
        (f"ZU DUENN (< {MIN_WORDS} Woerter)", thin),
    ]:
        if items:
            print(f"\n{label}: {len(items)}")
            for i in items:
                print(f"   {i}")

    return 1 if (bad or disambig) else 0


if __name__ == "__main__":
    raise SystemExit(main())
