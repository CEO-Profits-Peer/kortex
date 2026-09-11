import { haptics } from './haptics';
import { rewards } from './rewards';
import { sound } from './sound';

/**
 * Rueckmeldung auf eine Antwort: Ton und Vibration zusammen.
 *
 * Warum eine eigene Schicht und nicht einfach beides nebeneinander
 * aufrufen: die neun Aufgabentypen benutzten bisher `haptics.success()` und
 * `haptics.warning()` fuer zwei verschiedene Dinge, die zufaellig gleich
 * aussahen -
 *
 *     "falsch beantwortet"        und
 *     "noch nicht fertig, geht noch nicht"
 *
 * Das eine ist ein Ergebnis, das andere eine gesperrte Taste. Mit Ton faellt
 * der Unterschied sofort auf: ein Fehlerton fuer "du musst erst alle Felder
 * ausfuellen" waere schlicht falsch und wuerde entmutigen, wo gar nichts
 * schiefgegangen ist.
 *
 * Deshalb hier drei benannte Faelle statt zwei allgemeine.
 */
export const feedback = {
  /**
   * Richtig beantwortet.
   *
   * Hier laeuft auch die Serie mit. Diese Funktion ist der einzige Ort, an
   * dem "richtig" in der ganzen App entsteht - waere die Zaehlung woanders,
   * wuerde sie beim naechsten Aufgabentyp vergessen.
   */
  correct() {
    haptics.success();
    sound.correct();
    rewards.scored();
  },

  /** Falsch beantwortet. Weich - siehe scripts/make_sounds.py. */
  wrong() {
    haptics.warning();
    sound.wrong();
    rewards.missed();
  },

  /**
   * Geht noch nicht: Eingabe unvollstaendig, Regler nicht bewegt.
   *
   * Kein Ton. Nur ein kurzer Stups. Der Nutzer hat nichts falsch gemacht,
   * er ist nur noch nicht fertig.
   */
  blocked() {
    haptics.warning();
  },

  /** Ein Paar sitzt, die Aufgabe laeuft weiter. */
  progress() {
    haptics.light();
    sound.tick();
  },

  /** Kategorie-Stufe aufgestiegen. */
  levelUp() {
    haptics.success();
    sound.level();
  },

  /** Serie verlaengert. */
  streak() {
    haptics.success();
    sound.streak();
  },

  /** Ein ganzer Stapel fehlerfrei. Der lauteste Moment der App. */
  perfect() {
    haptics.success();
    sound.perfect();
  },
};
