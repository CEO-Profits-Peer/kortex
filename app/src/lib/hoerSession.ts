import { Platform } from 'react-native';

/**
 * Die Wiedergabe-Session fuer den Audio-Modus (19.09.).
 *
 * Das Problem: Karten werden mit der Sprachausgabe des Browsers vorgelesen
 * (speechSynthesis). Wandert die Seite in den Hintergrund oder geht der
 * Bildschirm aus, halten die Browser sie an - fuer eine Vorlesefunktion
 * richtig, fuer einen Podcast falsch. Genau dann will man ihn aber hoeren:
 * Handy in der Tasche, Kopfhoerer im Ohr.
 *
 * Drei Massnahmen, jede fuer sich unvollstaendig, zusammen tragfaehig:
 *
 *   1. EINE LAUFENDE WIEDERGABE. Ein stilles Tonstueck in Endlosschleife.
 *      Erst dadurch sieht das Betriebssystem ueberhaupt eine Wiedergabe -
 *      und zeigt die Steuerung auf dem Sperrbildschirm.
 *   2. MEDIA SESSION. Titel, Fortschritt und die Knoepfe Play, Pause,
 *      Vor und Zurueck landen dort, wo man sie erwartet: in der
 *      Benachrichtigung und auf dem Sperrbildschirm.
 *   3. EIN WACHHUND. Chrome haelt die Sprachausgabe von sich aus an
 *      (paused), ohne sie zu beenden. Alle zwei Sekunden nachsehen und
 *      fortsetzen holt sie zurueck.
 *
 * Was das NICHT kann: Android beendet die Sprachausgabe bei laengerer
 * Sperre trotzdem. Deshalb gibt es zusaetzlich "Bildschirm an lassen"
 * (Wake Lock) - und den ehrlichen Hinweis in der App.
 */

/** 0,4 s Stille, 8 kHz. Klein genug, um im Code zu stehen. */
const STILLE = 'data:audio/wav;base64,UklGRqQMAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YYAMAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

type Steuerung = {
  titel: string;
  untertitel?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
};

let audio: HTMLAudioElement | null = null;
let wachhund: ReturnType<typeof setInterval> | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;

function mediaSession(): any | null {
  if (Platform.OS !== 'web') return null;
  const nav = globalThis.navigator as any;
  return nav && 'mediaSession' in nav ? nav.mediaSession : null;
}

/** Laeuft die Sperrbildschirm-Steuerung auf diesem Geraet? */
export function sessionMoeglich(): boolean {
  return Platform.OS === 'web' && !!mediaSession();
}

/** Startet die stille Wiedergabe und setzt Titel und Knoepfe. */
export function sessionStarten(s: Steuerung): void {
  if (Platform.OS !== 'web') return;
  try {
    if (!audio) {
      audio = new Audio(STILLE);
      audio.loop = true;
      audio.volume = 0.001; // nicht 0: manche Browser werten das als stumm
      // Ins Dokument haengen: ein Element, das nur im Speicher steht,
      // behandelt Chrome nicht verlaesslich als laufende Wiedergabe.
      audio.setAttribute('aria-hidden', 'true');
      audio.style.display = 'none';
      try {
        document.body.appendChild(audio);
      } catch {
        /* ohne DOM geht es auch */
      }
    }
    void audio.play().catch(() => undefined);
  } catch {
    // Ohne Audio geht es auch - dann eben ohne Sperrbildschirm.
  }

  const ms = mediaSession();
  if (ms) {
    try {
      const MM = (globalThis as any).MediaMetadata;
      if (MM) {
        ms.metadata = new MM({
          title: s.titel,
          artist: s.untertitel ?? 'ElyCic',
          album: 'Anhören',
          artwork: [
            { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          ],
        });
      }
      ms.playbackState = 'playing';
      ms.setActionHandler('play', s.onPlay ?? null);
      ms.setActionHandler('pause', s.onPause ?? null);
      ms.setActionHandler('nexttrack', s.onNext ?? null);
      ms.setActionHandler('previoustrack', s.onPrev ?? null);
    } catch {
      // Einzelne Handler koennen fehlen; das ist kein Grund aufzuhoeren.
    }
  }

  // Der Wachhund: Chrome pausiert die Sprachausgabe im Hintergrund.
  if (!wachhund) {
    wachhund = setInterval(() => {
      const sp = (globalThis as any).speechSynthesis;
      if (sp && sp.paused && sp.speaking) {
        try {
          sp.resume();
        } catch {
          /* egal */
        }
      }
    }, 2000);
  }
}

/** Nur den Titel wechseln - fuer die naechste Karte. */
export function sessionTitel(titel: string, untertitel?: string): void {
  const ms = mediaSession();
  if (!ms) return;
  try {
    const MM = (globalThis as any).MediaMetadata;
    if (MM) {
      ms.metadata = new MM({
        title: titel,
        artist: untertitel ?? 'ElyCic',
        album: 'Anhören',
        artwork: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
      });
    }
  } catch {
    /* egal */
  }
}

export function sessionPausiert(pausiert: boolean): void {
  const ms = mediaSession();
  if (ms) {
    try {
      ms.playbackState = pausiert ? 'paused' : 'playing';
    } catch {
      /* egal */
    }
  }
  if (!audio) return;
  if (pausiert) audio.pause();
  else void audio.play().catch(() => undefined);
}

export function sessionBeenden(): void {
  if (wachhund) {
    clearInterval(wachhund);
    wachhund = null;
  }
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  const ms = mediaSession();
  if (ms) {
    try {
      ms.playbackState = 'none';
      for (const a of ['play', 'pause', 'nexttrack', 'previoustrack']) ms.setActionHandler(a, null);
      ms.metadata = null;
    } catch {
      /* egal */
    }
  }
  void bildschirmWach(false);
}

/**
 * Bildschirm an lassen.
 *
 * Der sichere Weg, damit die Sprachausgabe nicht abbricht - und der
 * teuerste fuer den Akku. Deshalb ein Schalter und keine Automatik.
 */
export async function bildschirmWach(an: boolean): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  const nav = globalThis.navigator as any;
  if (!nav?.wakeLock) return false;
  try {
    if (an) {
      if (!wakeLock) wakeLock = await nav.wakeLock.request('screen');
      return true;
    }
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
    return false;
  } catch {
    wakeLock = null;
    return false;
  }
}

export function wachMoeglich(): boolean {
  return Platform.OS === 'web' && !!(globalThis.navigator as any)?.wakeLock;
}
