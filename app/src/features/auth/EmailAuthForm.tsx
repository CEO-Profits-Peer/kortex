import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * E-Mail-Formular für zwei Fälle, die sich technisch unterscheiden:
 *
 *   'upgrade'  Ein anonymes Konto bekommt eine E-Mail. Der Fortschritt
 *              bleibt vollständig erhalten — es ist derselbe Datensatz,
 *              er wird nur ansprechbar gemacht.
 *   'signin'   Anmeldung auf einem anderen Gerät.
 *
 * Der Unterschied ist wichtig genug für zwei getrennte Texte: „Konto sichern"
 * und „Anmelden" sind für den Nutzer nicht dasselbe, auch wenn beide nach
 * E-Mail und Passwort fragen.
 */

type Mode = 'upgrade' | 'signin';

const MIN_PASSWORD = 8;

export function EmailAuthForm({
  mode,
  onDone,
}: {
  mode: Mode;
  onDone?: (info: { needsConfirmation: boolean }) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const emailLooksValid = /^\S+@\S+\.\S{2,}$/.test(email.trim());
  const ready = emailLooksValid && password.length >= MIN_PASSWORD;

  const hint = !email
    ? null
    : !emailLooksValid
      ? 'Die E-Mail-Adresse sieht noch nicht vollständig aus.'
      : password.length === 0
        ? `Jetzt ein Passwort, mindestens ${MIN_PASSWORD} Zeichen.`
        : password.length < MIN_PASSWORD
          ? `Noch ${MIN_PASSWORD - password.length} Zeichen.`
          : null;

  const submit = async () => {
    if (!ready) {
      haptics.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'upgrade') {
        // Hängt E-Mail und Passwort an das BESTEHENDE Konto. Kein neuer
        // Datensatz, keine Migration - XP, Streak und Wiederholungen bleiben.
        const { error: e1 } = await supabase.auth.updateUser({ email: email.trim() });
        if (e1) throw e1;
        const { error: e2 } = await supabase.auth.updateUser({ password });
        if (e2) throw e2;

        setDone(
          'Fast fertig: Wir haben dir eine Bestätigungsmail geschickt. ' +
            'Erst nach dem Klick darin ist dein Konto gesichert.',
        );
        haptics.success();
        onDone?.({ needsConfirmation: true });
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (e) throw e;
        haptics.success();
        onDone?.({ needsConfirmation: false });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Hat nicht geklappt';
      setError(translate(msg));
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.root}>
        <Text style={styles.success}>{done}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="E-Mail"
        placeholderTextColor={color.ink.low}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        inputMode="email"
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder={`Passwort (mind. ${MIN_PASSWORD} Zeichen)`}
        placeholderTextColor={color.ink.low}
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType={mode === 'upgrade' ? 'newPassword' : 'password'}
      />

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={mode === 'upgrade' ? 'Konto sichern' : 'Anmelden'}
        busy={busy}
        onPress={submit}
      />

      {mode === 'upgrade' ? (
        <Text style={styles.note}>
          Dein Fortschritt bleibt vollständig erhalten — es ist dasselbe Konto,
          es bekommt nur eine Adresse, unter der du es wiederfindest.
        </Text>
      ) : null}
    </View>
  );
}

/** Supabase antwortet auf Englisch. Die häufigsten Fälle übersetzt. */
function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Diese E-Mail gehört schon zu einem Konto. Melde dich stattdessen an.';
  }
  if (m.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort stimmt nicht.';
  }
  if (m.includes('email not confirmed')) {
    return 'Bestätige zuerst die E-Mail, die wir dir geschickt haben.';
  }
  if (m.includes('password should be at least')) {
    return `Das Passwort ist zu kurz — mindestens ${MIN_PASSWORD} Zeichen.`;
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Zu viele Versuche. Warte einen Moment.';
  }
  return msg;
}

const styles = StyleSheet.create({
  root: { gap: space.sm },
  input: {
    height: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...type.body,
    fontSize: 16,
    color: color.ink.max,
  },
  hint: { ...type.meta, color: color.ink.low },
  error: { ...type.body, fontSize: 14, color: color.signal.error },
  success: { ...type.body, fontSize: 15, color: color.signal.success },
  note: { ...type.meta, color: color.ink.low, lineHeight: 16 },
});
