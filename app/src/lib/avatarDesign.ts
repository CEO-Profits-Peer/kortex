/**
 * Das Profilbild, selbst gezeichnet.
 *
 * Bisher war `avatar_seed` eine zufaellige Zeichenkette: daraus wurde ein
 * Muster gehasht, und mehr Auswahl als "neues Konto anlegen" gab es nicht.
 *
 * Jetzt darf dieselbe Spalte auch eine ENTWORFENE Vorlage enthalten. Der
 * Trick ist, dass beides nebeneinander existieren kann:
 *
 *     "9f3c1a2b-..."   -> gehasht wie bisher, unveraendert
 *     "v1-210-a7"      -> genau dieses Muster, so gewollt
 *
 * Warum keine eigene Spalte: der Avatar wird an einem Dutzend Stellen
 * gezeichnet - Kommentare, Rangliste, Personenleiste, fremde Profile - und
 * ueberall liegt schon `avatar_seed` vor. Eine zweite Spalte haette
 * bedeutet, jede dieser Abfragen anzufassen. Eine Zeichenkette, die sich
 * selbst erklaert, kostet nichts und kommt ueberall von allein an.
 *
 * Format:  v1-<farbe><form><kern>-<hex>
 *          farbe 0-7, form 0-2, kern 0|1, hex = 8 Bit Muster
 */

/**
 * Die ersten SECHS Farben sind die von frueher, in genau dieser
 * Reihenfolge. Der Hash-Weg benutzt weiterhin nur sie - haette ich die
 * Liste einfach verlaengert, haetten ueber Nacht alle bestehenden Konten
 * eine andere Farbe gehabt. Ein Erkennungszeichen, das sich von selbst
 * aendert, ist keins mehr.
 */
export const PALETTE = [
  '#00F0FF',
  '#7CFF6B',
  '#B78BFF',
  '#FFD84D',
  '#FF9F45',
  '#FF6BA8',
  // Ab hier nur fuer selbst entworfene Bilder.
  '#3DDCC8',
  '#5B8CFF',
] as const;

const HASH_COLORS = 6;

export const SHAPES = ['blocks', 'dots', 'bars'] as const;
export type Shape = (typeof SHAPES)[number];

export const SHAPE_LABEL: Record<Shape, string> = {
  blocks: 'Blöcke',
  dots: 'Punkte',
  bars: 'Balken',
};

export type AvatarDesign = {
  /** Index in PALETTE. */
  tint: number;
  shape: Shape;
  /** Der Punkt in der Mitte. */
  core: boolean;
  /**
   * 4 Zeilen x 2 Spalten. Gespiegelt ergibt das ein 4x4-Raster - deshalb
   * werden hier nur acht Felder gespeichert und nicht sechzehn.
   */
  cells: boolean[][];
};

const RE = /^v1-([0-7])([0-2])([01])-([0-9a-f]{2})$/;

/** Ist diese Zeichenkette ein Entwurf (und nicht irgendeine Zufalls-ID)? */
export function isDesignSeed(seed: string | null | undefined): boolean {
  return !!seed && RE.test(seed);
}

export function encodeAvatar(d: AvatarDesign): string {
  let bits = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      if (d.cells[row][col]) bits |= 1 << (row * 2 + col);
    }
  }
  const tint = Math.max(0, Math.min(PALETTE.length - 1, d.tint));
  const shape = Math.max(0, SHAPES.indexOf(d.shape));
  return `v1-${tint}${shape}${d.core ? 1 : 0}-${bits.toString(16).padStart(2, '0')}`;
}

/**
 * Aus dem Seed ein Muster machen - egal welcher Sorte.
 *
 * Faellt der Entwurf durch die Pruefung (alter Seed, Tippfehler, kaputter
 * Datensatz), wird gehasht wie immer. Diese Funktion gibt nie nichts
 * zurueck: ein Konto ohne Erkennungszeichen waere schlimmer als eins mit
 * dem falschen.
 */
export function decodeAvatar(seed: string): AvatarDesign {
  const m = RE.exec(seed ?? '');
  if (m) {
    const bits = parseInt(m[4], 16);
    return {
      tint: Number(m[1]),
      shape: SHAPES[Number(m[2])] ?? 'blocks',
      core: m[3] === '1',
      cells: Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 2 }, (_, col) => (bits & (1 << (row * 2 + col))) !== 0),
      ),
    };
  }
  return hashed(seed ?? '');
}

/** Der alte Weg, Zeichen fuer Zeichen unveraendert. */
function hashed(seed: string): AvatarDesign {
  const r = rng(seed);
  const tint = Math.floor(r() * HASH_COLORS);
  const cells = Array.from({ length: 4 }, () =>
    Array.from({ length: 2 }, () => r() > 0.45),
  );
  return { tint, shape: 'blocks', core: true, cells };
}

export function randomDesign(): AvatarDesign {
  const cells = Array.from({ length: 4 }, () =>
    Array.from({ length: 2 }, () => Math.random() > 0.45),
  );
  // Ein komplett leeres Raster sieht aus wie ein Ladefehler.
  if (!cells.some((row) => row.some(Boolean))) cells[1][0] = true;
  return {
    tint: Math.floor(Math.random() * PALETTE.length),
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    core: Math.random() > 0.4,
    cells,
  };
}

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
