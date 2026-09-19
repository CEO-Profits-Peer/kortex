import * as Speech from 'expo-speech';

import { duckMusic } from './music';
import { getPrefs } from './prefs';
import { proAktiv } from './pro';
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

/**
 * Audio-Modus (19.09.): eine Karte als Folge kurzer Stuecke.
 *
 * Satzweise statt am Stueck, weil Browser lange Aeusserungen gern nach
 * etwa 15 Sekunden abschneiden (Chrome) - und weil man so zurueck- und
 * weiterspringen kann, ohne mitten im Wort zu landen. Stuecke unter 30
 * Zeichen werden an das naechste gehaengt, sonst stockt die Stimme.
 */
export function karteAlsStuecke(item: ContentItem): string[] {
  const roh = cardToSpeech(item, true)
    .split(BLOCK_PAUSE)
    .flatMap((teil) => teil.match(/[^.!?…]+[.!?…]*\s*/g) ?? [teil])
    .map((t) => t.trim())
    .filter(Boolean);
  const aus: string[] = [];
  for (const t of roh) {
    if (aus.length > 0 && (aus[aus.length - 1].length < 30 || t.length < 12)) aus[aus.length - 1] += ` ${t}`;
    else aus.push(t);
  }
  return aus;
}

/** BCP-47 fuer die Sprachausgabe. 'de' allein waehlt auf iOS manchmal nichts. */
function voiceLanguage(language: string | null | undefined): string {
  return language === 'en' ? 'en-US' : 'de-DE';
}

/**
 * Wie lange zwischen Abbrechen und Sprechen gewartet wird.
 *
 * Im Browser ist `Speech.stop()` nichts anderes als
 * `speechSynthesis.cancel()`, und cancel() raeumt die Warteschlange
 * NACHTRAEGLICH auf: wer im selben Tick danach speak() aufruft, bekommt
 * seine eigene, gerade eingereihte Aeusserung mit abgeraeumt - zurueck
 * kommt `error: interrupted`, gemessen nach 7 bis 22 Millisekunden.
 *
 * Fuer eine Erklaerkarte heisst das: "fertig gesprochen" nach zehn
 * Millisekunden, naechster Takt, wieder abbrechen, wieder Fehler. Die
 * ganze Karte lief in einer Zehntelsekunde durch und in der Schleife
 * endlos weiter - zu sehen war nur ein Flackern. Beim Vorlesen einer
 * gewoehnlichen Karte sprang die Taste sofort zurueck und es blieb still.
 *
 * Sechzig Millisekunden hoert niemand und liegen sicher hinter cancel().
 */
const SPEAK_GAP_MS = 60;

let speakingId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

/** Ein angefangener, noch nicht ausgesprochener Sprechauftrag. */
let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Abbrechen, einen Tick warten, sprechen.
 *
 * Der einzige Ort, an dem `Speech.speak` aufgerufen wird - sonst steht die
 * Begruendung oben an einer Stelle und der Fehler an zwei.
 */
function stopThenSpeak(text: string, options: Parameters<typeof Speech.speak>[1]): void {
  if (pending) clearTimeout(pending);
  Speech.stop();
  const mit = eigeneStimme(options);
  pending = setTimeout(() => {
    pending = null;
    Speech.speak(text, mit);
  }, SPEAK_GAP_MS);
}

/**
 * PRO: gewaehltes Tempo und gewaehlte Stimme. Eine Stelle fuer alles, was
 * spricht - Vorlesen UND Erklaerkarten. Die Karten warten auf das Satzende
 * (speakSentence), ein schnelleres Tempo verschiebt also keinen Takt.
 */
function eigeneStimme(options: Parameters<typeof Speech.speak>[1]): Parameters<typeof Speech.speak>[1] {
  if (!proAktiv()) return options;
  const p = getPrefs();
  const aus = { ...options };
  if (p.sprechTempo && p.sprechTempo !== 1) aus.rate = (aus.rate ?? 1) * p.sprechTempo;
  const stimme = p.stimmen?.[(aus.language ?? '').slice(0, 2)];
  if (stimme) aus.voice = stimme;
  return aus;
}

/** Stimmen des Geraets fuer eine Sprache ('de' | 'en'), fuer die Auswahl. */
export async function stimmenFuer(sprache: string): Promise<{ id: string; name: string }[]> {
  try {
    const alle = await Speech.getAvailableVoicesAsync();
    return alle
      .filter((v) => (v.language ?? '').toLowerCase().startsWith(sprache))
      .map((v) => ({ id: v.identifier, name: v.name }));
  } catch {
    return [];
  }
}

/** Ein kurzer Probesatz mit den aktuellen Einstellungen. */
export function stimmProbe(sprache: 'de' | 'en') {
  stopThenSpeak(sprache === 'en' ? 'This is how cards will sound.' : 'So klingen deine Karten.', {
    language: voiceLanguage(sprache),
    rate: 0.98,
    pitch: 1.0,
  });
}

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

  const text = cardToSpeech(item);
  announce(item.id);

  stopThenSpeak(text, {
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
  /**
   * Die Stimme hat wirklich angefangen.
   *
   * Der Abspieler braucht das, um seine Notbremse zu setzen: solange
   * ungewiss ist, ob ueberhaupt gesprochen wird, muss er nach der
   * geschaetzten Lesezeit weiterschalten. Kommt diese Meldung, spricht
   * jemand - dann darf er auf das Satzende warten, auch wenn die Stimme
   * langsamer ist als die Schaetzung.
   */
  onStart?: () => void;
}): () => void {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    opts.onDone();
  };

  announce(opts.cardId);

  stopThenSpeak(opts.text, {
    language: voiceLanguage(opts.language),
    rate: 0.98,
    pitch: 1.0,
    onStart: opts.onStart,
    onDone: finish,
    onStopped: finish,
    onError: finish,
  });

  // Abbrechen von aussen: der Rueckruf faellt dann aus, damit der Abspieler
  // nicht weiterschaltet, waehrend er gerade angehalten wird.
  return () => {
    settled = true;
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
    Speech.stop();
  };
}

export function stopSpeech() {
  // Auch den Auftrag, der noch in der Wartezeit steckt. Ohne das faengt
  // die Stimme sechzig Millisekunden NACH dem Anhalten an zu reden.
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
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
