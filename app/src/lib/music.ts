import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { getPrefs } from './prefs';

/**
 * Hintergrundflaeche pro Karte.
 *
 * Was hier passiert
 * -----------------
 * Drei Klangflaechen liegen als Dateien vor (scripts/make_music.py). Pro
 * Karte werden ZWEI davon ausgewaehlt und jede mit leicht abweichender
 * Geschwindigkeit abgespielt. Geschwindigkeit heisst bei einer Aufnahme auch
 * Tonhoehe - jede Karte klingt dadurch in einer anderen Tonart, obwohl es
 * immer dieselben drei Dateien sind.
 *
 * Drei Paare mal zwei Geschwindigkeiten aus einem feinen Raster ergeben
 * hunderte hoerbar verschiedene Zustaende. Und weil die Auswahl aus der
 * Karten-Kennung berechnet wird, klingt dieselbe Karte immer gleich - beim
 * Wiedersehen erkennt man sie am Klang, bevor man den Titel gelesen hat.
 * Zufall haette diese Eigenschaft nicht.
 *
 * Drei Regeln, die wichtiger sind als die Technik
 * -----------------------------------------------
 * 1. **Standardmaessig aus.** Musik unter einem Text, den man lesen soll,
 *    ist eine Geschmacksfrage, und die falsche Antwort vertreibt Leute.
 *    Wer sie will, schaltet sie ein.
 *
 * 2. **Leise, und beim Vorlesen noch leiser.** Waehrend die Sprachausgabe
 *    laeuft, geht die Flaeche auf ein Viertel herunter. Eine Flaeche, die
 *    mit der Stimme konkurriert, macht beides unverstaendlich.
 *
 * 3. **Ueberblenden, nie schneiden.** Beim Kartenwechsel wird die alte
 *    Flaeche heruntergefahren, waehrend die neue hochkommt. Ein harter
 *    Schnitt beim Scrollen waere schlimmer als gar keine Musik.
 */

const PADS = {
  deep: require('../../assets/music/pad-deep.wav'),
  crystal: require('../../assets/music/pad-crystal.wav'),
  air: require('../../assets/music/pad-air.wav'),
} as const;

type PadName = keyof typeof PADS;

const PAIRS: [PadName, PadName][] = [
  ['deep', 'crystal'],
  ['deep', 'air'],
  ['crystal', 'air'],
];

/**
 * Abspielgeschwindigkeiten, aus denen gewaehlt wird.
 *
 * Der Bereich ist Absicht klein: 0,94 bis 1,06 sind rund ein Ganzton nach
 * oben oder unten. Weiter gespreizt klingt die tiefe Flaeche traege und die
 * hohe schrill - es soll nach einer anderen Tonart klingen, nicht nach
 * einem defekten Abspielgeraet.
 */
const RATES = [0.94, 0.97, 1.0, 1.03, 1.06];

/** Grundlautstaerke. Bewusst sehr leise - das ist Untergrund, kein Stueck. */
const BED_VOLUME = 0.16;

/** Waehrend die Sprachausgabe laeuft. */
const DUCKED = 0.25;

/** Dauer der Ueberblendung in Millisekunden. */
const FADE_MS = 700;
const FADE_STEP_MS = 50;

type Voice = { player: AudioPlayer; target: number };

let voices: Voice[] = [];
let currentCard: string | null = null;
let ducked = false;
let fader: ReturnType<typeof setInterval> | null = null;

/**
 * Ein stabiler Zahlenwert aus der Karten-Kennung.
 *
 * Derselbe Streuwert wie in components/Avatar.tsx - dieselbe Aufgabe: aus
 * einer Kennung etwas Wiedererkennbares machen, das nicht gespeichert
 * werden muss.
 */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function planFor(cardId: string): { pad: PadName; rate: number }[] {
  const h = hash(cardId);
  const [a, b] = PAIRS[h % PAIRS.length];
  return [
    { pad: a, rate: RATES[(h >> 3) % RATES.length] },
    { pad: b, rate: RATES[(h >> 7) % RATES.length] },
  ];
}

/** Alle laufenden Stimmen weich auf ihr Ziel bringen. */
function startFader() {
  if (fader) return;
  fader = setInterval(() => {
    let moving = false;

    for (const v of voices) {
      const step = (FADE_STEP_MS / FADE_MS) * (BED_VOLUME || 1);
      const diff = v.target - v.player.volume;
      if (Math.abs(diff) < 0.005) {
        v.player.volume = v.target;
      } else {
        v.player.volume = Math.max(0, Math.min(1, v.player.volume + Math.sign(diff) * step));
        moving = true;
      }
    }

    // Ausgeblendete Stimmen abraeumen. Ohne das sammeln sich beim Scrollen
    // durch fuenfzig Karten fuenfzig stumme Abspieler an.
    voices = voices.filter((v) => {
      if (v.target === 0 && v.player.volume === 0) {
        try {
          v.player.remove();
        } catch {
          /* schon weg */
        }
        return false;
      }
      return true;
    });

    if (!moving && voices.every((v) => v.player.volume === v.target)) {
      clearInterval(fader!);
      fader = null;
    }
  }, FADE_STEP_MS);
}

function bedLevel(): number {
  return BED_VOLUME * (ducked ? DUCKED : 1);
}

/**
 * Die Flaeche fuer diese Karte anfahren.
 *
 * Wird beim Einrasten jeder Karte gerufen. Ist dieselbe Karte schon dran,
 * passiert nichts - sonst wuerde jedes erneute Sichtbarwerden die Musik
 * neu starten.
 */
export function musicForCard(cardId: string) {
  if (!getPrefs().musicEnabled) {
    stopMusic();
    return;
  }
  if (cardId === currentCard) return;
  currentCard = cardId;

  // Alles Bisherige ausblenden lassen.
  for (const v of voices) v.target = 0;

  for (const { pad, rate } of planFor(cardId)) {
    try {
      const player = createAudioPlayer(PADS[pad]);
      player.loop = true;
      player.volume = 0;
      player.playbackRate = rate;
      player.play();
      voices.push({ player, target: bedLevel() });
    } catch {
      /* Kein Ton verfuegbar - die Karte funktioniert auch ohne. */
    }
  }

  startFader();
}

/** Waehrend die Sprachausgabe laeuft: zuruecknehmen. */
export function duckMusic(on: boolean) {
  if (ducked === on) return;
  ducked = on;
  for (const v of voices) {
    if (v.target > 0) v.target = bedLevel();
  }
  startFader();
}

/** Beim Verlassen des Feeds, beim Abschalten in den Einstellungen. */
export function stopMusic() {
  currentCard = null;
  for (const v of voices) {
    try {
      v.player.remove();
    } catch {
      /* schon weg */
    }
  }
  voices = [];
  if (fader) {
    clearInterval(fader);
    fader = null;
  }
}
