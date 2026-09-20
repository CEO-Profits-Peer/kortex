import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import type { MenuEintrag } from '@/components/KartenMenue';
import { haptics } from '@/lib/haptics';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Die Rueckseite der Karte (20.09., einschaltbar).
 *
 * Karteikarten haben zwei Seiten - das muss man niemandem erklaeren.
 * Statt eines Menues, das sich ueber die Karte legt, dreht sich hier die
 * Karte um: hinten steht, was nicht beim Lesen gebraucht wird.
 *
 * Standard ist das NICHT. Eine Karte, die sich unerwartet dreht, ist eine
 * Ueberraschung; wer es will, schaltet es unter Einstellungen ein. Ohne
 * den Schalter bleibt es beim Menue.
 *
 * Die Eintraege sind dieselben wie im Menue - eine Liste, zwei Kleider.
 * Damit koennen beide Wege nie auseinanderlaufen.
 */
export function KartenRueckseite({
  titel,
  eintraege,
  onClose,
}: {
  titel: string;
  eintraege: MenuEintrag[];
  onClose: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.seite}>
      <View style={styles.kopf}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.oben}>{T('Rückseite')}</Text>
          <Text style={styles.titel} numberOfLines={2}>
            {titel}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={T('Umdrehen')}>
          <Icon name="refresh" size={18} color={color.ink.mid} />
        </Pressable>
      </View>

      <ScrollView style={styles.liste} showsVerticalScrollIndicator={false}>
        {eintraege.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => {
              haptics.light();
              e.onPress();
            }}
            style={({ pressed }) => [styles.zeile, pressed && { backgroundColor: color.bgSunken }]}
          >
            <Icon name={e.icon} size={17} color={e.aktiv ? color.akzent : color.ink.mid} />
            <Text style={[styles.label, e.aktiv && { color: color.akzent }]} numberOfLines={1}>
              {e.label}
            </Text>
            {e.rechts ? <Text style={styles.rechts}>{e.rechts}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.fuss}>{T('Tippen auf das Symbol dreht zurück')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  seite: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    backgroundColor: color.bgElevated,
    padding: space.xl,
    gap: space.md,
    ...flaeche(14),
  },
  kopf: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  oben: { ...type.meta, fontSize: 10, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  titel: { ...type.title, fontSize: 18, lineHeight: 23, color: color.ink.max },
  liste: { flexGrow: 0 },
  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  label: { ...type.label, fontSize: 15, color: color.ink.high, flex: 1, minWidth: 0 },
  rechts: { ...type.meta, fontSize: 11, color: color.ink.low },
  fuss: { ...type.meta, fontSize: 10, color: color.ink.low, textAlign: 'center' },
});
