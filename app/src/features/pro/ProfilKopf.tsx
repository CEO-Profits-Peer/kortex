import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Polygon, Rect } from 'react-native-svg';

import { BordeauxMuster } from '@/components/Sechseck';
import { ZWEI, facette } from '@/theme/design';
import { color, space } from '@/theme/tokens';

/**
 * Profil-Themes (PRO, 0098): die Kopfkarte eines Profils.
 *
 * Ohne Theme bleibt der Kopf, wie er war - offen auf dem Hintergrund. Mit
 * Theme liegt er auf einer geschliffenen Karte. Nur in Design 2.0: das
 * klassische Design hat keine Facetten und keine Bordeaux-Toene.
 */

export type ProfilTheme = 'bordeaux' | 'nacht' | 'smaragd' | 'gold';

export const PROFIL_THEMES: { id: ProfilTheme; label: string }[] = [
  { id: 'bordeaux', label: 'Bordeaux' },
  { id: 'nacht', label: 'Nacht' },
  { id: 'smaragd', label: 'Smaragd' },
  { id: 'gold', label: 'Gold' },
];

const GRUND: Record<ProfilTheme, string> = {
  bordeaux: color.bordeaux,
  nacht: '#141A33',
  smaragd: '#0F2A24',
  gold: '#1A1510',
};

export function istProfilTheme(t: unknown): t is ProfilTheme {
  return t === 'bordeaux' || t === 'nacht' || t === 'smaragd' || t === 'gold';
}

/** Feine Linien fuer Nacht und Smaragd - ein anderes Muster als Bordeaux, damit sie nicht nur umgefaerbt wirken. */
function Linien({ farbe }: { farbe: string }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <Pattern id={`linien-${farbe}`} width={18} height={18} patternUnits="userSpaceOnUse">
          <Path d="M0 18 L18 0" stroke={farbe} strokeWidth={0.6} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#linien-${farbe})`} opacity={0.18} />
    </Svg>
  );
}

/**
 * Goldlinie entlang der geschliffenen Form. Ein borderWidth wurde vom
 * clip-path an den vier Schraegen abgeschnitten - die Kante fehlte genau an
 * den Ecken, die den Schliff ausmachen. Das SVG zeichnet die Schraegen mit.
 */
const SCHLIFF = 12;
function GoldKante() {
  const [g, setG] = React.useState<{ w: number; h: number } | null>(null);
  const i = 0.75;
  const k = SCHLIFF;
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => setG({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {g ? (
        <Svg width={g.w} height={g.h}>
          <Polygon
            points={[
              [k, i], [g.w - k, i], [g.w - i, k], [g.w - i, g.h - k],
              [g.w - k, g.h - i], [k, g.h - i], [i, g.h - k], [i, k],
            ].map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="#D9B872"
            strokeOpacity={0.8}
            strokeWidth={1.2}
          />
        </Svg>
      ) : null}
    </View>
  );
}

export function ProfilKopf({
  theme,
  children,
  style,
}: {
  theme: string | null | undefined;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (!ZWEI || !istProfilTheme(theme)) return <View style={style}>{children}</View>;
  return (
    <View style={[styles.karte, { backgroundColor: GRUND[theme] }, style]}>
      {theme === 'bordeaux' ? <BordeauxMuster voll /> : null}
      {theme === 'nacht' ? <Linien farbe="#8FA5E8" /> : null}
      {theme === 'smaragd' ? <Linien farbe="#8FBF9A" /> : null}
      {theme === 'gold' ? <GoldKante /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  karte: {
    padding: space.lg,
    overflow: 'hidden',
    ...facette(SCHLIFF),
  },
});
