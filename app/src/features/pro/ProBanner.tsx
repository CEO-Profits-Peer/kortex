import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { BordeauxMuster, SechseckLinse } from '@/components/Sechseck';
import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { ZWEI, facette } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * "PRO werden" im eigenen Profil - fuehrt nur zur Vorschau (ProScreen).
 *
 * Eine Karte, kein Popup: wer sein Profil ansieht, will sein Profil sehen.
 * Ein Banner, das man uebergehen kann, stoert nicht; eines, das sich
 * davorschiebt, schon. In Design 2.0 eine der wenigen Bordeaux-Karten.
 */
export function ProBanner() {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        analytics.proGeoeffnet();
        router.push('/pro');
      }}
      style={({ pressed }) => [styles.karte, pressed && { opacity: 0.88 }]}
      accessibilityRole="button"
      accessibilityLabel="PRO werden"
    >
      {ZWEI ? <BordeauxMuster /> : null}
      <View style={styles.zeichen}>
        {ZWEI ? <SechseckLinse b={38} h={44} /> : null}
        <View style={styles.zeichenMitte}>
          <Icon name="mastery" size={18} color={color.signal.primary} />
        </View>
      </View>
      <View style={styles.text}>
        <Text style={styles.titel}>PRO werden</Text>
        <Text style={styles.unter} numberOfLines={1}>
          Sammeln, Statistik, Ligen – bald
        </Text>
      </View>
      <Icon name="chevron" size={16} color={ZWEI ? color.ink.high : color.ink.low} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  karte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.signal.primary,
    backgroundColor: color.bgElevated,
    overflow: 'hidden',
    ...(ZWEI ? { borderWidth: 0, backgroundColor: color.bordeaux, ...facette(10) } : null),
  },
  zeichen: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    ...(ZWEI ? null : { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: color.signal.primary, height: 38 }),
  },
  zeichenMitte: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  text: { flex: 1, gap: 1 },
  titel: { ...type.label, fontSize: 15, color: color.ink.max },
  unter: { ...type.meta, color: ZWEI ? '#D6C3BE' : color.ink.low },
});
