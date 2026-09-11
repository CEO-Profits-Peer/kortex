import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { categoryAccent, color } from '@/theme/tokens';

/**
 * Generative Kartengrafik im Blueprint-Stil.
 *
 * Jede Karte bekommt ein eigenes Bild - erzeugt aus ihrer ID, nicht aus einer
 * Datei. Das loest drei Probleme auf einmal:
 *
 *   Rechtlich  Pressefotos sind separat lizenziert, og:image-Hotlinking ist
 *              heikel. Selbst erzeugte Vektoren gehoeren uns.
 *   Kosten     Null Bytes Speicher, null Bandbreite, kein CDN noetig.
 *   Optik      Konsistent technisch statt zusammengewuerfelt - genau das
 *              Gegenteil vom Stock-Foto-Look.
 *
 * Dieselbe ID ergibt immer dieselbe Grafik. Der Nutzer erkennt eine Karte
 * wieder, ohne dass irgendwo ein Bild gespeichert waere.
 */

const W = 320;
const H = 150;

/** Deterministischer PRNG (mulberry32) - gleiche ID, gleiches Bild. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Motif = 'orbit' | 'network' | 'wave' | 'strata' | 'radial';
const MOTIFS: Motif[] = ['orbit', 'network', 'wave', 'strata', 'radial'];

function BlueprintVisualBase({
  seed,
  accentHex,
  height = H,
}: {
  seed: string;
  accentHex?: string | null;
  height?: number;
}) {
  const accent = categoryAccent(accentHex);

  const art = useMemo(() => {
    const r = rng(seed);
    const motif = MOTIFS[Math.floor(r() * MOTIFS.length)];
    // Genau EIN Element traegt die Signalfarbe. Mehr wirkt sofort bunt.
    const highlight = Math.floor(r() * 5);
    return { motif, r, highlight };
  }, [seed]);

  const { motif, r, highlight } = art;
  const line = { stroke: color.gridLineMajor, strokeWidth: 1, fill: 'none' } as const;
  const hot = { stroke: accent, strokeWidth: 1.6, fill: 'none' } as const;

  return (
    <View style={[styles.wrap, { height }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* Passermarken an den Ecken - das Detail, das den Blaupausen-Eindruck macht */}
        <G opacity={0.5}>
          {[
            [8, 8],
            [W - 8, 8],
            [8, H - 8],
            [W - 8, H - 8],
          ].map(([x, y], i) => (
            <G key={i}>
              <Line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={color.ink.faint} strokeWidth={1} />
              <Line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={color.ink.faint} strokeWidth={1} />
            </G>
          ))}
        </G>

        {motif === 'orbit' && (
          <G>
            {[0, 1, 2, 3].map((i) => {
              const rx = 26 + i * 20 + r() * 8;
              return (
                <Circle
                  key={i}
                  cx={W / 2}
                  cy={H / 2}
                  r={rx}
                  {...(i === highlight % 4 ? hot : line)}
                />
              );
            })}
            {[0, 1, 2].map((i) => {
              const angle = r() * Math.PI * 2;
              const rad = 26 + i * 20;
              return (
                <Circle
                  key={`d${i}`}
                  cx={W / 2 + Math.cos(angle) * rad}
                  cy={H / 2 + Math.sin(angle) * rad}
                  r={3}
                  fill={i === 0 ? accent : color.ink.low}
                />
              );
            })}
          </G>
        )}

        {motif === 'network' && (
          <G>
            {(() => {
              const nodes = Array.from({ length: 7 }, () => ({
                x: 40 + r() * (W - 80),
                y: 26 + r() * (H - 52),
              }));
              return (
                <>
                  {nodes.map((a, i) =>
                    nodes.slice(i + 1).map((b, j) => {
                      const d = Math.hypot(a.x - b.x, a.y - b.y);
                      if (d > 96) return null;
                      return (
                        <Line
                          key={`${i}-${j}`}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          {...(i === highlight % 7 ? hot : line)}
                        />
                      );
                    }),
                  )}
                  {nodes.map((n, i) => (
                    <Circle
                      key={i}
                      cx={n.x}
                      cy={n.y}
                      r={i === highlight % 7 ? 5 : 3.2}
                      fill={i === highlight % 7 ? accent : color.ink.mid}
                    />
                  ))}
                </>
              );
            })()}
          </G>
        )}

        {motif === 'wave' && (
          <G>
            {[0, 1, 2].map((k) => {
              const amp = 14 + r() * 22;
              const freq = 1 + r() * 2.2;
              const offset = H / 2 + (k - 1) * 22;
              const d = Array.from({ length: 33 }, (_, i) => {
                const x = 20 + (i * (W - 40)) / 32;
                const y = offset + Math.sin((i / 32) * Math.PI * 2 * freq) * amp * (1 - k * 0.25);
                return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
              }).join(' ');
              return <Path key={k} d={d} {...(k === highlight % 3 ? hot : line)} />;
            })}
          </G>
        )}

        {motif === 'strata' && (
          <G>
            {Array.from({ length: 9 }, (_, i) => {
              const y = 20 + i * 13;
              const w = 60 + r() * (W - 130);
              return (
                <Line
                  key={i}
                  x1={34}
                  y1={y}
                  x2={34 + w}
                  y2={y}
                  stroke={i === highlight % 9 ? accent : color.gridLineMajor}
                  strokeWidth={i === highlight % 9 ? 2.5 : 1.5}
                />
              );
            })}
            <Line x1={26} y1={14} x2={26} y2={H - 14} stroke={color.ink.faint} strokeWidth={1} />
          </G>
        )}

        {motif === 'radial' && (
          <G>
            {Array.from({ length: 18 }, (_, i) => {
              const a = (i / 18) * Math.PI * 2;
              const inner = 18;
              const outer = 32 + r() * 34;
              return (
                <Line
                  key={i}
                  x1={W / 2 + Math.cos(a) * inner}
                  y1={H / 2 + Math.sin(a) * inner}
                  x2={W / 2 + Math.cos(a) * outer}
                  y2={H / 2 + Math.sin(a) * outer}
                  stroke={i % 6 === highlight % 6 ? accent : color.gridLineMajor}
                  strokeWidth={i % 6 === highlight % 6 ? 2 : 1}
                />
              );
            })}
            <Circle cx={W / 2} cy={H / 2} r={14} {...line} />
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden' },
});

export const BlueprintVisual = memo(BlueprintVisualBase);
