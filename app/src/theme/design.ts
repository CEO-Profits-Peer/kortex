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
/** Wie das Sechseck auf dem aktiven Tab aussieht: flach mit Goldlinie oder geschliffen. */
export type Linse = 'flach' | 'stein';

const SCHLUESSEL_DESIGN = 'elycic.design';
const SCHLUESSEL_MUSTER = 'elycic.design.muster';
const SCHLUESSEL_LINSE = 'elycic.design.linse';

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

/**
 * Standard ist jetzt "keins": das Muster hinter grossen Ueberschriften machte
 * sie unruhig. Es lebt stattdessen in den Bordeaux-Karten (BordeauxMuster).
 * Wer im Hintergrund eins gewaehlt hat, behaelt es.
 */
const gelesenesMuster = lesen(SCHLUESSEL_MUSTER);
export const MUSTER: Muster =
  gelesenesMuster === 'dreieck' || gelesenesMuster === 'sechseck' ? gelesenesMuster : 'keins';

/** Entwurf B ("Stein") ist der Standard, A ("Flach") per Schalter. */
export const LINSE: Linse = lesen(SCHLUESSEL_LINSE) === 'flach' ? 'flach' : 'stein';

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

export function linseWechseln(l: Linse) {
  speichernUndNeuLaden(SCHLUESSEL_LINSE, l);
}

// --- Formen -------------------------------------------------------------------------

/**
 * Facette: alle VIER Ecken klein abgeschraegt, wie ein geschliffener Stein.
 *
 * Vorher waren es nur zwei (oben links, unten rechts). Am Handy sah das aus
 * wie eine abgebrochene Ecke, nicht wie Absicht - eine einzelne Schraege
 * liest man als Schaden, eine symmetrische als Schliff.
 *
 * Seit der Ueberarbeitung NUR fuer das Besondere: Bordeaux-Karten, der
 * Hauptknopf, die Tab-Leiste. Waeren alle Karten geschliffen, waere es
 * keine mehr.
 *
 * Gebaut mit clip-path statt SVG hinter jeder Flaeche - das bleibt beim
 * Scrollen billig. Der Preis: ein Rahmen wird mit abgeschnitten.
 *
 * Im klassischen Design und nativ: nichts.
 */
export function facette(g = 10): ViewStyle {
  if (!ZWEI || Platform.OS !== 'web') return {};
  const p = `polygon(${g}px 0, calc(100% - ${g}px) 0, 100% ${g}px, 100% calc(100% - ${g}px), calc(100% - ${g}px) 100%, ${g}px 100%, 0 calc(100% - ${g}px), 0 ${g}px)`;
  return { clipPath: p, WebkitClipPath: p } as unknown as ViewStyle;
}

/** Die hauchduenne helle Kante oben auf normalen Karten. */
export const KANTE = '#332B30';

/**
 * Normale Karte in Design 2.0: praezise eckig, kein Rahmen rundum, oben eine
 * feine helle Kante - wie Glas oder Stein, auf das Licht von oben faellt.
 * Dadurch wirkt die Flaeche wie ein Material statt wie ein Kasten.
 *
 * Der Parameter ist geblieben, damit die vielen Aufrufer nicht angefasst
 * werden muessen; geschnitten wird hier nichts mehr (siehe facette).
 */
export function flaeche(_g = 10): ViewStyle {
  if (!ZWEI) return {};
  return { borderWidth: 0, borderTopWidth: 1, borderTopColor: KANTE } as ViewStyle;
}

/** Sechseck mit Spitze oben - fuer Avatare, Abzeichen, Marken. */
export function sechseck(): ViewStyle {
  if (!ZWEI || Platform.OS !== 'web') return {};
  const p = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
  return { clipPath: p, WebkitClipPath: p, borderRadius: 0 } as unknown as ViewStyle;
}

/**
 * REGELMAESSIGES Sechseck mit Spitze oben in einem quadratischen Kasten.
 *
 * sechseck() fuellt den Kasten ganz aus - in einem Quadrat wird das
 * gestaucht: zu breit fuer seine Hoehe. Ein regelmaessiges Sechseck mit
 * Spitze oben ist nur sqrt(3)/2 = 86,6 % so breit wie hoch; links und
 * rechts bleiben also je 6,7 % frei. Fuer Profilbilder, die auf Wunsch
 * "echte regelmaessige Sechsecke" sind.
 */
export const SECHSECK_RAND = (1 - Math.sqrt(3) / 2) / 2;

export function sechseckRegel(): ViewStyle {
  if (!ZWEI || Platform.OS !== 'web') return {};
  const l = `${(SECHSECK_RAND * 100).toFixed(2)}%`;
  const r = `${(100 - SECHSECK_RAND * 100).toFixed(2)}%`;
  const p = `polygon(50% 0, ${r} 25%, ${r} 75%, 50% 100%, ${l} 75%, ${l} 25%)`;
  return { clipPath: p, WebkitClipPath: p, borderRadius: 0 } as unknown as ViewStyle;
}

/** Punkte des regelmaessigen Sechsecks in einem Quadrat der Kante `g`. */
export function sechseckRegelPunkte(g: number, inset = 0): string {
  const rand = g * SECHSECK_RAND;
  const b = g - 2 * rand;
  return sechseckPunkte(b, g, inset)
    .split(' ')
    .map((p) => {
      const [x, y] = p.split(',').map(Number);
      return `${(x + rand).toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
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
    backgroundImage: 'linear-gradient(160deg, #E8D3A2 0%, #D9B872 50%, #C19C58 100%)',
  } as unknown as ViewStyle;
}
