import { font } from './fonts';

/**
 * Blueprint / Grid Canvas — das Designsystem.
 *
 * Kernregel: Alles ist monochrom, BIS der Nutzer etwas tut. Erst Interaktion
 * bringt Farbe. Deshalb gibt es unten getrennt `ink` (ruhende Zustaende,
 * ausschliesslich Graustufen) und `signal` (Reaktion, Erfolg, Fortschritt).
 *
 * Wer hier eine bunte Farbe in `ink` eintraegt, bricht das ganze Konzept.
 */

export const color = {
  // --- Grund: tiefes Obsidian, kein reines Schwarz (OLED-Schwarz wirkt tot)
  bg: '#0B0C0E',
  bgElevated: '#0F1114',
  bgSunken: '#08090B',

  // --- Das karierte Raster
  gridLine: '#1A1D24',
  gridLineMajor: '#232833',

  // --- Ink: alle ruhenden Zustaende. NUR Graustufen.
  ink: {
    max: '#F2F4F7', // Ueberschriften
    high: '#C9CFD9', // Fliesstext
    mid: '#8A929F', // Sekundaer, Metadaten
    /**
     * Nachgemessen: der alte Wert #5A616D lag bei 3,1:1 gegen den Grund -
     * deutlich unter den 4,5:1, die fuer Text gelten. Betroffen war alles
     * Kleine: Quellenangabe, Hinweise, Zeitangaben, Bildunterschriften,
     * Untertitel der Erklaerkarten.
     *
     * #7E8695 liegt bei 5,3:1, auf derselben leicht blaeulichen Achse.
     *
     * Das ist bewusst keine Einstellung geworden. Eine Option "heller"
     * waere die falsche Antwort auf Text, der von vornherein zu dunkel
     * ist - der Fliesstext liegt naemlich schon bei 12,5:1 und braucht
     * nichts.
     */
    low: '#7E8695', // Beiwerk, Platzhalter
    faint: '#2A2F3A', // Trennlinien, Rahmen
  },

  // --- Signal: erscheint NUR bei Interaktion, Erfolg, Fortschritt
  signal: {
    primary: '#00F0FF', // Electric Cyan — XP, Fokus, aktiver Zustand
    success: '#7CFF6B', // Neon Lime — richtig geloest
    warn: '#FFD84D', // Streak in Gefahr, Hinweis
    error: '#FF5C7A', // falsch beantwortet
    mastery: '#B78BFF', // Mastery/Level — die "wertvolle" Waehrung
  },

  // --- Semantisch
  overlay: 'rgba(8, 9, 11, 0.72)',
  scrim: 'rgba(0, 0, 0, 0.45)',
} as const;

/** 4px-Basisraster — passt visuell zum karierten Hintergrund */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Der Raster-Hintergrund verwendet exakt diese Zellgroesse */
export const GRID_CELL = 24;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/**
 * Typografie.
 *
 * fontFamily statt fontWeight: bei geladenen Schriften erzeugt fontWeight auf
 * Android sonst eine synthetische Fettung, die schmierig aussieht. Jede Stufe
 * benennt deshalb die Schnittdatei direkt.
 *
 * Negative letterSpacing bei den grossen Graden ist kein Zufall - Space
 * Grotesk laeuft ab etwa 24px sonst zu locker.
 */
export const type = {
  display: {
    fontFamily: font.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.5,
  },
  deck: {
    fontFamily: font.medium,
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 17,
    lineHeight: 27,
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    fontFamily: font.monoMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  mono: {
    fontFamily: font.mono,
    fontSize: 13,
    lineHeight: 18,
  },
} as const;

/**
 * Bewegung. Kurz und feststehend — lange Animationen fuehlen sich auf einem
 * guenstigen Android traege an, und genau darauf wird getestet.
 */
export const motion = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 400,
  /** Feder fuer Drag & Drop / Snap-Back in den Interaktions-Templates */
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  /** Weicher, fuer Ein- und Ausblendungen ganzer Bloecke */
  softSpring: { damping: 22, stiffness: 140, mass: 1 },
  /** Versatz zwischen aufeinanderfolgenden Elementen beim Einblenden */
  stagger: 55,
} as const;

/** Kategoriefarbe aus der DB, mit sicherem Rueckfall auf die Signalfarbe */
export function categoryAccent(hex?: string | null): string {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return color.signal.primary;
  return hex;
}
