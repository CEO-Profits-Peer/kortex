import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Sind wir online?
 *
 * Warum es das gibt
 * -----------------
 * Ohne Netz zeigte jeder Bildschirm, was fetch gerade geworfen hat:
 * "TypeError: Failed to fetch", "Network request failed", je nach Browser
 * etwas anderes, und an jeder der 35 Stellen, die Fehler anzeigen, roh. Wer im
 * Zug in einen Tunnel faehrt, hat nichts falsch gemacht und bekommt trotzdem
 * eine Meldung, die nach kaputter App aussieht.
 *
 * Woher der Zustand kommt
 * -----------------------
 * NICHT aus navigator.onLine allein. Das sagt nur, ob eine Netzwerkkarte
 * verbunden ist - ein WLAN ohne Internet, ein Hotel-Portal, ein Funkloch mit
 * einem Balken melden alle "online". Der Browser-Wert ist ein guter Hinweis
 * darauf, dass die Verbindung WEG ist, und ein schlechter darauf, dass sie
 * wieder DA ist.
 *
 * Deshalb die eigentliche Quelle: jede Anfrage an Supabase laeuft durch
 * `beobachteterFetch` (lib/supabase.ts). Kommt eine Antwort - egal welche,
 * auch ein 401 -, sind wir online. Scheitert die Anfrage selbst, nicht. Das
 * misst genau das, worauf es ankommt: erreichen wir den Server?
 *
 * Auf dem Handy gibt es keine online/offline-Ereignisse ohne zusaetzliches
 * Paket. Dafuer die Probe: solange wir offline sind, fragt ein kleiner
 * Aufruf alle paar Sekunden nach, ob der Server wieder antwortet. Eine
 * Abhaengigkeit weniger, und dieselbe Logik auf beiden Plattformen.
 */

let online = true;
const listeners = new Set<(on: boolean) => void>();
let probe: ReturnType<typeof setTimeout> | null = null;

/** Wie oft nachgefragt wird, solange keine Verbindung besteht. */
const PROBE_MS = 4000;

const HEALTH =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '') + '/auth/v1/health';

function setzen(on: boolean) {
  if (on === online) return;
  online = on;
  listeners.forEach((fn) => fn(on));
  if (!on) {
    planeProbe(PROBE_MS);
  } else if (probe) {
    clearTimeout(probe);
    probe = null;
  }
}

function planeProbe(ms: number) {
  if (!HEALTH.startsWith('http')) return;
  if (probe) {
    // Eine SOFORTIGE Probe ersetzt eine wartende. Ohne das hing die Rueckkehr
    // am alten Vier-Sekunden-Takt: der Browser meldete "online", die App
    // blieb trotzdem noch 3,6 Sekunden offline - gemessen, nicht vermutet.
    if (ms > 0) return;
    clearTimeout(probe);
    probe = null;
  }
  probe = setTimeout(async () => {
    probe = null;
    try {
      // `no-cors` im Browser: eine undurchsichtige Antwort reicht voellig -
      // gefragt ist nur, ob ueberhaupt etwas zurueckkommt. Ohne das koennte
      // eine CORS-Ablehnung wie ein Funkloch aussehen, und die App bliebe
      // offline, obwohl sie es nicht ist. Auf dem Handy wird `mode`
      // ignoriert.
      await fetch(HEALTH, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
      setzen(true);
    } catch {
      if (!online) planeProbe(PROBE_MS);
    }
  }, ms);
}

/**
 * War das ein Verbindungsproblem und kein Fehler der Anfrage selbst?
 *
 * Die Texte unterscheiden sich je Laufzeit - Chrome "Failed to fetch",
 * Safari "Load failed", Firefox "NetworkError", React Native "Network
 * request failed". postgrest-js faengt den Fehler ab und steckt ihn als Text
 * in seine eigene Fehlermeldung, deshalb wird der Text geprueft und nicht nur
 * der Typ.
 */
export function istNetzfehler(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const name = (e as { name?: string }).name ?? '';
  if (name === 'AbortError') return false;
  if (name === 'AuthRetryableFetchError') return true;
  const msg = String((e as { message?: string }).message ?? '').toLowerCase();
  return /failed to fetch|network request failed|networkerror|load failed|fetch failed/.test(msg);
}

/**
 * fetch mit Zeugen. An supabase-js uebergeben, damit JEDE Anfrage mitzaehlt,
 * ohne dass einer der Bildschirme davon wissen muss.
 */
export const beobachteterFetch: typeof fetch = async (input, init) => {
  try {
    const res = await fetch(input, init);
    setzen(true);
    return res;
  } catch (e) {
    // fetch wirft nur bei Verbindungsproblemen oder Abbruch. Ein Abbruch ist
    // eine Entscheidung der App, kein Funkloch.
    if ((e as { name?: string })?.name !== 'AbortError') setzen(false);
    throw e;
  }
};

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    online = false;
    planeProbe(PROBE_MS);
  }
  // "offline" glauben wir dem Browser sofort - er weiss es verlaesslich.
  window.addEventListener('offline', () => setzen(false));
  // "online" nur als Anlass, sofort nachzufragen. Siehe Kopf.
  window.addEventListener('online', () => planeProbe(0));
}

export function istOnline(): boolean {
  return online;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(online);
  useEffect(() => {
    listeners.add(setOn);
    setOn(online);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}

/**
 * Einmal ausfuehren, sobald die Verbindung zurueckkommt.
 *
 * Fuer alles, was ohne Netz gescheitert ist und nachgeholt werden soll: den
 * Feed neu laden, gepufferte Lesezeit schicken, eine Duell-Abgabe.
 */
export function beiWiederOnline(fn: () => void): () => void {
  const hoerer = (on: boolean) => {
    if (on) fn();
  };
  listeners.add(hoerer);
  return () => {
    listeners.delete(hoerer);
  };
}
