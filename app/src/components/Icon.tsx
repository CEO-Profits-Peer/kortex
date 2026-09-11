import React, { memo } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { color } from '@/theme/tokens';

/**
 * Das Piktogramm-Set.
 *
 * Vorher standen überall Textzeichen: ◆ ◇ ⌕ ✕ ⚙ →. Die sehen auf jedem Gerät
 * anders aus, haben unterschiedliche Strichstärken, sitzen schief auf der
 * Grundlinie — und genau das lässt eine Oberfläche zusammengesucht wirken.
 *
 * Diese hier sind alle nach denselben Regeln gezeichnet:
 *   · 24er-Raster
 *   · Strichstärke 1.5, runde Enden und Ecken
 *   · offene Formen, keine Flächen (außer bei "gefüllten" Zuständen)
 *
 * Kein Icon-Paket: react-native-svg ist ohnehin da, und eine Bibliothek
 * bringt tausend Symbole mit, von denen wir zwanzig brauchen — mit einer
 * fremden Strichsprache, die neben den Blaupausen-Linien auffällt.
 */

export type IconName =
  // Navigation
  | 'courses' | 'feed' | 'search' | 'profile'
  | 'back' | 'close' | 'chevron' | 'settings'
  // Aktionen
  | 'like' | 'like-filled' | 'source' | 'share' | 'refresh'
  // Zustände und Werte
  | 'xp' | 'mastery' | 'streak' | 'check' | 'cross' | 'clock'
  // Kartentypen
  | 'news' | 'knowledge' | 'interactive' | 'lesson'
  // Sonstiges
  | 'leaderboard' | 'lock' | 'plus' | 'sliders'
  | 'listen' | 'listening' | 'comment';

type Props = {
  name: IconName;
  size?: number;
  color?: ColorValue;
  /** Für "like": füllt die Form statt sie nur zu umranden */
  filled?: boolean;
};

function IconBase({ name, size = 20, color: tint = color.ink.mid }: Props) {
  const s = {
    stroke: tint,
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const solid = { fill: tint, stroke: 'none' };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* --- Navigation ------------------------------------------------- */}
      {name === 'courses' && (
        <>
          <Path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z" {...s} />
          <Path d="M4 12l8 3.5L20 12" {...s} />
          <Path d="M4 17l8 3.5L20 17" {...s} />
        </>
      )}
      {name === 'feed' && (
        <>
          <Rect x={5} y={3} width={14} height={12} rx={2.5} {...s} />
          <Path d="M7 18h10M8.5 21h7" {...s} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={6.5} {...s} />
          <Path d="m16 16 4.5 4.5" {...s} />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle cx={12} cy={8.5} r={3.75} {...s} />
          <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...s} />
        </>
      )}
      {name === 'back' && <Path d="M14.5 5 8 12l6.5 7" {...s} />}
      {name === 'chevron' && <Path d="m9.5 5 6.5 7-6.5 7" {...s} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...s} />}
      {name === 'settings' && (
        <>
          <Circle cx={12} cy={12} r={3} {...s} />
          <Path
            d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"
            {...s}
          />
        </>
      )}

      {/* --- Aktionen ---------------------------------------------------- */}
      {/* Raute statt Herz: das Signalzeichen der App, kein Social-Media-Klischee */}
      {name === 'like' && <Path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" {...s} />}
      {name === 'like-filled' && <Path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" {...solid} />}
      {name === 'source' && (
        <>
          <Path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.2 1.2" {...s} />
          <Path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.2-1.2" {...s} />
        </>
      )}
      {name === 'share' && (
        <>
          <Path d="M12 3v12M8.5 6.5 12 3l3.5 3.5" {...s} />
          <Path d="M5.5 12v7.5h13V12" {...s} />
        </>
      )}
      {name === 'refresh' && (
        <>
          <Path d="M20 12a8 8 0 1 1-2.6-5.9" {...s} />
          <Path d="M20 3.5V8h-4.5" {...s} />
        </>
      )}

      {/* --- Werte -------------------------------------------------------- */}
      {name === 'xp' && <Path d="M13.5 2.5 5 13.5h5.5L9.5 21.5 19 10.5h-6l.5-8Z" {...s} />}
      {name === 'mastery' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Circle cx={12} cy={12} r={4.5} {...s} />
          <Circle cx={12} cy={12} r={1.4} {...solid} />
        </>
      )}
      {name === 'streak' && (
        <Path d="M12 2.5c3 3.5 5.5 6 5.5 9.5a5.5 5.5 0 0 1-11 0c0-1.6.7-2.9 1.8-4.2.4 1.3 1.2 2 2.2 2.2-.5-3 .3-5.6 1.5-7.5Z" {...s} />
      )}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7" {...s} />}
      {name === 'cross' && <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...s} />}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M12 7v5.5l3.5 2" {...s} />
        </>
      )}

      {/* --- Kartentypen --------------------------------------------------- */}
      {name === 'news' && (
        <>
          <Rect x={3} y={5} width={15} height={14} rx={2} {...s} />
          <Path d="M18 9h3v8a2 2 0 0 1-2 2h-1" {...s} />
          <Path d="M6.5 9h8M6.5 12.5h8M6.5 16h5" {...s} />
        </>
      )}
      {name === 'knowledge' && (
        <>
          <Path d="M9 17.5h6M10 20.5h4" {...s} />
          <Path d="M12 3a6 6 0 0 0-3.5 10.9V15h7v-1.1A6 6 0 0 0 12 3Z" {...s} />
        </>
      )}
      {name === 'interactive' && (
        <>
          <Path d="M4 8.5h16M4 15.5h16" {...s} />
          <Circle cx={9} cy={8.5} r={2.6} {...s} />
          <Circle cx={15} cy={15.5} r={2.6} {...s} />
        </>
      )}
      {name === 'lesson' && (
        <>
          <Path d="M4 4.5h6a2.5 2.5 0 0 1 2 2.5v12a2 2 0 0 0-2-1.5H4Z" {...s} />
          <Path d="M20 4.5h-6a2.5 2.5 0 0 0-2 2.5v12a2 2 0 0 1 2-1.5h6Z" {...s} />
        </>
      )}

      {/* --- Sonstiges ------------------------------------------------------ */}
      {name === 'leaderboard' && (
        <>
          <Rect x={3.5} y={13} width={4.5} height={7.5} rx={1} {...s} />
          <Rect x={9.75} y={8} width={4.5} height={12.5} rx={1} {...s} />
          <Rect x={16} y={16} width={4.5} height={4.5} rx={1} {...s} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect x={5} y={10.5} width={14} height={10} rx={2.5} {...s} />
          <Path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" {...s} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5.5v13M5.5 12h13" {...s} />}
      {/* Vorlesen: eine Schallquelle mit zwei Wellen. Kein Lautsprecher-
          Trapez - das steht ueberall fuer Lautstaerke, hier geht es um
          Vorlesen. */}
      {name === 'listen' && (
        <>
          <Path d="M5 9.5h2.5L11 6.5v11L7.5 14.5H5z" {...s} />
          <Path d="M14.8 9.4a3.8 3.8 0 0 1 0 5.2" {...s} />
          <Path d="M17.4 7.2a7.2 7.2 0 0 1 0 9.6" {...s} />
        </>
      )}
      {/* Laeuft gerade: dieselbe Quelle, aber die Wellen sind ein
          Pausenzeichen. Ein Tipp haelt an. */}
      {/* Sprechblase mit eckiger Spitze - dieselbe Strichsprache wie der
          Rest, keine runde Comic-Blase. */}
      {name === 'comment' && (
        <>
          <Path d="M4.5 6.5h15v9.5h-9l-4.2 3.2v-3.2H4.5z" {...s} />
          <Path d="M8.5 10.2h7M8.5 13h4.5" {...s} />
        </>
      )}
      {name === 'listening' && (
        <>
          <Path d="M5 9.5h2.5L11 6.5v11L7.5 14.5H5z" {...s} />
          <Path d="M15 9v6M18.5 9v6" {...s} />
        </>
      )}
      {name === 'sliders' && (
        <>
          <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" {...s} />
          <Circle cx={16} cy={7} r={2.2} {...s} />
          <Circle cx={10} cy={17} r={2.2} {...s} />
        </>
      )}
    </Svg>
  );
}

export const Icon = memo(IconBase);
