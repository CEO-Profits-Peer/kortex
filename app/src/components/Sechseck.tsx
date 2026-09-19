import React, { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Path, Pattern, Polygon, Rect } from 'react-native-svg';

import { getPrefs } from '@/lib/prefs';
import { proAktiv } from '@/lib/pro';

import { LINSE, sechseckPunkte } from '@/theme/design';
import { color } from '@/theme/tokens';

/**
 * Das Sechseck fuer "das ist gerade aktiv" - auf dem aktiven Tab und auf
 * gedrueckten Knoepfen der Feed-Leiste. Beide zeichnen es aus derselben
 * Quelle, damit ein Umschalten von Flach auf Stein ueberall gleich wirkt.
 *
 *   flach: eine Bordeaux-Flaeche mit feiner Goldlinie ein Stueck innen.
 *   stein: sechs Dreiecke in Bordeaux-Toenen um die Mitte, oben hell, unten
 *          dunkel - so faellt Licht auf einen geschliffenen Stein. Aussen
 *          eine Goldkante.
 *
 * Die Toene sind flache Farben, kein Verlauf: ein Verlauf auf sechs kleinen
 * Flaechen sieht verschwommen aus, feste Toene sehen geschliffen aus.
 */

/** Reihenfolge wie sechseckPunkte: oben, oben rechts, unten rechts, unten, unten links, oben links. */
const STEIN_TOENE = ['#7A2B40', '#5E1E30', '#431523', '#4B1827', '#641F33', '#6E2438'];
/** Gold-Stein (PRO, 18.09.): dieselbe Lichtfuehrung in Gold, Kante in Bordeaux. */
const GOLD_TOENE = ['#EAD7A6', '#D9B872', '#B8964F', '#A8883F', '#C9A862', '#DEC284'];

function punkte(b: number, h: number, inset: number): [number, number][] {
  return sechseckPunkte(b, h, inset)
    .split(' ')
    .map((p) => p.split(',').map(Number) as [number, number]);
}

function SechseckLinseBase({
  b,
  h,
  an = true,
}: {
  b: number;
  h: number;
  /** false: das ruhende Sechseck - Glas mit warmer Linie, kein Bordeaux. */
  an?: boolean;
}) {
  if (!an) {
    return (
      <Svg width={b} height={h} pointerEvents="none">
        <Polygon
          points={sechseckPunkte(b, h, 0.75)}
          fill="rgba(22, 18, 21, 0.72)"
          stroke="rgba(214, 207, 199, 0.20)"
          strokeWidth={1}
        />
      </Svg>
    );
  }

  if (LINSE === 'flach') {
    return (
      <Svg width={b} height={h} pointerEvents="none">
        <Polygon points={sechseckPunkte(b, h, 0)} fill="#5A1B2C" />
        <Polygon
          points={sechseckPunkte(b, h, Math.max(3, b * 0.06))}
          fill="none"
          stroke={color.signal.primary}
          strokeOpacity={0.75}
          strokeWidth={1}
        />
      </Svg>
    );
  }

  const e = punkte(b, h, 0.75);
  const mx = b / 2;
  const my = h / 2;
  const gold = LINSE === 'gold';
  return (
    <Svg width={b} height={h} pointerEvents="none">
      {e.map(([x, y], i) => {
        const [x2, y2] = e[(i + 1) % 6];
        return <Polygon key={i} points={`${x},${y} ${x2},${y2} ${mx},${my}`} fill={(gold ? GOLD_TOENE : STEIN_TOENE)[i]} />;
      })}
      {steinAnimiert() ? <SteinSchein e={e} mx={mx} my={my} /> : null}
      <Polygon
        points={sechseckPunkte(b, h, 0.75)}
        fill="none"
        stroke={gold ? '#5A1B2C' : color.signal.primary}
        strokeWidth={1.2}
      />
    </Svg>
  );
}

/**
 * Animierter Stein (PRO, 19.09.): ein weicher Lichtschein wandert langsam um
 * die Facetten - wie beim Laden, nur ruhiger (6 s statt 1,5 s), damit es auf
 * dem aktiven Tab nicht nervt. Nur mit Schalter, PRO und ohne "Bewegung
 * reduzieren".
 */
function steinAnimiert(): boolean {
  const p = getPrefs();
  return p.steinAnimiert && !p.reduceMotion && proAktiv();
}

const AnimPolygon = Animated.createAnimatedComponent(Polygon);

function SteinSchein({ e, mx, my }: { e: [number, number][]; mx: number; my: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  return (
    <>
      {e.map(([x, y], i) => {
        const [x2, y2] = e[(i + 1) % 6];
        return <ScheinFacette key={i} punkte={`${x},${y} ${x2},${y2} ${mx},${my}`} i={i} t={t} />;
      })}
    </>
  );
}

function ScheinFacette({ punkte, i, t }: { punkte: string; i: number; t: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    let d = Math.abs(t.value * 6 - i - 0.5);
    d = Math.min(d, 6 - d);
    return { fillOpacity: Math.max(0, 1 - d / 1.5) * 0.18 };
  });
  return <AnimPolygon points={punkte} fill="#FFFFFF" animatedProps={props} />;
}

export const SechseckLinse = memo(SechseckLinseBase);

/**
 * Feines Dreiecksmuster IN Bordeaux-Karten. Auf dem ganzen Hintergrund
 * machte es die Ueberschriften unruhig; auf einer satten Flaeche gibt es ihr
 * Tiefe. Liegt absolut hinter dem Inhalt - der Aufrufer setzt es als erstes
 * Kind.
 */
function BordeauxMusterBase({ voll }: { voll?: boolean }) {
  // voll: ueber eine ganze Flaeche. Ohne Groesse zeichnet ein <svg> im
  // Browser nur 300 x 150 - in kleinen Karten faellt das nicht auf.
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" {...(voll ? { width: '100%', height: '100%' } : null)}>
      <Defs>
        <Pattern id="bordeauxDreiecke" width={28} height={24} patternUnits="userSpaceOnUse">
          <Path d="M0 24 L14 0 L28 24 M0 0 L28 0" stroke={color.signal.primary} strokeWidth={0.6} fill="none" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#bordeauxDreiecke)" opacity={0.12} />
    </Svg>
  );
}

export const BordeauxMuster = memo(BordeauxMusterBase);
