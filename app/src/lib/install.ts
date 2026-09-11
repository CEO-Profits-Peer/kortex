import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Laeuft die App schon als App - oder noch als Webseite im Browser?
 *
 * Der Unterschied ist fuer eine PWA der wichtigste ueberhaupt. Auf dem
 * Startbildschirm installiert hat sie ein eigenes Symbol, keine
 * Adresszeile, sie startet schneller und darf spaeter Mitteilungen
 * schicken. Im Browsertab ist sie eine Seite unter vielen.
 *
 * Deshalb der Hinweis - aber nur dort, wo er etwas bewirkt. In der
 * installierten App waere ein Knopf "Als App benutzen" unsinnig, und in der
 * echten Handy-App erst recht.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * Chrome meldet die Installierbarkeit EINMAL und erwartet, dass man das
 * Ereignis aufhebt. Wer es verstreichen laesst, bekommt keinen zweiten
 * Versuch - und der Knopf koennte dann nichts mehr tun.
 *
 * Deshalb liegt es hier im Modul und nicht in einer Komponente: die
 * Meldung kommt oft, bevor irgendein Bildschirm aufgebaut ist.
 */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function announce() {
  listeners.forEach((fn) => fn());
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    announce();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    announce();
  });
}

/** Laeuft gerade als installierte App (eigenes Fenster, keine Adresszeile)? */
export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  const media = window.matchMedia?.('(display-mode: standalone)')?.matches;
  // Safari auf dem iPhone kennt display-mode nicht und meldet es eigens.
  const ios = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return Boolean(media || ios);
}

/** Laeuft das auf einem iPhone oder iPad? Dort geht es nur ueber Teilen. */
export function isIOS(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS gibt sich seit Jahren als Mac aus - erkennbar nur am
    // Tastsinn: ein Mac hat keinen.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export type InstallState =
  /** Schon installiert, oder gar kein Browser - nichts anzeigen. */
  | { kind: 'hidden' }
  /** Ein Tipp genuegt: der Browser hat das Installieren angeboten. */
  | { kind: 'prompt' }
  /** Geht nur von Hand. `ios` unterscheidet nur die Anleitung. */
  | { kind: 'manual'; ios: boolean };

/**
 * Warum auch ohne Angebot des Browsers etwas angezeigt wird.
 *
 * Naheliegend waere: nur zeigen, wenn `beforeinstallprompt` gekommen ist.
 * Damit verschwindet der Knopf aber genau in den Faellen, in denen er
 * gebraucht wird:
 *
 *   · Safari auf dem iPhone meldet das Ereignis nie - dort geht es
 *     ausschliesslich ueber das Teilen-Menue.
 *   · Chrome meldet es nur EINMAL. Wer das Angebot einmal weggetippt hat,
 *     sieht monatelang keines mehr - der Knopf waere dann fuer denselben
 *     Nutzer dauerhaft verschwunden, obwohl die App weiter nicht
 *     installiert ist.
 *
 * Also: ist die App nicht installiert, steht der Hinweis da. Nur der Weg
 * dorthin unterscheidet sich - ein Tipp, wenn der Browser mitspielt, sonst
 * die Anleitung.
 */
function currentState(): InstallState {
  if (Platform.OS !== 'web') return { kind: 'hidden' };
  if (isStandalone()) return { kind: 'hidden' };
  if (deferred) return { kind: 'prompt' };
  return { kind: 'manual', ios: isIOS() };
}

export function useInstallState(): InstallState {
  const [state, setState] = useState<InstallState>(() => currentState());

  useEffect(() => {
    const fn = () => setState(currentState());
    listeners.add(fn);
    fn();

    // Nach dem Installieren wechselt der Anzeigemodus, ohne dass die Seite
    // neu laedt. Ohne das bliebe der Knopf stehen.
    const media = window.matchMedia?.('(display-mode: standalone)');
    media?.addEventListener?.('change', fn);

    return () => {
      listeners.delete(fn);
      media?.removeEventListener?.('change', fn);
    };
  }, []);

  return state;
}

/**
 * Installieren anstossen.
 *
 * Gibt zurueck, ob es tatsaechlich losging. `false` heisst: der Browser hat
 * die Gelegenheit zurueckgezogen - dann bleibt nur der Weg von Hand.
 */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  // Ein aufgehobenes Ereignis laesst sich nur einmal verwenden.
  deferred = null;
  announce();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}
