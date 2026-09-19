import React, { memo, useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { getPrefs } from '@/lib/prefs';
import { sechseckPunkte } from '@/theme/design';

/**
 * Laden im Stil des Logos: der Bordeaux-Stein mit Goldkante und Knoten.
 *
 * Statt eines grauen Kreisels wandert ein Lichtschein Facette fuer Facette
 * um den Stein, ein kurzes Goldstueck laeuft die Kante entlang und der
 * Knoten in der Mitte atmet. Ersetzt ActivityIndicator ueberall; `color`
 * wird nur angenommen, damit der Tausch eins zu eins ging - der Stein hat
 * seine eigenen Farben und ist auf Gold, Bordeaux und Schwarz lesbar.
 *
 * "Bewegung reduzieren": nur der Knoten wird langsam heller und dunkler,
 * kein Umlauf.
 */

/** Wie das App-Icon (assets/brand/logo.png): oben hell, unten dunkel. */
const TOENE = ['#7A2B40', '#5E1E30', '#431523', '#4B1827', '#641F33', '#6E2438'];
const GOLD = '#D9B872';

const AnimPolygon = Animated.createAnimatedComponent(Polygon);

type Groesse = 'small' | 'large' | number;

function pixel(g: Groesse | undefined): number {
  if (typeof g === 'number') return g;
  return g === 'large' ? 44 : 24;
}

function LadenBase({
  size,
  style,
}: {
  size?: Groesse;
  /** Ohne Wirkung - siehe oben. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const h = pixel(size);
  const b = h * 0.866;
  const t = useSharedValue(0);
  const ruhig = getPrefs().reduceMotion;

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: ruhig ? 2400 : 1500, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [ruhig, t]);

  const ecken = sechseckPunkte(b, h, h * 0.04)
    .split(' ')
    .map((p) => p.split(',').map(Number));
  const mx = b / 2;
  const my = h / 2;
  const kante = Math.max(1, h * 0.07);
  // Umfang des Sechsecks: sechs gleich lange Seiten.
  const seite = Math.hypot(ecken[1][0] - ecken[0][0], ecken[1][1] - ecken[0][1]);
  const umfang = 6 * seite;

  return (
    <View
      style={[{ width: b, height: h, alignSelf: 'center' }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Lädt"
    >
      <Svg width={b} height={h}>
        {ecken.map(([x, y], i) => {
          const [x2, y2] = ecken[(i + 1) % 6];
          const punkte = `${x},${y} ${x2},${y2} ${mx},${my}`;
          return (
            <React.Fragment key={i}>
              <Polygon points={punkte} fill={TOENE[i]} />
              {ruhig ? null : <Schein punkte={punkte} i={i} t={t} />}
            </React.Fragment>
          );
        })}
        <Polygon points={sechseckPunkte(b, h, h * 0.04)} fill="none" stroke={GOLD} strokeOpacity={0.35} strokeWidth={kante} />
        {ruhig ? null : <Lauf b={b} h={h} umfang={umfang} kante={kante} t={t} />}
        <Knoten b={b} h={h} t={t} ruhig={ruhig} />
      </Svg>
    </View>
  );
}

/** Weisser Hauch ueber einer Facette - am hellsten, wenn der Umlauf gerade dort ist. */
function Schein({ punkte, i, t }: { punkte: string; i: number; t: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    const pos = t.value * 6;
    let d = Math.abs(pos - i - 0.5);
    d = Math.min(d, 6 - d);
    return { fillOpacity: Math.max(0, 1 - d / 1.4) * 0.24 };
  });
  return <AnimPolygon points={punkte} fill="#FFFFFF" animatedProps={props} />;
}

/** Ein Goldstueck, ein Sechstel des Umfangs lang, das die Kante entlanglaeuft. */
function Lauf({ b, h, umfang, kante, t }: { b: number; h: number; umfang: number; kante: number; t: SharedValue<number> }) {
  const stueck = umfang / 5;
  const props = useAnimatedProps(() => ({ strokeDashoffset: -t.value * umfang }));
  return (
    <AnimPolygon
      points={sechseckPunkte(b, h, h * 0.04)}
      fill="none"
      stroke={GOLD}
      strokeWidth={kante}
      strokeLinecap="round"
      strokeDasharray={`${stueck} ${umfang - stueck}`}
      animatedProps={props}
    />
  );
}

/** Der Knoten in der Mitte: dunkler Ring, goldener Kern, der sanft atmet. */
function Knoten({ b, h, t, ruhig }: { b: number; h: number; t: SharedValue<number>; ruhig: boolean }) {
  const kb = b * 0.3;
  const kh = h * 0.3;
  const ox = (b - kb) / 2;
  const oy = (h - kh) / 2;
  const verschoben = (inset: number) =>
    sechseckPunkte(kb, kh, inset)
      .split(' ')
      .map((p) => {
        const [x, y] = p.split(',').map(Number);
        return `${(x + ox).toFixed(2)},${(y + oy).toFixed(2)}`;
      })
      .join(' ');
  const props = useAnimatedProps(() => ({
    fillOpacity: ruhig ? 0.75 + 0.25 * Math.sin(t.value * Math.PI * 2) : 0.8 + 0.2 * Math.sin(t.value * Math.PI * 2),
  }));
  return (
    <>
      <Polygon points={verschoben(0)} fill="#111013" />
      <AnimPolygon points={verschoben(kh * 0.16)} fill={GOLD} animatedProps={props} />
    </>
  );
}

export const Laden = memo(LadenBase);
