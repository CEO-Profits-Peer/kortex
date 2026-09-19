import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Defs, Line, Path, Pattern, Rect } from 'react-native-svg';

import { getPrefs } from '@/lib/prefs';

import { MUSTER, ZWEI } from '@/theme/design';
import { GRID_CELL, color } from '@/theme/tokens';

/**
 * Das Raster hinter allem.
 *
 * Als SVG-<Pattern> gerendert, nicht als hunderte einzelne Views: das Muster
 * wird einmal definiert und von der GPU gekachelt. Ein Grid aus View-Elementen
 * waere auf einem guenstigen Android sofort spuerbar — und genau darauf wird
 * getestet.
 *
 * Klassisch: kariert, jede vierte Linie etwas heller ("Ingenieursblock").
 *
 * Design 2.0: in den Einstellungen waehlbar - feine Waben, ein Dreiecks-
 * gitter oder gar nichts. Leiser als das Karo, weil die Form jetzt in den
 * Karten und der Tab-Leiste steckt; der Hintergrund soll sie tragen, nicht
 * mit ihnen konkurrieren.
 */

type Props = {
  /** Zellgroesse in px. Standard passt zum 4px-Spacing-Raster. */
  cell?: number;
  /** 0-1. Hoeher als 0.5 wird unruhig hinter Text. */
  opacity?: number;
  children?: React.ReactNode;
};

/** Waben mit Spitze oben: eine Kachel ist √3·s breit und 3·s hoch. */
function Waben({ s }: { s: number }) {
  const w = Math.sqrt(3) * s;
  const h = 3 * s;
  const d = `M0 ${s / 2} L${w / 2} 0 L${w} ${s / 2} L${w} ${1.5 * s} L${w / 2} ${2 * s} L0 ${1.5 * s} Z M${w / 2} ${2 * s} L${w / 2} ${h}`;
  return (
    <Pattern id="waben" width={w} height={h} patternUnits="userSpaceOnUse">
      <Path d={d} stroke={color.gridLineMajor} strokeWidth={1} fill="none" />
    </Pattern>
  );
}

/**
 * Gold-Dreiecke (PRO, 18.09.): vereinzelte kleine goldene Dreiecke, sehr
 * leise. Kein Raster - ein Raster in Gold waere laut, einzelne Funken nicht.
 */
function GoldDreiecke({ a }: { a: number }) {
  const k = a * 0.09;
  const tri = (x: number, y: number, auf: boolean) =>
    auf ? `M${x} ${y + k} L${x + k} ${y + k} L${x + k / 2} ${y} Z` : `M${x} ${y} L${x + k} ${y} L${x + k / 2} ${y + k} Z`;
  return (
    <Pattern id="gold" width={a} height={a * 1.3} patternUnits="userSpaceOnUse">
      <Path d={`${tri(a * 0.12, a * 0.18, true)} ${tri(a * 0.62, a * 0.78, false)} ${tri(a * 0.8, a * 0.2, true)}`} fill="#D9B872" opacity={0.16} />
    </Pattern>
  );
}

/** Gleichseitige Dreiecke: waagrecht, 60° und 120°. */
function Dreiecke({ a }: { a: number }) {
  const h = a * Math.sqrt(3);
  const d = `M0 0 H${a} M0 ${h / 2} H${a} M0 0 L${a} ${h} M${a} 0 L0 ${h}`;
  return (
    <Pattern id="dreiecke" width={a} height={h} patternUnits="userSpaceOnUse">
      <Path d={d} stroke={color.gridLineMajor} strokeWidth={1} fill="none" />
    </Pattern>
  );
}

function GridBackgroundBase({ cell = GRID_CELL, opacity = 0.35, children }: Props) {
  const major = cell * 4;

  if (ZWEI) {
    return (
      <View style={styles.root}>
        {/* width/height: ohne Groesse ist ein <svg> im Browser 300 x 150 -
            das Muster lag bis 19.09. nur in der linken oberen Ecke. */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
          <Defs>
            {MUSTER === 'sechseck' ? <Waben s={16} /> : null}
            {MUSTER === 'dreieck' ? <Dreiecke a={36} /> : null}
            {MUSTER === 'gold' ? <GoldDreiecke a={64} /> : null}
          </Defs>
          <Rect width="100%" height="100%" fill={color.bg} />
          {MUSTER !== 'keins' ? (
            <Rect
              width="100%"
              height="100%"
              fill={`url(#${MUSTER === 'sechseck' ? 'waben' : MUSTER === 'gold' ? 'gold' : 'dreiecke'})`}
              opacity={MUSTER === 'gold' ? 1 : 0.55}
            />
          ) : null}
        </Svg>
        <Uebergang>{children}</Uebergang>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Pattern id="minor" width={cell} height={cell} patternUnits="userSpaceOnUse">
            <Line x1={0} y1={0} x2={cell} y2={0} stroke={color.gridLine} strokeWidth={1} />
            <Line x1={0} y1={0} x2={0} y2={cell} stroke={color.gridLine} strokeWidth={1} />
          </Pattern>
          <Pattern id="major" width={major} height={major} patternUnits="userSpaceOnUse">
            <Rect width={major} height={major} fill="url(#minor)" />
            <Line x1={0} y1={0} x2={major} y2={0} stroke={color.gridLineMajor} strokeWidth={1} />
            <Line x1={0} y1={0} x2={0} y2={major} stroke={color.gridLineMajor} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={color.bg} />
        <Rect width="100%" height="100%" fill="url(#major)" opacity={opacity} />
      </Svg>
      <Uebergang>{children}</Uebergang>
    </View>
  );
}

/**
 * Bildschirm-Uebergang (Test, 19.09.): jeder Bildschirm gleitet beim Oeffnen
 * leicht von unten herein. Liegt hier, weil fast jeder Bildschirm auf
 * GridBackground steht - eine Stelle statt vierzig. Nur mit dem Test-Schalter
 * und nie bei "Bewegung reduzieren". Die Stack-Animationen von expo-router
 * greifen im Browser nicht, deshalb nicht dort.
 */
function Uebergang({ children }: { children: React.ReactNode }) {
  const p = getPrefs();
  if (!p.testAnimationen || p.reduceMotion) return <>{children}</>;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ flex: 1 }}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});

export const GridBackground = memo(GridBackgroundBase);
