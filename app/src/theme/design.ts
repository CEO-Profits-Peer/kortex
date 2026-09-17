import { Platform, type ViewStyle } from 'react-native';

/**
 * Design 2.0 - umschaltbar, zum direkten Vergleich.
 *
 * Gewuenscht (16.09.2026): "das gesamte neue UI-Paket mit einem Schalter in
 * den Einstellungen umschalten - das Umschalten darf dauern, die App darf
 * neu laden - dann kann ich perfekt vergleichen."
 *
 * Deshalb wird die Wahl BEIM LADEN dieses Moduls gelesen, synchron, und
 * nie waehrend die App laeuft geaendert. tokens.ts entscheidet damit, welche
 * Farben und Radien gelten, und jedes StyleSheet.create in der App baut
 * seine Stile daraus. Ein Umschalten zur Laufzeit muesste jeden Stil neu
 * erzeugen - ein Neuladen erledigt das vollstaendig und ohne Sonderfaelle.
 *
 * Gelesen wird aus localStorage, nicht aus AsyncStorage: AsyncStorage ist
 * asynchron und kaeme zu spaet - die ersten Stile waeren schon gebaut. Die
 * App laeuft als Web-App; nativ gibt es localStorage nicht, dort bleibt das
 * klassische Design.
 *
 * Die Wahl gilt fuer dieses Geraet, nicht fuer das Konto: ein Vergleich
 * zwischen zwei Designs ist etwas, das man auf einem Bildschirm macht.
 */

export type DesignVersion = 'klassisch' | 'zwei';
export type Muster = 'sechseck' | 'dreieck' | 'keins';

const SCHLUESSEL_DESIGN = 'elycic.design';
const SCHLUESSEL_MUSTER = 'elycic.design.muster';

function lesen(schluessel: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(schluessel);
  } catch {
    return null;
  }
}

export const DESIGN: DesignVersion = lesen(SCHLUESSEL_DESIGN) === 'zwei' ? 'zwei' : 'klassisch';
export const ZWEI = DESIGN === 'zwei';

const gelesenesMuster = lesen(SCHLUESSEL_MUSTER);
export const MUSTER: Muster =
  gelesenesMuster === 'dreieck' || gelesenesMuster === 'keins' ? gelesenesMuster : 'sechseck';

/** Kann dieses Geraet ueberhaupt umschalten? */
export const UMSCHALTBAR = Platform.OS === 'web' && typeof window !== 'undefined';

function speichernUndNeuLaden(schluessel: string, wert: string) {
  if (!UMSCHALTBAR) return;
  try {
    window.localStorage.setItem(schluessel, wert);
  } catch {
    return;
  }
  // Ein Moment Luft, damit der Schalter noch sichtbar umspringt - sonst
  // sieht das Neuladen aus wie ein Absturz.
  setTimeout(() => window.location.reload(), 350);
}

export function designWechseln(v: DesignVersion) {
  speichernUndNeuLaden(SCHLUESSEL_DESIGN, v);
}

export function musterWechseln(m: Muster) {
  speichernUndNeuLaden(SCHLUESSEL_MUSTER, m);
}

// --- Formen -------------------------------------------------------------------------

/**
 * Facette: ein Rechteck mit zwei schraeg abgeschnittenen Ecken (oben links,
 * unten rechts) - die Sprache des Sechsecks auf einer Flaeche, auf der Text
 * steht.
 *
 * Gebaut mit clip-path, nicht mit SVG hinter jeder Karte: eine Liste mit
 * fuenfzig Beitraegen haette sonst fuenfzig Zeichenflaechen mehr, und das
 * spuert man beim Scrollen auf einem guenstigen Handy. Der Preis: clip-path
 * schneidet auch einen Rahmen ab. Deshalb tragen Karten in Design 2.0 keinen
 * Rahmen, sondern eine etwas hellere Flaeche - die schraege Kante zeichnet
 * sich durch den Helligkeitsunterschied ab.
 *
 * Im klassischen Design und nativ: nichts.
 */
export function facette(g = 10): ViewStyle {
  if (!ZWEI || Platform.OS !== 'web') return {};
  const p = `polygon(${g}px 0, 100% 0, 100% calc(100% - ${g}px), calc(100% - ${g}px) 100%, 0 100%, 0 ${g}px)`;
  return { clipPath: p, WebkitClipPath: p } as unknown as ViewStyle;
}

/** Facette ohne Rahmen: in Design 2.0 Rahmen weg, Flaeche statt Linie. */
export function flaeche(g = 10): ViewStyle {
  if (!ZWEI) return {};
  return { borderWidth: 0, ...facette(g) } as ViewStyle;
}

/** Sechseck mit Spitze oben - fuer Avatare, Abzeichen, Marken. */
export function sechseck(): ViewStyle {
  if (!ZWEI || Platform.OS !== 'web') return {};
  const p = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
  return { clipPath: p, WebkitClipPath: p, borderRadius: 0 } as unknown as ViewStyle;
}

/** Punkte eines Sechsecks mit Spitze oben, fuer SVG (Rahmen, Ringe). */
export function sechseckPunkte(b: number, h: number, inset = 0): string {
  const i = inset;
  return [
    [b / 2, i],
    [b - i, h * 0.25 + i / 2],
    [b - i, h * 0.75 - i / 2],
    [b / 2, h - i],
    [i, h * 0.75 - i / 2],
    [i, h * 0.25 + i / 2],
  ]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
}

/** Goldverlauf fuer Hauptknoepfe - nur im Browser, sonst die Grundfarbe. */
export function goldVerlauf(): ViewStyle {
  if (!ZWEI || Platform.OS !== 'web') return {};
  return {
    backgroundImage: 'linear-gradient(135deg, #E6C987 0%, #D4AF6A 45%, #B8893F 100%)',
  } as unknown as ViewStyle;
}
