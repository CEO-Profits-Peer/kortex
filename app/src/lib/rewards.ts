import { sound } from './sound';

/**
 * Belohnungen sichtbar machen.
 *
 * Der Punktestand stand bisher nur im Profil. Das ist der Unterschied
 * zwischen "ich habe Punkte" und "ich BEKOMME gerade Punkte" - und der ist
 * der ganze Reiz. In jedem Feed, den die Zielgruppe kennt, passiert im
 * Moment der Handlung etwas: eine Zahl fliegt hoch, ein Zaehler springt.
 * Ohne das fuehlt sich richtig Antworten genauso an wie weiterscrollen.
 *
 * Diese Datei ist nur der Kanal. Das Bild dazu macht components/RewardLayer.
 *
 * Absichtlich ein winziger eigener Kanal statt eines React-Contexts: die
 * Belohnung soll von ueberall ausloesbar sein, auch aus einer Funktion ohne
 * Komponentenkontext, und sie darf niemals einen Neuaufbau der Karte
 * ausloesen. Eine Karte, die beim Punktevergeben neu rendert, verliert ihre
 * Animationen.
 */

export type Reward =
  | { kind: 'xp'; amount: number }
  | { kind: 'mastery'; amount: number }
  | { kind: 'combo'; count: number }
  | { kind: 'text'; text: string };

const listeners = new Set<(r: Reward) => void>();

export function onReward(fn: (r: Reward) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(r: Reward) {
  listeners.forEach((fn) => fn(r));
}

// --- Serie richtiger Antworten ----------------------------------------------
//
// Bewusst nur fuer die laufende Sitzung und bewusst NICHT auf dem Server.
// Eine Serie, die ueber Tage laeuft, ist der Streak - den gibt es schon. Was
// hier fehlt, ist das Gefuehl innerhalb einer Sitzung: drei richtige
// hintereinander, und der naechste Fehler tut ein bisschen weh. Genau das
// haelt Leute an der Aufgabe.
let combo = 0;

/** Ab hier wird die Serie angezeigt. Zwei richtige sind noch kein Lauf. */
const COMBO_MIN = 3;

export function currentCombo(): number {
  return combo;
}

export const rewards = {
  xp(amount: number) {
    if (amount > 0) emit({ kind: 'xp', amount });
  },

  mastery(amount: number) {
    if (amount > 0) emit({ kind: 'mastery', amount });
  },

  /** Freitext fuer seltene Momente: "Stufe 4", "Serie gehalten". */
  note(text: string) {
    emit({ kind: 'text', text });
  },

  /**
   * Eine richtige Antwort. Gibt die neue Serienlaenge zurueck.
   *
   * Der Ton fuer eine lange Serie ist ein anderer als der fuer eine einzelne
   * richtige Antwort - sonst waere die Serie nur eine Zahl am Bildschirm
   * und kein Erlebnis.
   */
  scored(): number {
    combo += 1;
    if (combo >= COMBO_MIN) {
      emit({ kind: 'combo', count: combo });
      // Jede fuenfte hoerbar hervorheben. Bei jeder einzelnen waere der
      // Klang nach zehn Antworten Tapete.
      if (combo % 5 === 0) sound.streak();
    }
    return combo;
  },

  /** Eine falsche Antwort. Die Serie ist vorbei. */
  missed() {
    combo = 0;
  },

  /** Beim Abmelden und beim Wechsel des Kontos. */
  reset() {
    combo = 0;
  },
};
