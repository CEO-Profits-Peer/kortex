import type { BodyBlock, ContentItem } from '@/lib/types.db';

/**
 * Wann bekommt eine Karte eine zweite Seite?
 *
 * Grundsatz: so selten wie möglich. Eine Karte ist ein Bildschirm — jedes
 * Blättern ist eine Unterbrechung, und die muss sich lohnen.
 *
 * Es gibt genau zwei Gründe:
 *
 *   1. Der Text passt beim besten Willen nicht. Dann wird geteilt statt
 *      verkleinert (unlesbar) oder gescrollt (kollidiert mit dem Wischen).
 *
 *   2. Nach einer Aufgabe will man den Originaltext nachlesen. Die Aufgabe
 *      steht dann auf Seite 1, der Kontext auf Seite 2 — erreichbar, aber
 *      nicht im Weg. Genau umgekehrt zur ersten Fassung, und richtig
 *      herum: die Aufgabe ist der Inhalt, der Text die Fußnote.
 *
 * ENTSCHIEDEN WIRD AN DEN DATEN, NICHT AN DER GEMESSENEN HÖHE. Ein
 * Schätzwert aus Wortzahl und Blocktypen steht vor dem ersten Bildaufbau
 * fest. Genau daran ist die Mess-und-Anpass-Fassung gescheitert.
 *
 * SEIT FitBox ist der Schätzwert nicht mehr die letzte Instanz. Was hier
 * durchrutscht und doch ein paar Zeilen zu lang ist, wird beim Anzeigen
 * gemessen und passgenau verkleinert (components/FitBox.tsx). Diese Datei
 * muss deshalb nicht mehr auf Nummer sicher gehen — sie darf großzügig
 * schätzen, weil ein Schätzfehler nach oben jetzt abgefedert wird statt
 * abgeschnitten zu werden.
 *
 * Die Kapazitäten waren zwischenzeitlich ein Viertel höher, weil FitBox
 * ja nachfedert. Das ging schief, als die Zeilenbegrenzung aus den
 * Absätzen flog (vorher schnitt sie lange Texte einfach ab, was die
 * Schätzung künstlich stützte). Ohne sie wurden Karten deutlich höher als
 * geschätzt, FitBox lief in seinen Mindestfaktor, und der Rest wurde
 * abgeschnitten — genau das, was vermieden werden sollte.
 *
 * Jetzt wieder knapp geschätzt. Eine zweite Seite ist ärgerlich, eine
 * abgeschnittene Karte ist kaputt.
 */

export type Page = {
  showVisual: boolean;
  blocks: BodyBlock[];
  showInteraction: boolean;
  /** Beschriftung des Weiter-Knopfes, der auf DIESE Seite führt */
  label: string;
};

/**
 * Grober Platzbedarf eines Blocks in „Zeilen“.
 *
 * `hero` ist der erste Block einer Karte, wenn er eine Kennzahl oder ein
 * Zitat ist — der wird deutlich größer gesetzt (CardBlock.tsx). Ohne diesen
 * Zusatz schätzt die Seitenaufteilung eine Kennzahl mit drei Zeilen, während
 * sie in Wirklichkeit fünf braucht: 60 px Ziffer plus Strich plus Beschriftung.
 * Die Folge wäre kein sichtbarer Fehler, sondern ein schleichender: FitBox
 * zieht die ganze Karte zusammen, und der Fließtext wird auf allen
 * Kennzahl-Karten kleiner als auf den übrigen. Genau die Art Abweichung, die
 * man nicht benennen kann und trotzdem sieht.
 */
function weigh(block: BodyBlock, hero = false): number {
  switch (block.type) {
    case 'para':
      // ~34 Zeichen pro Zeile bei 17 px auf einem üblichen Handy.
      return Math.ceil(block.text.length / 34);
    case 'bullet':
      // Als Gerüst: je Punkt eine Haarlinie, mehr Zeilenabstand und 17 statt
      // 15 px. Das kostet ungefähr die Hälfte mehr Platz je Punkt.
      return hero
        ? block.items.reduce((n, l) => n + Math.ceil(l.length / 26), 0) * 1.5 + 1
        : block.items.reduce((n, l) => n + Math.ceil(l.length / 30), 0) + 0.5;
    case 'stat':
      return hero ? 5 : 3;
    case 'quote':
      // 22 px statt 18 px, dazu das große Anführungszeichen darüber.
      return hero
        ? Math.ceil(block.text.length / 26) * 1.2 + 2
        : Math.ceil(block.text.length / 30) + 1;
    default:
      return 2;
  }
}

/**
 * Trägt dieser Block die Karte?
 *
 * Exportiert, weil ContentCard dieselbe Frage stellt. Vorher stand die Regel
 * an zwei Stellen — und beim Hinzufügen der Liste wäre genau das der Fehler
 * gewesen, den man erst zwei Wochen später sieht: die Seitenaufteilung
 * rechnet mit einem kleinen Block, die Karte zeichnet einen großen, FitBox
 * zieht alles zusammen, und der Fließtext ist auf Listenkarten kleiner als
 * sonst. Nicht benennbar, aber sichtbar.
 *
 * Drei Formen können eine Karte tragen: eine Kennzahl, ein Zitat und eine
 * kurze Liste. Ein Absatz nicht — ein Absatz ist ein Absatz.
 */
export function isHero(blocks: BodyBlock[], i: number): boolean {
  if (i !== 0) return false;
  const b = blocks[0];
  if (!b) return false;
  if (b.type === 'stat' || b.type === 'quote') return true;
  return b.type === 'bullet' && istGeruest(b.items);
}

/**
 * Eine Liste trägt die Karte nur, wenn sie ein Gerüst ist und kein Text.
 *
 * Zwei bis vier Punkte, jeder kurz genug für eine Zeile. Sechs lange
 * Stichpunkte groß gesetzt wären keine Gestaltung, sondern eine Wand — und
 * die zweite Seite wäre sicher. Die Grenze bei 72 Zeichen ist gemessen: bei
 * 17 px passen auf ein übliches Handy etwa 34 Zeichen je Zeile, groß gesetzt
 * entsprechend weniger, zwei Zeilen je Punkt sind noch Gerüst, drei nicht
 * mehr.
 */
export function istGeruest(items: string[]): boolean {
  return (
    items.length >= 2 &&
    items.length <= 4 &&
    items.every((l) => l.length <= 72)
  );
}

const HEADER_LINES = 5; // Titel und Unterzeile
const VISUAL_LINES = 6; // die Blaupausen-Grafik

/**
 * Wie viele „Zeilen“ passen auf diesen Bildschirm?
 *
 * Bewusst großzügig angesetzt. Lieber eine Karte, die randvoll ist, als eine
 * unnötige zweite Seite — und die randvolle Karte wird von FitBox notfalls
 * um ein paar Prozent zusammengezogen. Ein leicht verkleinerter Text ist
 * ein kleineres Übel als ein Blättern, das niemand braucht.
 */
function capacity(screenHeight: number): number {
  if (screenHeight < 700) return 20;
  if (screenHeight < 820) return 24;
  return 28;
}

export function paginate(
  item: ContentItem,
  screenHeight: number,
  interactive: boolean,
  /**
   * Setzt die Schätzung außer Kraft und teilt auf jeden Fall.
   *
   * Gesetzt wird das von der Karte selbst, wenn FitBox beim Anzeigen
   * feststellt, dass der Inhalt selbst am Mindestfaktor noch übersteht.
   * Damit ist die Schätzung unten nicht mehr das letzte Wort: sie entscheidet
   * im Normalfall, und der gemessene Wirklichkeitsabgleich korrigiert sie,
   * wenn sie danebenlag.
   */
  forceSplit = false,
): Page[] {
  const room = capacity(screenHeight) - HEADER_LINES;
  const blocks = item.body_blocks ?? [];

  // --- Aufgaben: Aufgabe zuerst, Text zum Nachlesen -----------------------
  if (interactive) {
    const first: Page = {
      showVisual: false,
      blocks: [],
      showInteraction: true,
      label: 'Aufgabe',
    };
    // Nur wenn es überhaupt Kontext gibt, der das Nachlesen lohnt.
    const textWeight = blocks.reduce((n, b) => n + weigh(b), 0);
    if (blocks.length === 0 || textWeight < 2) return [first];

    return [
      first,
      { showVisual: false, blocks, showInteraction: false, label: 'Nachlesen' },
    ];
  }

  // --- Lesekarten: erst die Grafik opfern, dann erst teilen ---------------
  const total = blocks.reduce((n, b, i) => n + weigh(b, isHero(blocks, i)), 0);

  // Bei einem Hauptblock zeichnet ContentCard die Blaupausen-Grafik gar
  // nicht erst — zwei Blickfänge sind keiner. Dann darf die Schätzung auch
  // keinen Platz dafür freihalten.
  const hero = isHero(blocks, 0);
  if (!forceSplit && !hero && total + VISUAL_LINES <= room) {
    return [{ showVisual: true, blocks, showInteraction: false, label: '' }];
  }
  if (!forceSplit && total <= room) {
    // Passt ohne Grafik — besser eine volle Seite als zwei halbe.
    return [{ showVisual: false, blocks, showInteraction: false, label: '' }];
  }

  // Wirklich zu lang: aufteilen.
  //
  // Beim erzwungenen Teilen wird in der Mitte getrennt, nicht bei `room`.
  // Sonst wäre die Trennstelle wieder von derselben Schätzung abhängig, die
  // gerade nachweislich zu großzügig war — und die erste Seite bliebe genauso
  // zu lang wie vorher.
  const cut = forceSplit ? total / 2 : room;
  const first: BodyBlock[] = [];
  let used = 0;
  for (const [i, b] of blocks.entries()) {
    const w = weigh(b, isHero(blocks, i));
    if (used + w > cut && first.length > 0) break;
    first.push(b);
    used += w;
  }
  const rest = blocks.slice(first.length);

  // Ein einzelner riesiger Block lässt sich nicht teilen. Dann bleibt es bei
  // einer Seite, und FitBox verkleinert so weit es geht. Der Fall ist selten
  // genug — die Pipeline erzeugt zwei bis vier Blöcke pro Karte.
  return rest.length > 0
    ? [
        { showVisual: false, blocks: first, showInteraction: false, label: '' },
        { showVisual: false, blocks: rest, showInteraction: false, label: 'weiter' },
      ]
    : [{ showVisual: false, blocks: first, showInteraction: false, label: '' }];
}
