import { ZWEI } from './design';
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

const farbenKlassisch = {
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

  // --- Neu fuer Design 2.0; im klassischen Design auf die alten Rollen gelegt,
  // damit gemeinsame Bausteine nicht verzweigen muessen.
  bordeaux: '#0F1114',
  bordeauxHell: '#2A2F3A',
  goldHell: '#00F0FF',
  goldDunkel: '#00F0FF',
  /** Kleine Hinweise, Links, Markierungen. Klassisch: die Signalfarbe. */
  akzent: '#00F0FF',
};

/**
 * Design 2.0 (entschieden 16.09.2026, ueberarbeitet am selben Tag) - 60 / 30 / 10.
 *
 * Die erste Fassung sah am Handy aus "wie eine Baustelle, Gelb - Grau/
 * Schwarz". Zwei Gruende: das Gold war ein gesaettigtes Senfgelb, und es
 * stand ueberall - Knoepfe, Links, Markierungen, Symbolkreise, Avatar-
 * Ringe. Gold wirkt nur, wenn es selten ist und auf etwas Sattem liegt.
 *
 * Deshalb jetzt:
 *   - Gold waermer (Champagner statt Senf) und nur noch fuer den einen
 *     Hauptknopf, den aktiven Tab, XP und Fortschritt.
 *   - `akzent` fuer alles Kleine, das vorher gold war: ein warmes Hellgrau.
 *   - Karten in Pflaumen-Anthrazit statt neutralem Grau - aus derselben
 *     Familie wie Bordeaux, sonst sehen die Flaechen aus wie zwei Apps.
 *
 *   60 %  Graphit: Grund und Feed. Fast schwarz mit einem Hauch Rot, damit
 *         Bordeaux und Gold darauf zu Hause sind statt aufgeklebt.
 *   30 %  Dunkelgrau fuer Flaechen, Bordeaux NUR fuer besondere Karten
 *         (Tagesfrage, LAB-Ergebnis, der Haupt-Knopf "Beitrag"). Waeren alle
 *         Karten rot, waere keine mehr besonders.
 *   10 %  Gold: was man druecken oder verdienen kann - Aktion, aktiver Tab,
 *         XP. Nie fuer laengeren Text, dafuer ist es zu schwer lesbar.
 *
 * Gold ersetzt Cyan als Signalfarbe. Richtig/falsch bleiben eigene Farben,
 * und das Rot fuer "falsch" ist bewusst Koralle - neben Bordeaux darf es
 * nicht wie Deko aussehen.
 *
 * Kontrast nachgerechnet gegen #0E0D0F: ink.low #8F877F liegt bei rund
 * 5,4:1, ink.high bei ueber 11:1.
 */
const farbenZwei: typeof farbenKlassisch = {
  bg: '#0F0D10',
  bgElevated: '#1B1619',
  bgSunken: '#0B0A0C',

  gridLine: '#1B181B',
  gridLineMajor: '#241F23',

  ink: {
    max: '#F5F1EB',
    high: '#D6CFC7',
    mid: '#A1988F',
    low: '#8F877F',
    faint: '#2F282C',
  },

  signal: {
    primary: '#D9B872',
    success: '#6FCF97',
    warn: '#E9A45B',
    error: '#F07167',
    mastery: '#BFA2EE',
  },

  overlay: 'rgba(10, 9, 11, 0.76)',
  scrim: 'rgba(0, 0, 0, 0.5)',

  bordeaux: '#4E1626',
  bordeauxHell: '#6E2436',
  goldHell: '#E8D3A2',
  goldDunkel: '#BF9A57',
  akzent: '#CDBFAA',
};

type Farben = {
  bg: string;
  bgElevated: string;
  bgSunken: string;
  gridLine: string;
  gridLineMajor: string;
  ink: { max: string; high: string; mid: string; low: string; faint: string };
  signal: { primary: string; success: string; warn: string; error: string; mastery: string };
  overlay: string;
  scrim: string;
  bordeaux: string;
  bordeauxHell: string;
  goldHell: string;
  goldDunkel: string;
  akzent: string;
};

export const color: Farben = ZWEI ? farbenZwei : farbenKlassisch;

/**
 * "Ausgewaehlt" in Design 2.0: eine Bordeaux-Flaeche statt eines Goldrands.
 *
 * Ein Goldrand um jede gewaehlte Option war einer der Gruende fuer den
 * Baustellen-Eindruck. Bordeaux ist ruhiger, liest sich trotzdem sofort als
 * "das hier" - und Gold bleibt frei fuer das, was man druecken soll.
 * Klassisch gilt weiter, was der Aufrufer angibt.
 */
export function gewaehlt<T extends object>(klassisch: T): T {
  if (!ZWEI) return klassisch;
  return { backgroundColor: color.bordeaux, borderColor: color.bordeauxHell } as unknown as T;
}

/** Schrift auf einer gewaehlten Flaeche: hell statt Gold. */
export function gewaehltText<T extends object>(klassisch: T): T {
  if (!ZWEI) return klassisch;
  return { color: color.ink.max } as unknown as T;
}

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

const radiusKlassisch = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 };

/**
 * Design 2.0: keine weich gerundeten Ecken mehr ("was mich nervt, sind die
 * Karten mit den regulaeren abgerundeten Ecken"). Ein, zwei Pixel bleiben,
 * damit Kanten auf hochaufloesenden Bildschirmen nicht flimmern. Die Form
 * tragen die Facetten (design.ts), nicht der Radius.
 */
const radiusZwei = { sm: 2, md: 2, lg: 3, xl: 4, pill: 4 };

export const radius: { sm: number; md: number; lg: number; xl: number; pill: number } = ZWEI
  ? radiusZwei
  : radiusKlassisch;

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
  return ZWEI ? gedaempft(hex) : hex;
}

/**
 * Design 2.0: die Kategoriefarben bleiben, aber gedaempft. Neon-Gruen und
 * Cyan neben Gold und Bordeaux sehen aus wie zwei Apps auf einem Bildschirm.
 * Ein Drittel Richtung warmes Grau - die Farbe bleibt erkennbar, verliert
 * aber das Leuchten.
 */
function gedaempft(hex: string): string {
  const mix = (a: number, b: number) => Math.round(a * 0.66 + b * 0.34);
  const r = mix(parseInt(hex.slice(1, 3), 16), 0x9a);
  const g = mix(parseInt(hex.slice(3, 5), 16), 0x92);
  const b = mix(parseInt(hex.slice(5, 7), 16), 0x8b);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
