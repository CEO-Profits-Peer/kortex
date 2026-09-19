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

export type Meisterwege = {
  rahmen: string | null;
  namensfarbe: string | null;
  wege: Meisterweg[];
};

/** Dieselben Schwellen wie meister_schwelle() in 0095. */
export const MEISTER_SCHWELLEN = [50, 150, 400, 800, 1500] as const;

export const STUFEN_NAMEN = ['', 'Neugierig', 'Kundig', 'Versiert', 'Meisterlich', 'Meister'] as const;

type RahmenStil = 'voll' | 'doppelt' | 'strich' | 'punkt' | 'lang';

/**
 * Wie ein Rahmen aussieht. Farbe = Akzentfarbe des Themas (categories.accent_hex),
 * dazu ein Strichbild, damit Themen mit aehnlicher Farbe unterscheidbar bleiben.
 * "-gold" (PRO): dieselbe Linie plus eine goldene Aussenkante.
 */
const RAHMEN: Record<string, { farbe: string; stil: RahmenStil }> = {
  science: { farbe: '#B78BFF', stil: 'doppelt' },
  tech: { farbe: '#00F0FF', stil: 'strich' },
  finance: { farbe: '#7CFF6B', stil: 'punkt' },
  body: { farbe: '#FF9F45', stil: 'lang' },
  mind: { farbe: '#FF6BA8', stil: 'doppelt' },
  world: { farbe: '#E8E4DE', stil: 'strich' },
  local: { farbe: '#FFD84D', stil: 'voll' },
  life: { farbe: '#C8D94E', stil: 'punkt' },
  history: { farbe: '#E3B889', stil: 'voll' },
  culture: { farbe: '#FF7A6B', stil: 'lang' },
  language: { farbe: '#5AD1C4', stil: 'voll' },
};

export function rahmenAussehen(code: string | null | undefined) {
  if (!code) return null;
  const gold = code.endsWith('-gold');
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
