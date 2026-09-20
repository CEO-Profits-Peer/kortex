import { Image } from 'expo-image';
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Rect } from 'react-native-svg';

import { type AvatarDesign, PALETTE, decodeAvatar } from '@/lib/avatarDesign';
import {
  WABEN,
  WABEN_FARBEN,
  WABEN_GRUENDE,
  type WabenDesign,
  wabenDekodieren,
  wabenEcken,
  wabenMitte,
} from '@/lib/avatarWaben';
import { rahmenAussehen } from '@/lib/meisterwege';
import { api } from '@/lib/supabase';
import { OrnamentRahmen } from '@/features/rahmen/Ornamente';
import { ZWEI, sechseckRegel, sechseckRegelPunkte } from '@/theme/design';
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

/** Design 2.0: der Grund des Sechsecks - eine Spur heller als die Karten, damit es sich abhebt. */
const AVATAR_GRUND = '#241D22';

/** Das reine Bild, ohne Rahmen und ohne Foto-Logik. Auch der Editor zeichnet damit. */
export function AvatarArt({ design, size }: { design: AvatarDesign; size: number }) {
  const cell = size / 4;
  const tint = PALETTE[design.tint] ?? PALETTE[0];

  return (
    <Svg width={size} height={size}>
      {/* Design 2.0: keine Rundung - das Sechseck schneidet der Rahmen. */}
      <Rect width={size} height={size} fill={ZWEI ? AVATAR_GRUND : color.bgSunken} rx={ZWEI ? 0 : size * 0.28} />
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

/** Wabengroesse (Mitte bis Ecke) je Pixel Bildkante - 37 Waben passen ins regelmaessige Sechseck. */
const WABE_JE_PIXEL = 0.064;

const punkteText = (e: [number, number][]) => e.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/**
 * Das Wabenbild (Format v2, siehe avatarWaben.ts). Die Waben bilden selbst
 * ein Sechseck mit Spitze oben - im Sechseck-Rahmen wird nichts angeschnitten.
 * Auch der Editor zeichnet damit.
 */
export function WabenArt({
  design,
  size,
  raster = false,
  massstab = WABE_JE_PIXEL,
}: {
  design: WabenDesign;
  size: number;
  /** Leere Waben immer andeuten - im Malfeld muss man sehen, wohin man tippt. */
  raster?: boolean;
  /** Wabengroesse je Pixel; das Malfeld hat keinen Rahmen und darf groesser zeichnen. */
  massstab?: number;
}) {
  const s = size * massstab;
  const mx = size / 2;
  const my = size / 2;
  const f1 = WABEN_FARBEN[design.farbe1] ?? WABEN_FARBEN[0];
  const f2 = WABEN_FARBEN[design.farbe2] ?? WABEN_FARBEN[1];
  // Leere Waben nur dort andeuten, wo man sie sieht - bei 28 px waeren sie Rauschen.
  const leereZeigen = raster || size >= 64;

  return (
    <Svg width={size} height={size}>
      <Rect width={size} height={size} fill={WABEN_GRUENDE[design.grund] ?? WABEN_GRUENDE[0]} />
      {WABEN.map((w, i) => {
        const wert = design.waben[i] ?? 0;
        const { x: dx, y: dy } = wabenMitte(w.q, w.r, s);
        const x = mx + dx;
        const y = my + dy;
        if (!wert) {
          return leereZeigen ? (
            <Polygon
              key={i}
              points={punkteText(wabenEcken(x, y, s * 0.9))}
              fill="none"
              stroke="rgba(255, 255, 255, 0.07)"
              strokeWidth={Math.max(0.5, s * 0.06)}
            />
          ) : null;
        }
        const farbe = wert === 1 ? f1 : f2;
        if (design.stil === 'punkte') {
          return <Circle key={i} cx={x} cy={y} r={s * 0.52} fill={farbe} />;
        }
        if (design.stil === 'kontur') {
          return (
            <Polygon
              key={i}
              points={punkteText(wabenEcken(x, y, s * 0.72))}
              fill="none"
              stroke={farbe}
              strokeWidth={s * 0.26}
            />
          );
        }
        const e = wabenEcken(x, y, s * 0.92);
        if (design.stil === 'metall') {
          // PRO: poliertes Metall - kraeftiges Licht oben links, tiefer
          // Schatten unten rechts und eine helle Kante oben.
          return (
            <React.Fragment key={i}>
              <Polygon points={punkteText(e)} fill={farbe} />
              <Polygon points={punkteText([e[0], e[1], e[2], [x, y]])} fill="#FFFFFF" opacity={0.38} />
              <Polygon points={punkteText([[x, y], e[2], e[3], e[4]])} fill="#000000" opacity={0.18} />
              <Polygon points={punkteText([[x, y], e[4], e[5], e[0]])} fill="#000000" opacity={0.34} />
              <Polygon points={punkteText([e[1], e[2]])} fill="none" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={Math.max(0.5, s * 0.08)} />
            </React.Fragment>
          );
        }
        if (design.stil === 'glas') {
          // PRO: Glas - die Farbe durchscheinend, eine klare Kante und ein
          // Lichtfleck oben.
          const innen = wabenEcken(x, y, s * 0.55);
          return (
            <React.Fragment key={i}>
              <Polygon points={punkteText(e)} fill={farbe} opacity={0.32} stroke={farbe} strokeWidth={Math.max(0.6, s * 0.12)} />
              <Polygon points={punkteText([innen[0], innen[1], innen[2]])} fill="#FFFFFF" opacity={0.45} />
            </React.Fragment>
          );
        }
        if (design.stil === 'stein') {
          // Licht von oben: obere Haelfte heller, unten rechts dunkler -
          // wie das Sechseck auf dem aktiven Tab.
          return (
            <React.Fragment key={i}>
              <Polygon points={punkteText(e)} fill={farbe} />
              <Polygon points={punkteText([e[0], e[1], e[2], e[3]])} fill="#FFFFFF" opacity={0.2} />
              <Polygon points={punkteText([[x, y], e[3], e[4], e[5]])} fill="#000000" opacity={0.22} />
            </React.Fragment>
          );
        }
        return <Polygon key={i} points={punkteText(e)} fill={farbe} />;
      })}
    </Svg>
  );
}

function GeneratedAvatar({ seed, size }: { seed: string; size: number }) {
  const waben = useMemo(() => wabenDekodieren(seed), [seed]);
  const design = useMemo(() => (waben ? null : decodeAvatar(seed)), [seed, waben]);
  if (waben) return <WabenArt design={waben} size={size} />;
  return <AvatarArt design={design!} size={size} />;
}

function AvatarBase({
  seed,
  path,
  size = 40,
  ring,
  rahmen,
  rahmenFarbe,
}: {
  seed: string;
  path?: string | null;
  size?: number;
  /** Farbiger Rand, z.B. für „das bist du" */
  ring?: string;
  /** Meisterweg-Rahmen (0095), z.B. 'science' oder 'science-gold'. */
  rahmen?: string | null;
  /** 0124: selbst gewaehlte Rahmenfarbe (PRO). */
  rahmenFarbe?: string | null;
}) {
  const r = rahmenAussehen(rahmen, rahmenFarbe);
  const url = api.avatarUrl(path);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: size * 0.28 },
        // Design 2.0: das Profilbild ist ein Sechseck - das eine Zeichen, an
        // dem man die App auf einen Blick wiedererkennt. Ein Rahmen wuerde
        // vom clip-path mit abgeschnitten, deshalb zeichnet den Ring ein SVG.
        ZWEI ? sechseckRegel() : ring ? { borderWidth: 1.5, borderColor: ring } : null,
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
      ) : ZWEI && !seed?.startsWith('v2-') ? (
        // Das alte Muster (v1 und gehasht) ist quadratisch. Randvoll ins
        // Sechseck gelegt, schnitt die Spitze mitten durch die Kaestchen.
        // Verkleinert und mittig sitzt es ganz im Sechseck. Wabenbilder (v2)
        // haben die Form schon und fuellen das Sechseck ganz.
        <View style={styles.mitte}>
          <GeneratedAvatar seed={seed} size={Math.round(size * 0.64)} />
        </View>
      ) : (
        <GeneratedAvatar seed={seed} size={size} />
      )}
      {r ? (
        r.ornament ? (
          // 19.09.: Ornamente statt Strichbild - ein verdienter Rahmen soll
          // nach Auszeichnung aussehen, nicht nach Diagramm.
          <OrnamentRahmen art={r.ornament} size={size} farbe={r.farbe} gold={r.gold} />
        ) : (
          <MeisterRahmen r={r} size={size} />
        )
      ) : null}
      {ZWEI && ring && !r ? (
        // Design 2.0: ein duenner warmgrauer Ring statt eines dicken goldenen.
        // Gold um jeden Menschen war zu laut - die Farbe des Aufrufers (meist
        // Gold) wird hier bewusst nicht uebernommen.
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polygon
            points={sechseckRegelPunkte(size, 0.75)}
            fill="none"
            stroke="rgba(214, 207, 199, 0.35)"
            strokeWidth={1}
          />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Der Meisterweg-Rahmen: eine Linie in der Farbe des Themas, das Strichbild
 * unterscheidet Themen mit aehnlicher Farbe. Gold (PRO) legt eine feine
 * Goldkante aussen herum. Liegt innerhalb des Bildes, damit Listen ihre
 * Abstaende behalten.
 */
function MeisterRahmen({ r, size }: { r: NonNullable<ReturnType<typeof rahmenAussehen>>; size: number }) {
  const w = Math.max(1.5, size * 0.055);
  const innen = r.gold ? w * 1.4 : w / 2;
  const punkte = (inset: number) =>
    ZWEI ? sechseckRegelPunkte(size, inset) : `${inset},${inset} ${size - inset},${inset} ${size - inset},${size - inset} ${inset},${size - inset}`;
  const strich =
    r.stil === 'strich'
      ? `${size * 0.1} ${size * 0.05}`
      : r.stil === 'punkt'
        ? `0.1 ${w * 2.2}`
        : r.stil === 'lang'
          ? `${size * 0.28} ${size * 0.07}`
          : undefined;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {r.gold ? <Polygon points={punkte(0.6)} fill="none" stroke="#D9B872" strokeWidth={Math.max(1, w * 0.5)} /> : null}
      <Polygon
        points={punkte(innen)}
        fill="none"
        stroke={r.farbe}
        strokeWidth={w}
        strokeDasharray={strich}
        strokeLinecap={r.stil === 'punkt' ? 'round' : 'butt'}
        strokeLinejoin="round"
      />
      {r.stil === 'doppelt' ? (
        <Polygon points={punkte(innen + w * 1.8)} fill="none" stroke={r.farbe} strokeOpacity={0.6} strokeWidth={Math.max(1, w * 0.5)} />
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: ZWEI ? AVATAR_GRUND : color.bgSunken, borderRadius: radius.md },
  mitte: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export const Avatar = memo(AvatarBase);
