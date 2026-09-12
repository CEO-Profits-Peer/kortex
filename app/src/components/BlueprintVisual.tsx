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
 *
 * Zwei Auftritte
 * --------------
 * `block`  Ein Bild im Textfluss, wie bisher: Titel, Unterzeile, BILD,
 *          Absaetze. Fuer Karten, auf denen Platz dafuer ist.
 *
 * `sheet`  Dieselbe Zeichnung ueber die GANZE Karte, sehr blass, hinter
 *          dem Text. Die Karte wird damit zum Blatt, auf dem etwas
 *          gezeichnet ist, statt eine Liste mit einem Bild darin zu sein.
 *
 * Der Anlass fuer `sheet` war eine Rueckmeldung, die meine Aenderung
 * korrigiert hat: ich hatte die Grafik auf Karten mit grosser Kennzahl
 * ganz weggelassen, mit der Begruendung "zwei Blickfaenge sind keiner".
 * Das Ziel ist aber gar nicht EIN Blickfang - es ist, dass die ganze
 * Karte lebt. Weglassen war die bequeme Antwort; die richtige ist, die
 * Zeichnung in den Hintergrund zu legen, wo sie traegt statt zu
 * konkurrieren.
 *
 * Die Passermarken sitzen dann an den Ecken der KARTE. Genau das macht
 * den Blaupausen-Eindruck aus: ein Blatt hat Marken am Rand, nicht in
 * der Mitte.
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
  variant = 'block',
}: {
  seed: string;
  accentHex?: string | null;
  height?: number;
  variant?: 'block' | 'sheet';
}) {
  const sheet = variant === 'sheet';

  /**
   * Die Hoehe des Zeichenfelds.
   *
   * Beim ersten Versuch wurde dasselbe 320x150-Feld mit "slice" auf die
   * Karte gestreckt. Das vergroessert alles um das Sechsfache: aus einem
   * Punkt mit Radius 3 wird ein Klecks von zwanzig Pixeln, und der lag dann
   * mitten im Wort "Posten". Ein Hintergrund darf nicht die vergroesserte
   * Fassung eines Vordergrunds sein.
   *
   * Also wird die Zeichnung gleich im Format der Karte erzeugt: dieselbe
   * Strichstaerke, dieselben Abstaende, nur mehr Platz nach unten - und
   * entsprechend mehr Elemente, damit das Blatt nicht oben voll und unten
   * leer ist.
   */
  const h = sheet ? 560 : H;
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
  /**
   * Im Blatt gibt es KEINE Signalfarbe.
   *
   * Nicht aus Geschmack, sondern wegen der Kernregel des Designsystems
   * (theme/tokens.ts): Farbe erscheint nur bei Interaktion. Ein cyanfarbener
   * Strich, den niemand ausgeloest hat und der auch noch hinter dem Text
   * liegt, bricht genau diese Regel - und macht den Text schlechter lesbar.
   */
  const hot = sheet
    ? line
    : ({ stroke: accent, strokeWidth: 1.6, fill: 'none' } as const);
  /** Punkte im Blatt sind Markierungen, keine Leuchtpunkte. */
  const dot = sheet ? color.ink.faint : accent;
  const dotQuiet = sheet ? color.ink.faint : color.ink.mid;

  return (
    <View
      style={sheet ? styles.sheet : [styles.wrap, { height }]}
      pointerEvents="none"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${h}`}
        // "slice" statt "meet": das Blatt soll die Karte FUELLEN. Bei
        // "meet" bliebe oben und unten ein Streifen frei, und genau dort
        // stehen Titel und Quelle - die Passermarken saessen dann mitten
        // im Text statt an den Ecken.
        preserveAspectRatio={sheet ? 'xMidYMid slice' : 'xMidYMid meet'}
        opacity={sheet ? 0.55 : 1}
      >
        {/* Passermarken an den Ecken - das Detail, das den Blaupausen-Eindruck macht */}
        <G opacity={0.5}>
          {[
            [8, 8],
            [W - 8, 8],
            [8, h - 8],
            [W - 8, h - 8],
          ].map(([x, y], i) => (
            <G key={i}>
              <Line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={color.ink.faint} strokeWidth={1} />
              <Line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={color.ink.faint} strokeWidth={1} />
            </G>
          ))}
        </G>

        {motif === 'orbit' && (
          <G>
            {(sheet ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3]).map((i) => {
              const rx = 26 + i * (sheet ? 34 : 20) + r() * 8;
              return (
                <Circle
                  key={i}
                  cx={W / 2}
                  cy={h / 2}
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
                  cy={h / 2 + Math.sin(angle) * rad}
                  r={3}
                  fill={i === 0 ? dot : sheet ? color.ink.faint : color.ink.low}
                />
              );
            })}
          </G>
        )}

        {motif === 'network' && (
          <G>
            {(() => {
              const nodes = Array.from({ length: sheet ? 16 : 7 }, () => ({
                x: 40 + r() * (W - 80),
                y: 26 + r() * (h - 52),
              }));
              return (
                <>
                  {nodes.map((a, i) =>
                    nodes.slice(i + 1).map((b, j) => {
                      const d = Math.hypot(a.x - b.x, a.y - b.y);
                      if (d > (sheet ? 150 : 96)) return null;
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
                      fill={i === highlight % 7 ? dot : dotQuiet}
                    />
                  ))}
                </>
              );
            })()}
          </G>
        )}

        {motif === 'wave' && (
          <G>
            {(sheet ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2]).map((k) => {
              const amp = 14 + r() * 22;
              const freq = 1 + r() * 2.2;
              const offset = sheet ? 60 + k * 72 : h / 2 + (k - 1) * 22;
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
            {Array.from({ length: sheet ? 22 : 9 }, (_, i) => {
              const y = 20 + i * (sheet ? 24 : 13);
              const w = 60 + r() * (W - 130);
              return (
                <Line
                  key={i}
                  x1={34}
                  y1={y}
                  x2={34 + w}
                  y2={y}
                  stroke={!sheet && i === highlight % 9 ? accent : color.gridLineMajor}
                  strokeWidth={!sheet && i === highlight % 9 ? 2.5 : 1.5}
                />
              );
            })}
            <Line x1={26} y1={14} x2={26} y2={h - 14} stroke={color.ink.faint} strokeWidth={1} />
          </G>
        )}

        {motif === 'radial' && (
          <G>
            {Array.from({ length: sheet ? 30 : 18 }, (_, i) => {
              const a = (i / (sheet ? 30 : 18)) * Math.PI * 2;
              const inner = sheet ? 40 : 18;
              const outer = (sheet ? 90 : 32) + r() * (sheet ? 130 : 34);
              return (
                <Line
                  key={i}
                  x1={W / 2 + Math.cos(a) * inner}
                  y1={h / 2 + Math.sin(a) * inner}
                  x2={W / 2 + Math.cos(a) * outer}
                  y2={h / 2 + Math.sin(a) * outer}
                  stroke={!sheet && i % 6 === highlight % 6 ? accent : color.gridLineMajor}
                  strokeWidth={!sheet && i % 6 === highlight % 6 ? 2 : 1}
                />
              );
            })}
            <Circle cx={W / 2} cy={h / 2} r={sheet ? 30 : 14} {...line} />
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden' },
  // Hinter dem Inhalt, ueber dem Kartengrund. `overflow: hidden` ist
  // Pflicht: "slice" schneidet zu, und ohne das laegen die
  // ueberstehenden Linien auf der Nachbarkarte.
  sheet: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});

export const BlueprintVisual = memo(BlueprintVisualBase);
