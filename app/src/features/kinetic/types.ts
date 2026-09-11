/**
 * Das Drehbuch einer Erklaerkarte.
 *
 * Format und Begruendung stehen in
 * supabase/migrations/0027_kinetic_cards.sql. Kurz: eine Liste von Takten,
 * jeder mit einem gesprochenen Satz und einem Bild. Jeder Takt beschreibt
 * sein Bild vollstaendig; `id` sagt nur, dass zwei Takte dasselbe Bild
 * meinen und ueberblendet statt neu aufgebaut wird.
 */

export type KineticShow =
  /** Eine grosse Zahl oder Aussage. Der Ruhepunkt zwischen bewegten Bildern. */
  | { kind: 'statement'; text: string; sub?: string }
  /** Zeilen, die nacheinander erscheinen. Fuer Verlaeufe und Vergleiche. */
  | { kind: 'table'; id?: string; head?: [string, string]; rows: [string, string][] }
  /** Balken, die auf ihren Wert wachsen. Fuer Groessenverhaeltnisse. */
  | {
      kind: 'bars';
      id?: string;
      unit?: string;
      labels: string[];
      values: number[];
      /** Wo die Balken anfangen. Ohne Angabe bei null. */
      baseline?: number;
    }
  /** Die generative Blaupausen-Grafik. Fuer Takte ohne eigene Zahlen. */
  | { kind: 'figure'; seed?: string; caption?: string };

export type KineticBeat = {
  /** Ein Satz. Nicht zwei - die Sprachausgabe schaltet am Satzende weiter. */
  say: string;
  show: KineticShow;
};

export type KineticScript = { beats: KineticBeat[] };

/**
 * Ist das ein brauchbares Drehbuch?
 *
 * Wird vor dem Abspielen geprueft, nicht vertraut. Das Drehbuch kommt
 * spaeter aus einem Sprachmodell, und ein halbes Drehbuch soll eine
 * gewoehnliche Textkarte ergeben statt eines leeren Bildschirms.
 */
export function isKineticScript(value: unknown): value is KineticScript {
  if (!value || typeof value !== 'object') return false;
  const beats = (value as KineticScript).beats;
  if (!Array.isArray(beats) || beats.length === 0) return false;
  return beats.every(isBeat);
}

function isBeat(b: unknown): boolean {
  const beat = b as KineticBeat | null;
  if (!beat || typeof beat.say !== 'string' || !beat.say.trim()) return false;
  const show = beat.show as (KineticShow & Record<string, unknown>) | undefined;
  if (!show || typeof show !== 'object') return false;

  // Die Form, nicht nur die Art. Ein Takt mit dreispaltiger Tabelle
  // erfuellt zwar "kind === 'table'", wird aber schief gezeichnet - und
  // schief gezeichnet sieht niemand als Datenfehler, sondern als kaputte
  // App. Die Pipeline prueft dasselbe (validate/checks.py); hier steht es
  // trotzdem, weil Karten auch von Hand oder aus einer aelteren Fassung
  // kommen koennen.
  switch (show.kind) {
    case 'statement':
      return typeof show.text === 'string' && show.text.trim().length > 0;
    case 'table':
      return (
        Array.isArray(show.rows) &&
        show.rows.length > 0 &&
        show.rows.every((r) => Array.isArray(r) && r.length === 2)
      );
    case 'bars':
      return (
        Array.isArray(show.labels) &&
        Array.isArray(show.values) &&
        show.labels.length === show.values.length &&
        show.labels.length >= 2 &&
        show.values.every((v) => typeof v === 'number' && Number.isFinite(v))
      );
    case 'figure':
      return true;
    default:
      return false;
  }
}

/**
 * Wie lange ein Takt stehen bleibt, wenn NICHT gesprochen wird.
 *
 * Der Normalfall ist, dass die Sprachausgabe den Takt gibt: gesprochen wird
 * Satz fuer Satz, und weitergeschaltet wird, wenn sie fertig meldet. Damit
 * stimmt es auf jedem Geraet.
 *
 * Ohne Ton braucht es trotzdem ein Tempo - Ton kann aus sein, blockiert
 * sein, oder die Stimme fehlt. Die Schaetzung orientiert sich am
 * Lesetempo: rund 14 Zeichen pro Sekunde, mit einer knappen Sekunde
 * Grundzeit fuer das Bild.
 */
export function estimateBeatMs(say: string): number {
  return Math.round(900 + (say.length / 14) * 1000);
}
