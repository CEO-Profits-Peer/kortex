"""Supabase-Zugriff ueber PostgREST, direkt per HTTP.

Warum nicht die supabase-py Bibliothek: die zieht einen ganzen Baum an
Abhaengigkeiten mit (Auth-Client, Realtime, Storage, WebSockets), von denen
wir nichts brauchen - wir haben einen statischen service_role Key und machen
keinen Login-Flow. Genau dieser Baum ist unter Python 3.14 auseinander-
gefallen (`No module named 'supabase_auth.http_clients'`).

PostgREST ist eine normale REST-Schnittstelle. httpx reicht, ist stabil, und
es gibt nichts mehr, das versionsmaessig kollidieren kann.

Der service_role Key umgeht jede RLS-Regel. Deshalb laeuft er ausschliesslich
hier - niemals in der App, niemals im Browser.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from config import USER_AGENT, Config

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Source:
    id: str
    handle: str
    display_name: str
    license_class: str          # owned | cc | press_free | link_only
    license_name: str | None
    feed_urls: list[str]
    default_category_id: str | None
    default_language: str
    default_region_code: str | None
    trust_score: int

    @property
    def may_store_fulltext(self) -> bool:
        """Die zentrale Regel aus docs/CONTENT-SOURCING.md.

        Bei 'link_only' duerfen wir NUR Titel und Link speichern - keine
        Zusammenfassung, kein Quiz. Das steht hier im Code und nicht in einem
        Merkblatt, damit es nicht vergessen werden kann.
        """
        return self.license_class in {"owned", "cc", "press_free"}


class Database:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.http = httpx.Client(
            base_url=f"{cfg.supabase_url.rstrip('/')}/rest/v1",
            headers={
                "apikey": cfg.supabase_service_key,
                "Authorization": f"Bearer {cfg.supabase_service_key}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            timeout=30.0,
        )

    def close(self) -> None:
        self.http.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # --- Lesen ---------------------------------------------------------------

    def _get(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        response = self.http.get(path, params=params)
        if response.status_code >= 400:
            raise RuntimeError(f"{path}: {response.status_code} {response.text[:300]}")
        return response.json()

    def fetchable_sources(self) -> list[Source]:
        langs = ",".join(self.cfg.languages)
        rows = self._get(
            "/sources",
            {
                "select": "*",
                "is_active": "eq.true",
                "default_language": f"in.({langs})",
            },
        )
        out: list[Source] = []
        for row in rows:
            feeds = row.get("feed_urls") or []
            if not feeds:
                continue
            out.append(
                Source(
                    id=row["id"],
                    handle=row["handle"],
                    display_name=row["display_name"],
                    license_class=row["license_class"],
                    license_name=row.get("license_name"),
                    feed_urls=feeds,
                    default_category_id=row.get("default_category_id"),
                    default_language=row.get("default_language") or "de",
                    default_region_code=row.get("default_region_code"),
                    trust_score=row.get("trust_score") or 50,
                )
            )
        return out

    def categories(self) -> list[dict[str, Any]]:
        return self._get(
            "/categories", {"select": "id,slug,kind,parent_id", "is_active": "eq.true"}
        )

    def known_hashes(self, hashes: list[str]) -> set[str]:
        """Welche Inhalte kennen wir schon? Jeder Treffer spart einen
        Gemini-Aufruf, und die sind das eigentliche Budget."""
        found: set[str] = set()
        for i in range(0, len(hashes), 100):
            chunk = ",".join(hashes[i : i + 100])
            rows = self._get(
                "/content_items", {"select": "content_hash", "content_hash": f"in.({chunk})"}
            )
            found.update(r["content_hash"] for r in rows if r.get("content_hash"))
        return found

    # --- Schreiben -----------------------------------------------------------

    def insert_items(self, items: list[dict[str, Any]]) -> int:
        """Einfuegen, Duplikate still ignorieren.

        Braucht den vollen Unique-Index aus Migration 0009 - mit dem
        vorherigen partiellen Index kann PostgREST kein ON CONFLICT bilden.
        """
        if not items:
            return 0
        response = self.http.post(
            "/content_items",
            params={"on_conflict": "content_hash"},
            headers={"Prefer": "resolution=ignore-duplicates,return=representation"},
            json=items,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Insert fehlgeschlagen: {response.status_code} {response.text[:500]}")
        return len(response.json())

    def mark_fetched(self, source_id: str, error: str | None = None) -> None:
        self.http.patch(
            "/sources",
            params={"id": f"eq.{source_id}"},
            headers={"Prefer": "return=minimal"},
            json={
                "last_fetched_at": datetime.now(timezone.utc).isoformat(),
                "last_error": error,
            },
        )


def content_hash(url: str, title: str) -> str:
    """Stabiler Fingerabdruck. URL ohne Query-Teil, damit Tracking-Parameter
    nicht dieselbe Meldung zweimal durchlassen."""
    base = (url.split("?")[0].rstrip("/") or title).strip().lower()
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:40]
