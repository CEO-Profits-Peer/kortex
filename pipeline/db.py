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

    def source_by_id(self, source_id: str) -> Source | None:
        """Eine Quelle direkt holen, auch ohne Feed-Adresse.

        fetchable_sources() ueberspringt alles ohne Feed - richtig fuer
        den Nachrichtenlauf, falsch fuer Evergreen: Wikipedia hat keinen
        Feed und soll trotzdem Quelle sein. Die Themenliste ersetzt dort
        den Feed.
        """
        rows = self._get("/sources", {"select": "*", "id": f"eq.{source_id}", "limit": "1"})
        if not rows:
            return None
        row = rows[0]
        return Source(
            id=row["id"],
            handle=row["handle"],
            display_name=row["display_name"],
            license_class=row["license_class"],
            license_name=row.get("license_name"),
            feed_urls=row.get("feed_urls") or [],
            default_category_id=row.get("default_category_id"),
            default_language=row.get("default_language") or "de",
            default_region_code=row.get("default_region_code"),
            trust_score=row.get("trust_score") or 50,
        )

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

    def similar_to(self, embedding: list[float], threshold: float) -> dict[str, Any] | None:
        """Gibt es schon eine Karte, die dasselbe erzaehlt?

        Der content_hash faengt nur denselben ARTIKEL. Zwei Meldungen ueber
        denselben Satellitenstart haben verschiedene Hashes und ergaben
        bisher zwei Karten - siehe Migration 0046.

        Ein Fehlschlag hier darf den Lauf nicht anhalten: lieber eine
        Dublette zu viel als eine Karte zu wenig.
        """
        try:
            response = self.http.post(
                "/rpc/find_similar_content",
                json={"p_embedding": embedding, "p_min_similarity": threshold},
            )
            if response.status_code >= 400:
                return None
            rows = response.json()
            return rows[0] if rows else None
        except Exception:  # noqa: BLE001 - Netz, Timeout, alles
            return None

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

    def text_cards(self, limit: int, language: str | None = None) -> list[dict[str, Any]]:
        """Freigegebene Karten OHNE Drehbuch - die Arbeitsliste zum Nachruesten.

        Aelteste zuerst. Sie sind am laengsten im Feed und hatten die
        schlechtesten Chancen: zur Zeit ihrer Entstehung gab es vier
        Bildarten, keine sieben.
        """
        params = {
            "select": "id,title,language,primary_category_id,primary_source_id,source_urls",
            "presentation_mode": "eq.text",
            "status": "eq.approved",
            "order": "created_at.asc",
            "limit": str(limit),
        }
        if language:
            params["language"] = f"eq.{language}"
        return self._get("/content_items", params)

    def card_counts(self) -> dict[tuple[str, str], int]:
        """Wie viele freigegebene Karten hat jede Kategorie je Sprache?

        Grundlage fuer die Reihenfolge der Themenliste (siehe
        topics.order_by_scarcity). Geholt werden nur zwei Spalten, das sind
        bei zweihundert Karten wenige Kilobyte. Die Alternative waere eine
        Zaehlung je Kategorie ueber `count=exact` - also fuenfundvierzig
        Anfragen fuer eine Zahl, die in einer Antwort Platz hat.

        Seitenweise, weil PostgREST bei tausend Zeilen abschneidet und ein
        stilles Abschneiden hier die schlimmste Form von falsch waere: die
        Liste sieht vollstaendig aus und ist es nicht.
        """
        counts: dict[tuple[str, str], int] = {}
        page = 0
        while True:
            rows = self._get(
                "/content_items",
                {
                    "select": "primary_category_id,language",
                    "status": "eq.approved",
                    "order": "id.asc",
                    "limit": "1000",
                    "offset": str(page * 1000),
                },
            )
            for row in rows:
                key = (row.get("primary_category_id") or "", row.get("language") or "")
                counts[key] = counts.get(key, 0) + 1
            if len(rows) < 1000:
                return counts
            page += 1

    def presentation_counts(self) -> tuple[int, int]:
        """(freigegebene Karten, davon Erklaerkarten).

        Ueber den Kopf `content-range` statt ueber die Zeilen: die Zahl
        interessiert, nicht der Inhalt, und 147 Karten zu holen, um sie zu
        zaehlen, waere Unsinn.
        """

        def count(**extra: str) -> int:
            response = self.http.get(
                "/content_items",
                params={"select": "id", "status": "eq.approved", **extra},
                headers={"Prefer": "count=exact", "Range": "0-0"},
            )
            return int(response.headers["content-range"].split("/")[-1])

        return count(), count(presentation_mode="eq.kinetic")

    def attach_script(self, item_id: str, script: dict[str, Any]) -> None:
        """Aus einer Textkarte eine Erklaerkarte machen.

        Beide Spalten in EINEM Aufruf, nicht nacheinander: die Bedingung aus
        Migration 0027 verlangt, dass presentation_mode='kinetic' und ein
        vorhandenes Drehbuch immer zusammen auftreten. Zwei getrennte
        Aenderungen wuerde die Datenbank je einzeln ablehnen.
        """
        response = self.http.patch(
            "/content_items",
            params={"id": f"eq.{item_id}"},
            headers={"Prefer": "return=minimal"},
            json={"presentation_mode": "kinetic", "kinetic_script": script},
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Nachruesten fehlgeschlagen: {response.status_code} {response.text[:300]}"
            )

    def detach_script(self, item_id: str) -> None:
        """Zurueck zur Textkarte. Das Drehbuch ist danach weg."""
        response = self.http.patch(
            "/content_items",
            params={"id": f"eq.{item_id}"},
            headers={"Prefer": "return=minimal"},
            json={"presentation_mode": "text", "kinetic_script": None},
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Zuruecknehmen fehlgeschlagen: {response.status_code} {response.text[:300]}"
            )

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
