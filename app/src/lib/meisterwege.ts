/**
 * Meisterwege (0095): Stufen je Hauptthema, freigespielt nur durch Lernen.
 *
 * Die App ZEIGT hier nur. Welche Stufe jemand hat und was frei ist,
 * rechnet der Server aus der Mastery (meisterwege(), meister_frei()); die
 * Auswahl geht ueber meister_waehlen(), das Profilbild prueft ein Trigger.
 * Stimmt hier etwas nicht, ist das ein Anzeigefehler - keine Luecke.
 */

export type MeisterBelohnung = {
  id: string;
  stufe: number;
  art: 'rahmen' | 'name' | 'grund' | 'farbe';
  wert: string;
  titel: string;
  pro: boolean;
  frei: boolean;
};

export type Meisterweg = {
  id: string;
  name: string;
  emoji: string | null;
  farbe: string | null;
  mastery: number;
  stufe: number;
  /** Mastery fuer die naechste Stufe, null auf Stufe 5. */
  naechste: number | null;
  belohnungen: MeisterBelohnung[];
};

export type Saison = {
  id: string;
  name: string;
  von: string;
  bis: string;
  ziel: number;
  laeuft: boolean;
  gelesen: number;
};

export type Meisterwege = {
  /** 0108: laufende oder zuletzt gelaufene Saison. */
  saison?: Saison | null;
  rahmen: string | null;
  namensfarbe: string | null;
  wege: Meisterweg[];
};

/** Dieselben Schwellen wie meister_schwelle() in 0095. */
export const MEISTER_SCHWELLEN = [50, 150, 400, 800, 1500] as const;

export const STUFEN_NAMEN = ['', 'Neugierig', 'Kundig', 'Versiert', 'Meisterlich', 'Meister'] as const;

import type { OrnamentArt } from '@/features/rahmen/Ornamente';

type RahmenStil = 'voll' | 'doppelt' | 'strich' | 'punkt' | 'lang';

/**
 * Wie ein Rahmen aussieht. Farbe = Akzentfarbe des Themas (categories.accent_hex),
 * dazu ein Strichbild, damit Themen mit aehnlicher Farbe unterscheidbar bleiben.
 * "-gold" (PRO): dieselbe Linie plus eine goldene Aussenkante.
 */
const RAHMEN: Record<string, { farbe: string; stil: RahmenStil; ornament?: OrnamentArt }> = {
  // Das Ornament passt zum Thema, nicht zur Farbe: Wissenschaft bekommt das
  // Siegel (Praegung), Technik den Knoten (Konstruktion), Geld den Beschlag
  // (Tresorecke), Koerper die Ranke (Wachstum), Kopf das Filigran
  // (Feinarbeit), Welt das Flechtband (Verbindung), Regional die Krone
  // (Wappen). Die Strichart bleibt als Rueckfall, falls ein Ornament
  // einmal nicht gezeichnet werden kann.
  science: { farbe: '#B78BFF', stil: 'doppelt', ornament: 'siegel' },
  tech: { farbe: '#00F0FF', stil: 'strich', ornament: 'knoten' },
  finance: { farbe: '#7CFF6B', stil: 'punkt', ornament: 'beschlag' },
  body: { farbe: '#FF9F45', stil: 'lang', ornament: 'ranke' },
  mind: { farbe: '#FF6BA8', stil: 'doppelt', ornament: 'filigran' },
  world: { farbe: '#E8E4DE', stil: 'strich', ornament: 'band' },
  local: { farbe: '#FFD84D', stil: 'voll', ornament: 'krone' },
  life: { farbe: '#C8D94E', stil: 'punkt', ornament: 'ranke' },
  history: { farbe: '#E3B889', stil: 'voll', ornament: 'beschlag' },
  culture: { farbe: '#FF7A6B', stil: 'lang', ornament: 'filigran' },
  language: { farbe: '#5AD1C4', stil: 'voll', ornament: 'band' },
};

/** Saison-Rahmen (0108): eigene Farbe, sonst wie die Meister-Rahmen gezeichnet. */
const SAISON_RAHMEN: Record<string, { farbe: string; stil: RahmenStil; titel: string; ornament?: OrnamentArt }> = {
  herbst26: { farbe: '#D9803A', stil: 'lang', titel: 'Herbstlaub', ornament: 'ranke' },
};

export function saisonRahmenTitel(code: string): string | null {
  const id = code.replace(/^saison-/, '').replace(/-gold$/, '');
  const r = SAISON_RAHMEN[id];
  return r ? `${r.titel}${code.endsWith('-gold') ? ' Gold' : ''}` : null;
}

export function rahmenAussehen(code: string | null | undefined) {
  if (!code) return null;
  const gold = code.endsWith('-gold');
  if (code.startsWith('saison-')) {
    const r = SAISON_RAHMEN[code.slice(7).replace(/-gold$/, '')];
    return r ? { farbe: r.farbe, stil: r.stil, ornament: r.ornament, gold } : null;
  }
  const basis = RAHMEN[gold ? code.slice(0, -5) : code];
  if (!basis) return null;
  return { ...basis, gold };
}

/** Namensfarbe nur, wenn sie aus der Palette kommt - sonst die normale Schrift. */
const NAMENS_FARBEN = new Set(['#D9B872', '#E8D3A2', '#E39AA8', '#8FBF9A', '#9FB4EE', '#7FC4C9']);
export function namensfarbe(hex: string | null | undefined): string | undefined {
  return hex && NAMENS_FARBEN.has(hex) ? hex : undefined;
}

/** Freie Profilbild-Indizes aus der Uebersicht - fuer die Schloesser im Editor. */
export function freieIndizes(m: Meisterwege | null) {
  const grund = new Set<number>();
  const farbe = new Set<number>();
  for (const w of m?.wege ?? []) {
    for (const b of w.belohnungen) {
      if (!b.frei) continue;
      if (b.art === 'grund') grund.add(Number(b.wert));
      if (b.art === 'farbe') farbe.add(Number(b.wert));
    }
  }
  return { grund, farbe };
}
