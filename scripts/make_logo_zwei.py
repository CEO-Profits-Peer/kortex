#!/usr/bin/env python3
"""Zeichnet das Logo fuer Design 2.0: app/assets/brand/logo.png

    python scripts/make_logo_zwei.py && npm run icons

Die Idee des alten Logos bleibt - ein Knoten, in dem sich Linien treffen
(das Raster, in dem man lernt). Uebersetzt in die Sprache von Design 2.0:

  - die Form ist das Sechseck, wie Profilbilder und der aktive Tab
  - geschliffen: sechs Bordeaux-Facetten, oben hell, unten dunkel
  - die Kanten der Facetten sind die Rasterlinien, fein in Gold
  - in der Mitte der Knoten: ein goldenes Sechseck mit dunklem Ring,
    wie der Punkt mit Ring im alten Logo
  - aussen eine Goldkante

48-Pixel-Test: bei Startbildschirmgroesse bleiben Sechseck, Goldkante und
Mittelpunkt erkennbar; die feinen Linien duerfen dort verschwinden.

Gezeichnet wird doppelt so gross und dann verkleinert - Pillow glaettet
Kanten von Polygonen nicht selbst.

Das alte Logo liegt als logo-klassisch.png daneben. Zurueck geht es mit
Umbenennen und `npm run icons`.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ZIEL = ROOT / "app" / "assets" / "brand" / "logo.png"

GROESSE = 1024
X = 2  # Ueberabtastung
N = GROESSE * X

# Dieselben Toene wie SechseckLinse (app/src/components/Sechseck.tsx),
# Reihenfolge: oben->oben rechts, ..., oben links->oben.
FACETTEN = ["#7A2B40", "#5E1E30", "#431523", "#4B1827", "#641F33", "#6E2438"]
GOLD = "#D9B872"
GOLD_HELL = "#E8D3A2"
DUNKEL = "#0F0D10"


def hexfarbe(h: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)


def sechseck(cx: float, cy: float, hoehe: float) -> list[tuple[float, float]]:
    """Regelmaessig, Spitze oben: oben, oben rechts, unten rechts, unten, unten links, oben links."""
    r = hoehe / 2
    return [
        (cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        for a in (-90, -30, 30, 90, 150, 210)
    ]


def main() -> int:
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = N / 2

    aussen = sechseck(cx, cy, N * 0.96)
    # Facetten
    for i in range(6):
        a, b = aussen[i], aussen[(i + 1) % 6]
        d.polygon([a, b, (cx, cy)], fill=hexfarbe(FACETTEN[i]))

    # Rasterlinien: Mitte zu jeder Ecke, fein und halb durchsichtig. Auf eine
    # eigene Ebene, damit die Transparenz sich nicht mit den Facetten mischt.
    linien = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    dl = ImageDraw.Draw(linien)
    for p in aussen:
        dl.line([(cx, cy), p], fill=hexfarbe(GOLD_HELL, 95), width=int(N * 0.012))
    img = Image.alpha_composite(img, linien)
    d = ImageDraw.Draw(img)

    # Goldkante aussen
    breite = int(N * 0.038)
    # Zwei Punkte ueber den Anfang hinaus: sonst bleibt an der oberen Spitze,
    # wo die Linie beginnt und endet, eine Kerbe.
    d.line(aussen + aussen[:2], fill=hexfarbe(GOLD), width=breite, joint="curve")

    # Der Knoten: dunkler Ring, dann goldenes Sechseck
    d.polygon(sechseck(cx, cy, N * 0.30), fill=hexfarbe(DUNKEL))
    # Der Knoten ist selbst geschliffen, in Gold: oben hell, unten dunkel.
    # (Ein einzelner heller Deckel oben las sich wie ein Wuerfel.)
    k = sechseck(cx, cy, N * 0.21)
    gold_toene = ["#EAD7A8", "#DCBE7C", "#BF9A57", "#C9A763", "#D4B36E", "#E2C88E"]
    for i in range(6):
        d.polygon([k[i], k[(i + 1) % 6], (cx, cy)], fill=hexfarbe(gold_toene[i]))

    # Alles ausserhalb der Aussenform wegschneiden (die Kante ragt ein wenig
    # ueber den Rand, das darf sie - aber nicht ueber die Leinwand).
    img = img.resize((GROESSE, GROESSE), Image.LANCZOS)
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    img.save(ZIEL)
    print(f"Logo: {ZIEL.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
