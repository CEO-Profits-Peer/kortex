/**
 * Profilbild v2: ein Wabenraster.
 *
 * Gewuenscht (16.09.2026): "Profilbild bearbeiten aufs neue Theme anpassen,
 * umfangreicher, aber immer noch kreativ". Das alte Raster (4x4 Quadrate,
 * eine Farbe) passt nicht mehr zu einem Sechseck-Avatar: ein Quadratmuster
 * im Sechseck wird immer irgendwo angeschnitten.
 *
 * Deshalb zeichnet v2 auf 37 Waben, die zusammen selbst ein Sechseck mit
 * Spitze oben bilden - dieselbe Form wie der Rahmen. Nichts wird mehr
 * abgeschnitten, und das Bild IST die Form der App.
 *
 * Mehr Moeglichkeiten, aber jede einzelne bleibt einfach:
 *   - zwei Farben statt einer (jede Wabe: aus, Farbe 1, Farbe 2)
 *   - ein Hintergrund
 *   - vier Stile, wie die Waben gezeichnet werden
 *   - Symmetrie beim Malen (gespiegelt, sechsfach, frei) - nur ein
 *     Werkzeug im Editor, gespeichert werden immer alle 37 Waben
 *
 * Format:  v2-<hintergrund><farbe1><farbe2><stil>-<19 hex>
 *          je ein Zeichen 0-9a-z; 37 Waben x 2 Bit = 74 Bit -> 19 Hex.
 * Die Datenbank prueft genau dieses Muster (0089_avatar_waben.sql).
 */

/** Edelsteinfarben, die auf dunklem Grund und neben Bordeaux und Gold bestehen. */
export const WABEN_FARBEN = [
  '#D9B872', // Gold
  '#E8D3A2', // Champagner
  '#C0435E', // Rubin
  '#E39AA8', // Rose
  '#F07167', // Koralle
  '#E9A45B', // Bernstein
  '#8FBF9A', // Salbei
  '#4FA38A', // Jade
  '#4C9AA8', // Petrol
  '#6F8FE0', // Saphir
  '#BFA2EE', // Lavendel
  '#F5F1EB', // Elfenbein
] as const;

export const WABEN_GRUENDE = [
  '#241D22', // Graphit
  '#4E1626', // Bordeaux
  '#2E1B2E', // Pflaume
  '#16192A', // Nacht
  '#122A2E', // Ozean
  '#1C2620', // Moos
  '#3A3024', // Sand
  '#0F0D10', // Tinte
] as const;

export const WABEN_STILE = ['waben', 'stein', 'kontur', 'punkte'] as const;
export type WabenStil = (typeof WABEN_STILE)[number];
export const WABEN_STIL_LABEL: Record<WabenStil, string> = {
  waben: 'Waben',
  stein: 'Stein',
  kontur: 'Kontur',
  punkte: 'Punkte',
};

export type Symmetrie = 'spiegel' | 'sechs' | 'frei';
export const SYMMETRIE_LABEL: Record<Symmetrie, string> = {
  spiegel: 'Spiegel',
  sechs: 'Stern',
  frei: 'Frei',
};

/** 0 = aus, 1 = Farbe 1, 2 = Farbe 2 */
export type Wabe = 0 | 1 | 2;

export type WabenDesign = {
  grund: number;
  farbe1: number;
  farbe2: number;
  stil: WabenStil;
  /** Eine Eintragung je Wabe, Reihenfolge wie WABEN. */
  waben: Wabe[];
};

// --- Geometrie ---------------------------------------------------------------------

/**
 * Axiale Koordinaten (q, r) fuer ein Sechseck mit Radius 3. Die Waben sind
 * FLACH liegend - nur dann ergibt ihr Verbund ein Sechseck mit Spitze oben.
 * Die Reihenfolge ist fest und darf sich nie aendern: an ihr haengt, welches
 * Bit welche Wabe ist.
 */
export const RADIUS = 3;
export const WABEN: { q: number; r: number }[] = (() => {
  const out: { q: number; r: number }[] = [];
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = -RADIUS; r <= RADIUS; r++) {
      if (Math.abs(q + r) <= RADIUS) out.push({ q, r });
    }
  }
  return out;
})();

const INDEX = new Map(WABEN.map((w, i) => [`${w.q},${w.r}`, i]));

export function wabenIndex(q: number, r: number): number | undefined {
  return INDEX.get(`${q},${r}`);
}

/** Mittelpunkt einer Wabe relativ zur Bildmitte, bei Wabengroesse s (Mitte bis Ecke). */
export function wabenMitte(q: number, r: number, s: number): { x: number; y: number } {
  return { x: s * 1.5 * q, y: s * Math.sqrt(3) * (r + q / 2) };
}

/** Ecken einer flach liegenden Wabe um (x, y). */
export function wabenEcken(x: number, y: number, s: number): [number, number][] {
  const h = (s * Math.sqrt(3)) / 2;
  return [
    [x - s, y],
    [x - s / 2, y - h],
    [x + s / 2, y - h],
    [x + s, y],
    [x + s / 2, y + h],
    [x - s / 2, y + h],
  ];
}

/**
 * Alle Waben, die beim Tippen auf (q, r) mitgemalt werden.
 *
 * Spiegel: an der senkrechten Mittelachse. Im Wuerfelsystem (x=q, z=r,
 * y=-q-r) ist das der Tausch von x und -x bei festem y: (q, r) -> (-q, q+r).
 *
 * Sechsfach: sechs Drehungen um je 60 Grad - ein Kaleidoskop. Eine Drehung
 * ist (x, y, z) -> (-z, -x, -y).
 */
export function symmetrisch(q: number, r: number, sym: Symmetrie): number[] {
  const ziele: [number, number][] = [[q, r]];
  if (sym === 'spiegel') ziele.push([-q, q + r]);
  if (sym === 'sechs') {
    let x = q;
    let z = r;
    let y = -q - r;
    for (let i = 0; i < 5; i++) {
      [x, y, z] = [-z, -x, -y];
      ziele.push([x, z]);
    }
  }
  const out = new Set<number>();
  for (const [a, b] of ziele) {
    const i = wabenIndex(a, b);
    if (i !== undefined) out.add(i);
  }
  return [...out];
}

// --- Seed --------------------------------------------------------------------------

const RE = /^v2-([0-9a-z])([0-9a-z])([0-9a-z])([0-9a-z])-([0-9a-f]{19})$/;

export function istWabenSeed(seed: string | null | undefined): boolean {
  return !!seed && RE.test(seed);
}

const b36 = (n: number) => n.toString(36);
const klemme = (n: number, max: number) => Math.max(0, Math.min(max - 1, n | 0));

export function wabenKodieren(d: WabenDesign): string {
  // Zwei Waben je Hex-Zeichen, je 2 Bit. 37 Waben -> die letzte teilt sich
  // ihr Zeichen mit einer leeren.
  let hex = '';
  for (let i = 0; i < WABEN.length; i += 2) {
    const a = d.waben[i] ?? 0;
    const b = d.waben[i + 1] ?? 0;
    hex += ((a << 2) | b).toString(16);
  }
  return (
    'v2-' +
    b36(klemme(d.grund, WABEN_GRUENDE.length)) +
    b36(klemme(d.farbe1, WABEN_FARBEN.length)) +
    b36(klemme(d.farbe2, WABEN_FARBEN.length)) +
    b36(Math.max(0, WABEN_STILE.indexOf(d.stil))) +
    '-' +
    hex
  );
}

export function wabenDekodieren(seed: string): WabenDesign | null {
  const m = RE.exec(seed);
  if (!m) return null;
  const waben: Wabe[] = [];
  for (let i = 0; i < WABEN.length; i++) {
    const n = parseInt(m[5][i >> 1], 16);
    const v = (i % 2 === 0 ? n >> 2 : n) & 3;
    waben.push((v > 2 ? 0 : v) as Wabe);
  }
  return {
    grund: klemme(parseInt(m[1], 36), WABEN_GRUENDE.length),
    farbe1: klemme(parseInt(m[2], 36), WABEN_FARBEN.length),
    farbe2: klemme(parseInt(m[3], 36), WABEN_FARBEN.length),
    stil: WABEN_STILE[parseInt(m[4], 36)] ?? 'waben',
    waben,
  };
}

// --- Erzeugen ----------------------------------------------------------------------

/** Einfacher Zufall mit Startwert - damit ein altes Konto immer dieselbe Vorlage bekommt. */
function zufall(start: string) {
  let h = 2166136261;
  for (let i = 0; i < start.length; i++) {
    h ^= start.charCodeAt(i);
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

/**
 * Ein Zufallsbild, das nach Absicht aussieht: gemalt wird symmetrisch, und
 * nur auf einem Teil der Waben - ein volles Raster ist ein Fleck.
 */
export function wabenWuerfeln(sym: Symmetrie = 'spiegel', start?: string): WabenDesign {
  const r = start ? zufall(start) : Math.random;
  const waben: Wabe[] = WABEN.map(() => 0);
  const dichte = 0.28 + r() * 0.22;
  // Je GRUPPE wuerfeln, nicht je Wabe: sonst faerbt "Stern" jede Wabe bis
  // zu sechsmal an, und das Bild ist fast voll.
  const gesehen = new Set<number>();
  WABEN.forEach((w, i) => {
    if (gesehen.has(i)) return;
    const gruppe = symmetrisch(w.q, w.r, sym);
    gruppe.forEach((g) => gesehen.add(g));
    if (r() > dichte) return;
    const wert: Wabe = r() > 0.3 ? 1 : 2;
    for (const g of gruppe) waben[g] = wert;
  });
  if (!waben.some(Boolean)) waben[wabenIndex(0, 0)!] = 1;
  const farbe1 = Math.floor(r() * WABEN_FARBEN.length);
  let farbe2 = Math.floor(r() * WABEN_FARBEN.length);
  if (farbe2 === farbe1) farbe2 = (farbe1 + 5) % WABEN_FARBEN.length;
  return {
    grund: Math.floor(r() * WABEN_GRUENDE.length),
    farbe1,
    farbe2,
    stil: WABEN_STILE[Math.floor(r() * WABEN_STILE.length)],
    waben,
  };
}

export function wabenLeer(vorher: WabenDesign): WabenDesign {
  return { ...vorher, waben: WABEN.map(() => 0 as Wabe) };
}
