import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { OFFLINE_TEXT } from '@/lib/fehler';
import { istNetzfehler } from '@/lib/online';
import { T } from '@/lib/sprache';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * E-Mail-Formular für drei Fälle, die sich technisch unterscheiden.
 *
 *   'upgrade'   Ein anonymes Konto bekommt eine E-Mail. Derselbe Datensatz,
 *               er wird nur ansprechbar gemacht. NUR die Adresse - kein
 *               Passwort, siehe unten.
 *   'signin'    Anmeldung auf einem anderen Gerät: Passwort oder Link.
 *   'password'  Ein Passwort setzen oder ändern, wenn die Adresse schon
 *               bestätigt ist.
 *
 * Warum 'upgrade' kein Passwort mehr abfragt
 * ------------------------------------------
 * Es ging nicht, und zwar grundsätzlich. Der alte Ablauf war:
 *
 *     await supabase.auth.updateUser({ email })     // 200
 *     await supabase.auth.updateUser({ password })  // 422
 *
 * Der erste Aufruf sieht erfolgreich aus, hängt die Adresse aber nur als
 * `new_email` an - bestätigt ist sie erst nach dem Klick in der Mail. Bis
 * dahin gilt das Konto weiter als anonym, und der zweite Aufruf antwortet:
 *
 *     "Updating password of an anonymous user without an email
 *      or phone is not allowed"
 *
 * Das Formular hat also zuverlässig eine Bestätigungsmail verschickt und
 * danach einen Fehler angezeigt. Wer daraufhin nochmal drückte, lief in die
 * Sendesperre von Supabase. Genau so war es gemeldet: "Creating account
 * with E-Mail doesn't work."
 *
 * Die Reihenfolge lässt sich nicht umdrehen - also fällt der Schritt weg,
 * an dem sie scheitert. Erst die Adresse, bestätigen, und ein Passwort
 * setzt man danach, wenn man eines will. Wer keines setzt, meldet sich per
 * Link an; das ist ohnehin der Weg, den die meisten nehmen.
 */

type Mode = 'upgrade' | 'signin' | 'password';

const MIN_PASSWORD = 8;

/** Wohin der Link aus der Mail zurückführt. Muss in Supabase erlaubt sein. */
function emailRedirectTo(): string | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return `${window.location.origin}/`;
}

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

  const wantsEmail = mode !== 'password';
  const wantsPassword = mode !== 'upgrade';

  const emailLooksValid = /^\S+@\S+\.\S{2,}$/.test(email.trim());
  const ready =
    (!wantsEmail || emailLooksValid) && (!wantsPassword || password.length >= MIN_PASSWORD);

  const hint = !wantsEmail
    ? password.length > 0 && password.length < MIN_PASSWORD
      ? `Noch ${MIN_PASSWORD - password.length} Zeichen.`
      : null
    : !email
      ? null
      : !emailLooksValid
        ? 'Die E-Mail-Adresse sieht noch nicht vollständig aus.'
        : !wantsPassword
          ? null
          : password.length === 0
            ? `Jetzt ein Passwort, mindestens ${MIN_PASSWORD} Zeichen.`
            : password.length < MIN_PASSWORD
              ? `Noch ${MIN_PASSWORD - password.length} Zeichen.`
              : null;

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      const message = await fn();
      haptics.success();
      if (message) {
        setDone(message);
        onDone?.({ needsConfirmation: true });
      } else {
        onDone?.({ needsConfirmation: false });
      }
    } catch (e) {
      setError(
        istNetzfehler(e)
          ? OFFLINE_TEXT
          : translate(e instanceof Error ? e.message : 'Hat nicht geklappt'),
      );
      haptics.warning();
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!ready) {
      haptics.warning();
      return;
    }
    void run(async () => {
      if (mode === 'upgrade') {
        // Hängt die Adresse an das BESTEHENDE Konto. Kein neuer Datensatz,
        // keine Migration - XP, Streak und Wiederholungen bleiben.
        const { error: e } = await supabase.auth.updateUser(
          { email: email.trim() },
          { emailRedirectTo: emailRedirectTo() },
        );
        if (e) throw e;
        return (
          'Wir haben dir eine Mail geschickt. Klick den Link darin — dann ' +
          'gehört dein Fortschritt zu dieser Adresse und du kommst von jedem ' +
          'Gerät daran.'
        );
      }

      if (mode === 'password') {
        const { error: e } = await supabase.auth.updateUser({ password });
        if (e) throw e;
        return null;
      }

      const { error: e } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (e) throw e;
      return null;
    });
  };

  /** Anmelden ohne Passwort. Für alle, die per Link gesichert haben. */
  const sendLink = () => {
    if (!emailLooksValid) {
      haptics.warning();
      setError('Trag zuerst deine E-Mail-Adresse ein.');
      return;
    }
    void run(async () => {
      const { error: e } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        // Kein neues Konto aus Versehen: wer sich anmelden will, hat schon eins.
        options: { shouldCreateUser: false, emailRedirectTo: emailRedirectTo() },
      });
      if (e) throw e;
      return 'Link unterwegs. Öffne die Mail auf diesem Gerät, dann bist du drin.';
    });
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
      {wantsEmail ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={T('E-Mail')}
          placeholderTextColor={color.ink.low}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          inputMode="email"
        />
      ) : null}

      {wantsPassword ? (
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={`Passwort (mind. ${MIN_PASSWORD} Zeichen)`}
          placeholderTextColor={color.ink.low}
          style={styles.input}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
        />
      ) : null}

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={
          mode === 'upgrade' ? 'Konto sichern' : mode === 'password' ? 'Passwort setzen' : 'Anmelden'
        }
        busy={busy}
        onPress={submit}
      />

      {mode === 'signin' ? (
        <Pressable onPress={sendLink} disabled={busy} hitSlop={8}>
          <Text style={styles.linkAction}>{T('Kein Passwort? Anmeldelink an diese Adresse schicken')}</Text>
        </Pressable>
      ) : null}

      {mode === 'upgrade' ? (
        <Text style={styles.note}>
          Dein Fortschritt bleibt vollständig erhalten — es ist dasselbe Konto,
          es bekommt nur eine Adresse, unter der du es wiederfindest. Ein
          Passwort kannst du danach setzen; nötig ist es nicht.
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
  if (m.includes('email address') && m.includes('invalid')) {
    return 'Diese Adresse akzeptiert der Anbieter nicht. Nimm deine echte E-Mail.';
  }
  if (m.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort stimmt nicht.';
  }
  if (m.includes('signups not allowed') || m.includes('user not found')) {
    return 'Zu dieser Adresse gibt es noch kein Konto.';
  }
  if (m.includes('email not confirmed')) {
    return 'Bestätige zuerst die E-Mail, die wir dir geschickt haben.';
  }
  if (m.includes('password should be at least')) {
    return `Das Passwort ist zu kurz — mindestens ${MIN_PASSWORD} Zeichen.`;
  }
  if (m.includes('email send rate') || m.includes('rate limit') || m.includes('too many')) {
    return 'Zu viele Mails in kurzer Zeit. Warte ein paar Minuten und versuch es nochmal.';
  }
  if (m.includes('anonymous user')) {
    return 'Bestätige zuerst die E-Mail — danach kannst du ein Passwort setzen.';
  }
  // Der Mailversand selbst ist kaputt, nicht die Eingabe.
  //
  // GoTrue meldet das als "Error sending confirmation email" (bzw. recovery,
  // magic link, email change) — bisher fiel das durch bis in die letzte
  // Zeile und der Nutzer bekam rohes Englisch zu lesen. Das ist die
  // schlechteste Stelle dafür: er hat gerade seine Adresse eingetippt und
  // denkt, er hätte sie falsch geschrieben.
  //
  // Der wichtigste Teil der Meldung ist der zweite Satz. Wer hier steht,
  // benutzt die App längst mit einem anonymen Konto — und genau dieses
  // Konto ist unberührt. Es geht nichts verloren, es lässt sich nur gerade
  // nicht sichern.
  if (m.includes('error sending') || m.includes('smtp')) {
    return (
      'Die Mail konnte gerade nicht verschickt werden — das liegt nicht an ' +
      'dir. Dein Fortschritt bleibt auf diesem Gerät erhalten; versuch es ' +
      'später nochmal.'
    );
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
  success: { ...type.body, fontSize: 15, lineHeight: 22, color: color.signal.success },
  linkAction: { ...type.label, color: color.akzent, paddingVertical: space.xs },
  note: { ...type.meta, color: color.ink.low, lineHeight: 16 },
});
