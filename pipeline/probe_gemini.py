#!/usr/bin/env python3
"""Ein einziger Gemini-Aufruf, mit voller Fehlerausgabe.

    python pipeline/probe_gemini.py

Warum das noetig wurde: Der erste echte Lauf meldete

    unbrauchbar 106 · Gemini-Aufrufe 0

Null Aufrufe bei 106 Fehlversuchen heisst, dass jeder Aufruf abgestuerzt ist,
bevor der Zaehler hochging - und die Ausnahme wurde nur als Warnung
protokolliert und ging in der Ausgabe unter.

Dieses Skript macht drei Dinge in aufsteigender Schwierigkeit und bricht beim
ersten Fehler MIT der vollen Meldung ab:

    1. Modelle auflisten   - stimmen Schluessel und Zugang?
    2. Freier Text         - antwortet das Modell ueberhaupt?
    3. Structured Output   - akzeptiert es unser Schema?

Damit steht in dreissig Sekunden fest, woran es liegt, statt zu raten.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import Config  # noqa: E402


def main() -> int:
    try:
        cfg = Config.load()
    except SystemExit as exc:
        print(f'Konfiguration unvollstaendig: {exc}')
        return 1

    print(f'Modell aus .env: {cfg.gemini_model}')
    print(f'Schluessel: {cfg.gemini_api_key[:8]}… ({len(cfg.gemini_api_key)} Zeichen)\n')

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print('google-genai fehlt.  pip install -r pipeline/requirements.txt')
        return 1

    client = genai.Client(api_key=cfg.gemini_api_key)

    # --- 1. Welche Modelle sind ueberhaupt erreichbar? ----------------------
    print('[1] Verfuegbare Modelle …')
    available: list[str] = []
    try:
        for m in client.models.list():
            name = (m.name or '').replace('models/', '')
            actions = getattr(m, 'supported_actions', None) or []
            if not actions or 'generateContent' in actions:
                available.append(name)
        flash = [n for n in available if 'flash' in n and 'thinking' not in n]
        print(f'    {len(available)} Modelle erreichbar.')
        print('    Flash-Varianten: ' + (', '.join(sorted(flash)[:12]) or 'keine'))
        if cfg.gemini_model in available:
            print(f'    "{cfg.gemini_model}" ist dabei.\n')
        else:
            print(f'\n    >>> "{cfg.gemini_model}" ist NICHT in der Liste. <<<')
            if flash:
                print(f'    Trag in pipeline/.env ein:  GEMINI_MODEL={sorted(flash)[0]}\n')
            return 1
    except Exception:
        print('    Fehlgeschlagen:')
        traceback.print_exc()
        print('\n    Meist bedeutet das: Schluessel falsch, oder die Generative '
              'Language API\n    ist im Google-Projekt nicht aktiviert.')
        return 1

    # --- 2. Antwortet ein Modell auf einfachen Text? ------------------------
    #
    # Nicht nur das eingestellte: bei Ueberlastung ist die einzige nuetzliche
    # Auskunft, welches Modell gerade antwortet.
    from transform.generate import FALLBACK_MODELS, _is_transient

    candidates = [cfg.gemini_model] + [m for m in FALLBACK_MODELS if m != cfg.gemini_model]
    candidates = [m for m in candidates if m in available]

    print('[2] Einfacher Aufruf ...')
    working: str | None = None
    for name in candidates:
        try:
            r = client.models.generate_content(
                model=name, contents='Antworte mit genau einem Wort: Test'
            )
            print(f'    {name}: {(r.text or "").strip()[:40]}')
            if working is None:
                working = name
        except Exception as exc:  # noqa: BLE001
            kind = 'ausgelastet' if _is_transient(exc) else 'Fehler'
            print(f'    {name}: {kind} - {str(exc)[:90]}')

    if working is None:
        print()
        print('    >>> Kein einziges Modell hat geantwortet. <<<')
        print('    Steht ueberall "ausgelastet", ist das voruebergehend: spaeter')
        print('    erneut versuchen. Die Pipeline wartet inzwischen selbst und')
        print('    weicht aus, ein Lauf scheitert daran also nicht mehr so schnell.')
        return 1

    if working != cfg.gemini_model:
        print()
        print(f'    "{cfg.gemini_model}" antwortet gerade nicht, "{working}" schon.')
        print(f'    Fuer heute:  GEMINI_MODEL={working}  in pipeline/.env')
    print()


    # --- 3. Nimmt es unser Schema an? ---------------------------------------
    print('[3] Structured Output - ueber denselben Weg wie die Pipeline ...')
    #
    # Bewusst nicht mit einem nackten API-Aufruf, sondern mit dem Generator,
    # den die Pipeline auch benutzt: mit Wiederholung, mit Ausweichmodellen,
    # mit dem echten Schema. Sonst prueft dieser Schritt etwas anderes als
    # das, was nachts wirklich laeuft - und genau daran ist der erste Versuch
    # vorbeigelaufen.
    from transform.generate import Generator

    gen = Generator(cfg.gemini_api_keys, working)
    card = gen.make_card(
        text=(
            'Wasser verdunstet an der Oberflaeche von Ozeanen und Seen. Der '
            'Wasserdampf steigt auf, kuehlt ab und bildet Wolken. Aus den '
            'Wolken faellt Niederschlag, der ueber Fluesse zurueck ins Meer '
            'gelangt. Rund 505000 Kubikkilometer Wasser durchlaufen diesen '
            'Kreislauf jedes Jahr. Etwa 86 Prozent der Verdunstung stammen '
            'aus den Ozeanen.'
        ),
        title='Der Wasserkreislauf',
        source_name='Testquelle',
        language='de',
        category_ids=['science.climate', 'world.science'],
    )

    if card is None:
        print(f'    Fehlgeschlagen nach {gen.retries} Wiederholungen.')
        print(f'    Aufruf-Fehler:  {gen.first_error}')
        print(f'    Verworfen weil: {gen.last_reject}')
        print()
        if gen.first_error and ('503' in gen.first_error or 'UNAVAILABLE' in gen.first_error):
            print('    Das ist die Auslastung, nicht das Schema - Schritt 2 lief ja.')
            print('    Spaeter erneut versuchen. Die Pipeline haelt das jetzt aus:')
            print('    sie wartet, wiederholt und weicht auf ein anderes Modell aus.')
        else:
            print('    >>> Das sieht nach dem Schema aus. <<<')
            print('    Gemini akzeptiert nur eine Teilmenge von JSON Schema.')
            print('    Haeufige Ursachen: maxLength, verschachtelte optionale')
            print('    Felder, fehlende "required"-Angaben in Unterobjekten.')
        return 1

    print(f'    Schema akzeptiert (Modell {gen.model}, {gen.retries} Wiederholungen).')
    print(f'      Titel:   {card.get("title")}')
    print(f'      Bloecke: {len(card.get("body_blocks", []))}')
    print(f'      Quiz:    {(card.get("quiz") or {}).get("question", "-")[:60]}')
    print()
    print('Alles in Ordnung. Die Pipeline sollte laufen.')
    return 0



if __name__ == '__main__':
    raise SystemExit(main())
