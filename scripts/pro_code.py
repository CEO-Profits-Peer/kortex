#!/usr/bin/env python3
"""Erzeugt PRO-Codes und legt sie in der Datenbank an.

    python scripts/pro_code.py --tage 30
    python scripts/pro_code.py --tage 7 --anzahl 20 --notiz "Tester September"
    python scripts/pro_code.py --tage 30 --max 100 --bis 2026-12-31 --notiz "Gewinnspiel"

--anzahl  so viele verschiedene Codes (je einmal einloesbar, ausser --max)
--max     wie oft EIN Code eingeloest werden darf (fuer oeffentliche Aktionen)

In der Datenbank landet nur der SHA-256 des normalisierten Codes (0091).
Die Codes selbst erscheinen NUR hier in der Ausgabe - wer sie verliert,
muss neue erzeugen. Braucht SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY aus
pipeline/.env; der Schluessel wird nie ausgegeben.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import secrets
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
# Ohne 0/O und 1/I/L - die verwechselt man beim Abtippen.
ZEICHEN = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def neuer_code() -> str:
    teil = lambda: "".join(secrets.choice(ZEICHEN) for _ in range(4))  # noqa: E731
    return f"ELY-{teil()}-{teil()}"


def hash_von(code: str) -> str:
    norm = re.sub(r"[^A-Za-z0-9]", "", code).upper()
    return hashlib.sha256(norm.encode()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tage", type=int, required=True)
    ap.add_argument("--anzahl", type=int, default=1)
    ap.add_argument("--max", type=int, default=1)
    ap.add_argument("--bis", default=None, help="gueltig bis, z. B. 2026-12-31")
    ap.add_argument("--notiz", default=None)
    a = ap.parse_args()

    load_dotenv(ROOT / "pipeline" / ".env")
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in pipeline/.env")

    codes = [neuer_code() for _ in range(a.anzahl)]
    zeilen = [
        {
            "code_hash": hash_von(c),
            "tage": a.tage,
            "max_einloesungen": a.max,
            "gueltig_bis": f"{a.bis}T23:59:59Z" if a.bis else None,
            "notiz": a.notiz,
        }
        for c in codes
    ]
    r = httpx.post(
        f"{url}/rest/v1/pro_codes",
        json=zeilen,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"},
        timeout=30,
    )
    if r.status_code >= 300:
        sys.exit(f"Anlegen ging nicht: {r.status_code} {r.text[:200]}")

    print(f"{len(codes)} Code(s), je {a.tage} Tage PRO, {a.max}x einloesbar"
          + (f", gueltig bis {a.bis}" if a.bis else ""))
    for c in codes:
        print("  " + c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
