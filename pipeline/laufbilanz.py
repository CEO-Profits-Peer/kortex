"""Laufbilanz: jeder Pipeline-Lauf schreibt mit, was er geschafft hat.

Die Schlussbilanz stand bisher nur im Protokoll von GitHub Actions - lesbar
nur mit Anmeldung. Am 2026-09-13 hiess das: 22 statt rund 150 Karten, und
die Ursache liess sich von aussen nur raten. Jetzt landet dieselbe Bilanz in
der Tabelle pipeline_runs (Migration 0074) und ist im Kontrollzentrum zu
sehen.

Benutzung in einem Skript:

    bilanz = Laufbilanz(cfg, "ingest", dry)      # legt die Zeile an
    bilanz.beobachte(stats=stats, gen=gen)       # Referenzen, keine Kopien
    ...
    bilanz.stopp = "zeit"                        # an jeder Abbruchstelle
    ...
    bilanz.karten = written

    if __name__ == "__main__":
        hauptprogramm(main)                      # schliesst die Zeile - auch bei Absturz

Drei Regeln, die hier eingebaut sind:

  1. Die Bilanz darf den Lauf nie kippen. Fehlt die Tabelle (0074 noch nicht
     eingespielt) oder antwortet Supabase nicht, gibt es eine Warnung und
     sonst nichts. Ein Messinstrument, das die Messung verhindert, ist
     schlimmer als keins.
  2. `stats` und `gen` werden als Referenz gehalten, nicht kopiert. Stirbt
     der Lauf mitten drin, schreibt die Bilanz trotzdem den letzten Stand -
     genau dann ist er am meisten wert.
  3. Die Zeile wird am ANFANG angelegt. Wird der Prozess hart beendet (ein
     Abschuss ohne Signal), bleibt sie auf 'laeuft' stehen, und das
     Kontrollzentrum zeigt sie als abgebrochen. Eine Zeile erst am Ende
     anzulegen hiesse, dass genau die schlimmsten Laeufe unsichtbar sind.
"""

from __future__ import annotations

import logging
import os
import signal
import traceback
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from typing import Any

import httpx

from config import USER_AGENT, Config

log = logging.getLogger("laufbilanz")

#: Die gerade offene Bilanz, damit hauptprogramm() sie auch nach einem
#: Absturz findet. Ein Skript hat hoechstens eine.
_offen: "Laufbilanz | None" = None


class Laufbilanz:
    def __init__(self, cfg: Config, skript: str, trocken: bool) -> None:
        global _offen
        self.skript = skript
        self.trocken = trocken
        #: Warum der Lauf aufgehoert hat. None heisst am Ende: alles abgearbeitet.
        self.stopp: str | None = None
        self.fehler: str | None = None
        #: Geschriebene Karten. None heisst: nicht gemeldet, dann zaehlt 'accepted'.
        self.karten: int | None = None
        #: Weitere Zahlen, die nicht in `stats` stehen.
        self.extra: dict[str, Any] = {}
        self._stats: Mapping[str, int] = {}
        self._gen: Any = None
        self._id: int | None = None
        self._http = httpx.Client(
            base_url=f"{cfg.supabase_url.rstrip('/')}/rest/v1",
            headers={
                "apikey": cfg.supabase_service_key,
                "Authorization": f"Bearer {cfg.supabase_service_key}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            timeout=15.0,
        )
        _offen = self
        self._anlegen()

    def beobachte(self, *, stats: Mapping[str, int] | None = None, gen: Any = None) -> None:
        if stats is not None:
            self._stats = stats
        if gen is not None:
            self._gen = gen

    def _anlegen(self) -> None:
        run_id = os.getenv("GITHUB_RUN_ID", "").strip()
        zeile = {
            "skript": self.skript,
            # LAUF_AUSLOESER setzt ingest.yml: 'zeitplan', wenn der Cloudflare
            # Worker angestossen hat - fuer GitHub ist das sonst nur ein
            # workflow_dispatch, nicht zu unterscheiden von einem Start von Hand.
            "ausloeser": (os.getenv("LAUF_AUSLOESER", "").strip()
                          or os.getenv("GITHUB_EVENT_NAME", "").strip() or "lokal"),
            "github_run_id": int(run_id) if run_id.isdigit() else None,
            "trockenlauf": self.trocken,
        }
        try:
            r = self._http.post("/pipeline_runs", json=zeile,
                                headers={"Prefer": "return=representation"})
        except httpx.HTTPError as exc:
            log.warning("Laufbilanz nicht angelegt (%s) - der Lauf geht weiter.", type(exc).__name__)
            return
        if r.status_code >= 400:
            # 404: Tabelle fehlt (0074). 400: meist eine Pruefregel - etwa ein
            # Skript, das die Tabelle noch nicht kennt (kurse vor 0075). Die
            # erste Fassung sagte bei beidem "0074 eingespielt?" und schickte
            # damit bei 400 an die falsche Stelle. Deshalb der Antworttext.
            log.warning("Laufbilanz nicht angelegt (HTTP %d: %s) - der Lauf geht weiter.",
                        r.status_code, " ".join(r.text.split())[:160])
            return
        try:
            self._id = int(r.json()[0]["id"])
        except (ValueError, KeyError, IndexError, TypeError):
            log.warning("Laufbilanz: unerwartete Antwort beim Anlegen.")

    def schliessen(self, *, code: int | None = None, exc: BaseException | None = None) -> None:
        global _offen
        if _offen is self:
            _offen = None
        try:
            if self._id is None:
                return
            self._schreiben(code, exc)
        finally:
            self._http.close()

    def _schreiben(self, code: int | None, exc: BaseException | None) -> None:
        gen = self._gen
        stopp = self.stopp
        fehler = self.fehler

        if isinstance(exc, (KeyboardInterrupt,)) or (
            isinstance(exc, SystemExit) and exc.code == 143
        ):
            status, stopp = "fehler", "abgeschossen"
        elif exc is not None:
            status = "fehler"
            stopp = stopp or "absturz"
            fehler = fehler or "".join(traceback.format_exception_only(type(exc), exc)).strip()
        elif code:
            status = "fehler"
            stopp = stopp or "fehler"
            fehler = fehler or (getattr(gen, "first_error", None) if gen is not None else None)
        else:
            status = "fertig"
            stopp = stopp or "durch"

        zahlen: dict[str, Any] = {k: int(v) for k, v in dict(self._stats).items()}
        zahlen.update(self.extra)
        if gen is not None and getattr(gen, "first_error", None):
            # Auch bei einem gruenen Lauf: ein erster Fehler, auf den ein
            # Ausweichmodell folgte, ist die Spur zu "warum so wenig".
            zahlen["erster_fehler"] = str(gen.first_error)[:300]

        karten = self.karten if self.karten is not None else int(self._stats.get("accepted", 0))
        patch = {
            "beendet_at": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "stopp": stopp,
            "karten": karten,
            "gemini_aufrufe": int(getattr(gen, "calls", 0) or 0),
            "wiederholungen": int(getattr(gen, "retries", 0) or 0),
            "modell": getattr(gen, "model", None) if gen is not None else None,
            "schluessel": (int(gen.key_index) + 1) if gen is not None and hasattr(gen, "key_index") else None,
            "zahlen": zahlen,
            "fehler": fehler[:1000] if fehler else None,
        }
        try:
            r = self._http.patch("/pipeline_runs", params={"id": f"eq.{self._id}"}, json=patch,
                                 headers={"Prefer": "return=minimal"})
            if r.status_code >= 400:
                log.warning("Laufbilanz nicht abgeschlossen (HTTP %d): %s", r.status_code, r.text[:200])
            else:
                log.info("Laufbilanz geschrieben: %s, %s, %d Karten.", status, stopp, karten)
        except httpx.HTTPError as exc2:
            log.warning("Laufbilanz nicht abgeschlossen (%s).", type(exc2).__name__)


def _auf_sigterm(_signum: int, _frame: object) -> None:
    # Ein Abschuss durch das Zeitlimit des Workflows kommt als SIGTERM. Ohne
    # Handler endet Python sofort und die Bilanz bliebe auf 'laeuft'. Als
    # SystemExit(143) laeuft er durch hauptprogramm() und wird geschrieben.
    raise SystemExit(143)


def hauptprogramm(main: Callable[[], int]) -> None:
    """main() ausfuehren und die offene Bilanz in JEDEM Fall schliessen."""
    try:
        signal.signal(signal.SIGTERM, _auf_sigterm)
    except (ValueError, AttributeError, OSError):
        pass  # nicht im Hauptthread oder Plattform ohne SIGTERM

    try:
        code = main()
    except SystemExit as exc:
        if _offen is not None:
            if exc.code in (0, None):
                _offen.schliessen(code=0)
            else:
                _offen.schliessen(exc=exc)
        raise
    except BaseException as exc:
        if _offen is not None:
            _offen.schliessen(exc=exc)
        raise
    if _offen is not None:
        _offen.schliessen(code=code)
    raise SystemExit(code)
