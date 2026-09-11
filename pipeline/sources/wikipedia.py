"""Wikipedia-Artikel als Referenzdokument fuer Evergreen-Karten.

Warum ausgerechnet Wikipedia
----------------------------
docs/CONTENT-SOURCING.md, Regel 1: "Nie aus dem Modellgedaechtnis
generieren. Jede Evergreen-Card wird gegen ein konkretes, zitierfaehiges
Referenzdokument erzeugt. Kein Quellendokument -> keine Card."

Wikipedia erfuellt drei Bedingungen gleichzeitig, und das tut sonst
nichts:

  * Lizenz CC-BY-SA - in der Quellentabelle als `cc` gefuehrt, also
    Volltext erlaubt. Genau der Punkt, an dem ORF, BBC und Zeit
    scheitern: die sind `link_only`, und deshalb wirft die Pipeline
    dort rund 60 Prozent aller geholten Artikel weg, bevor sie
    ueberhaupt anfaengt.
  * Zeitlos. Ein Artikel ueber Zinseszins ist in fuenf Jahren noch
    richtig - die Karte bekommt kein Verfallsdatum und verschwindet
    nicht nach vierzehn Tagen aus dem Feed.
  * Beliebig breit. Der Nachschub haengt nicht mehr daran, was heute
    zufaellig passiert ist, sondern an einer Themenliste, die wir selbst
    schreiben.

Was hier NICHT passiert
-----------------------
Der Artikeltext wird nicht gespeichert und nicht ausgeliefert. Er geht
ins Modell, die Pruefung vergleicht die fertige Karte damit, danach ist
er weg. In der Datenbank steht eine neu geschriebene Karte plus Link -
das ist auch unter CC-BY-SA der saubere Weg, und die Namensnennung
haengt ohnehin an der Quelle (`attribution_required`).
"""

from __future__ import annotations

import logging
import urllib.parse
from dataclasses import dataclass

import httpx

from config import USER_AGENT
from db import Source, content_hash
from sources.feeds import RawItem

log = logging.getLogger(__name__)

#: So viel Artikel geht ins Modell. Der Anfang eines Wikipedia-Artikels
#: ist der allgemeinverstaendliche Teil; weiter unten wird es fachlich
#: und damit fuer eine Karte unbrauchbar. "Photosynthese" hat 11 000
#: Woerter - alles mitzuschicken kostet Kontingent und macht die Karte
#: nicht besser, sondern spezieller.
MAX_WORDS = 1200

#: Darunter traegt der Artikel keine Karte. Kommt bei Begriffsklaerungen
#: und Stummeln vor.
MIN_WORDS = 120


@dataclass(frozen=True)
class Topic:
    """Ein Thema aus der kuratierten Liste."""

    category_id: str
    language: str
    #: Lemma, genau wie in der Wikipedia. Weiterleitungen werden aufgeloest.
    title: str


def fetch_article(topic: Topic, source: Source, http: httpx.Client) -> RawItem | None:
    """Einen Artikel holen und als RawItem zurueckgeben.

    RawItem und nicht ein eigener Typ: ab hier ist der Weg derselbe wie
    bei einem Zeitungsartikel - dasselbe Modell, dieselbe Pruefung,
    dieselbe Dublettensuche, dieselbe Zeile in der Tabelle. Ein zweiter
    Typ haette nur bedeutet, jede dieser Stellen zweimal zu pflegen.
    """
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "extracts",
        # Klartext statt HTML, und der ganze Artikel statt nur der
        # Einleitung - gekuerzt wird unten, kontrolliert.
        "explaintext": "1",
        "redirects": "1",
        "titles": topic.title,
    }
    url = f"https://{topic.language}.wikipedia.org/w/api.php"
    try:
        response = http.get(url, params=params, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        pages = response.json().get("query", {}).get("pages", [])
    except Exception as exc:  # noqa: BLE001 - Netz, JSON, alles
        log.warning("Wikipedia %s:%s: %s", topic.language, topic.title, exc)
        return None

    if not pages or pages[0].get("missing"):
        log.warning("Wikipedia %s:%s gibt es nicht", topic.language, topic.title)
        return None

    page = pages[0]
    title = page.get("title") or topic.title
    text = (page.get("extract") or "").strip()

    words = text.split()
    if len(words) < MIN_WORDS:
        log.info("  zu duenn: %s (%d Woerter)", title, len(words))
        return None
    text = " ".join(words[:MAX_WORDS])

    article_url = (
        f"https://{topic.language}.wikipedia.org/wiki/"
        + urllib.parse.quote(title.replace(" ", "_"))
    )
    return RawItem(
        source=source,
        url=article_url,
        title=title,
        # Ein Wikipedia-Artikel hat kein sinnvolles Datum: er wird
        # staendig geaendert und ist trotzdem nicht "von heute". Ohne
        # Datum sortiert der Feed ihn ueber die Frische-Kurve ein wie
        # eine aeltere Meldung, und das ist genau richtig.
        published_at=None,
        text=text,
        hash=content_hash(article_url, title),
    )
