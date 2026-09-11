import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Push-Benachrichtigungen im Browser.
 *
 * Der Ablauf hat vier Schritte, und drei davon koennen scheitern, ohne
 * dass etwas kaputt ist:
 *
 *   1. Kann der Browser das ueberhaupt? (Safari unter iOS nur, wenn die
 *      App vom Startbildschirm laeuft - nicht im Browsertab.)
 *   2. Gibt die Person die Erlaubnis?
 *   3. Der Browser meldet sich bei seinem Push-Dienst an und gibt uns
 *      eine Adresse plus zwei Schluessel.
 *   4. Das schicken wir an unsere Datenbank.
 *
 * Warum kein expo-notifications: das deckt Web-Push nicht ab. Der
 * Browser kann es selbst, und die eigene Umsetzung ist hier kuerzer als
 * die Bibliothek einzubinden waere.
 *
 * WANN GEFRAGT WIRD, ist die eigentliche Entscheidung. Nicht beim Start -
 * eine Berechtigungsfrage, bevor jemand weiss, wofuer, wird weggeklickt,
 * und dann ist sie fuer immer weg (Chrome merkt sich das "Nein"). Deshalb
 * fragt nur der Schalter in den Einstellungen.
 */

export type PushState =
  | 'unsupported'   // Browser kann es nicht
  | 'needs-install' // iOS: erst zum Startbildschirm hinzufuegen
  | 'denied'        // dauerhaft abgelehnt, nur in den Browsereinstellungen zurueckzunehmen
  | 'off'           // moeglich, aber nicht eingeschaltet
  | 'on';

const VAPID_PUBLIC = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function supported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * iOS erlaubt Web-Push ausschliesslich der installierten App.
 *
 * Im Browsertab gibt es `PushManager` dort gar nicht - der Fall faellt
 * also schon oben durch. Diese Pruefung faengt den Rest: ein iPhone, auf
 * dem die Seite offen ist, aber nicht vom Startbildschirm gestartet
 * wurde. Ohne den Unterschied bekaeme die Person "geht nicht" statt
 * "installier es, dann geht es".
 */
function isIosBrowserTab(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Apples eigenes, nicht standardisiertes Kennzeichen.
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIosBrowserTab() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/**
 * Einschalten. Gibt den neuen Zustand zurueck.
 *
 * Muss aus einem echten Klick heraus aufgerufen werden - Browser
 * verweigern die Berechtigungsfrage ohne Nutzergeste.
 */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return isIosBrowserTab() ? 'needs-install' : 'unsupported';
  if (!VAPID_PUBLIC) {
    throw new Error('EXPO_PUBLIC_VAPID_PUBLIC_KEY fehlt in app/.env');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  // `ready` statt `getRegistration`: beim allerersten Besuch ist der
  // Service Worker noch am Installieren, und ein pushManager an einer
  // halb fertigen Registrierung wirft.
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // Ohne das lehnt Chrome ab: es gibt keine stillen Push-Nachrichten
      // mehr, jede muss dem Nutzer angezeigt werden.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    }));

  const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Der Browser hat keine Schluessel geliefert.');
  }

  const { error } = await supabase.rpc('register_push', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;

  return 'on';
}

/** Ausschalten: beim Browser abmelden UND bei uns loeschen. */
export async function disablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return 'off';

  // Reihenfolge: erst bei uns austragen, dann beim Browser abmelden. Bricht
  // es dazwischen ab, steht eine tote Adresse in der Datenbank - der
  // Versender raeumt sie nach ein paar Fehlschlaegen weg. Andersherum
  // haetten wir eine lebende Adresse ohne Eintrag, und die Person bekaeme
  // weiter nichts, ohne dass es jemand merkt.
  await supabase.rpc('unregister_push', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
  return 'off';
}

/**
 * Der VAPID-Schluessel kommt als base64url-Text, `subscribe` will Bytes.
 *
 * base64url benutzt `-` und `_` statt `+` und `/` und laesst die
 * Auffuellzeichen weg - `atob` kennt nur die Standardvariante und wirft
 * sonst "InvalidCharacterError".
 */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  // Der Puffer statt der Sicht darauf: `applicationServerKey` ist als
  // BufferSource typisiert, und ein Uint8Array kann laut Typ auch auf
  // einem SharedArrayBuffer sitzen - den nimmt die Signatur nicht.
  return out.buffer;
}
