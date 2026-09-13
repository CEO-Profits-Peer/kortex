import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Tab-Icons als Inline-SVG-Linien.
 *
 * Bewusst keine Icon-Library: der Blueprint-Stil lebt von duennen, gleich
 * starken Vektorlinien (1.5 px), und react-native-svg ist ohnehin schon
 * fuer den Raster-Hintergrund da. Eine Abhaengigkeit weniger, ein
 * konsistenter Strich mehr.
 */

export type TabName = 'home' | 'studio' | 'courses' | 'feed' | 'search' | 'profile';

const SIZE = 22;
const STROKE = 1.5;

export function TabIcon({ name, color }: { name: TabName; color: ColorValue }) {
  const common = {
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 24 24">
      {name === 'home' && (
        // Ein Haus mit Tuer - das Zeichen, das jeder als "Start" liest.
        <Path
          d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5h-6v5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z"
          {...common}
        />
      )}

      {name === 'studio' && (
        <>
          {/* Ein Plus im Rahmen: hier macht man selbst etwas. */}
          <Rect x={4} y={4} width={16} height={16} rx={4.5} {...common} />
          <Path d="M12 8.5v7M8.5 12h7" {...common} />
        </>
      )}

      {name === 'courses' && (
        <>
          {/* Gestapelte Lektionen */}
          <Path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z" {...common} />
          <Path d="M4 12l8 3.5L20 12" {...common} />
          <Path d="M4 17l8 3.5L20 17" {...common} />
        </>
      )}

      {name === 'feed' && (
        <>
          {/* Karten im Stapel - die vordere ist die aktive */}
          <Rect x={5} y={3} width={14} height={12} rx={2.5} {...common} />
          <Path d="M7 18h10M8.5 21h7" {...common} />
        </>
      )}

      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={6.5} {...common} />
          <Path d="m16 16 4.5 4.5" {...common} />
        </>
      )}

      {name === 'profile' && (
        <>
          <Circle cx={12} cy={8.5} r={3.75} {...common} />
          <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...common} />
        </>
      )}
    </Svg>
  );
}
