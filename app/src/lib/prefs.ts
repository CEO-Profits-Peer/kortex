import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Geraete-lokale Einstellungen.
 *
 * Bewusst NICHT in der Datenbank: Haptik und Bewegung haengen am Geraet, nicht
 * am Konto. Wer auf dem Tablet keine Vibration will, will sie auf dem Handy
 * vielleicht schon. Kontobezogenes (Sprache, Region, Rangliste, Tagesziel)
 * liegt dagegen in profiles.
 */

export type Prefs = {
  haptics: boolean;
  reduceMotion: boolean;
  /** Die kurzen Klaenge: Einrasten, Loesen, Aufsteigen. Siehe lib/sound.ts. */
  audioEnabled: boolean;
  /**
   * Hintergrundflaeche pro Karte. Standardmaessig AUS.
   *
   * Musik unter einem Text, den man lesen soll, ist Geschmackssache - und
   * die falsche Voreinstellung vertreibt Leute, bevor sie die Einstellung
   * finden.
   */
  musicEnabled: boolean;
  /**
   * PRO (19.09.): Vorlese-Tempo als Faktor auf das Grundtempo (1 = wie
   * bisher) und je Sprache eine Browser-Stimme (Kennung aus
   * getAvailableVoicesAsync). Keine bezahlten Stimmen - entschieden 18.09.
   */
  sprechTempo: number;
  stimmen: Record<string, string>;
};

const DEFAULTS: Prefs = {
  haptics: true,
  reduceMotion: false,
  audioEnabled: true,
  musicEnabled: false,
  sprechTempo: 1,
  stimmen: {},
};

const KEY = 'prefs_v1';

let current: Prefs = { ...DEFAULTS };
let hydrated = false;
const listeners = new Set<(p: Prefs) => void>();

export async function loadPrefs(): Promise<Prefs> {
  if (hydrated) return current;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) current = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    current = { ...DEFAULTS };
  }
  hydrated = true;
  listeners.forEach((fn) => fn(current));
  return current;
}

export function getPrefs(): Prefs {
  return current;
}

export async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  current = { ...current, [key]: value };
  listeners.forEach((fn) => fn(current));
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Nicht speicherbar - die Einstellung gilt dann nur fuer diese Sitzung. */
  }
}

export function usePrefs(): Prefs {
  const [state, setState] = useState<Prefs>(current);
  useEffect(() => {
    listeners.add(setState);
    void loadPrefs();
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
