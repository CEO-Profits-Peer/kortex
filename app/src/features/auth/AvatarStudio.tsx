import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, AvatarArt } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import {
  type AvatarDesign,
  PALETTE,
  SHAPES,
  SHAPE_LABEL,
  decodeAvatar,
  encodeAvatar,
  randomDesign,
} from '@/lib/avatarDesign';
import { haptics } from '@/lib/haptics';
import { pickAvatarImage } from '@/lib/pickImage';
import { api } from '@/lib/supabase';
import type { Profile } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Profilbild selbst zeichnen.
 *
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [design, setDesign] = useState<AvatarDesign | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await api.getMyProfile();
    if (!p) return;
    setProfile(p);
    setDesign(decodeAvatar(p.avatar_seed));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 2400);
  };

  const toggleCell = (row: number, col: number) => {
    const mirrored = col < 2 ? col : 3 - col;
    haptics.light();
    setDesign((d) =>
      d
        ? {
            ...d,
            cells: d.cells.map((r, i) =>
              i === row ? r.map((v, j) => (j === mirrored ? !v : v)) : r,
            ),
          }
        : d,
    );
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
        await api.updateSettings({ avatar_seed: encodeAvatar(design), avatar_path: '' }),
      );
      await api.deleteAvatar(old);
      haptics.success();
      flash('Profilbild gespeichert');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
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
      .catch((e: unknown) => flash(e instanceof Error ? e.message : 'Hochladen fehlgeschlagen'))
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
      flash(e instanceof Error ? e.message : 'Hat nicht geklappt');
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
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={15} color={color.ink.mid} />
          <Text style={styles.backText}>zurück</Text>
        </Pressable>

        <Text style={styles.pageTitle}>Profilbild</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}

        {/* --- Vorschau und Raster ---------------------------------------- */}
        <View style={styles.stage}>
          <View style={styles.previews}>
            <AvatarArt design={design} size={96} />
            {/* Solange ein Foto gesetzt ist, liegt es ueber dem Muster.
                Dann muss hier auch stehen, was andere tatsaechlich sehen -
                sonst arbeitet man an einem Bild, das gar nicht auftaucht. */}
            {profile.avatar_path ? (
              <View style={styles.liveRow}>
                <Avatar seed={profile.avatar_seed} path={profile.avatar_path} size={28} />
                <Text style={styles.liveLabel}>zeigt dein Foto</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.grid}>
            {/* Die Spiegelachse. Sie ersetzt die Abdunklung, die vorher auf
                der rechten Haelfte lag: die hat die gespiegelten Felder in
                einer anderen Farbe gezeigt, und damit sah das Raster
                genau nicht nach zwei gleichen Haelften aus - gemeldet als
                "sides not mirroring". Gespiegelt war es die ganze Zeit,
                man konnte es nur nicht sehen. */}
            <View pointerEvents="none" style={styles.axis} />
            {[0, 1, 2, 3].map((row) => (
              <View key={row} style={styles.gridRow}>
                {[0, 1, 2, 3].map((col) => {
                  const mirrored = col < 2 ? col : 3 - col;
                  const on = design.cells[row][mirrored];
                  return (
                    <Pressable
                      key={col}
                      onPress={() => toggleCell(row, col)}
                      style={[
                        styles.gridCell,
                        on ? { backgroundColor: PALETTE[design.tint] } : null,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={'Feld ' + (row + 1) + ' ' + (col + 1)}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
        <Text style={styles.hint}>
          Tippe die Felder an. Die rechte Hälfte spiegelt die linke — deshalb
          ergibt sich ein Zeichen und kein Flickenteppich.
        </Text>

        {/* --- Farbe ------------------------------------------------------ */}
        <View style={styles.group}>
          <Text style={styles.label}>Farbe</Text>
          <View style={styles.swatchRow}>
            {PALETTE.map((hex, i) => (
              <Pressable
                key={hex}
                onPress={() => {
                  haptics.light();
                  setDesign({ ...design, tint: i });
                }}
                style={[
                  styles.swatch,
                  { backgroundColor: hex },
                  design.tint === i ? styles.swatchOn : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={'Farbe ' + (i + 1)}
              />
            ))}
          </View>
        </View>

        {/* --- Form ------------------------------------------------------- */}
        <View style={styles.group}>
          <Text style={styles.label}>Form</Text>
          <View style={styles.chipRow}>
            {SHAPES.map((s) => (
              <Pressable
                key={s}
                onPress={() => {
                  haptics.light();
                  setDesign({ ...design, shape: s });
                }}
                style={[styles.chip, design.shape === s ? styles.chipOn : null]}
              >
                <Text style={[styles.chipText, design.shape === s ? styles.chipTextOn : null]}>
                  {SHAPE_LABEL[s]}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                haptics.light();
                setDesign({ ...design, core: !design.core });
              }}
              style={[styles.chip, design.core ? styles.chipOn : null]}
            >
              <Text style={[styles.chipText, design.core ? styles.chipTextOn : null]}>Kern</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              haptics.medium();
              setDesign(randomDesign());
            }}
            style={styles.ghost}
          >
            <Text style={styles.ghostText}>Würfeln</Text>
          </Pressable>
          <View style={styles.grow}>
            <Button label="Speichern" busy={busy} onPress={saveDesign} />
          </View>
        </View>

        {/* --- Eigenes Foto ------------------------------------------------ */}
        <View style={styles.group}>
          <Text style={styles.sectionTitle}>Oder ein eigenes Foto</Text>
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

const CELL = 44;

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
  },
  backText: { ...type.meta, color: color.ink.mid },
  pageTitle: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  note: { ...type.body, fontSize: 14, color: color.signal.primary },

  stage: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  previews: { gap: space.sm, alignItems: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  liveLabel: { ...type.meta, fontSize: 10, color: color.ink.low },
  grid: { borderRadius: radius.sm, overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },
  axis: {
    position: 'absolute',
    left: CELL * 2 - 1,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: color.bg,
    zIndex: 1,
  },
  gridCell: {
    width: CELL,
    height: CELL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
  },

  group: { gap: space.sm },
  sectionTitle: {
    ...type.label,
    color: color.ink.mid,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  label: { ...type.meta, color: color.ink.low },
  hint: { ...type.meta, color: color.ink.low, lineHeight: 17 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Acht Farben in EINE Zeile: bricht die Reihe um, haengt eine einzelne
  // Kachel darunter und sieht aus wie ein Fehler.
  swatchRow: { flexDirection: 'row', gap: space.xs },
  swatch: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 34,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchOn: { borderColor: color.ink.max },
  chip: {
    paddingHorizontal: space.lg,
    height: 38,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  chipOn: { borderColor: color.signal.primary, backgroundColor: color.bgSunken },
  chipText: { ...type.label, color: color.ink.mid },
  chipTextOn: { color: color.signal.primary },

  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1 },
  ghost: {
    height: 48,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  ghostText: { ...type.label, color: color.ink.high },
});
