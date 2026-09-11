import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { GRID_CELL, color } from '@/theme/tokens';

/**
 * Das karierte Raster hinter allem.
 *
 * Als SVG-<Pattern> gerendert, nicht als hunderte einzelne Views: das Muster
 * wird einmal definiert und von der GPU gekachelt. Ein Grid aus View-Elementen
 * waere auf einem guenstigen Android sofort spuerbar — und genau darauf wird
 * getestet.
 *
 * Jede vierte Linie ist etwas heller. Das ist der Unterschied zwischen
 * "Millimeterpapier" und "Ingenieursblock".
 */

type Props = {
  /** Zellgroesse in px. Standard passt zum 4px-Spacing-Raster. */
  cell?: number;
  /** 0-1. Hoeher als 0.5 wird unruhig hinter Text. */
  opacity?: number;
  children?: React.ReactNode;
};

function GridBackgroundBase({ cell = GRID_CELL, opacity = 0.35, children }: Props) {
  const major = cell * 4;

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
