import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polygon, Polyline } from 'react-native-svg';

import { sechseckRegelPunkte } from '@/theme/design';

/**
 * Ornament-Rahmen fuer Profilbilder - VORSCHAU (19.09.).
 *
 * Die heutigen Rahmen (Meisterwege, 0095) sind Linien: durchgezogen,
 * doppelt, gestrichelt, gepunktet, dazu eine goldene Kante fuer PRO. Das
 * unterscheidet zuverlaessig, sieht aber nach Diagramm aus, nicht nach
 * Auszeichnung.
 *
 * Diese vier sind Vorschlaege, noch nichts Vergebenes: gezeichnet auf
 * demselben regelmaessigen Sechseck wie das Profilbild, in der Farbe des
 * Themas. Vergeben wird erst, wenn einer davon gefaellt.
 *
 *   ranke     - zwei Zweige wachsen aus gegenueberliegenden Ecken
 *   band      - ein geflochtenes Band entlang aller sechs Kanten
 *   lorbeer   - Blaetter an den unteren Schraegen, oben offen
 *   beschlag  - massive Eckbeschlaege wie an einem Bucheinband
 */
export type OrnamentArt = 'ranke' | 'band' | 'lorbeer' | 'beschlag';

export const ORNAMENTE: { art: OrnamentArt; titel: string }[] = [
  { art: 'ranke', titel: 'Ranke' },
  { art: 'band', titel: 'Flechtband' },
  { art: 'lorbeer', titel: 'Lorbeer' },
  { art: 'beschlag', titel: 'Beschlag' },
];

/** Die sechs Ecken des Sechsecks als Zahlen (Spitze oben). */
function ecken(g: number, inset = 0): [number, number][] {
  return sechseckRegelPunkte(g, inset)
    .split(' ')
    .map((p) => p.split(',').map(Number) as [number, number]);
}

function mitte(a: [number, number], b: [number, number], t = 0.5): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Ein Zweig entlang einer Kante, mit Blaettern abwechselnd links und rechts. */
function Zweig({
  von,
  bis,
  farbe,
  breite,
  blatt,
  anzahl = 3,
}: {
  von: [number, number];
  bis: [number, number];
  farbe: string;
  breite: number;
  blatt: number;
  anzahl?: number;
}) {
  const dx = bis[0] - von[0];
  const dy = bis[1] - von[1];
  const laenge = Math.hypot(dx, dy) || 1;
  // Normale zur Kante: dorthin biegt der Zweig und dorthin zeigen die Blaetter.
  const nx = -dy / laenge;
  const ny = dx / laenge;
  const bauch = blatt * 1.15;
  const s1: [number, number] = [von[0] + dx * 0.35 + nx * bauch, von[1] + dy * 0.35 + ny * bauch];
  const s2: [number, number] = [von[0] + dx * 0.65 + nx * bauch, von[1] + dy * 0.65 + ny * bauch];
  const winkel = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <G>
      <Path
        d={`M ${von[0]} ${von[1]} C ${s1[0]} ${s1[1]}, ${s2[0]} ${s2[1]}, ${bis[0]} ${bis[1]}`}
        stroke={farbe}
        strokeWidth={breite}
        fill="none"
        strokeLinecap="round"
      />
      {Array.from({ length: anzahl }, (_, i) => {
        const t = (i + 0.8) / (anzahl + 0.6);
        const seite = i % 2 === 0 ? 1 : -1;
        // Punkt auf der Kurve, genaehert ueber die Sehne plus Bauch.
        const bogen = Math.sin(Math.PI * t) * bauch;
        const p: [number, number] = [
          von[0] + dx * t + nx * bogen,
          von[1] + dy * t + ny * bogen,
        ];
        const ab: [number, number] = [p[0] + nx * blatt * 0.75 * seite, p[1] + ny * blatt * 0.75 * seite];
        return (
          <Ellipse
            key={i}
            cx={ab[0]}
            cy={ab[1]}
            rx={blatt * 0.72}
            ry={blatt * 0.34}
            fill={farbe}
            opacity={0.85}
            transform={`rotate(${winkel} ${ab[0]} ${ab[1]})`}
          />
        );
      })}
    </G>
  );
}

export function OrnamentRahmen({
  art,
  size,
  farbe,
  gold,
}: {
  art: OrnamentArt;
  size: number;
  farbe: string;
  /** Wie bei den Meister-Rahmen: eine goldene Aussenkante fuer PRO. */
  gold?: boolean;
}) {
  const w = Math.max(1.2, size * 0.035);
  const e = ecken(size, w);
  // Groesser als beim ersten Versuch: ein Profilbild ist 64 bis 96 Pixel
  // gross, und was dort nicht auf den ersten Blick zu erkennen ist, ist
  // kein Ornament, sondern Rauschen.
  const blatt = size * 0.085;

  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {gold ? (
        <Polygon points={sechseckRegelPunkte(size, 0.6)} fill="none" stroke="#D9B872" strokeWidth={Math.max(1, w * 0.5)} />
      ) : null}

      {/* Die Grundkante bleibt bei allen - ohne sie schwebt das Ornament. */}
      <Polygon
        points={sechseckRegelPunkte(size, w)}
        fill="none"
        stroke={farbe}
        strokeWidth={art === 'beschlag' ? w : w * 0.8}
        strokeOpacity={art === 'band' ? 0.45 : 0.75}
        strokeLinejoin="round"
      />

      {art === 'ranke' ? (
        <G>
          {/* Zwei Zweige, gegenueberliegend: oben links und unten rechts. */}
          <Zweig von={e[5]} bis={e[0]} farbe={farbe} breite={w} blatt={blatt} />
          <Zweig von={e[2]} bis={e[3]} farbe={farbe} breite={w} blatt={blatt} />
          <Circle cx={e[0][0]} cy={e[0][1]} r={w * 1.1} fill={farbe} />
          <Circle cx={e[3][0]} cy={e[3][1]} r={w * 1.1} fill={farbe} />
        </G>
      ) : null}

      {art === 'band' ? (
        <G>
          {/* Zwei versetzte Zickzack-Linien ergeben ein Geflecht. */}
          {[0.5, -0.5].map((versatz, k) => (
            <Polyline
              key={k}
              points={[...e, e[0]]
                .map((p, i, alle) => {
                  if (i === alle.length - 1) return `${p[0]},${p[1]}`;
                  const n = alle[i + 1];
                  const m = mitte(p, n);
                  const zx = m[0] - size / 2;
                  const zy = m[1] - size / 2;
                  const l = Math.hypot(zx, zy) || 1;
                  const aus = blatt * 1.5 * versatz;
                  return `${p[0]},${p[1]} ${m[0] + (zx / l) * aus},${m[1] + (zy / l) * aus}`;
                })
                .join(' ')}
              fill="none"
              stroke={farbe}
              strokeWidth={w * 1.15}
              strokeOpacity={k === 0 ? 1 : 0.7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </G>
      ) : null}

      {art === 'lorbeer' ? (
        <G>
          {/* Unten herum, oben offen - wie ein Kranz. */}
          <Zweig von={e[3]} bis={e[4]} farbe={farbe} breite={w} blatt={blatt * 1.1} anzahl={3} />
          <Zweig von={e[2]} bis={e[3]} farbe={farbe} breite={w} blatt={blatt * 1.1} anzahl={3} />
          <Circle cx={e[3][0]} cy={e[3][1]} r={w * 1.3} fill={farbe} />
        </G>
      ) : null}

      {art === 'beschlag' ? (
        <G>
          {/* Winkel an drei Ecken, wie die Messingecken eines Buchdeckels. */}
          {[0, 2, 4].map((i) => {
            const p = e[i];
            const vor = mitte(p, e[(i + 5) % 6], 0.34);
            const nach = mitte(p, e[(i + 1) % 6], 0.34);
            return (
              <G key={i}>
                <Path
                  d={`M ${vor[0]} ${vor[1]} L ${p[0]} ${p[1]} L ${nach[0]} ${nach[1]}`}
                  stroke={farbe}
                  strokeWidth={w * 2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <Circle cx={p[0]} cy={p[1]} r={w * 0.7} fill="#0B0C0E" opacity={0.55} />
              </G>
            );
          })}
        </G>
      ) : null}
    </Svg>
  );
}
