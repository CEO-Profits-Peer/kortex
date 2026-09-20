import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { Icon } from '@/components/Icon';
import { EmailAuthForm } from '@/features/auth/EmailAuthForm';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { takeOAuthError } from '@/lib/oauthReturn';
import { api, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Konto: Profilbild, Anzeigename, Bio, E-Mail sichern.
 *
 * Der wichtigste Block ist unten: „Konto sichern". Ein anonymes Konto lebt
 * ausschliesslich auf diesem Gerät — Handy weg heisst Fortschritt weg. Das
 * steht auch so da, statt es hinter „Konto verknüpfen" zu verstecken.
 */

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  // Vor jedem fruehen return: Hooks duerfen nicht bedingt laufen.
  const scrollY = useSharedValue(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [setPassword, setSetPassword] = useState(false);
  // Kommt man gerade von einer gescheiterten Google-Anmeldung zurueck? Nur
  // einmal abholen - danach ist der Wert verbraucht.
  const [oauthError] = useState(() => takeOAuthError());

  const load = useCallback(async () => {
    const [p, { data: auth }] = await Promise.all([
      api.getMyProfile(),
      supabase.auth.getUser(),
    ]);
    if (p) {
      setProfile(p);
      setDisplayName(p.display_name ?? '');
      setBio(p.bio ?? '');
    }
    setEmail(auth.user?.email ?? null);
    setIsAnonymous(!auth.user?.email);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveText = async () => {
    setBusy(true);
    try {
      setProfile(await api.updateSettings({ display_name: displayName, bio }));
      setNote('Gespeichert');
      haptics.success();
      setTimeout(() => setNote(null), 2000);
    } catch (e) {
      setNote(fehlerText(e, 'Speichern fehlgeschlagen'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Das Bild wird nicht mehr hier ausgesucht.
   *
   * Frueher stand an dieser Stelle der ganze Ablauf: Berechtigung abfragen,
   * Auswahldialog, verkleinern, hochladen. Im Browser ist er nie
   * angekommen (siehe lib/pickImage.web.ts), und inzwischen gibt es ohnehin
   * mehr zu entscheiden als nur "welche Datei" - deshalb ein eigener
   * Bildschirm.
   */
  const openAvatarStudio = () => {
    haptics.light();
    router.push('/avatar');
  };

  if (!profile) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <Laden color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      {/* Die Kopfzeile liegt AUSSERHALB der Liste: sie muss stehen
          bleiben, um beim Scrollen zusammenklappen zu koennen. */}
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={T('Konto')} eyebrow={T('anmeldung & daten')} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {oauthError ? <Text style={styles.oauthError}>{oauthError.message}</Text> : null}

        {/* --- Profilbild ------------------------------------------------ */}
        <View style={styles.avatarRow}>
          <Pressable onPress={openAvatarStudio}>
            <Avatar seed={profile.avatar_seed} path={profile.avatar_path} size={72} />
          </Pressable>
          <View style={styles.avatarText}>
            <Text style={styles.handle} numberOfLines={1}>{personName(profile)}</Text>
            <Text style={styles.handleSub}>@{profile.handle}</Text>
            <Pressable onPress={openAvatarStudio} hitSlop={6}>
              <Text style={styles.link}>Profilbild gestalten</Text>
            </Pressable>
          </View>
        </View>

        {/* --- Name und Bio ---------------------------------------------- */}
        <View style={styles.group}>
          <Text style={styles.label}>Anzeigename</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={T('Optional')}
            placeholderTextColor={color.ink.low}
            style={styles.input}
            maxLength={40}
          />

          <Text style={styles.label}>{T('Über dich')}</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder={T('Ein Satz. Optional.')}
            placeholderTextColor={color.ink.low}
            style={[styles.input, styles.inputTall]}
            multiline
            maxLength={160}
          />
          <Text style={styles.counter}>{bio.length} / 160</Text>

          <Button label={T('Speichern')} busy={busy} onPress={saveText} />
        </View>

        {/* --- E-Mail ----------------------------------------------------- */}
        <View style={styles.group}>
          <SectionTitle>
            {isAnonymous ? 'Konto sichern' : 'Angemeldet'}
          </SectionTitle>

          {isAnonymous ? (
            <>
              <View style={styles.warning}>
                <Icon name="lock" size={16} color={color.signal.warn} />
                <Text style={styles.warningText}>{T('Dein Konto lebt nur auf diesem Gerät. Geht das Handy verloren oder löschst du die App, sind XP, Streak und Wiederholungen weg.')}</Text>
              </View>
              <EmailAuthForm mode="upgrade" onDone={() => void load()} />
            </>
          ) : (
            <>
              <View style={styles.emailRow}>
                <Icon name="check" size={16} color={color.signal.success} />
                <Text style={styles.emailText}>{email}</Text>
              </View>
              {/* Erst hier ist ein Passwort ueberhaupt moeglich: bei einem
                  Konto ohne bestaetigte Adresse lehnt Supabase es ab. */}
              {setPassword ? (
                <EmailAuthForm
                  mode="password"
                  onDone={() => {
                    setSetPassword(false);
                    setNote('Passwort gesetzt');
                    setTimeout(() => setNote(null), 2000);
                  }}
                />
              ) : (
                <Pressable onPress={() => setSetPassword(true)} hitSlop={6}>
                  <Text style={styles.link}>{T('Passwort setzen oder ändern')}</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  note: { ...type.body, fontSize: 14, color: color.akzent },
  oauthError: { ...type.body, fontSize: 14, lineHeight: 20, color: color.signal.error },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatarText: { gap: 4 },
  handle: { ...type.title, fontSize: 20, color: color.ink.max },
  handleSub: { ...type.mono, fontSize: 12, color: color.ink.low, marginTop: 2 },
  link: { ...type.label, color: color.akzent },

  group: { gap: space.sm },
  label: { ...type.meta, color: color.ink.low, marginTop: space.xs },
  input: {
    minHeight: 50,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...type.body,
    fontSize: 16,
    color: color.ink.max,
    ...flaeche(10),
  },
  inputTall: { minHeight: 84, textAlignVertical: 'top' },
  counter: { ...type.meta, color: color.ink.low, alignSelf: 'flex-end' },

  warning: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.signal.warn,
    backgroundColor: color.bgElevated,
  },
  warningText: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.high, flex: 1 },

  emailRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  emailText: { ...type.body, fontSize: 15, color: color.ink.high },
});
