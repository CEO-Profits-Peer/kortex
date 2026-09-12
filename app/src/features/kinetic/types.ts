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
  /**
   * Punkte auf einer Zeitachse. Fuer Verlaeufe ueber Jahre.
   *
   * Der Unterschied zur Tabelle ist der ABSTAND: zwischen 1943 und 1957
   * liegen vierzehn Jahre, zwischen 2018 und 2020 zwei - und genau das
   * sieht man hier, waehrend die Tabelle beides gleich hoch macht. Die
   * Luecke ist die Aussage.
   */
  | {
      kind: 'timeline';
      id?: string;
      /** Was auf der Achse steht, wenn es keine Jahre sind ("Tage", "km"). */
      unit?: string;
      points: { at: number; label: string; note?: string }[];
    }
  /**
   * Felder, die sich fuellen. Fuer Anteile an einem Ganzen.
   *
   * Balken vergleichen zwei Groessen nebeneinander; hier geht es um die
   * Aufteilung EINER Groesse. "Achtunddreissig von hundert" als achtund-
   * dreissig gefuellte Kaestchen trifft staerker als ein Balken bei 38 %,
   * weil man die Kaestchen abzaehlen kann.
   */
  | {
      kind: 'quantity';
      id?: string;
      /** Das Ganze. Hoechstens hundert - mehr Kaestchen sieht niemand. */
      total: number;
      unit?: string;
      groups: { label: string; value: number }[];
    }
  /**
   * Ein Ablauf, Schritt fuer Schritt.
   *
   * Die einzige Bildart ohne Zahlen - und der Grund, warum es sie gibt:
   * "wie wird aus einem Antrag ein Bescheid", "was passiert bei der
   * Photosynthese". Solche Texte wurden bisher abgelehnt, weil sich aus
   * ihnen keine Tabelle bauen laesst. Sie sind aber der Kern dessen, was
   * eine Lern-App erklaeren soll.
   */
  | { kind: 'steps'; id?: string; steps: { label: string; note?: string }[] }
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
    case 'timeline':
      // Ein einzelner Punkt ist erlaubt, obwohl er fuer sich nichts
      // erklaert: der erste Takt einer Zeitachse zeigt genau einen, der
      // zweite zwei. Wuerde hier zwei verlangt, faende die App ein
      // Drehbuch ungueltig, das die Pipeline gerade erst freigegeben hat -
      // und die Karte bliebe leer statt Text zu zeigen.
      return (
        Array.isArray(show.points) &&
        show.points.length >= 1 &&
        show.points.every(
          (p) =>
            p &&
            typeof p.at === 'number' &&
            Number.isFinite(p.at) &&
            typeof p.label === 'string' &&
            p.label.trim().length > 0,
        )
      );
    case 'quantity':
      return (
        typeof show.total === 'number' &&
        show.total >= 2 &&
        Array.isArray(show.groups) &&
        show.groups.length > 0 &&
        show.groups.every(
          (g) =>
            g &&
            typeof g.value === 'number' &&
            Number.isFinite(g.value) &&
            g.value >= 0 &&
            typeof g.label === 'string',
        ) &&
        // Mehr Anteile als Ganzes gaebe ein Raster, das ueberlaeuft - und
        // eine Aussage, die nicht stimmt. Die zwei Prozent Spielraum sind
        // dieselben wie in validate/checks.py: gerundete Prozentangaben
        // summieren sich auf 100,2, und die beiden Pruefungen MUESSEN
        // gleich streng sein. Waere die App strenger, ergaebe ein von der
        // Pipeline freigegebenes Drehbuch hier eine leere Karte.
        show.groups.reduce((sum, g) => sum + g.value, 0) <= show.total * 1.02
      );
    case 'steps':
      return (
        Array.isArray(show.steps) &&
        show.steps.length >= 1 &&
        show.steps.every(
          (s) => s && typeof s.label === 'string' && s.label.trim().length > 0,
        )
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
