#!/usr/bin/env python3
"""Verschickt, was in der notifications-Tabelle liegt.

    python pipeline/push.py
    python pipeline/push.py --dry-run
    python pipeline/push.py --limit 50

Dies ist NICHT mehr der Hauptweg. Seit 0053 stoesst eine neue Zeile in
`notifications` eine Edge Function an, die in Sekunden zustellt.

Dieses Skript ist das Auffangnetz und laeuft im GitHub-Workflow alle drei
Stunden: was der Sofortweg verpasst hat - Funktion gerade nicht
erreichbar, Push-Dienst kurz weg, VAPID-Secrets dort noch nicht gesetzt -
geht hier nachtraeglich raus. Beide Wege beachten `sent_at`, also kann
niemand dieselbe Meldung zweimal bekommen.

Braucht drei Werte in pipeline/.env:

    VAPID_PUBLIC_KEY     derselbe wie in app/.env
    VAPID_PRIVATE_KEY    nur hier, nie im Bundle
    VAPID_SUBJECT        mailto:... - die Push-Dienste verlangen eine
                         Kontaktmoeglichkeit und sperren sonst irgendwann

Das Schluesselpaar gehoert zusammen. Ein neues zu erzeugen macht ALLE
bestehenden Anmeldungen ungueltig - die Geraete haben den oeffentlichen
Teil gespeichert und nehmen nur Nachrichten an, die dazu passen.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from collections import Counter
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).parent))

from config import Config  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("push")

#: Nach so vielen Fehlschlaegen in Folge fliegt eine Anmeldung raus.
#:
#: Nicht beim ersten: ein Push-Dienst kann kurz nicht erreichbar sein, und
#: dann waere jede Anmeldung nach einer Stoerung geloescht. Bei 404/410
#: wird sofort geloescht - das sind endgueltige Antworten.
MAX_FAILS = 5


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="nichts schicken, nichts aendern")
    parser.add_argument("--limit", type=int, default=200, help="hoechstens so viele")
    args = parser.parse_args()

    cfg = Config.load()
    private = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    subject = os.getenv("VAPID_SUBJECT", "").strip()
    if not private or not subject:
        log.error(
            "VAPID_PRIVATE_KEY oder VAPID_SUBJECT fehlt in pipeline/.env.\n"
            "  Ohne die beiden kann nichts verschickt werden - die Nachrichten\n"
            "  bleiben in der Tabelle liegen und gehen nicht verloren."
        )
        return 1

    # pywebpush erst hier importieren: fehlt die Bibliothek, soll die
    # Meldung sagen, was zu tun ist, statt beim Programmstart abzustuerzen.
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        log.error("pywebpush fehlt:  pip install -r pipeline/requirements.txt")
        return 1

    rest = f"{cfg.supabase_url.rstrip('/')}/rest/v1"
    headers = {
        "apikey": cfg.supabase_service_key,
        "Authorization": f"Bearer {cfg.supabase_service_key}",
        "Content-Type": "application/json",
    }
    stats: Counter[str] = Counter()

    with httpx.Client(timeout=30.0, headers=headers) as http:
        # 0104: Streak-Erinnerungen anlegen, bevor verschickt wird. Die
        # Funktion waehlt selbst, wer gerade Abend hat - hier nur anstossen.
        # Scheitert es (alte Datenbank), laeuft der Versand trotzdem.
        if not args.dry_run:
            # 0105: sonntags der Wochenrueckblick, gleiche Logik.
            try:
                r = http.post(f"{rest}/rpc/wochenrueckblick_erinnerungen", json={})
                r.raise_for_status()
                log.info("Rueckblick-Erinnerungen angelegt: %s", r.json())
            except httpx.HTTPStatusError as exc:
                log.warning("Rueckblick-Erinnerungen nicht angelegt: HTTP %s %s",
                            exc.response.status_code, exc.response.text[:200])
            except httpx.HTTPError as exc:
                log.warning("Rueckblick-Erinnerungen nicht angelegt: %s: %s", type(exc).__name__, exc)
            try:
                r = http.post(f"{rest}/rpc/streak_erinnerungen", json={})
                r.raise_for_status()
                log.info("Streak-Erinnerungen angelegt: %s", r.json())
            except httpx.HTTPStatusError as exc:
                # Status und Anfang der Antwort: "404" heisst Funktion fehlt,
                # "401" Schluessel falsch - der blosse Klassenname sagt das nicht.
                log.warning("Streak-Erinnerungen nicht angelegt: HTTP %s %s",
                            exc.response.status_code, exc.response.text[:200])
            except httpx.HTTPError as exc:
                log.warning("Streak-Erinnerungen nicht angelegt: %s: %s", type(exc).__name__, exc)

        pending = http.get(
            f"{rest}/notifications",
            params={
                "select": "id,user_id,kind,title,body,url",
                "sent_at": "is.null",
                "order": "created_at.asc",
                "limit": str(args.limit),
            },
        ).json()

        if not pending:
            log.info("Nichts zu verschicken.")
            return 0

        # Alle Anmeldungen der betroffenen Personen auf einmal holen. Eine
        # Abfrage pro Nachricht waeren bei 200 Nachrichten 200 Abfragen.
        user_ids = sorted({n["user_id"] for n in pending})
        subs_rows = http.get(
            f"{rest}/push_subscriptions",
            params={
                "select": "id,user_id,endpoint,p256dh,auth,fail_count",
                "user_id": f"in.({','.join(user_ids)})",
            },
        ).json()
        subs: dict[str, list[dict]] = {}
        for s in subs_rows:
            subs.setdefault(s["user_id"], []).append(s)

        log.info(
            "%d Nachrichten · %d Personen · %d Geraete · %s",
            len(pending), len(user_ids), len(subs_rows),
            "TROCKENLAUF" if args.dry_run else "schickend",
        )

        sent_ids: list[str] = []
        drop_ids: list[str] = []
        bump: list[dict] = []

        for note in pending:
            targets = subs.get(note["user_id"], [])
            if not targets:
                # Kein Geraet angemeldet. Die Nachricht trotzdem als
                # erledigt markieren: sie ist in der App unter der Glocke
                # zu sehen, und ein Stapel, der nie abgearbeitet wird,
                # waechst bei jedem Lauf weiter.
                stats["ohne_geraet"] += 1
                sent_ids.append(note["id"])
                continue

            payload = json.dumps({
                "title": note["title"],
                "body": note["body"],
                "url": note.get("url") or "/",
                "kind": note["kind"],
            })
            delivered = False

            for sub in targets:
                if args.dry_run:
                    delivered = True
                    stats["waere_geschickt"] += 1
                    continue
                try:
                    webpush(
                        subscription_info={
                            "endpoint": sub["endpoint"],
                            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                        },
                        data=payload,
                        vapid_private_key=private,
                        vapid_claims={"sub": subject},
                        timeout=15,
                    )
                    delivered = True
                    stats["zugestellt"] += 1
                except WebPushException as exc:
                    code = getattr(exc.response, "status_code", None)
                    if code in (404, 410):
                        # Endgueltig: die Anmeldung existiert nicht mehr.
                        # Kein Grund, es morgen nochmal zu versuchen.
                        drop_ids.append(sub["id"])
                        stats["geraet_weg"] += 1
                    else:
                        bump.append(sub)
                        stats["fehlgeschlagen"] += 1
                        log.warning("Zustellung fehlgeschlagen (%s): %s", code, str(exc)[:120])

            if delivered:
                sent_ids.append(note["id"])

        if args.dry_run:
            log.info("Trockenlauf - nichts geaendert.")
        else:
            if sent_ids:
                http.patch(
                    f"{rest}/notifications",
                    params={"id": f"in.({','.join(sent_ids)})"},
                    headers={**headers, "Prefer": "return=minimal"},
                    json={"sent_at": "now()"},
                )
            for sub in bump:
                n = sub["fail_count"] + 1
                if n >= MAX_FAILS:
                    drop_ids.append(sub["id"])
                else:
                    http.patch(
                        f"{rest}/push_subscriptions",
                        params={"id": f"eq.{sub['id']}"},
                        headers={**headers, "Prefer": "return=minimal"},
                        json={"fail_count": n},
                    )
            if drop_ids:
                http.delete(
                    f"{rest}/push_subscriptions",
                    params={"id": f"in.({','.join(drop_ids)})"},
                    headers={**headers, "Prefer": "return=minimal"},
                )

    log.info("Fertig.")
    for label in ("zugestellt", "waere_geschickt", "ohne_geraet", "fehlgeschlagen", "geraet_weg"):
        if stats[label]:
            log.info("  %-18s %d", label, stats[label])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
