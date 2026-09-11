#!/usr/bin/env python3
"""Prueft alle Quellen-Feeds, ohne die Datenbank anzufassen.

    python pipeline/check_feeds.py

Warum getrennt vom Ingest: Eine tote Feed-URL ist der wahrscheinlichste
Fehler im ganzen System - Pressestellen bauen ihre Seiten um, ohne jemanden
zu fragen. Das hier laeuft in zwanzig Sekunden und braucht weder Supabase-
noch Gemini-Schluessel.

Die Liste ist absichtlich hier fest verdrahtet und nicht aus der Datenbank
geholt: dieses Skript soll auch dann laufen, wenn die Datenbank streikt.
"""

from __future__ import annotations

import concurrent.futures
import sys

import feedparser
import httpx

from config import USER_AGENT

FEEDS: list[tuple[str, str, str]] = [
    # (Quellen-ID, Sprache, URL) - Stand nach Migration 0019
    # --- Deutsch, frei verwendbar
    ('ots-politik',    'de', 'https://www.ots.at/rss/politik'),
    ('ots-wirtschaft', 'de', 'https://www.ots.at/rss/wirtschaft'),
    ('ots-chronik',    'de', 'https://www.ots.at/rss/chronik'),
    ('eu-kom-de',      'de', 'https://ec.europa.eu/commission/presscorner/api/rss?language=de'),
    ('bundesregierung','de', 'https://www.bundesregierung.de/service/rss/breg-de/1151244/feed.xml'),
    ('esa-de',         'de', 'https://www.esa.int/rssfeed/Germany'),
    ('leibniz',        'de', 'https://www.leibniz-gemeinschaft.de/rss.xml'),
    ('wikinews-de',    'de', 'https://de.wikinews.org/w/index.php?title=Spezial:Letzte_%C3%84nderungen&feed=rss'),
    # --- Englisch, frei verwendbar
    ('nasa',           'en', 'https://www.nasa.gov/news-release/feed/'),
    ('esa',            'en', 'https://www.esa.int/rssfeed/Our_Activities/Space_Science'),
    ('eu-kom-en',      'en', 'https://ec.europa.eu/commission/presscorner/api/rss?language=en'),
    ('cern',           'en', 'https://home.cern/news/feed'),
    ('ista',           'en', 'https://ista.ac.at/en/news/feed/'),
    ('canada-gov',     'en', 'https://api.io.canada.ca/io-server/gc/news/en/v2?format=atom&pick=25'),
    ('wikinews-en',    'en', 'https://en.wikinews.org/w/index.php?title=Special:RecentChanges&feed=rss'),
    ('arxiv-ai',       'en', 'http://export.arxiv.org/rss/cs.AI'),
    ('arxiv-lg',       'en', 'http://export.arxiv.org/rss/cs.LG'),
    ('biorxiv',        'en', 'https://connect.biorxiv.org/biorxiv_xml.php?subject=neuroscience'),
]


def check(entry: tuple[str, str, str]) -> tuple[str, str, int, str]:
    source_id, lang, url = entry
    try:
        with httpx.Client(
            timeout=20.0, follow_redirects=True, headers={'User-Agent': USER_AGENT}
        ) as http:
            r = http.get(url)
            if r.status_code >= 400:
                return (source_id, lang, 0, f'HTTP {r.status_code}')
            parsed = feedparser.parse(r.content)
            n = len(parsed.entries)
            if n == 0:
                return (source_id, lang, 0, 'erreichbar, aber 0 Eintraege')
            titled = sum(1 for e in parsed.entries if getattr(e, 'title', '').strip())
            linked = sum(1 for e in parsed.entries if getattr(e, 'link', '').strip())
            note = 'ok'
            if titled < n:
                note = f'{n - titled} ohne Titel'
            elif linked < n:
                note = f'{n - linked} ohne Link'
            return (source_id, lang, n, note)
    except httpx.HTTPError as exc:
        return (source_id, lang, 0, type(exc).__name__)
    except Exception as exc:  # noqa: BLE001
        return (source_id, lang, 0, f'{type(exc).__name__}: {exc}'[:60])


def main() -> int:
    print(f'Pruefe {len(FEEDS)} Feeds …\n')

    # Parallel, sonst dauert es bei zwanzig Quellen eine Minute.
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(check, FEEDS))

    ok = [r for r in results if r[2] > 0]
    bad = [r for r in results if r[2] == 0]

    for source_id, lang, n, note in sorted(results, key=lambda r: (r[2] == 0, r[0])):
        mark = 'OK  ' if n > 0 else 'TOT '
        print(f'  {mark} {source_id:<14} {lang}  {n:>3} Eintraege   {note}')

    print(f'\n{len(ok)} von {len(FEEDS)} erreichbar, zusammen '
          f'{sum(r[2] for r in results)} Eintraege.')

    if bad:
        print('\nTote Quellen muessen raus oder ersetzt werden:')
        print('  update public.sources set is_active = false where id in (' +
              ', '.join(f"'{r[0].split('-')[0]}'" for r in bad) + ');')
        return 1
    return 0


if __name__ == '__main__':
    sys.path.insert(0, __file__.rsplit('\\', 1)[0].rsplit('/', 1)[0])
    raise SystemExit(main())
