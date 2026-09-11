import { Image } from 'expo-image';
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { type AvatarDesign, PALETTE, decodeAvatar } from '@/lib/avatarDesign';
import { api } from '@/lib/supabase';
import { color, radius } from '@/theme/tokens';

/**
 * Profilbild.
 *
 * Ohne hochgeladenes Bild wird eins gezeichnet — aus avatar_seed. Damit hat
 * jedes Konto vom ersten Moment an ein eigenes Erkennungszeichen, ohne dass
 * jemand etwas hochladen muss.
 *
 * Das Muster ist derselbe Blaupausen-Gedanke wie überall: ein Raster-
 * ausschnitt mit gesetzten Knoten. Kein Comic-Gesicht, kein Farbklecks mit
 * Initiale — beides sähe nach Baukasten aus.
 *
 * Der Seed kann seit avatarDesign.ts zweierlei sein: eine Zufalls-ID, die
 * gehasht wird wie immer, oder ein selbst entworfenes Muster. Das Zeichnen
 * kennt den Unterschied nicht — es bekommt in beiden Faellen dieselbe
 * Beschreibung.
 */

/** Das reine Bild, ohne Rahmen und ohne Foto-Logik. Auch der Editor zeichnet damit. */
export function AvatarArt({ design, size }: { design: AvatarDesign; size: number }) {
  const cell = size / 4;
  const tint = PALETTE[design.tint] ?? PALETTE[0];

  return (
    <Svg width={size} height={size}>
      <Rect width={size} height={size} fill={color.bgSunken} rx={size * 0.28} />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3].map((col) => {
          // Gespiegelt: symmetrische Muster wirken wie ein Zeichen,
          // zufaellige wie Rauschen.
          const mirrored = col < 2 ? col : 3 - col;
          if (!design.cells[row]?.[mirrored]) return null;
          const key = `${row}-${col}`;
          const x = col * cell;
          const y = row * cell;

          if (design.shape === 'dots') {
            return (
              <Circle
                key={key}
                cx={x + cell / 2}
                cy={y + cell / 2}
                r={cell * 0.34}
                fill={tint}
                opacity={0.9}
              />
            );
          }
          if (design.shape === 'bars') {
            return (
              <Rect
                key={key}
                x={x}
                y={y + cell * 0.28}
                width={cell}
                height={cell * 0.44}
                fill={tint}
                opacity={0.9}
              />
            );
          }
          return (
            <Rect key={key} x={x} y={y} width={cell} height={cell} fill={tint} opacity={0.9} />
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
      {design.core ? (
        <Circle cx={size / 2} cy={size / 2} r={size * 0.07} fill={color.bg} />
      ) : null}
    </Svg>
  );
}

function GeneratedAvatar({ seed, size }: { seed: string; size: number }) {
  const design = useMemo(() => decodeAvatar(seed), [seed]);
  return <AvatarArt design={design} size={size} />;
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
          // bei einer Liste mit 50 Zeilen 50 Anfragen. Dass ein NEUES Bild
          // trotzdem sofort erscheint, liegt am Pfad: jeder Upload bekommt
          // einen eigenen Dateinamen (siehe api.uploadAvatar).
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
