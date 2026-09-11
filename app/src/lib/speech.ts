import * as Speech from 'expo-speech';

import { duckMusic } from './music';
import { getPrefs } from './prefs';
import type { BodyBlock, ContentItem } from './types.db';

/**
 * Karten vorlesen.
 *
 * Der Grund steht im Konzept und ist der eigentliche Unterschied zu einer
 * Lern-App am Schreibtisch: unterwegs, im Bus, beim Laufen, mit dem Handy in
 * der Tasche. Lesen geht dann nicht. Zuhoeren schon.
 *
 * Zwei Entscheidungen, die den Unterschied machen:
 *
 * 1. **Die Quizfrage wird mitgelesen, die Antwort nicht.** Wer zuhoert, soll
 *    mitdenken koennen - aber die Loesung vorzusagen wuerde die Aufgabe
 *    zerstoeren. Die Frage kommt nach einer Pause, damit klar ist, dass
 *    jetzt etwas anderes anfaengt.
 *
 * 2. **Die Stimme folgt der Sprache der Karte, nicht der des Geraets.** Eine
 *    englische Karte mit deutscher Stimme ist unverstaendlich. Das ist bei
 *    einer zweisprachigen App der Regelfall, nicht die Ausnahme.
 */

/** Pausen als Satzzeichen: die Sprachausgabe kennt keine Absaetze. */
const BLOCK_PAUSE = ' … ';

function blockToSpeech(block: BodyBlock): string {
  switch (block.type) {
    case 'para':
      return block.text;
    case 'bullet':
      // Aufzaehlungspunkte brauchen hoerbare Grenzen, sonst laeuft alles
      // zu einem Satz zusammen.
      return block.items.join('. ');
    case 'stat':
      return `${block.value}. ${block.label}`;
    case 'quote':
      return block.attribution ? `Zitat: ${block.text}. ${block.attribution}` : block.text;
    default:
      return '';
  }
}

export function cardToSpeech(item: ContentItem, withQuestion = true): string {
  const parts: string[] = [item.title];
  if (item.deck) parts.push(item.deck);
  for (const b of item.body_blocks ?? []) {
    const t = blockToSpeech(b);
    if (t) parts.push(t);
  }
  const question = item.quiz_items?.[0]?.question;
  if (withQuestion && question) {
    parts.push(`Frage: ${question}`);
  }
  return parts.join(BLOCK_PAUSE);
}

/** BCP-47 fuer die Sprachausgabe. 'de' allein waehlt auf iOS manchmal nichts. */
function voiceLanguage(language: string | null | undefined): string {
  return language === 'en' ? 'en-US' : 'de-DE';
}

let speakingId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

function announce(id: string | null) {
  speakingId = id;
  // Die Hintergrundflaeche zurueckdrehen, solange gesprochen wird. Zwei
  // Klaenge auf derselben Lautstaerke machen beide unverstaendlich.
  duckMusic(id !== null);
  listeners.forEach((fn) => fn(id));
}

export function onSpeechChange(fn: (id: string | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function speakingCardId(): string | null {
  return speakingId;
}

/**
 * Vorlesen starten oder anhalten.
 *
 * Ein zweiter Tipp auf dieselbe Karte hoert auf - das ist die Erwartung bei
 * jedem Abspielknopf. Ein Tipp auf eine ANDERE Karte wechselt, statt beide
 * gleichzeitig zu lesen.
 */
export function toggleSpeech(item: ContentItem) {
  if (speakingId === item.id) {
    stopSpeech();
    return;
  }

  Speech.stop();
  const text = cardToSpeech(item);
  announce(item.id);

  Speech.speak(text, {
    language: voiceLanguage(item.language),
    // Etwas langsamer als der Standard. Es geht um Verstehen, nicht um
    // Durchkommen - und Fachbegriffe brauchen einen Moment.
    rate: 0.98,
    pitch: 1.0,
    onDone: () => announce(null),
    onStopped: () => announce(null),
    onError: () => announce(null),
  });
}

/**
 * Einen einzelnen Satz sprechen und Bescheid geben, wenn er zu Ende ist.
 *
 * Das Herzstueck der Erklaerkarten. Statt den ganzen Text als eine lange
 * Aeusserung zu schicken und zu raten, wo die Stimme gerade steht, wird
 * Satz fuer Satz gesprochen - und der naechste Takt beginnt genau dann,
 * wenn die Sprachausgabe fertig meldet.
 *
 * Damit stimmt die Synchronisierung auf JEDEM Geraet: bei einer schnellen
 * Systemstimme laeuft die Animation schneller, bei einer langsamen
 * langsamer. Die Alternative - feste Zeiten im Drehbuch - ist auf dem
 * Geraet, auf dem man sie eingestellt hat, perfekt und auf jedem anderen
 * daneben.
 *
 * `onDone` kommt genau einmal, egal ob fertig gesprochen, abgebrochen oder
 * fehlgeschlagen. Ohne diese Garantie bleibt eine Erklaerkarte irgendwann
 * stehen und wartet auf einen Rueckruf, der nie kommt.
 */
export function speakSentence(opts: {
  cardId: string;
  text: string;
  language: string | null | undefined;
  onDone: () => void;
}): () => void {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    opts.onDone();
  };

  Speech.stop();
  announce(opts.cardId);

  Speech.speak(opts.text, {
    language: voiceLanguage(opts.language),
    rate: 0.98,
    pitch: 1.0,
    onDone: finish,
    onStopped: finish,
    onError: finish,
  });

  // Abbrechen von aussen: der Rueckruf faellt dann aus, damit der Abspieler
  // nicht weiterschaltet, waehrend er gerade angehalten wird.
  return () => {
    settled = true;
    Speech.stop();
  };
}

export function stopSpeech() {
  Speech.stop();
  announce(null);
}

/**
 * Liest die App gerade vor?
 *
 * Wird beim Wegscrollen gebraucht: eine Karte, die man nicht mehr sieht,
 * soll nicht weiterreden.
 */
export function isSpeechEnabled(): boolean {
  return getPrefs().audioEnabled;
}
