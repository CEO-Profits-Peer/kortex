#!/usr/bin/env python3
"""Erzeugt aus einem Logo alle Icon-Groessen, die App und PWA brauchen.

    npm run icons

Quelle:  app/assets/brand/logo.png   (mindestens 1024x1024, gern transparent)
Ziel:    app/assets/generated/

Warum ein Skript und nicht von Hand: Es sind sieben Formate mit
unterschiedlichen Regeln fuer Rand und Hintergrund. Von Hand macht man das
einmal richtig und beim naechsten Logo-Entwurf wieder falsch.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow fehlt.  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "app" / "assets" / "brand"
OUT = ROOT / "app" / "assets" / "generated"
# Was im Web gebraucht wird, muss in public/ liegen - Expo kopiert diesen
# Ordner unveraendert in die Ausgabe, damit die Pfade im Manifest stimmen.
WEB = ROOT / "app" / "public" / "icons"

# Muss zu color.bg aus app/src/theme/tokens.ts passen.
BG = (15, 13, 16, 255)          # #0F0D10 Graphit (Design 2.0)
BG_LIGHT = (245, 241, 232, 255)  # Cremeweiss, fuer helle Varianten


def load() -> Image.Image:
    for name in ("logo.png", "logo.jpg", "logo.jpeg", "logo.webp"):
        p = SRC_DIR / name
        if p.exists():
            print(f"Quelle: {p.relative_to(ROOT)}")
            return Image.open(p).convert("RGBA")
    sys.exit(
        f"Kein Logo gefunden. Leg eine Datei nach {SRC_DIR.relative_to(ROOT)}/logo.png\n"
        f"(siehe {SRC_DIR.relative_to(ROOT)}/README.md)"
    )


def square(img: Image.Image) -> Image.Image:
    """Auf Quadrat bringen, ohne zu verzerren - fehlender Platz bleibt leer."""
    if img.width == img.height:
        return img
    side = max(img.width, img.height)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    return canvas


def render(
    logo: Image.Image,
    size: int,
    *,
    padding: float = 0.0,
    background: tuple[int, int, int, int] | None = None,
) -> Image.Image:
    """Logo mittig auf eine Flaeche legen.

    padding ist der Anteil, der ringsum frei bleibt. Fuer Androids
    Adaptive Icon sind 25 % noetig: das System schneidet je nach Hersteller
    Kreis, Squircle oder Rundrechteck aus, und was zu weit aussen liegt,
    verschwindet.
    """
    canvas = Image.new("RGBA", (size, size), background or (0, 0, 0, 0))
    inner = max(1, int(size * (1 - 2 * padding)))
    scaled = logo.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.paste(scaled, (off, off), scaled)
    return canvas


def wide(logo: Image.Image, w: int, h: int, bg: tuple[int, int, int, int]) -> Image.Image:
    """Querformat fuers Teilen-Vorschaubild."""
    canvas = Image.new("RGBA", (w, h), bg)
    side = int(h * 0.55)
    scaled = logo.resize((side, side), Image.LANCZOS)
    canvas.paste(scaled, ((w - side) // 2, (h - side) // 2), scaled)
    return canvas


def main() -> int:
    logo = square(load())
    if min(logo.size) < 512:
        print(f"WARNUNG: Quelle ist nur {logo.width}px breit. Ab 1024px sieht es besser aus.")

    OUT.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)

    jobs = [
        # (Datei, Groesse, Rand, Hintergrund)
        ("icon.png", 1024, 0.06, BG),                 # iOS: eigener Rand, deckend
        ("adaptive-icon.png", 1024, 0.25, None),      # Android: viel Luft, transparent
        ("favicon.png", 48, 0.04, None),
        ("pwa-192.png", 192, 0.08, BG),
        ("pwa-512.png", 512, 0.08, BG),
        ("pwa-512-maskable.png", 512, 0.22, BG),      # "maskable": Zuschnitt-sicher
        ("splash.png", 1284, 0.34, None),             # Splash: Logo klein, viel Raum
    ]

    WEB_FILES = {"favicon.png", "pwa-192.png", "pwa-512.png", "pwa-512-maskable.png"}

    for name, size, pad, bg in jobs:
        img = render(logo, size, padding=pad, background=bg)
        img.save(OUT / name)
        if name in WEB_FILES:
            img.save(WEB / name)
        print(f"  {name:24} {size}x{size}")

    og = wide(logo, 1200, 630, BG)
    og.save(OUT / "og-image.png")
    og.save(WEB / "og-image.png")
    print(f"  {'og-image.png':24} 1200x630")

    # Helle Variante zum Vergleichen - siehe Farb-Anmerkung im README.
    render(logo, 512, padding=0.08, background=BG_LIGHT).save(OUT / "preview-light.png")
    render(logo, 512, padding=0.08, background=BG).save(OUT / "preview-dark.png")
    print(f"  {'preview-light/dark.png':24} 512x512   (nur zum Ansehen)")

    print(f"\nFertig. {len(jobs) + 3} Dateien in app/assets/generated/")
    print("Naechster Schritt:  npm run web")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
