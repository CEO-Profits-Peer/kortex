#!/usr/bin/env python3
"""Prueft die Anmeldung, ohne einen Browser zu oeffnen.

    python pipeline/check_auth.py

Warum es das gibt
-----------------
Gemeldet war ein "Gateway Timeout" auf der Google-Anmeldung, als
Bildschirmfoto. Die Frage dahinter - ist etwas falsch eingestellt oder hat
Supabase gerade gehustet - liess sich damit nicht beantworten, und ein
zweites Bildschirmfoto haette sie auch nicht beantwortet. Drei HTTP-Abrufe
beantworten sie in fuenf Sekunden.

(Die Antwort war damals: Supabase hat gehustet. Die Einstellungen waren in
Ordnung. Genau das wollte man wissen, bevor man an ihnen dreht.)

Es benutzt ausschliesslich den anon-Schluessel aus app/.env - den, der
ohnehin in jedem ausgelieferten Bundle steht. Kein service_role, keine
Geheimnisse, nichts wird veraendert.

Was es NICHT kann: den Mailversand pruefen
-------------------------------------------
Das waere der wichtigste Punkt und geht leider nicht. GoTrue antwortet auf
eine Anfrage zu einer unbekannten Adresse mit HTTP 200 und leerem Koerper,
ohne SMTP ueberhaupt anzufassen - das ist Absicht, damit niemand
durchprobieren kann, welche Adressen ein Konto haben. Nachgeprueft:

    POST /auth/v1/recover  {"email": "...@example.com"}  ->  200  {}

Eine echte Mail entsteht nur fuer ein echtes Konto, und die schickt man
nicht zum Testen an Fremde. Der Mailversand bleibt damit das eine Stueck,
das ein Mensch von Hand pruefen muss: in der App eine Adresse eintragen und
nachsehen, ob die Mail ankommt.
"""

from __future__ import annotations

import pathlib
import sys
import time
import urllib.parse

import httpx

#: Wohin die App nach dem Anmelden zurueckkehrt. Jede dieser Adressen muss
#: in Supabase unter Authentication -> URL Configuration -> Redirect URLs
#: stehen. Steht sie nicht dort, lehnt Supabase sie NICHT ab - es nimmt
#: stillschweigend die Site URL, und der Nutzer landet woanders.
ERWARTETE_RUECKKEHR = [
    "https://elycic.pages.dev/**",
    "http://localhost:8081/**",
    "elycic://**",
]


def env(pfad: pathlib.Path) -> dict[str, str]:
    werte = {}
    for zeile in pfad.read_text(encoding="utf-8").splitlines():
        if "=" in zeile and not zeile.strip().startswith("#"):
            k, v = zeile.split("=", 1)
            werte[k.strip()] = v.strip()
    return werte


def main() -> int:
    wurzel = pathlib.Path(__file__).resolve().parent.parent
    datei = wurzel / "app" / ".env"
    if not datei.exists():
        print(f"app/.env fehlt ({datei})")
        return 1

    werte = env(datei)
    url = werte.get("EXPO_PUBLIC_SUPABASE_URL", "").rstrip("/")
    anon = werte.get("EXPO_PUBLIC_SUPABASE_ANON_KEY", "")
    if not url or not anon:
        print("EXPO_PUBLIC_SUPABASE_URL oder _ANON_KEY fehlt in app/.env")
        return 1

    print(f"Projekt: {url}\n")
    fehler = 0

    with httpx.Client(timeout=30.0, follow_redirects=False) as http:
        # --- 1. Welche Anmeldearten sind ueberhaupt an? ---------------------
        try:
            r = http.get(f"{url}/auth/v1/settings", headers={"apikey": anon})
        except Exception as exc:  # noqa: BLE001
            print(f"[1] Einstellungen nicht abrufbar: {type(exc).__name__}")
            return 1
        if r.status_code != 200:
            print(f"[1] Einstellungen: HTTP {r.status_code} - {r.text[:150]}")
            return 1

        daten = r.json()
        extern = daten.get("external", {})
        print("[1] Anmeldearten")
        for name in ("email", "google", "anonymous_users"):
            an = bool(extern.get(name))
            print(f"    {'an ' if an else 'AUS'}  {name}")
            if not an:
                fehler += 1
        print(f"    Bestaetigungsmail: "
              f"{'aus (autoconfirm)' if daten.get('mailer_autoconfirm') else 'an'}")

        # --- 2. Fuehrt der Google-Knopf wirklich zu Google? ----------------
        print("\n[2] Google-Weiterleitung")
        ziel = urllib.parse.quote("https://elycic.pages.dev/", safe="")
        pfad = f"{url}/auth/v1/authorize?provider=google&redirect_to={ziel}"
        for versuch in range(3):
            t0 = time.monotonic()
            try:
                r = http.get(pfad, headers={"apikey": anon})
            except Exception as exc:  # noqa: BLE001
                print(f"    Versuch {versuch + 1}: {type(exc).__name__}")
                fehler += 1
                continue
            dauer = time.monotonic() - t0
            ort = r.headers.get("location", "")
            if r.status_code in (301, 302, 303, 307) and "accounts.google.com" in ort:
                frage = urllib.parse.parse_qs(urllib.parse.urlparse(ort).query)
                rueck = frage.get("redirect_uri", ["-"])[0]
                erwartet = f"{url}/auth/v1/callback"
                print(f"    Versuch {versuch + 1}: 302 nach {dauer:.1f}s -> Google")
                if versuch == 0:
                    print(f"      client_id gesetzt: {'client_id' in frage}")
                    print(f"      redirect_uri:      {rueck}")
                    if rueck != erwartet:
                        # Das ist die Adresse, die in der Google Cloud Console
                        # unter "Autorisierte Weiterleitungs-URIs" stehen muss.
                        print(f"      ERWARTET WAERE:    {erwartet}")
                        fehler += 1
            else:
                # Genau hier stand der gemeldete Gateway Timeout. Drei
                # Versuche, weil eine einzelne Stoerung nichts ueber die
                # Einstellungen sagt - drei Fehlschlaege dagegen schon.
                print(f"    Versuch {versuch + 1}: HTTP {r.status_code} nach "
                      f"{dauer:.1f}s  {r.text[:80]}")
                fehler += 1
            time.sleep(1)

    # --- 3. Was nur ein Mensch pruefen kann ---------------------------------
    print("\n[3] Von Hand nachsehen (geht nicht automatisch)")
    print("    Supabase -> Authentication -> URL Configuration")
    print("      Site URL:      https://elycic.pages.dev")
    print("      Redirect URLs: " + "  ".join(ERWARTETE_RUECKKEHR))
    print("    Supabase -> Project Settings -> Authentication -> SMTP")
    print("      Steht 'Enable custom SMTP' AN und sind die Felder leer,")
    print("      geht gar keine Mail raus - auch nicht ueber den eingebauten")
    print("      Versand. Dann entweder ausfuellen (docs/SMTP.md) oder den")
    print("      Schalter zurueck auf aus.")

    print()
    if fehler:
        print(f"{fehler} Punkt(e) brauchen einen Blick.")
        return 1
    print("Anmeldung sieht in Ordnung aus.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
