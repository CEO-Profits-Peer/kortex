import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { Icon, type IconName } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { ZWEI } from '@/theme/design';
import { color, space, type } from '@/theme/tokens';

/**
 * Die Wege aus dem Profil als Waben (19.09., Idee des Nutzers): drei oben,
 * zwei verzahnt darunter - wie ein Stueck vom Profilbild-Raster.
 *
 * Vorher acht gleiche Kaestchen in einer Reihe, jedes zu schmal fuer seine
 * Beschriftung. Fuenf Waben sind lesbar und brauchen trotzdem wenig Hoehe,
 * weil die untere Reihe um ein Viertel in die obere greift.
 *
 * Kommt eines Tages eine sechste dazu: dann als Kreis aus sechs Waben mit
 * dem Logo in der Mitte - so vorgemerkt, nicht gebaut.
 */

export type Wabe = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Kleine Zahl oben rechts, z. B. faellige Wiederholungen. */
  badge?: number;
  /** Farbe fuer Symbol und Beschriftung, wenn die Wabe gerade wichtig ist. */
  tint?: string;
};

const LUECKE = 6;

/** Sechseck mit Spitze oben, b breit, h hoch. */
function punkte(b: number, h: number, i = 0) {
  return [
    [b / 2, i],
    [b - i, h * 0.25 + i / 2],
    [b - i, h * 0.75 - i / 2],
    [b / 2, h - i],
    [i, h * 0.75 - i / 2],
    [i, h * 0.25 + i / 2],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

export function WabenKacheln({ waben }: { waben: Wabe[] }) {
  const { width } = useWindowDimensions();
  // Hoechstens so breit wie der Inhaltsbereich, aber nie riesig am Desktop.
  const verfuegbar = Math.min(width, 440) - 2 * space.xl;
  // 88 px: gross genug fuer 'Meisterwege', klein genug, dass die fuenf
  // Waben kaum hoeher sind als zwei Zeilen Text.
  const b = Math.min(88, (verfuegbar - 2 * LUECKE) / 3);
  const h = b / 0.866;
  const oben = waben.slice(0, 3);
  const unten = waben.slice(3, 5);

  return (
    <View style={{ alignItems: 'center', height: h + h * 0.75 + LUECKE * 0.866 }}>
      <View style={[styles.reihe, { gap: LUECKE }]}>
        {oben.map((w) => (
          <Einzel key={w.label} w={w} b={b} h={h} />
        ))}
      </View>
      {/* Um eine Viertelhoehe nach oben verschoben: so greifen die Waben
          ineinander wie im Raster, statt nur untereinander zu stehen. */}
      <View style={[styles.reihe, { gap: LUECKE, marginTop: -h * 0.25 + LUECKE * 0.866 }]}>
        {unten.map((w) => (
          <Einzel key={w.label} w={w} b={b} h={h} />
        ))}
      </View>
    </View>
  );
}

function Einzel({ w, b, h }: { w: Wabe; b: number; h: number }) {
  const farbe = w.tint ?? color.ink.mid;
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        w.onPress();
      }}
      style={({ pressed }) => [{ width: b, height: h }, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
      accessibilityRole="button"
      accessibilityLabel={w.badge ? `${w.label}, ${w.badge} offen` : w.label}
    >
      <Svg width={b} height={h} style={StyleSheet.absoluteFill}>
        <Polygon
          points={punkte(b, h, 0.75)}
          fill={color.bgElevated}
          stroke={w.tint ?? (ZWEI ? 'rgba(214, 207, 199, 0.16)' : color.ink.faint)}
          strokeOpacity={w.tint ? 0.7 : 1}
          strokeWidth={1}
        />
      </Svg>
      <View style={styles.inhalt}>
        <View>
          <Icon name={w.icon} size={20} color={farbe} />
          {w.badge ? (
            <View style={[styles.badge, { backgroundColor: w.tint ?? color.signal.primary }]}>
              <Text style={styles.badgeText}>{w.badge > 9 ? '9+' : w.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, w.tint ? { color: w.tint } : null]} numberOfLines={1}>
          {w.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reihe: { flexDirection: 'row', justifyContent: 'center' },
  inhalt: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 1 },
  label: { ...type.meta, fontSize: 9.5, letterSpacing: -0.2, color: color.ink.mid, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.meta, fontSize: 9, lineHeight: 11, color: color.bg },
});
