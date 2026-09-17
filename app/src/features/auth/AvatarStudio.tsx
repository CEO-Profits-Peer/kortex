import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AvatarEditor } from '@/features/auth/AvatarEditor';
import { type WabenDesign, wabenDekodieren, wabenKodieren, wabenWuerfeln } from '@/lib/avatarWaben';
import { haptics } from '@/lib/haptics';
import { pickAvatarImage } from '@/lib/pickImage';
import { api } from '@/lib/supabase';
import type { Profile } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Profilbild selbst zeichnen.
 *
 * Seit 16.09.2026 auf Waben (Format v2, avatarWaben.ts): das Zeichnen
 * selbst steckt in AvatarEditor, hier bleiben Laden, Speichern und das
 * eigene Foto. Wer noch ein altes Bild (v1 oder gehasht) hat, bekommt als
 * Startpunkt ein Wabenbild, das aus seinem alten Seed gewuerfelt ist -
 * immer dasselbe, damit Oeffnen und Schliessen nichts veraendert. Solange
 * nicht gespeichert wird, bleibt das alte Bild bestehen.
 *
 * (Frueher:)
 * Der Gedanke: nicht mehr Auswahl im Sinne von mehr Vorlagen, sondern
 * dieselbe Bildsprache in die Hand des Nutzers geben. Wer mag, tippt sein
 * Zeichen selbst zusammen; wer nicht, wuerfelt zweimal und ist fertig.
 *
 * Die rechte Haelfte des Rasters ist nicht eigenstaendig - sie IST die
 * linke, gespiegelt. Das sieht man beim ersten Tippen sofort, und es ist
 * der Grund, warum die Ergebnisse wie Zeichen aussehen und nicht wie
 * Rauschen.
 */
export function AvatarStudio() {
  const insets = useSafeAreaInsets();
  // Vor jedem fruehen return: Hooks duerfen nicht bedingt laufen.
  const scrollY = useSharedValue(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [design, setDesign] = useState<WabenDesign | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await api.getMyProfile();
    if (!p) return;
    setProfile(p);
    setDesign(wabenDekodieren(p.avatar_seed) ?? wabenWuerfeln('spiegel', p.avatar_seed));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 2400);
  };

  const saveDesign = async () => {
    if (!design || !profile) return;
    setBusy(true);
    try {
      // Das Foto muss weg, sonst liegt es ueber dem Muster und der Nutzer
      // sieht von seiner Arbeit nichts - und dann auch wirklich weg, nicht
      // nur der Verweis darauf.
      const old = profile.avatar_path;
      setProfile(
        await api.updateSettings({ avatar_seed: wabenKodieren(design), avatar_path: '' }),
      );
      await api.deleteAvatar(old);
      haptics.success();
      flash('Profilbild gespeichert');
    } catch (e) {
      flash(fehlerText(e, 'Speichern fehlgeschlagen'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Kein `await` vor pickAvatarImage(): im Browser haengt das Oeffnen des
   * Dateidialogs an der Nutzergeste, und die ist nach dem ersten await weg.
   */
  const uploadPhoto = () => {
    if (!profile) return;
    const picked = pickAvatarImage();
    // `busy` erst, wenn wirklich eine Datei da ist - NICHT schon beim
    // Oeffnen des Dialogs.
    //
    // Vorher stand es hier, und das machte den Bildschirm von einem
    // abgebrochenen Dateidialog abhaengig: meldet der Browser den Abbruch
    // nicht (Safari), loest das Versprechen nie auf, das `finally` laeuft
    // nie, und beide Knoepfe bleiben deaktiviert. Danach tut "Profilbild
    // aendern" gar nichts mehr, bis man den Bildschirm verlaesst.
    //
    // Waehrend der Dialog offen ist, gibt es ohnehin nichts zu sperren -
    // er liegt darueber. Gesperrt gehoert das Hochladen, und das faengt
    // erst hier an.
    picked
      .then(async (img) => {
        if (!img) return;
        setBusy(true);
        const path = await api.uploadAvatar(profile.id, img.bytes, img.ext, profile.avatar_path);
        setProfile(await api.updateSettings({ avatar_path: path }));
        haptics.success();
        flash('Foto uebernommen');
      })
      .catch((e: unknown) => flash(fehlerText(e, 'Hochladen fehlgeschlagen')))
      .finally(() => setBusy(false));
  };

  const removePhoto = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const old = profile.avatar_path;
      setProfile(await api.updateSettings({ avatar_path: '' }));
      await api.deleteAvatar(old);
      flash('Foto entfernt — dein Muster ist wieder da');
    } catch (e) {
      flash(fehlerText(e, 'Hat nicht geklappt'));
    } finally {
      setBusy(false);
    }
  };

  if (!profile || !design) {
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
      {/* Die Kopfzeile liegt AUSSERHALB der Liste: sie muss stehen
          bleiben, um beim Scrollen zusammenklappen zu koennen. */}
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Profilbild" eyebrow="dein zeichen" scrollY={scrollY} />
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
      >
        {note ? <Text style={styles.note}>{note}</Text> : null}

        {/* Solange ein Foto gesetzt ist, liegt es ueber dem Muster. Dann muss
            hier auch stehen, was andere tatsaechlich sehen - sonst arbeitet
            man an einem Bild, das gar nicht auftaucht. */}
        {profile.avatar_path ? (
          <View style={styles.liveRow}>
            <Avatar seed={profile.avatar_seed} path={profile.avatar_path} size={28} />
            <Text style={styles.liveLabel}>Andere sehen gerade dein Foto</Text>
          </View>
        ) : null}

        <AvatarEditor design={design} onChange={setDesign} />

        <Button label="Speichern" busy={busy} onPress={saveDesign} />

        {/* --- Eigenes Foto ------------------------------------------------ */}
        <View style={styles.group}>
          <Text style={styles.sectionTitle}>Foto</Text>
          <Text style={styles.hint}>
            Ein Foto liegt über dem Muster. Nimmst du es wieder weg, ist dein
            Zeichen unverändert da.
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={uploadPhoto} disabled={busy} style={styles.ghost}>
              <Text style={styles.ghostText}>
                {profile.avatar_path ? 'Anderes Foto' : 'Foto wählen'}
              </Text>
            </Pressable>
            {profile.avatar_path ? (
              <Pressable onPress={removePhoto} disabled={busy} style={styles.ghost}>
                <Text style={[styles.ghostText, { color: color.signal.error }]}>
                  Foto entfernen
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  note: { ...type.body, fontSize: 14, color: color.akzent },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  liveLabel: { ...type.meta, color: color.ink.low },

  group: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  sectionTitle: { ...type.label, color: color.ink.high },
  hint: { ...type.meta, color: color.ink.low, lineHeight: 17 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ghost: {
    height: 44,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
  },
  ghostText: { ...type.label, color: color.ink.high },
});
