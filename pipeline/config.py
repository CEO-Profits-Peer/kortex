"""Konfiguration aus pipeline/.env bzw. den GitHub-Actions-Secrets."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")


def _req(key: str) -> str:
    value = os.getenv(key, "").strip()
    if not value:
        raise SystemExit(
            f"{key} fehlt. Lokal: pipeline/.env ausfuellen. "
            f"In CI: Repo -> Settings -> Secrets and variables -> Actions."
        )
    return value


def _int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, "").strip() or default)
    except ValueError:
        return default


def _bool(key: str, default: bool = False) -> bool:
    return (os.getenv(key, "").strip().lower() or str(default).lower()) in {"1", "true", "yes"}


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_key: str
    gemini_api_key: str
    #: Alle Schluessel, der erste ist gemini_api_key. Mehrere Schluessel aus
    #: verschiedenen Google-Projekten sind mehrere Kontingente - siehe
    #: FALLBACK_MODELS in transform/generate.py.
    gemini_api_keys: tuple[str, ...]
    gemini_model: str
    embedding_model: str

    # Sicherheitsnetze. Eine Schleife im Ingest kann sonst ueber Nacht das
    # gesamte Gemini-Kontingent verbrennen.
    max_items_per_run: int
    max_gemini_calls_per_run: int
    dry_run: bool

    languages: tuple[str, ...]
    dedupe_threshold: float
    auto_approve: bool

    @classmethod
    def load(cls) -> "Config":
        return cls(
            supabase_url=_req("SUPABASE_URL"),
            supabase_service_key=_req("SUPABASE_SERVICE_ROLE_KEY"),
            gemini_api_key=_req("GEMINI_API_KEY"),
            gemini_api_keys=_keys(),
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip(),
            embedding_model=os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001").strip(),
            max_items_per_run=_int("MAX_ITEMS_PER_RUN", 250),
            max_gemini_calls_per_run=_int("MAX_GEMINI_CALLS_PER_RUN", 400),
            dry_run=_bool("DRY_RUN"),
            languages=tuple(
                x.strip() for x in os.getenv("INGEST_LANGUAGES", "de,en").split(",") if x.strip()
            ),
            dedupe_threshold=float(os.getenv("DEDUPE_SIMILARITY_THRESHOLD", "0.86")),
            auto_approve=_bool("AUTO_APPROVE"),
        )


def _keys() -> tuple[str, ...]:
    """Alle Gemini-Schluessel, in der Reihenfolge ihrer Benutzung.

    Drei Schreibweisen, weil jede irgendwo natuerlich ist:

        GEMINI_API_KEY        der erste, Pflicht
        GEMINI_API_KEY_2..9   je einer pro Zeile, gut in .env
        GEMINI_API_KEYS       kommagetrennt, gut als GitHub-Secret

    Dubletten fliegen raus: derselbe Schluessel zweimal waere kein
    zweites Kontingent, sondern nur ein zweiter Anlauf auf dasselbe.
    """
    out: list[str] = []
    for name in ["GEMINI_API_KEY"] + [f"GEMINI_API_KEY_{i}" for i in range(2, 10)]:
        v = os.getenv(name, "").strip()
        if v and v not in out:
            out.append(v)
    for v in os.getenv("GEMINI_API_KEYS", "").split(","):
        v = v.strip()
        if v and v not in out:
            out.append(v)
    return tuple(out)


USER_AGENT = (
    "ElyCicBot/0.1 (+https://elycic.app; Lern-App, liest nur offizielle Feeds)"
)
