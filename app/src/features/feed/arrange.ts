import type { ContentItem } from '@/lib/types.db';

/**
 * Reihenfolge innerhalb eines Batches.
 *
 * Der Server rankt nach Relevanz — was am besten passt, kommt zuerst. Das
 * erzeugt aber genau die Monotonie, die im Konzept ausgeschlossen war: fünf
 * Finanzkarten hintereinander, oder drei Aufgaben am Stück.
 *
 * Relevanz und Abwechslung sind zwei verschiedene Ziele. Der Server macht
 * das erste, diese Funktion das zweite — bewusst getrennt, weil sich
 * "abwechslungsreich" in SQL nur mit Fensterfunktionen und Rekursion
 * ausdrücken lässt, die niemand mehr lesen kann.
 *
 * Drei Regeln, in dieser Reihenfolge gewichtet:
 *
 *   1. Nie zwei Karten derselben Kategorie hintereinander.
 *   2. Nie mehr als zwei desselben Typs hintereinander
 *      (die Anti-Monotonie-Regel aus dem Konzept).
 *   3. Aufgaben etwa alle vier Karten — "alle 3–4 Swipes eine interaktive
 *      Card". Zu dicht ermüdet, zu dünn und man vergisst, dass es sie gibt.
 *   0b. Die erste Karte ist nie eine Wiederholung. Wer die App öffnet und
 *       als Erstes etwas Gelesenes sieht, schließt sie wieder — das ist
 *       der teuerste Moment, den es gibt.
 *   4. Erklärkarten so oft wie möglich, aber nie zwei hintereinander.
 *      Sie sind das Beste, was der Feed zu bieten hat — und genau deshalb
 *      dürfen sie sich nicht stapeln: zwei gesprochene Vorträge in Folge
 *      sind kein Feed mehr, sondern eine Sendung. Ziel ist jede zweite
 *      Karte.
 *
 * Greedy statt optimal: bei zehn Karten wäre die perfekte Anordnung
 * berechenbar, aber der Unterschied ist unsichtbar und der Code doppelt so
 * lang. Was zählt, ist dass keine zwei Gleichen aufeinander folgen.
 *
 * Regel 1 war trotzdem an zwei Stellen löchrig — gemeldet als "zweimal
 * derselbe Hashtag hintereinander":
 *
 *   - An der Naht zwischen zwei Batches. appendArranged hat die letzten
 *     zwei Karten des alten Batches mit umsortiert und danach wieder
 *     herausgefiltert. Landeten sie dabei nicht vorn, wurde die erste neue
 *     Karte gegen gar nichts geprüft — und konnte genau die Kategorie der
 *     letzten sichtbaren Karte haben.
 *   - Am Ende eines Batches. Greedy verbraucht die gut passenden Karten
 *     zuerst; übrig bleiben oft zwei aus derselben Kategorie, und die
 *     müssen dann nebeneinander.
 *
 * Das erste behebt ein fester Kontext (die schon sichtbaren Karten werden
 * nicht mehr angefasst, nur mitgezählt). Das zweite ein Zurückhalten: was
 * am Ende nur noch als Wiederholung passt, bleibt draußen und kommt mit dem
 * nächsten Batch wieder, wo es Nachbarn zur Auswahl hat.
 */

const INTERACTIVE_EVERY = 4;

/**
 * Abstand zwischen zwei Erklärkarten.
 *
 * 2 heißt: jede zweite darf eine sein. Höher wäre sparsamer, aber sie sind
 * der Grund, warum jemand bleibt — der Feed soll sie zeigen, wann immer
 * welche da sind. Der Nachschub begrenzt sie ohnehin von selbst.
 */
const KINETIC_EVERY = 2;

type Scored = { item: ContentItem; index: number };

function penalty(
  candidate: ContentItem,
  previous: ContentItem | undefined,
  beforePrevious: ContentItem | undefined,
  serverRank: number,
  sinceInteractive: number,
  position: number,
  sinceKinetic: number,
  isRepeat: boolean,
): number {
  let p = 0;

  // Regel 1 — dieselbe Kategorie direkt hintereinander ist am auffälligsten.
  if (previous && candidate.primary_category_id === previous.primary_category_id) p += 100;
  // Auch der Elternbereich zählt, wenn auch schwächer: zwei Finanzthemen in
  // Folge fallen weniger auf als zweimal exakt #zinseszins.
  if (previous && candidate.primary_category_id.split('.')[0] === previous.primary_category_id.split('.')[0]) {
    p += 25;
  }

  // Regel 2 — dritter gleicher Typ in Folge.
  if (
    previous &&
    beforePrevious &&
    candidate.content_type === previous.content_type &&
    previous.content_type === beforePrevious.content_type
  ) {
    p += 60;
  }

  // Regel 0 — die erste Karte ist nie eine Aufgabe.
  // Wer die App öffnet, will erst sehen worum es geht. Sofort geprüft zu
  // werden fühlt sich an wie eine Tür, nicht wie ein Einstieg.
  const isInteractive = candidate.content_type === 'interactive';
  if (position === 0 && isInteractive) p += 500;

  // Regel 3 — Rhythmus der Aufgaben.
  if (isInteractive) {
    // Zu früh nach der letzten Aufgabe.
    if (sinceInteractive < INTERACTIVE_EVERY - 1) p += 40;
  } else if (sinceInteractive >= INTERACTIVE_EVERY) {
    // Es wäre Zeit für eine Aufgabe, diese Karte ist keine.
    p += 30;
  }

  // Regel 4 — Erklärkarten bevorzugen, aber auf Abstand halten.
  const isKinetic = candidate.presentation_mode === 'kinetic';
  if (isKinetic) {
    if (sinceKinetic < KINETIC_EVERY - 1) {
      // Direkt hintereinander: klar unerwünscht.
      p += 80;
    } else {
      // Sonst nach vorn ziehen. Stärker als der Server-Rang (0,5 pro Platz),
      // schwächer als jede Kategorie-Wiederholung (100) — Abwechslung bleibt
      // wichtiger, als die beste Kartenart zu erzwingen.
      p -= 45;
    }
  }

  // Regel 0b — Wiederholungen nach hinten, auf Platz eins gar nicht.
  //
  // Der Server liefert sie schon zuletzt (0035). Diese Anordnung würde sie
  // sonst wieder nach vorn mischen, weil sie thematisch gut passen -
  // ausgerechnet die Eigenschaft, die eine Wiederholung nutzlos macht.
  if (isRepeat) {
    p += position === 0 ? 1000 : 200;
  }

  // Bei Gleichstand gewinnt die Relevanz vom Server.
  p += serverRank * 0.5;

  return p;
}

/**
 * Ordnet `items` so an, dass sie hinter `context` passen.
 *
 * `context` wird nicht verändert, nur für die Regeln mitgezählt — das sind
 * die Karten, die schon auf dem Bildschirm stehen.
 *
 * Mit `zurueckhalten` endet die Anordnung, sobald nur noch eine
 * Kategorie-Wiederholung übrig bliebe. Die restlichen Karten fehlen dann im
 * Ergebnis; wer sie nicht in die geladenen IDs aufnimmt, bekommt sie vom
 * Server mit dem nächsten Batch wieder.
 */
function arrange(
  items: ContentItem[],
  repeats: ReadonlySet<string>,
  context: ContentItem[],
  zurueckhalten: boolean,
): ContentItem[] {
  const pool: Scored[] = items.map((item, index) => ({ item, index }));
  const out: ContentItem[] = [];
  let sinceInteractive = INTERACTIVE_EVERY; // erste Aufgabe darf sofort kommen
  let sinceKinetic = KINETIC_EVERY;         // die erste Karte darf eine Erklärkarte sein
  for (const c of context) {
    sinceInteractive = c.content_type === 'interactive' ? 0 : sinceInteractive + 1;
    sinceKinetic = c.presentation_mode === 'kinetic' ? 0 : sinceKinetic + 1;
  }

  // Nie mehr als die Hälfte zurückhalten. Sonst kann ein Batch aus lauter
  // Karten einer Kategorie komplett draußen bleiben, der Server liefert
  // dieselben zehn wieder, und der Feed lädt im Kreis, ohne zu wachsen.
  const mindestens = Math.ceil(items.length / 2);

  while (pool.length > 0) {
    const reihe = [...context.slice(-2), ...out.slice(-2)];
    const prev = reihe[reihe.length - 1];
    const prev2 = reihe[reihe.length - 2];

    let bestAt = 0;
    let bestScore = Infinity;
    for (let i = 0; i < pool.length; i++) {
      // Die Zielposition zählt den Kontext mit - Regel 0 gilt nur für die
      // allererste Karte des Feeds, nicht für die erste eines Nachschubs.
      const s = penalty(
        pool[i].item, prev, prev2, pool[i].index, sinceInteractive,
        context.length + out.length, sinceKinetic, repeats.has(pool[i].item.id),
      );
      if (s < bestScore) {
        bestScore = s;
        bestAt = i;
      }
    }

    // Greedy nimmt die Karte mit der kleinsten Strafe. Hat selbst die noch
    // dieselbe Kategorie wie die Vorgängerin, gibt es im Rest keine andere
    // mehr, die besser passt - also lieber aufhören als nebeneinanderstellen.
    if (
      zurueckhalten &&
      prev &&
      out.length >= mindestens &&
      pool[bestAt].item.primary_category_id === prev.primary_category_id
    ) {
      break;
    }

    const [chosen] = pool.splice(bestAt, 1);
    out.push(chosen.item);
    sinceInteractive = chosen.item.content_type === 'interactive' ? 0 : sinceInteractive + 1;
    sinceKinetic = chosen.item.presentation_mode === 'kinetic' ? 0 : sinceKinetic + 1;
  }

  return out;
}

export function arrangeBatch(
  items: ContentItem[],
  /** Welche davon hat der Nutzer schon gelesen? */
  repeats: ReadonlySet<string> = new Set(),
  /** Karten am Ende zurückhalten, statt Kategorien doppelt zu stellen. */
  zurueckhalten = false,
): ContentItem[] {
  if (items.length < 3) return items;
  return arrange(items, repeats, [], zurueckhalten);
}

/**
 * Beim Anhängen eines neuen Batches muss die letzte Karte des alten mitzählen —
 * sonst entsteht genau an der Naht eine Wiederholung.
 */
export function appendArranged(
  existing: ContentItem[],
  incoming: ContentItem[],
  repeats: ReadonlySet<string> = new Set(),
  zurueckhalten = false,
): ContentItem[] {
  const known = new Set(existing.map((i) => i.id));
  const fresh = incoming.filter((i) => !known.has(i.id));
  if (fresh.length === 0) return existing;

  return [...existing, ...arrange(fresh, repeats, existing.slice(-2), zurueckhalten)];
}
