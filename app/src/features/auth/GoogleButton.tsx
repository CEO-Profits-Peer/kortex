import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Laden } from '@/components/Laden';
import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { T } from '@/lib/sprache';
import { color, radius, space, type } from '@/theme/tokens';

import { signInWithGoogle } from './googleSignIn';

/**
 * "Weiter mit Google".
 *
 * Das G bleibt in Googles Farben. Das ist die eine Stelle, an der die
 * Blaupausen-Regel "Farbe nur bei Interaktion" nicht gilt: das Zeichen ist
 * eine Marke, kein Gestaltungselement, und ein umgefaerbtes Google-G sieht
 * nach Nachahmung aus. Der Rest des Knopfes bleibt im System.
 */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"
      />
    </Svg>
  );
}

export function GoogleButton({
  label = T('Weiter mit Google'),
  onDone,
  /**
   * Anmelden statt anhaengen. Wird gesetzt, wenn die Rueckkehr von Google
   * gemeldet hat, dass dieses Konto schon vergeben ist - dann waere ein
   * weiterer Versuch mit linkIdentity nur derselbe Fehler nochmal.
   */
  forceNew = false,
}: {
  label?: string;
  onDone?: () => void;
  forceNew?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = async () => {
    setBusy(true);
    setError(null);
    haptics.medium();
    const result = await signInWithGoogle({ forceNew });

    switch (result.kind) {
      case 'redirecting':
        // Die Seite ist unterwegs. Den Ladezustand stehen lassen - ein
        // wieder freigegebener Knopf waere eine Einladung zum Doppelklick.
        return;
      case 'signed-in':
        analytics.signedIn('google');
        onDone?.();
        setBusy(false);
        return;
      case 'cancelled':
        setBusy(false);
        return;
      case 'error':
        setError(friendly(result.message));
        setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={press}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {busy ? (
          <Laden size="small" color={color.ink.high} />
        ) : (
          <>
            <GoogleMark />
            <Text style={styles.label}>{label}</Text>
          </>
        )}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * Supabase-Fehlermeldungen sind fuer Entwickler geschrieben.
 *
 * Die eine, die hier wirklich vorkommt, ist "Unsupported provider" - Google
 * ist im Dashboard noch nicht eingeschaltet. Das ist keine Nutzerschuld und
 * auch kein Nutzerproblem, aber solange die App vor dem Start steht, ist die
 * Anleitung an dieser Stelle mehr wert als eine hoefliche Floskel.
 */
function friendly(message: string): string {
  if (/unsupported provider|provider is not enabled/i.test(message)) {
    return (
      'Google ist im Supabase-Projekt noch nicht eingeschaltet: ' +
      'Authentication → Sign In / Providers → Google.'
    );
  }
  if (/manual linking|identity_already_exists/i.test(message)) {
    return 'Dieses Google-Konto ist schon mit einem anderen Profil verbunden.';
  }
  return message;
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  button: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  pressed: { opacity: 0.82 },
  label: { ...type.label, fontSize: 15, color: color.ink.max },
  error: { ...type.meta, color: color.signal.error },
});
