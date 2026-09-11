import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { getPrefs } from './prefs';

/**
 * Die Toene der App.
 *
 * Denselben Zweck wie haptics.ts, aus denselben Gruenden: ein Schalter in
 * den Einstellungen, der wirklich schaltet, und ein Ort, an dem man das
 * ganze Klangbild aendern kann.
 *
 * Vier Regeln, die hier durchgesetzt werden:
 *
 * 1. **Ton bestaetigt, er unterbricht nicht.** Alles unter einer halben
 *    Sekunde, alles leise. Wer die App ohne Ton benutzt, verpasst nichts -
 *    das ist die Messlatte.
 *
 * 2. **Nie die Musik des Nutzers stoppen.** Die meisten hoeren beim
 *    Scrollen etwas. Eine App, die dafuer Spotify pausiert, wird einmal
 *    benutzt. Deshalb mischt sich der Ton dazu, statt sich den Vorrang zu
 *    nehmen.
 *
 * 3. **Nie den Bildaufbau aufhalten.** Alle Aufrufe sind feuern-und-
 *    vergessen. Ein fehlender Ton ist kein Fehler, den jemand sehen muss.
 *
 * 4. **Erst beim ersten Gebrauch laden.** Neun Dateien beim Start zu laden
 *    verzoegert den ersten Bildaufbau fuer etwas, das vielleicht nie
 *    gebraucht wird.
 */

const SOURCES = {
  /** Karte eingerastet. Sehr leise - man hoert ihn hundertmal pro Sitzung. */
  tick: require('../../assets/sounds/tick.wav'),
  /** Richtig geloest. */
  correct: require('../../assets/sounds/correct.wav'),
  /** Falsch. Weich, nicht strafend. */
  wrong: require('../../assets/sounds/wrong.wav'),
  /** Doppeltipp-Like. */
  like: require('../../assets/sounds/like.wav'),
  /** Kategorie-Stufe aufgestiegen. */
  level: require('../../assets/sounds/level.wav'),
  /** Serie fortgesetzt. */
  streak: require('../../assets/sounds/streak.wav'),
  /** Ganzer Stapel fehlerfrei. */
  perfect: require('../../assets/sounds/perfect.wav'),
  /** Seite gewechselt, Block aufgeklappt. */
  swipe: require('../../assets/sounds/swipe.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const players = new Map<SoundName, AudioPlayer>();
let audioModeSet = false;

function ensureAudioMode() {
  if (audioModeSet) return;
  audioModeSet = true;
  // Regel 2. Schlaegt das fehl, spielen wir trotzdem - dann eben mit den
  // Standardeinstellungen des Systems.
  void setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
  }).catch(() => {});
}

function player(name: SoundName): AudioPlayer | null {
  const existing = players.get(name);
  if (existing) return existing;
  try {
    const created = createAudioPlayer(SOURCES[name]);
    players.set(name, created);
    return created;
  } catch {
    return null;
  }
}

/**
 * Einen Ton abspielen.
 *
 * `seekTo(0)` vor jedem Abspielen ist noetig, weil derselbe Spieler
 * wiederverwendet wird: nach dem ersten Mal steht er am Ende, und ein
 * zweites `play()` wuerde nichts tun. Genau das faellt beim schnellen
 * Durchscrollen sofort auf - der erste Tick klingt, die naechsten zwanzig
 * nicht.
 */
export function playSound(name: SoundName) {
  if (!getPrefs().audioEnabled) return;
  ensureAudioMode();
  try {
    const p = player(name);
    if (!p) return;
    p.seekTo(0);
    p.play();
  } catch {
    /* Im Web bis zur ersten Nutzergeste blockiert. Kein Fehler, nur still. */
  }
}

export const sound = {
  tick: () => playSound('tick'),
  correct: () => playSound('correct'),
  wrong: () => playSound('wrong'),
  like: () => playSound('like'),
  level: () => playSound('level'),
  streak: () => playSound('streak'),
  perfect: () => playSound('perfect'),
  swipe: () => playSound('swipe'),
};

/** Beim Abmelden oder Neuladen: Speicher der Abspieler freigeben. */
export function releaseSounds() {
  players.forEach((p) => {
    try {
      p.remove();
    } catch {
      /* schon weg */
    }
  });
  players.clear();
}
