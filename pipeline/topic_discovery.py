#!/usr/bin/env python3
"""Neue Evergreen-Themen finden, statt die Liste von Hand zu verlaengern.

    python pipeline/topic_discovery.py --sprache de                 # alle Kategorien
    python pipeline/topic_discovery.py --sprache en --kategorie finance.taxes --top 20

Warum es das gibt
-----------------
Die Themenliste (topics.py) war die naechste Wand: 382 Themen, und bei gut
hundert Karten am Tag nach vier Tagen aufgebraucht. Danach bekommt Evergreen
nichts mehr zu tun, und das Gemini-Kontingent verfaellt ungenutzt.

Der Kopf von topics.py begruendet, warum dort KEIN Automatismus steht:
Wikipedia-Kategorien abgrasen liefert "Liste der Staatsoberhaeupter 1974"
und "Bahnhof Wolfratshausen". Das stimmt - fuer Kategorien. Dieser Weg geht
anders.

Wie gesucht wird
----------------
Ausgangspunkt sind Themen, die schon eine Karte haben: die handverlesenen
und alles, was diese Suche frueher gefunden hat. Gefragt wird: auf welche
Artikel verweisen MEHRERE Themen DERSELBEN Kategorie?

Wenn "Zinseszins", "Sparbuch" und "Rendite" alle auf "Effektiver
Jahreszins" verlinken, ist das mit hoher Wahrscheinlichkeit ein Lernthema -
drei von Hand gewaehlte Artikel hielten es fuer wichtig genug, darauf zu
verweisen.

Das Gegenmittel gegen Allerweltsartikel steht direkt dabei: gezaehlt wird
auch, wie viele Themen ALLER Kategorien auf einen Artikel verweisen.
"Deutschland" wird von ueberall verlinkt und hat deshalb nirgends einen
eigenen Anteil.

Was der erste Trockenlauf gezeigt hat
-------------------------------------
In Wissenschaft und Technik war die Ausbeute gut (Albedo, Tsunami, Synapse,
Rotverschiebung, Backpropagation, Transistor). Daneben drei Sorten Rauschen,
und gegen jede steht jetzt eine Regel:

  1. Kategorien mit einem einzigen Ausgangsthema lieferten "Aachener Dom" und
     "Adobe Flash" - ein einzelner Verweis ist Zufall, kein Muster. Jetzt
     immer mindestens zwei.
  2. Firmen, Zeitungen, Laender, Kriege, Sprachen: Equifax, "The New York
     Times", Irak, Irakkrieg, "Griechische Sprache". Direkte Wikidata-
     Klassen fingen das nicht - Equifax ist dort eine "Auskunftei", keine
     "Organisation". Jetzt wird die Klassenhierarchie hinauf geprueft
     (P31/P279*).
  3. Falsche Schublade: "Reelle Zahl" unter tech.code. Das laesst sich am
     Linkgraphen allein nicht verhindern. Deshalb entscheidet bei gefundenen
     Themen das MODELL ueber die Kategorie (evergreen.py) - es sieht den
     Artikel. Die Kategorie hier ist nur noch der Grund, WANN gesucht wird.

Warum das kein Limit mehr ist: jedes gefundene Thema, das eine Karte
bekommt, ist beim naechsten Lauf selbst Ausgangspunkt.

Kosten: nur Wikipedia- und Wikidata-Anfragen, kein Gemini-Kontingent.
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import USER_AGENT  # noqa: E402
from sources.wikipedia import Topic  # noqa: E402

log = logging.getLogger("entdeckung")

BATCH = 50

#: Darunter ist ein Artikel meist ein Stummel. Bytes Wikitext - diesen Wert
#: liefert die API, ohne den Artikel zu schicken.
MIN_BYTES = 12_000

#: So viele Themen der eigenen Kategorie muessen auf einen Artikel verweisen.
#: Einer ist Zufall (siehe Kopf, Punkt 1).
MIN_TREFFER = 2

#: So viel Anteil der Verweise muss aus der eigenen Kategorie kommen.
MIN_EIGENANTEIL = 0.6

#: Wikidata-Klassen, deren Instanzen (auch ueber Unterklassen) keine
#: Lernkarte ergeben.
AUSSCHLUSS_KLASSEN = (
    "Q5",          # Mensch
    "Q43229",      # Organisation - Firmen, Zeitungen, Parteien, Behoerden
    "Q6256",       # Land
    "Q3624078",    # souveraener Staat
    "Q486972",     # Siedlung
    "Q41176",      # Gebaeude
    "Q350604",     # bewaffneter Konflikt
    "Q34770",      # Sprache
    "Q17537576",   # kreatives Werk
    "Q4167410",    # Begriffsklaerung
    "Q13406463",   # Wikimedia-Liste
    "Q3186692",    # Kalenderjahr
)

TITEL_AUS = re.compile(
    r"^(Liste |Liste der |Liste von |List of |Lists of |Index of |Outline of |"
    r"Timeline of |Glossary of |Chronologie |Criticism of |Kritik an )"
    r"|^\d{1,4}(er)?( v\. Chr\.| BC)?$"
    r"|\((Begriffsklärung|disambiguation)\)",
)


@dataclass(frozen=True)
class Kandidat:
    category_id: str
    language: str
    title: str
    #: Wie viele Themen DIESER Kategorie auf den Artikel verweisen.
    im_thema: int
    #: Wie viele Themen insgesamt.
    ueberall: int
    bytes: int

    @property
    def eigenanteil(self) -> float:
        return self.im_thema / max(1, self.ueberall)

    @property
    def score(self) -> float:
        # Viele Verweise aus der Kategorie UND ein hoher eigener Anteil. Das
        # Produkt bestraft beides: einen Artikel, auf den nur ein Thema zeigt,
        # und einen, auf den alle zeigen.
        return self.im_thema * self.eigenanteil

    def als_topic(self) -> Topic:
        return Topic(category_id=self.category_id, language=self.language, title=self.title)


def _anfrage(http: httpx.Client, url: str, params: dict[str, str]) -> dict:
    """GET mit Geduld. `maxlag` sagt Wikipedia, dass wir nachrangig sind."""
    for versuch in range(5):
        try:
            r = http.get(url, params=params, headers={"User-Agent": USER_AGENT})
        except httpx.HTTPError as exc:
            log.warning("Netz: %s", exc)
            time.sleep(2 * (versuch + 1))
            continue
        if r.status_code in (429, 503, 504):
            time.sleep(2 ** versuch * 2)
            continue
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get("error", {}).get("code") == "maxlag":
            time.sleep(5)
            continue
        return data
    raise RuntimeError(f"{url} antwortet nicht")


def _wiki(http: httpx.Client, sprache: str, params: dict[str, str]) -> dict:
    return _anfrage(
        http,
        f"https://{sprache}.wikipedia.org/w/api.php",
        {"format": "json", "formatversion": "2", "maxlag": "5", **params},
    )


def _zielfunktion(q: dict):
    """Angefragter Titel -> tatsaechlicher Artikeltitel (Schreibweise, Weiterleitung)."""
    norm = {n["from"]: n["to"] for n in q.get("normalized", []) or []}
    weiter = {r["from"]: r["to"] for r in q.get("redirects", []) or []}

    def ziel(t: str) -> str:
        t = norm.get(t, t)
        return weiter.get(t, t)

    return ziel


def links_von(http: httpx.Client, sprache: str, titel: list[str]) -> dict[str, set[str]]:
    """Ausgehende Artikel-Links je angefragtem Titel."""
    out: dict[str, set[str]] = defaultdict(set)
    for i in range(0, len(titel), BATCH):
        teil = titel[i:i + BATCH]
        je_seite: dict[str, set[str]] = defaultdict(set)
        ziel = None
        fortsetzung: dict[str, str] = {}
        while True:
            data = _wiki(http, sprache, {
                "action": "query", "prop": "links", "titles": "|".join(teil),
                "plnamespace": "0", "pllimit": "max", "redirects": "1", **fortsetzung,
            })
            q = data.get("query", {})
            if ziel is None:
                ziel = _zielfunktion(q)
            for seite in q.get("pages", []) or []:
                for link in seite.get("links", []) or []:
                    je_seite[seite["title"]].add(link["title"])
            if "continue" not in data:
                break
            fortsetzung = data["continue"]
        for t in teil:
            out[t] |= je_seite.get(ziel(t) if ziel else t, set())
    return out


def eigenschaften(http: httpx.Client, sprache: str, titel: list[str]) -> dict[str, dict]:
    """Angefragter Titel -> Artikeltitel, Laenge, Begriffsklaerung, Wikidata-Kennung."""
    out: dict[str, dict] = {}
    for i in range(0, len(titel), BATCH):
        teil = titel[i:i + BATCH]
        data = _wiki(http, sprache, {
            "action": "query", "prop": "info|pageprops",
            "ppprop": "disambiguation|wikibase_item",
            "titles": "|".join(teil), "redirects": "1",
        })
        q = data.get("query", {})
        ziel = _zielfunktion(q)
        seiten = {s["title"]: s for s in q.get("pages", []) or [] if not s.get("missing")}
        for t in teil:
            s = seiten.get(ziel(t))
            if not s:
                continue
            props = s.get("pageprops") or {}
            out[t] = {
                "titel": s["title"],
                "bytes": int(s.get("length") or 0),
                "begriffsklaerung": "disambiguation" in props,
                "wikidata": props.get("wikibase_item"),
            }
    return out


def ausgeschlossen(http: httpx.Client, ids: list[str]) -> set[str]:
    """Welche dieser Wikidata-Kennungen sind Instanz einer Ausschlussklasse?

    Ueber die Hierarchie hinauf (P31/P279*): Equifax ist in Wikidata eine
    "Auskunftei", und erst drei Stufen hoeher eine "Organisation". Die direkte
    Klasse allein hat im ersten Trockenlauf genau solche Firmen durchgelassen.

    Scheitert die Abfrage (Wikidata antwortet bei solchen Pfaden gelegentlich
    mit einem Timeout), wird fuer diesen Teil nur die direkte Klasse geprueft
    - lieber etwas Rauschen als gar keine neuen Themen.
    """
    raus: set[str] = set()
    klassen = " ".join(f"wd:{k}" for k in AUSSCHLUSS_KLASSEN)
    for i in range(0, len(ids), 40):
        teil = ids[i:i + 40]
        werte = " ".join(f"wd:{q}" for q in teil)
        transitiv = (
            f"SELECT DISTINCT ?item WHERE {{ VALUES ?item {{ {werte} }} "
            f"VALUES ?k {{ {klassen} }} ?item wdt:P31/wdt:P279* ?k . }}"
        )
        direkt = (
            f"SELECT DISTINCT ?item WHERE {{ VALUES ?item {{ {werte} }} "
            f"VALUES ?k {{ {klassen} }} ?item wdt:P31 ?k . }}"
        )
        for abfrage in (transitiv, direkt):
            try:
                data = _anfrage(
                    http, "https://query.wikidata.org/sparql",
                    {"query": abfrage, "format": "json"},
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("Wikidata-Abfrage gescheitert (%s), versuche einfacher", exc)
                continue
            for zeile in data.get("results", {}).get("bindings", []):
                raus.add(zeile["item"]["value"].rsplit("/", 1)[-1])
            break
    return raus


def entdecke(
    http: httpx.Client,
    saat: list[Topic],
    bekannt: set[str],
    je_kategorie: int,
    nur_kategorie: str | None = None,
) -> list[Kandidat]:
    """Neue Themen aus dem Linkgraphen der bestehenden, alle in EINER Sprache.

    `bekannt` sind Titel, die schon Thema sind oder schon versucht wurden -
    sie kommen nie wieder vor, egal wie gut sie abschneiden.
    """
    if not saat:
        return []
    sprache = saat[0].language
    kategorie_von: dict[str, str] = {}
    for t in saat:
        kategorie_von.setdefault(t.title, t.category_id)

    log.info("Links holen: %d Themen (%s)", len(kategorie_von), sprache)
    links = links_von(http, sprache, list(kategorie_von))

    im_thema: dict[str, Counter[str]] = defaultdict(Counter)
    ueberall: Counter[str] = Counter()
    for titel, ziele in links.items():
        k = kategorie_von[titel]
        for z in ziele:
            im_thema[k][z] += 1
            ueberall[z] += 1

    bekannt_klein = {b.casefold() for b in bekannt} | {t.casefold() for t in kategorie_von}

    # Vorauswahl ohne eine einzige weitere Anfrage.
    vorauswahl: dict[str, tuple[str, int]] = {}
    for k, zaehler in im_thema.items():
        if nur_kategorie and k != nur_kategorie:
            continue
        passend = [
            (z, c) for z, c in zaehler.items()
            if c >= MIN_TREFFER
            and c / ueberall[z] >= MIN_EIGENANTEIL
            and z.casefold() not in bekannt_klein
            and not TITEL_AUS.search(z)
        ]
        passend.sort(key=lambda x: (-(x[1] * x[1] / ueberall[x[0]]), x[0]))
        # Dreimal so viele wie gebraucht: die Filter unten werfen einen Teil weg.
        for z, c in passend[: je_kategorie * 3]:
            vorauswahl.setdefault(z, (k, c))

    if not vorauswahl:
        return []

    log.info("Nachschlagen: %d Kandidaten", len(vorauswahl))
    info = eigenschaften(http, sprache, list(vorauswahl))
    wd_ids = sorted({i["wikidata"] for i in info.values() if i.get("wikidata")})
    raus = ausgeschlossen(http, wd_ids) if wd_ids else set()

    je: dict[str, list[Kandidat]] = defaultdict(list)
    gesehen: set[str] = set()
    for angefragt, (k, c) in vorauswahl.items():
        i = info.get(angefragt)
        if not i or i["begriffsklaerung"] or i["bytes"] < MIN_BYTES:
            continue
        titel = i["titel"]
        if titel.casefold() in bekannt_klein or titel in gesehen or TITEL_AUS.search(titel):
            continue
        if i.get("wikidata") in raus:
            continue
        gesehen.add(titel)
        je[k].append(Kandidat(k, sprache, titel, c, ueberall[angefragt], i["bytes"]))

    out: list[Kandidat] = []
    for k, liste in je.items():
        liste.sort(key=lambda x: (-x.score, -x.bytes))
        out.extend(liste[:je_kategorie])
    return out


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    parser.add_argument("--sprache", required=True, choices=["de", "en"])
    parser.add_argument("--kategorie")
    parser.add_argument("--top", type=int, default=12)
    args = parser.parse_args()

    from topics import TOPICS  # erst hier: nur der Trockenlauf braucht die Liste direkt

    saat = [t for t in TOPICS if t.language == args.sprache]
    with httpx.Client(timeout=40.0, follow_redirects=True) as http:
        kandidaten = entdecke(http, saat, set(), args.top, args.kategorie)

    je: dict[str, list[Kandidat]] = defaultdict(list)
    for k in kandidaten:
        je[k.category_id].append(k)
    for kat in sorted(je):
        print(f"\n{kat}  ({len(je[kat])})")
        for k in je[kat]:
            print(f"   {k.im_thema:>2}/{k.ueberall:<2}  {k.bytes // 1000:>4} kB   {k.title}")
    print(f"\nzusammen {len(kandidaten)} neue Themen")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
