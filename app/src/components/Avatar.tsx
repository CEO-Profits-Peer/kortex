import { Image } from 'expo-image';
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { api } from '@/lib/supabase';
import { color, radius } from '@/theme/tokens';

/**
 * Profilbild.
 *
 * Ohne hochgeladenes Bild wird eins gezeichnet — deterministisch aus
 * avatar_seed. Damit hat jedes Konto vom ersten Moment an ein eigenes
 * Erkennungszeichen, ohne dass jemand etwas hochladen muss.
 *
 * Das Muster ist derselbe Blaupausen-Gedanke wie überall: ein Raster-
 * ausschnitt mit gesetzten Knoten. Kein Comic-Gesicht, kein Farbklecks mit
 * Initiale — beides sähe nach Baukasten aus.
 */

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ['#00F0FF', '#7CFF6B', '#B78BFF', '#FFD84D', '#FF9F45', '#FF6BA8'];

function GeneratedAvatar({ seed, size }: { seed: string; size: number }) {
  const art = useMemo(() => {
    const r = rng(seed);
    const tint = PALETTE[Math.floor(r() * PALETTE.length)];
    // 4x4-Raster, gespiegelt: symmetrische Muster wirken wie ein Zeichen,
    // zufällige wie Rauschen.
    const half: boolean[][] = Array.from({ length: 4 }, () =>
      Array.from({ length: 2 }, () => r() > 0.45),
    );
    return { tint, half };
  }, [seed]);

  const cell = size / 4;

  return (
    <Svg width={size} height={size}>
      <Rect width={size} height={size} fill={color.bgSunken} rx={size * 0.28} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3].map((col) => {
          const mirrored = col < 2 ? col : 3 - col;
          if (!art.half[row][mirrored]) return null;
          return (
            <Rect
              key={`${row}-${col}`}
              x={col * cell}
              y={row * cell}
              width={cell}
              height={cell}
              fill={art.tint}
              opacity={0.9}
            />
          );
        }),
      )}
      {/* Rasterlinien darüber - das verbindet den Avatar mit dem Rest. */}
      {[1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          <Line x1={i * cell} y1={0} x2={i * cell} y2={size} stroke={color.bg} strokeWidth={1} />
          <Line x1={0} y1={i * cell} x2={size} y2={i * cell} stroke={color.bg} strokeWidth={1} />
        </React.Fragment>
      ))}
      <Circle cx={size / 2} cy={size / 2} r={size * 0.07} fill={color.bg} />
    </Svg>
  );
}

function AvatarBase({
  seed,
  path,
  size = 40,
  ring,
}: {
  seed: string;
  path?: string | null;
  size?: number;
  /** Farbiger Rand, z.B. für „das bist du" */
  ring?: string;
}) {
  const url = api.avatarUrl(path);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size * 0.28 },
        ring ? { borderWidth: 1.5, borderColor: ring } : null,
      ]}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={160}
          // Ein Avatar ändert sich selten - lokal zwischenspeichern spart
          // bei einer Liste mit 50 Zeilen 50 Anfragen.
          cachePolicy="memory-disk"
        />
      ) : (
        <GeneratedAvatar seed={seed} size={size} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: color.bgSunken, borderRadius: radius.md },
});

export const Avatar = memo(AvatarBase);
