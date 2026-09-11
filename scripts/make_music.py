#!/usr/bin/env python3
"""Erzeugt die Hintergrundflaechen.

    python scripts/make_music.py

Was das ist und was es nicht ist
--------------------------------
Keine Musik im Sinne von Melodie. Drei Klangflaechen, die endlos laufen
koennen, ohne sich bemerkbar zu machen - das Gegenteil von einem Ohrwurm.
Ein Ohrwurm zieht Aufmerksamkeit ab, und die soll beim Text bleiben.

Die Abwechslung entsteht nicht aus vielen Dateien, sondern in der App: pro
Karte werden zwei der drei Flaechen ausgewaehlt und leicht unterschiedlich
schnell abgespielt (lib/music.ts). Abspielgeschwindigkeit heisst hier auch
Tonhoehe - jede Karte klingt dadurch in einer anderen Tonart. Drei Dateien
ergeben so hunderte hoerbar verschiedene Kombinationen, bei rund einem
halben Megabyte insgesamt.

Warum die Schleife sauber ist
-----------------------------
Der Trick steckt in der Frequenzwahl: jede Teilschwingung bekommt eine
Frequenz, die GANZZAHLIG oft in die Schleifenlaenge passt. Damit ist das
Signal ueber die Schleife exakt periodisch, und der Ruecksprung von der
letzten auf die erste Probe faellt genau auf den Nulldurchgang derselben
Welle. Kein Knacken, kein Ein- und Ausblenden noetig.

Ein Ueberblenden waere die uebliche Notloesung. Sie hoert man aber: die
Flaeche wird an der Nahtstelle jedes Mal duenner. Bei einer Schleife, die
minutenlang laeuft, faellt genau das auf.

Warum so wenig Kilohertz
------------------------
Diese Flaechen haben oberhalb von 3 kHz praktisch keinen Inhalt. 12 kHz
Abtastrate reichen dafuer mit Sicherheitsabstand (Nyquist: 6 kHz) und
vierteln die Dateigroesse gegenueber 48 kHz. In einer PWA laedt jeder
Nutzer das mit herunter - das ist der Ort, an dem Sparsamkeit zaehlt.
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

RATE = 12000
LOOP_SECONDS = 8.0
OUT = Path(__file__).resolve().parent.parent / "app" / "assets" / "music"

N = int(RATE * LOOP_SECONDS)


def harmonic(cycles: int, amp: float, phase: float = 0.0) -> list[float]:
    """Eine Teilschwingung mit exakt `cycles` Durchlaeufen pro Schleife.

    `cycles` ist eine ganze Zahl - genau das macht die Schleife nahtlos.
    Die hoerbare Frequenz ist cycles / LOOP_SECONDS, bei acht Sekunden also
    Vielfache von 0,125 Hz. Fein genug, um jede gewuenschte Tonhoehe auf
    weniger als einen Zehntel-Halbton genau zu treffen.
    """
    w = 2 * math.pi * cycles / N
    return [amp * math.sin(w * i + phase) for i in range(N)]


def cycles_for(freq: float) -> int:
    """Naechstgelegene ganze Zyklenzahl fuer eine Wunschfrequenz."""
    return max(1, round(freq * LOOP_SECONDS))


def lfo(cycles: int, depth: float, phase: float = 0.0) -> list[float]:
    """Langsame Lautstaerkeschwankung, ebenfalls ganzzahlig pro Schleife.

    Ohne die klingt eine Summe aus Sinustoenen wie ein Testton. Mit ihr
    atmet die Flaeche.
    """
    w = 2 * math.pi * cycles / N
    return [1.0 - depth + depth * (0.5 + 0.5 * math.sin(w * i + phase)) for i in range(N)]


def mix(*layers: list[float]) -> list[float]:
    out = [0.0] * N
    for layer in layers:
        for i, v in enumerate(layer):
            out[i] += v
    return out


def apply(signal: list[float], envelope: list[float]) -> list[float]:
    return [s * e for s, e in zip(signal, envelope)]


def normalise(signal: list[float], peak: float) -> list[float]:
    top = max(abs(v) for v in signal) or 1.0
    return [v * peak / top for v in signal]


def write(name: str, samples: list[float]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.wav"
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(
            b"".join(
                struct.pack("<h", max(-32767, min(32767, int(v * 32767))))
                for v in samples
            )
        )

    # Nahtstelle nachrechnen statt hoffen: der Sprung von der letzten auf die
    # erste Probe muss so klein sein wie ein normaler Schritt mitten drin.
    jump = abs(samples[0] - samples[-1])
    typical = max(abs(samples[i + 1] - samples[i]) for i in range(0, N - 1, 97))
    ok = "nahtlos" if jump <= typical * 1.5 else f"KNACKEN ({jump:.4f} vs {typical:.4f})"
    print(f"  {path.name:12} {path.stat().st_size / 1024:6.0f} KB  {ok}")


def main() -> None:
    print(f"Klangflaechen ({LOOP_SECONDS:.0f} s Schleife, {RATE} Hz):")

    # --- 1. Tief und warm -----------------------------------------------
    # Grundton C2 mit Quinte und Oktave. Traegt, ohne im Weg zu sein.
    deep = mix(
        apply(harmonic(cycles_for(65.41), 1.00), lfo(3, 0.30)),          # C2
        apply(harmonic(cycles_for(98.00), 0.55, 1.1), lfo(2, 0.35, 2.0)),  # G2
        apply(harmonic(cycles_for(130.81), 0.35, 0.4), lfo(5, 0.25)),    # C3
        apply(harmonic(cycles_for(196.00), 0.12, 2.2), lfo(7, 0.40, 1.0)),  # G3
    )
    write("pad-deep", normalise(deep, 0.72))

    # --- 2. Mitte, kristallin --------------------------------------------
    # Quart und None darueber: offen, ohne Dur oder Moll festzulegen. Eine
    # Flaeche, die eine Tonart behauptet, passt irgendwann nicht mehr zum
    # Inhalt.
    crystal = mix(
        apply(harmonic(cycles_for(261.63), 0.70), lfo(4, 0.45)),         # C4
        apply(harmonic(cycles_for(349.23), 0.45, 0.8), lfo(3, 0.50, 1.7)),  # F4
        apply(harmonic(cycles_for(587.33), 0.28, 1.9), lfo(6, 0.55)),    # D5
        apply(harmonic(cycles_for(783.99), 0.14, 0.3), lfo(9, 0.60, 2.4)),  # G5
    )
    write("pad-crystal", normalise(crystal, 0.55))

    # --- 3. Hoch und luftig ----------------------------------------------
    # Sehr leise, sehr hoch, stark schwankend. Alleine klingt das nach
    # nichts - ueber einer der anderen Flaechen gibt es ihr Weite.
    air = mix(
        apply(harmonic(cycles_for(1046.50), 0.30), lfo(11, 0.70)),       # C6
        apply(harmonic(cycles_for(1567.98), 0.18, 1.4), lfo(13, 0.75, 0.9)),  # G6
        apply(harmonic(cycles_for(2093.00), 0.09, 2.7), lfo(17, 0.80)),  # C7
    )
    write("pad-air", normalise(air, 0.34))

    print(f"\n-> {OUT}")
    print("Die Auswahl pro Karte macht app/src/lib/music.ts.")


if __name__ == "__main__":
    main()
