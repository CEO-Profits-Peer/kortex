import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { analytics } from './analytics';
import { resetContentState } from './contentState';
import { supabase } from './supabase';

/**
 * Session-Status.
 *
 * Ohne angemeldeten Nutzer liefert der Feed nichts - jede Policy in
 * 0002_rls.sql prueft auth.uid(). Ein fehlender Login sieht sonst aus wie
 * ein leerer Feed, was beim Testen viel Zeit kostet.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setReady(true);

      // Nach einer Anmeldung ueber Google steht der Name in den Anmeldedaten,
      // aber noch nicht im Profil. Beim Verknuepfen eines anonymen Kontos
      // laeuft der Datenbank-Trigger gar nicht erst - dort ist das hier die
      // einzige Gelegenheit.
      //
      // Absichtlich ohne await und ohne Fehlerbehandlung nach aussen: geht es
      // schief, heisst der Nutzer weiter wie vorher. Das ist ein
      // Schoenheitsfehler, kein Grund, die Anmeldung zu blockieren.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        const provider = next?.user?.app_metadata?.provider;
        const providers = next?.user?.app_metadata?.providers ?? [];
        if (provider === 'google' || providers.includes('google')) {
          void Promise.resolve(supabase.rpc('adopt_identity_profile')).catch(
            () => {},
          );
        }
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, ready };
}

/**
 * Anonyme Anmeldung.
 *
 * Der schnellste Weg zu einem testbaren Prototyp: kein Passwort, keine
 * E-Mail-Bestaetigung, trotzdem ein echter Account mit eigener Zeile in
 * profiles, mit RLS, XP und Streak. Muss im Dashboard einmal freigeschaltet
 * werden (Authentication -> Sign In / Providers -> Anonymous).
 *
 * Spaeter kann derselbe Account per supabase.auth.updateUser() eine E-Mail
 * bekommen - der gesamte Fortschritt bleibt erhalten.
 */
export async function signInAnonymously() {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export async function signOut() {
  analytics.reset();
  // Der naechste Nutzer auf diesem Geraet hat andere Likes.
  resetContentState();
  await supabase.auth.signOut();
}
