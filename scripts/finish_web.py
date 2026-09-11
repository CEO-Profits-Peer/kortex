#!/usr/bin/env python3
"""Ergaenzt den Web-Build um alles, was ihn zur PWA macht.

Laeuft automatisch als Teil von `npm run build:web`.

WARUM ALS NACHBEARBEITUNG:
Expo Router bietet dafuer eigentlich `app/+html.tsx` an - das greift aber nur
beim statischen Rendering (output: "static"). Unsere App laeuft als
Single-Page-App (output: "single"), weil sie hinter einem Login sitzt und es
nichts zu prerendern gibt. In diesem Modus erzeugt Expo eine feste
index.html-Vorlage und ignoriert +html.tsx.

Getestet statt vermutet: mit geleertem Cache zweimal gebaut, die Datei wird
nicht eingebunden.

Eine index.html, ein Einfuegepunkt, nachpruefbares Ergebnis - das ist
robuster, als das Framework zu etwas zu ueberreden.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
INDEX = DIST / "index.html"

TITLE = "ElyCic"
DESCRIPTION = "Kurze Grids. Echte Fragen. Und in drei Tagen fragen wir nochmal."
BG = "#0B0C0E"

HEAD = f"""
    <meta name="description" content="{DESCRIPTION}" />

    <!-- PWA: macht aus dem Link eine App auf dem Startbildschirm -->
    <link rel="manifest" href="/manifest.json" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="{TITLE}" />
    <link rel="apple-touch-icon" href="/icons/pwa-192.png" />
    <link rel="icon" type="image/png" href="/icons/favicon.png" />

    <!-- Vorschau beim Teilen in WhatsApp, Discord, iMessage -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{TITLE}" />
    <meta property="og:description" content="{DESCRIPTION}" />
    <meta property="og:image" content="/icons/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />

    <style>
      body {{
        margin: 0;
        background-color: {BG};
        overscroll-behavior: none;
        -webkit-tap-highlight-color: transparent;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }}
      /* Eine App markiert keinen Text beim langen Druecken. */
      * {{ -webkit-user-select: none; user-select: none; }}
      input, textarea {{ -webkit-user-select: text; user-select: text; }}

      /*
       * Nie mehr als eine Karte pro Wischer.
       *
       * `scroll-snap-type: y mandatory` sorgt dafuer, dass IMMER an einem
       * Rastpunkt gestoppt wird - aber nicht am naechsten. Ein kraeftiger
       * Wischer fliegt ueber zwei, drei Karten hinweg und rastet erst dort
       * ein. Fuer einen Feed ist das falsch: man ueberspringt Inhalt, den
       * man nie gesehen hat.
       *
       * `scroll-snap-stop: always` zwingt den Browser, an JEDEM Rastpunkt
       * anzuhalten. Egal wie schnell gewischt wird, es geht genau eine
       * Karte weiter.
       *
       * Warum die Regel auf `*` steht statt auf einer Klasse: die Klassen
       * der Feed-Zellen erzeugt react-native-web selbst (r-cpa5s6 und
       * dergleichen) und sichert sie nicht zu - beim naechsten
       * Versionssprung heissen sie anders und die Regel waere still
       * wirkungslos.
       *
       * Breit ist das trotzdem nicht: `scroll-snap-stop` gilt
       * ausschliesslich fuer Elemente, die ueberhaupt Rastpunkte sind, also
       * solche mit `scroll-snap-align`. Auf allem anderen tut die
       * Eigenschaft nichts.
       */
      * {{ scroll-snap-stop: always; }}
    </style>
"""

# viewport-fit=cover: bis unter die Notch zeichnen. user-scalable=no: kein
# versehentliches Zoomen beim Doppeltippen auf eine Antwortoption.
VIEWPORT_OLD = '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />'
VIEWPORT_NEW = (
    '<meta name="viewport" content="width=device-width, initial-scale=1, '
    'maximum-scale=1, viewport-fit=cover, user-scalable=no" />'
)


SW_REGISTER = "\n".join([
    "    <script>",
    "      // Erst nach dem Laden anmelden: die Registrierung soll nicht mit",
    "      // dem ersten Bildaufbau um Bandbreite streiten.",
    "      if ('serviceWorker' in navigator) {",
    "        window.addEventListener(\'load\', function () {",
    "          navigator.serviceWorker.register(\'./sw.js\').catch(function () {});",
    "        });",
    "      }",
    "    </script>",
    "",
])

SW_TEMPLATE = ROOT / "scripts" / "sw.template.js"
SW_OUT_NAME = "sw.js"


def add_service_worker(html: str) -> str:
    """dist/sw.js aus der Vorlage erzeugen und in index.html anmelden.

    Warum ueberhaupt - siehe scripts/sw.template.js. Kurz: ohne Service
    Worker bietet Chrome das Installieren nicht an, und der Knopf "Als App
    benutzen" bliebe auf Android unsichtbar.

    Die Version kommt aus dem Dateinamen des Bundles. Das ist kein Zufall:
    der Name enthaelt einen Hash des Inhalts, also bekommt jede tatsaechlich
    geaenderte Auslieferung einen neuen Cache und raeumt den alten weg.
    """
    if not SW_TEMPLATE.exists():
        print("WARNUNG: scripts/sw.template.js fehlt - kein Service Worker.")
        return html

    entries = sorted((DIST / "_expo" / "static" / "js" / "web").glob("entry-*.js"))
    entry = entries[0] if entries else None
    version = entry.stem.replace("entry-", "")[:12] if entry else "dev"

    shell = ["./", "manifest.json", "icons/pwa-192.png", "icons/pwa-512.png"]
    if entry:
        shell.append("_expo/static/js/web/" + entry.name)

    worker = SW_TEMPLATE.read_text(encoding="utf-8")
    worker = worker.replace("__VERSION__", version)
    worker = worker.replace("__SHELL__", json.dumps(shell, indent=2))
    (DIST / SW_OUT_NAME).write_text(worker, encoding="utf-8")

    return html.replace("</body>", SW_REGISTER + "  </body>", 1)


def main() -> int:
    if not INDEX.exists():
        sys.exit(f"{INDEX} fehlt. Erst `npm run build:web`.")

    html = INDEX.read_text(encoding="utf-8")

    if 'rel="manifest"' in html:
        print("index.html ist bereits ergaenzt.")
        return 0

    if VIEWPORT_OLD in html:
        html = html.replace(VIEWPORT_OLD, VIEWPORT_NEW)
    else:
        print("Hinweis: viewport-Tag sah anders aus als erwartet, bleibt unveraendert.")

    if "</head>" not in html:
        sys.exit("Kein </head> in index.html - Expo hat die Vorlage geaendert.")
    html = html.replace("</head>", HEAD + "  </head>", 1)

    html = add_service_worker(html)
    INDEX.write_text(html, encoding="utf-8")

    # Nachpruefen statt hoffen.
    check = INDEX.read_text(encoding="utf-8")
    for needle in ('rel="manifest"', "apple-touch-icon", 'property="og:image"', "viewport-fit=cover"):
        if needle not in check:
            sys.exit(f"FEHLER: '{needle}' fehlt nach dem Einfuegen.")

    missing = [
        f for f in ("manifest.json", "icons/pwa-192.png", "icons/pwa-512.png", "icons/og-image.png")
        if not (DIST / f).exists()
    ]
    if missing:
        print("WARNUNG: fehlende Dateien im Build: " + ", ".join(missing))
        print("         Vermutlich fehlt `npm run icons`.")
        return 1

    print("index.html ergaenzt · Manifest, Icons und Teilen-Vorschau geprueft")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
