import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { EmailAuthForm } from '@/features/auth/EmailAuthForm';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { api, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Konto: Profilbild, Anzeigename, Bio, E-Mail sichern.
 *
 * Der wichtigste Block ist unten: „Konto sichern". Ein anonymes Konto lebt
 * ausschliesslich auf diesem Gerät — Handy weg heisst Fortschritt weg. Das
 * steht auch so da, statt es hinter „Konto verknüpfen" zu verstecken.
 */

const AVATAR_SIZE = 512;

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
      setNote(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote('Ohne Zugriff auf die Fotos geht es leider nicht.');
      return;
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (res.canceled || !res.assets[0] || !profile) return;

    setBusy(true);
    try {
      // Vor dem Hochladen verkleinern. Ein Handyfoto hat 4 MB und wird nie
      // grösser als 72 px angezeigt - ungefragt Freikontingent zu verbrennen
      // waere schlicht schlampig.
      const shrunk = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG },
      );

      const bytes = await (await fetch(shrunk.uri)).arrayBuffer();
      const path = await api.uploadAvatar(profile.id, bytes, 'jpg');
      // Zeitstempel anhaengen, sonst zeigt der Cache das alte Bild.
      setProfile(await api.updateSettings({ avatar_path: path }));
      setNote('Profilbild aktualisiert');
      haptics.success();
      setTimeout(() => setNote(null), 2000);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={15} color={color.ink.mid} />
          <Text style={styles.backText}>zurück</Text>
        </Pressable>

        <Text style={styles.pageTitle}>Konto</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}

        {/* --- Profilbild ------------------------------------------------ */}
        <View style={styles.avatarRow}>
          <Pressable onPress={pickAvatar} disabled={busy}>
            <Avatar seed={profile.avatar_seed} path={profile.avatar_path} size={72} />
          </Pressable>
          <View style={styles.avatarText}>
            <Text style={styles.handle} numberOfLines={1}>{personName(profile)}</Text>
            <Text style={styles.handleSub}>@{profile.handle}</Text>
            <Pressable onPress={pickAvatar} disabled={busy} hitSlop={6}>
              <Text style={styles.link}>
                {profile.avatar_path ? 'Bild ändern' : 'Bild wählen'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* --- Name und Bio ---------------------------------------------- */}
        <View style={styles.group}>
          <Text style={styles.label}>Anzeigename</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Optional"
            placeholderTextColor={color.ink.low}
            style={styles.input}
            maxLength={40}
          />

          <Text style={styles.label}>Über dich</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Ein Satz. Optional."
            placeholderTextColor={color.ink.low}
            style={[styles.input, styles.inputTall]}
            multiline
            maxLength={160}
          />
          <Text style={styles.counter}>{bio.length} / 160</Text>

          <Button label="Speichern" busy={busy} onPress={saveText} />
        </View>

        {/* --- E-Mail ----------------------------------------------------- */}
        <View style={styles.group}>
          <Text style={styles.sectionTitle}>
            {isAnonymous ? 'Konto sichern' : 'Angemeldet'}
          </Text>

          {isAnonymous ? (
            <>
              <View style={styles.warning}>
                <Icon name="lock" size={16} color={color.signal.warn} />
                <Text style={styles.warningText}>
                  Dein Konto lebt nur auf diesem Gerät. Geht das Handy verloren
                  oder löschst du die App, sind XP, Streak und Wiederholungen weg.
                </Text>
              </View>
              <EmailAuthForm mode="upgrade" onDone={() => void load()} />
            </>
          ) : (
            <View style={styles.emailRow}>
              <Icon name="check" size={16} color={color.signal.success} />
              <Text style={styles.emailText}>{email}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  back: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: space.xs },
  backText: { ...type.meta, color: color.ink.mid },
  pageTitle: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  note: { ...type.body, fontSize: 14, color: color.signal.primary },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  avatarText: { gap: 4 },
  handle: { ...type.title, fontSize: 20, color: color.ink.max },
  handleSub: { ...type.mono, fontSize: 12, color: color.ink.low, marginTop: 2 },
  link: { ...type.label, color: color.signal.primary },

  group: { gap: space.sm },
  sectionTitle: { ...type.label, color: color.ink.mid, textTransform: 'uppercase', letterSpacing: 1 },
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
