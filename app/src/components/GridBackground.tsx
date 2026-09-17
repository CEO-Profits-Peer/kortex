import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, Path, Pattern, Rect } from 'react-native-svg';

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
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            {MUSTER === 'sechseck' ? <Waben s={16} /> : null}
            {MUSTER === 'dreieck' ? <Dreiecke a={36} /> : null}
          </Defs>
          <Rect width="100%" height="100%" fill={color.bg} />
          {MUSTER !== 'keins' ? (
            <Rect
              width="100%"
              height="100%"
              fill={`url(#${MUSTER === 'sechseck' ? 'waben' : 'dreiecke'})`}
              opacity={0.55}
            />
          ) : null}
        </Svg>
        {children}
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
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
});

export const GridBackground = memo(GridBackgroundBase);
