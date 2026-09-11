"""Feeds abrufen und Artikeltext holen."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import feedparser
import httpx
import trafilatura

from config import USER_AGENT
from db import Source, content_hash

log = logging.getLogger(__name__)

# Unter dieser Laenge lohnt keine Zusammenfassung - meist ein Teaser oder
# eine Fehlerseite.
MIN_ARTICLE_CHARS = 400
MAX_ARTICLE_CHARS = 18_000


@dataclass
class RawItem:
    source: Source
    url: str
    title: str
    published_at: datetime | None
    text: str
    hash: str


def _parse_date(entry) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        value = getattr(entry, key, None)
        if value:
            try:
                return datetime(*value[:6], tzinfo=timezone.utc)
            except (TypeError, ValueError):
                continue
    return None


def fetch_feed(source: Source, limit: int) -> list[RawItem]:
    """Alle Feeds einer Quelle einlesen und die Artikeltexte holen."""
    items: list[RawItem] = []
    headers = {"User-Agent": USER_AGENT}

    with httpx.Client(timeout=20.0, follow_redirects=True, headers=headers) as http:
        for feed_url in source.feed_urls:
            try:
                response = http.get(feed_url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                log.warning("%s: Feed nicht erreichbar (%s)", source.id, exc)
                continue

            parsed = feedparser.parse(response.content)
            for entry in parsed.entries[:limit]:
                url = getattr(entry, "link", "")
                title = (getattr(entry, "title", "") or "").strip()
                if not url or not title:
                    continue

                text = _extract(http, url, entry) if source.may_store_fulltext else ""

                # 'link_only' kommt bewusst ohne Text durch: fuer diese Quellen
                # duerfen wir nur Titel und Link speichern.
                if source.may_store_fulltext and len(text) < MIN_ARTICLE_CHARS:
                    continue

                items.append(
                    RawItem(
                        source=source,
                        url=url,
                        title=title,
                        published_at=_parse_date(entry),
                        text=text[:MAX_ARTICLE_CHARS],
                        hash=content_hash(url, title),
                    )
                )
    return items


def _extract(http: httpx.Client, url: str, entry) -> str:
    """Sauberen Artikeltext holen.

    trafilatura entfernt Werbung, Navigation, Kommentare und Scripts. Wenn der
    Abruf scheitert, faellt es auf den Feed-Inhalt zurueck - der ist kuerzer,
    aber immerhin vom Anbieter selbst so ausgeliefert.
    """
    try:
        response = http.get(url)
        response.raise_for_status()
        text = trafilatura.extract(
            response.text,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
        )
        if text:
            return text.strip()
    except httpx.HTTPError as exc:
        log.debug("%s: Artikel nicht abrufbar (%s)", url, exc)

    for key in ("content", "summary"):
        value = getattr(entry, key, None)
        if isinstance(value, list) and value:
            value = value[0].get("value")
        if isinstance(value, str) and value.strip():
            cleaned = trafilatura.extract(f"<html><body>{value}</body></html>")
            return (cleaned or "").strip()
    return ""
