#!/usr/bin/env python3
"""Erzeugt die Toene der App.

    python scripts/make_sounds.py

Warum synthetisiert statt eingekauft:

  · Lizenzen. Jeder Klang aus einer Bibliothek bringt Bedingungen mit, die
    man beim naechsten Build wieder pruefen muss.
  · Groesse. Diese Dateien sind zusammen unter 100 KB. Ein Paket gekaufter
    Sounds ist schnell zehnmal so gross - in einer PWA laedt das jeder mit.
  · Kontrolle. Die Gestaltung heisst Blaupause: Praezision, kein Spielzeug.
    Klaenge aus einer Bibliothek klingen nach Handyspiel. Hier laesst sich
    jeder Ton auf den Hertz genau an das Bild anpassen.

Gestaltungsregeln, dieselben wie fuer die Farben:

  · Kurz. Nichts ueber 400 ms. Wer scrollt, hoert sonst Ueberlagerungen.
  · Leise. Der Ton bestaetigt, er kuendigt nicht an.
  · Reine Sinustoene mit weicher Huellkurve. Kein Rauschen ausser dort, wo
    Bewegung gemeint ist.
  · Stimmung: C-Dur. Richtige Antworten steigen, falsche fallen - das ist
    kulturell so tief eingeuebt, dass es niemand lernen muss.
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

RATE = 24000
OUT = Path(__file__).resolve().parent.parent / "app" / "assets" / "sounds"

# Notenfrequenzen, gleichstufig, A4 = 440.
NOTE = {
    "C4": 261.63, "E4": 329.63, "G4": 392.00,
    "A4": 440.00, "C5": 523.25, "D5": 587.33, "E5": 659.25,
    "G5": 783.99, "A5": 880.00, "C6": 1046.50, "E6": 1318.51, "G6": 1568.00,
}


def envelope(i: int, n: int, attack: float = 0.01, release: float = 0.7) -> float:
    """Weiche Huellkurve.

    Ohne Anstieg klickt jeder Ton am Anfang - die Membran springt aus der
    Ruhelage. Zehn Millisekunden reichen und sind nicht hoerbar.
    """
    t = i / n
    a = min(1.0, (i / RATE) / attack) if attack > 0 else 1.0
    r = 1.0 if t < (1 - release) else max(0.0, (1 - t) / release)
    return a * r * r  # quadratisch ausklingen: klingt natuerlicher als linear


def tone(freq: float, ms: int, gain: float = 0.25, harmonic: float = 0.0) -> list[float]:
    n = int(RATE * ms / 1000)
    out = []
    for i in range(n):
        t = i / RATE
        v = math.sin(2 * math.pi * freq * t)
        if harmonic:
            # Eine leise Oktave darueber gibt dem Sinus Koerper, ohne ihn
            # nach Synthesizer klingen zu lassen.
            v += harmonic * math.sin(4 * math.pi * freq * t)
        out.append(v * gain * envelope(i, n))
    return out


def silence(ms: int) -> list[float]:
    return [0.0] * int(RATE * ms / 1000)


def mix(*layers: list[float]) -> list[float]:
    n = max(len(x) for x in layers)
    out = [0.0] * n
    for layer in layers:
        for i, v in enumerate(layer):
            out[i] += v
    return out


def click(ms: int, freq: float, gain: float) -> list[float]:
    """Ein sehr kurzer, hoher Impuls. Fuer das Einrasten einer Karte."""
    n = int(RATE * ms / 1000)
    return [
        math.sin(2 * math.pi * freq * (i / RATE)) * gain * (1 - i / n) ** 3
        for i in range(n)
    ]


def sweep(ms: int, f0: float, f1: float, gain: float) -> list[float]:
    n = int(RATE * ms / 1000)
    out = []
    phase = 0.0
    for i in range(n):
        f = f0 + (f1 - f0) * (i / n)
        phase += 2 * math.pi * f / RATE
        out.append(math.sin(phase) * gain * envelope(i, n, 0.008, 0.85))
    return out


def write(name: str, samples: list[float]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.wav"
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b"".join(
            struct.pack("<h", max(-32767, min(32767, int(v * 32767))))
            for v in samples
        )
        w.writeframes(frames)
    print(f"  {path.name:14} {len(samples) / RATE * 1000:5.0f} ms  {path.stat().st_size / 1024:5.1f} KB")


def main() -> None:
    print("Toene:")

    # Einrasten einer Karte. Muss fast unhoerbar sein - man hoert ihn
    # hundertmal pro Sitzung.
    write("tick", click(18, NOTE["G6"], 0.055))

    # Richtig geloest: zwei Toene aufwaerts, Quinte. Eindeutig positiv,
    # ohne Fanfare.
    write("correct", tone(NOTE["E5"], 90, 0.22, 0.18) + tone(NOTE["A5"], 150, 0.20, 0.15))

    # Falsch: ein Ton abwaerts, tief, weich. Keine Strafe, nur ein Hinweis.
    # Ein harter Fehlerton macht Leute vorsichtig statt neugierig, und
    # Vorsicht ist das Gegenteil von dem, was eine Lern-App will.
    write("wrong", tone(NOTE["G4"], 110, 0.16) + tone(NOTE["E4"], 190, 0.14))

    # Like beim Doppeltippen: hell, sehr kurz.
    write("like", tone(NOTE["G6"], 70, 0.16, 0.25))

    # Stufe geschafft: gebrochener Dur-Akkord.
    write("level", (
        tone(NOTE["C5"], 70, 0.18)
        + tone(NOTE["E5"], 70, 0.18)
        + tone(NOTE["G5"], 70, 0.18)
        + tone(NOTE["C6"], 220, 0.20, 0.2)
    ))

    # Serie fortgesetzt: warm, zwei Toene, kleiner als der Stufenaufstieg.
    write("streak", tone(NOTE["E5"], 80, 0.17) + tone(NOTE["G5"], 170, 0.17, 0.2))

    # Ganzer Stapel richtig: der einzige Klang, der laenger als eine
    # Viertelsekunde dauern darf.
    write("perfect", (
        tone(NOTE["C5"], 65, 0.16)
        + tone(NOTE["E5"], 65, 0.16)
        + tone(NOTE["G5"], 65, 0.16)
        + mix(tone(NOTE["C6"], 320, 0.17, 0.2), tone(NOTE["E6"], 320, 0.10))
    ))

    # Aufgeklappt / Seite gewechselt: ein Hauch von Bewegung.
    write("swipe", sweep(110, 520, 900, 0.075))

    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
