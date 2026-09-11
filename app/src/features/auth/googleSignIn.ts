import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Anmelden mit Google.
 *
 * Der wichtigste Teil steht nicht im Code, sondern in der Reihenfolge:
 *
 *   1. Ist gerade ein anonymes Konto aktiv, wird Google DAZUGELEGT
 *      (linkIdentity). Derselbe Nutzer, dieselben Punkte, dieselbe Serie -
 *      nur ab jetzt mit einer Anmeldung, die auf jedem Geraet funktioniert.
 *   2. Erst wenn das nicht geht, wird normal angemeldet (signInWithOAuth).
 *
 * Warum das nicht andersherum: `signInWithOAuth` legt einen NEUEN Nutzer an.
 * Wer zwei Wochen gelernt hat und sich dann anmeldet, waere seinen ganzen
 * Fortschritt los. Das ist der Fehler, den man erst bemerkt, wenn er
 * jemandem passiert ist - und dann ist es zu spaet.
 *
 * Im Web laeuft alles ueber eine Weiterleitung: die Seite verschwindet und
 * kommt angemeldet zurueck. Auf dem Handy oeffnet sich ein Anmeldefenster
 * ueber der App, und wir setzen die Sitzung danach selbst.
 */

export type GoogleResult =
  | { kind: 'redirecting' }
  | { kind: 'signed-in'; linked: boolean }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

/** Wohin Google zurueckschickt. Muss in Supabase als Redirect-URL erlaubt sein. */
function redirectTo(): string {
  if (Platform.OS === 'web') {
    // Zurueck auf die Seite, auf der man war - ohne Query-Anhaengsel, sonst
    // sammelt sich bei jedem Anlauf mehr Muell in der Adresse.
    return `${window.location.origin}/`;
  }
  return Linking.createURL('/auth/callback');
}

/**
 * Ist das gerade ein anonymes Konto?
 *
 * Supabase markiert das mit `is_anonymous`. Aeltere Sitzungen haben das Feld
 * nicht - dann gilt: keine E-Mail und keine verknuepfte Identitaet heisst
 * anonym.
 */
async function isAnonymous(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return false;
  if (typeof user.is_anonymous === 'boolean') return user.is_anonymous;
  return !user.email && (user.identities?.length ?? 0) === 0;
}

export async function signInWithGoogle(): Promise<GoogleResult> {
  const to = redirectTo();
  const anonymous = await isAnonymous();

  // --- Weg 1: an das bestehende Konto anhaengen ---------------------------
  if (anonymous) {
    const linked = await runFlow(
      () =>
        supabase.auth.linkIdentity({
          provider: 'google',
          options: { redirectTo: to, skipBrowserRedirect: Platform.OS !== 'web' },
        }),
      to,
    );
    // Nur bei einem echten Fehler weiterprobieren. Ein Abbruch durch den
    // Nutzer ist keine Einladung, es nochmal anders zu versuchen.
    if (linked.kind !== 'error') return linked;
  }

  // --- Weg 2: normale Anmeldung -------------------------------------------
  return runFlow(
    () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: to, skipBrowserRedirect: Platform.OS !== 'web' },
      }),
    to,
    !anonymous,
  );
}

type FlowStart = () => Promise<{
  data: { url?: string | null } | null;
  error: { message: string } | null;
}>;

async function runFlow(start: FlowStart, to: string, linked = false): Promise<GoogleResult> {
  const { data, error } = await start();
  if (error) return { kind: 'error', message: error.message };

  // Im Web hat der Browser die Seite in diesem Moment schon verlassen.
  if (Platform.OS === 'web') return { kind: 'redirecting' };

  const url = data?.url;
  if (!url) return { kind: 'error', message: 'Keine Anmelde-Adresse erhalten.' };

  const result = await WebBrowser.openAuthSessionAsync(url, to);
  if (result.type !== 'success') return { kind: 'cancelled' };

  const session = extractSession(result.url);
  if (!session) return { kind: 'error', message: 'Antwort von Google unvollstaendig.' };

  const { error: setError } = await supabase.auth.setSession(session);
  if (setError) return { kind: 'error', message: setError.message };

  return { kind: 'signed-in', linked };
}

/**
 * Die Sitzung aus der Rueckkehr-Adresse holen.
 *
 * Supabase haengt die Wertepaare je nach Ablauf an den Fragment- oder an den
 * Abfrageteil. Beide durchsuchen ist billiger als zu wissen, welcher es
 * gerade ist.
 */
function extractSession(url: string): { access_token: string; refresh_token: string } | null {
  const [, tail = ''] = url.split('#');
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  for (const part of [tail, query]) {
    const params = new URLSearchParams(part);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) return { access_token, refresh_token };
  }
  return null;
}
