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
 *   4. Erklärkarten so oft wie möglich, aber nie zwei hintereinander.
 *      Sie sind das Beste, was der Feed zu bieten hat — und genau deshalb
 *      dürfen sie sich nicht stapeln: zwei gesprochene Vorträge in Folge
 *      sind kein Feed mehr, sondern eine Sendung. Ziel ist jede zweite
 *      Karte.
 *
 * Greedy statt optimal: bei zehn Karten wäre die perfekte Anordnung
 * berechenbar, aber der Unterschied ist unsichtbar und der Code doppelt so
 * lang. Was zählt, ist dass keine zwei Gleichen aufeinander folgen.
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

  // Bei Gleichstand gewinnt die Relevanz vom Server.
  p += serverRank * 0.5;

  return p;
}

export function arrangeBatch(items: ContentItem[]): ContentItem[] {
  if (items.length < 3) return items;

  const pool: Scored[] = items.map((item, index) => ({ item, index }));
  const out: ContentItem[] = [];
  let sinceInteractive = INTERACTIVE_EVERY; // erste Aufgabe darf sofort kommen
  let sinceKinetic = KINETIC_EVERY;         // die erste Karte darf eine Erklärkarte sein

  while (pool.length > 0) {
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];

    let bestAt = 0;
    let bestScore = Infinity;
    for (let i = 0; i < pool.length; i++) {
      // out.length ist die Zielposition - danach entscheidet sich Regel 0.
      const s = penalty(
        pool[i].item, prev, prev2, pool[i].index, sinceInteractive, out.length, sinceKinetic,
      );
      if (s < bestScore) {
        bestScore = s;
        bestAt = i;
      }
    }

    const [chosen] = pool.splice(bestAt, 1);
    out.push(chosen.item);
    sinceInteractive = chosen.item.content_type === 'interactive' ? 0 : sinceInteractive + 1;
    sinceKinetic = chosen.item.presentation_mode === 'kinetic' ? 0 : sinceKinetic + 1;
  }

  return out;
}

/**
 * Beim Anhängen eines neuen Batches muss die letzte Karte des alten mitzählen —
 * sonst entsteht genau an der Naht eine Wiederholung.
 */
export function appendArranged(existing: ContentItem[], incoming: ContentItem[]): ContentItem[] {
  const known = new Set(existing.map((i) => i.id));
  const fresh = incoming.filter((i) => !known.has(i.id));
  if (fresh.length === 0) return existing;

  const tail = existing.slice(-2);
  const arranged = arrangeBatch([...tail, ...fresh]);
  // Die zwei Übergabekarten wieder abziehen — sie stehen schon in der Liste.
  const withoutTail = arranged.filter((i) => !tail.some((t) => t.id === i.id));
  return [...existing, ...withoutTail];
}
