import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';

import { Avatar } from '@/components/Avatar';
import { GridBackground } from '@/components/GridBackground';
import { EmailAuthForm } from '@/features/auth/EmailAuthForm';
import { GoogleButton } from '@/features/auth/GoogleButton';
import { BRAND } from '@/lib/brand';
import { takeOAuthError } from '@/lib/oauthReturn';
import { signInAnonymously } from '@/lib/useSession';
import { fehlerText } from '@/lib/fehler';
import { offeneEinladung } from '@/lib/invite';
import { api } from '@/lib/supabase';
import type { InvitePreview } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Der erste Bildschirm.
 *
 * Fuer den Prototyp bewusst ein einziger Knopf statt eines Formulars: jede
 * Eingabemaske vor dem ersten Inhalt kostet Tester. Das vollstaendige
 * Onboarding (Region, Geburtsjahr, Interessen) kommt in v0.2 - dann wird
 * derselbe anonyme Account um eine E-Mail ergaenzt, ohne dass Fortschritt
 * verloren geht.
 */
export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kommt man von einer gescheiterten Google-Anmeldung zurueck, wurde das
  // bisher verschluckt: dieselbe Startseite, kein Hinweis, und der naechste
  // Versuch scheiterte genauso. Jetzt steht es da.
  const [oauthError] = useState(() => takeOAuthError());
  // Gehoert das Google-Konto schon jemandem, ist "anmelden" der Ausweg -
  // also gleich dorthin aufmachen.
  const [signin, setSignin] = useState(Boolean(oauthError?.alreadyLinked));

  // Kommt jemand ueber einen Einladungslink, soll er sehen, VON WEM - ein
  // Name, den man kennt, ist der Grund, auf "Los geht's" zu tippen. Scheitert
  // die Vorschau, geht die Einladung trotzdem: eingeloest wird spaeter.
  const [einlader, setEinlader] = useState<InvitePreview | null>(null);
  useEffect(() => {
    let lebt = true;
    void (async () => {
      const code = await offeneEinladung();
      if (!code) return;
      try {
        const p = await api.invitePreview(code);
        if (lebt && p) setEinlader(p);
      } catch {
        // ohne Vorschau geht es trotzdem
      }
    })();
    return () => {
      lebt = false;
    };
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    haptics.medium();
    try {
      await signInAnonymously();
      analytics.signedIn('anonymous');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen';
      setError(
        /anonymous/i.test(msg)
          ? 'Anonyme Anmeldung ist im Supabase-Dashboard noch nicht aktiviert: ' +
              'Authentication → Sign In / Providers → Anonymous einschalten.'
          : fehlerText(e, 'Anmeldung fehlgeschlagen'),
      );
      setBusy(false);
    }
  };

  return (
    <GridBackground>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.hero}>
          <Text style={styles.wordmark}>{BRAND.name}</Text>
          <Text style={styles.claim}>
            Kurze {BRAND.unit.many}. Echte Fragen.{'\n'}Und in drei Tagen fragen wir nochmal.
          </Text>
        </View>

        <View style={styles.actions}>
          {einlader ? (
            <View style={styles.einladung}>
              <Avatar seed={einlader.avatar_seed} path={einlader.avatar_path} size={34} />
              <Text style={styles.einladungText}>
                <Text style={styles.einladungName}>
                  {einlader.name || `@${einlader.handle}`}
                </Text>{' '}
                hat dich eingeladen. Ihr folgt euch automatisch.
              </Text>
            </View>
          ) : null}
          {oauthError ? <Text style={styles.oauthError}>{oauthError.message}</Text> : null}
          {signin ? (
            <>
              <GoogleButton label="Anmelden mit Google" forceNew />
              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>oder</Text>
                <View style={styles.orLine} />
              </View>
              <EmailAuthForm mode="signin" />
              <Pressable onPress={() => setSignin(false)} hitSlop={8}>
                <Text style={styles.switchMode}>Doch neu anfangen</Text>
              </Pressable>
            </>
          ) : (
          <>
          <Pressable
            onPress={start}
            disabled={busy}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={color.bg} />
            ) : (
              <Text style={styles.ctaLabel}>Los geht's</Text>
            )}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Google steht UNTER dem anonymen Start, nicht darueber. Der
              schnellste Weg zum ersten Inhalt bleibt der Weg ohne Konto -
              wer sich lieber gleich anmeldet, findet es direkt darunter. */}
          <GoogleButton />

          <Pressable onPress={() => setSignin(true)} hitSlop={8}>
            <Text style={styles.switchMode}>Ich habe schon ein Konto</Text>
          </Pressable>

          <Text style={styles.legal}>
            Es wird ein anonymes Konto angelegt — keine E-Mail, kein Passwort.
            Du kannst es später jederzeit sichern.
          </Text>
          </>
          )}
        </View>
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  einladung: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.signal.primary,
    backgroundColor: color.bgElevated,
  },
  einladungText: { ...type.body, fontSize: 14.5, lineHeight: 20, color: color.ink.high, flex: 1 },
  einladungName: { color: color.ink.max },

  root: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', gap: space.lg },
  wordmark: {
    ...type.display,
    fontSize: 44,
    lineHeight: 50,
    color: color.ink.max,
    letterSpacing: -1.2,
  },
  claim: { ...type.deck, color: color.ink.mid },

  actions: { gap: space.md, paddingBottom: space.xxl },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.ink.faint },
  orText: { ...type.meta, color: color.ink.low },
  cta: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.signal.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.82 },
  ctaLabel: { ...type.label, fontSize: 17, color: color.bg },
  error: { ...type.meta, color: color.signal.error, lineHeight: 18 },
  oauthError: { ...type.body, fontSize: 14, lineHeight: 20, color: color.signal.error },
  legal: { ...type.meta, color: color.ink.low, textAlign: 'center', lineHeight: 16 },
  switchMode: { ...type.label, color: color.signal.primary, textAlign: 'center', paddingVertical: space.sm },
});
