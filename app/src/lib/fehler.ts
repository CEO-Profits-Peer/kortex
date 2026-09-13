import { istNetzfehler, istOnline } from './online';

/**
 * Was ein Mensch lesen soll, wenn etwas nicht geklappt hat.
 *
 * Vorher stand an 35 Stellen `e instanceof Error ? e.message : '...'`. Das
 * klingt vernuenftig und zeigt in der Praxis genau das Falsche: seit
 * postgrest-js 2 ist JEDER Datenbankfehler eine Error-Instanz, der
 * Ausweichtext kam also nie zum Zug. Auf dem Bildschirm standen Saetze wie
 * "TypeError: Failed to fetch" oder "function public.get_x does not exist" -
 * technisch richtig und fuer niemanden brauchbar.
 *
 * Drei Faelle, in dieser Reihenfolge:
 *
 *   1. Keine Verbindung. Das haeufigste und das harmloseste - man hat nichts
 *      falsch gemacht, und es geht von selbst weiter.
 *   2. Eine Meldung, die WIR geschrieben haben. `raise exception` in einer
 *      eigenen Funktion kommt mit dem Code P0001 an - das sind Saetze wie
 *      "nicht genug gemeinsame Karten" oder "kein Zugang", absichtlich
 *      formuliert und dafuer gedacht, gelesen zu werden.
 *   3. Alles andere ist Innenleben. Dann der Satz des Aufrufers.
 */

export const OFFLINE_TEXT = 'Keine Verbindung. Sobald du wieder Netz hast, geht es von selbst weiter.';

export function fehlerText(e: unknown, ausweich: string): string {
  if (istNetzfehler(e) || !istOnline()) return OFFLINE_TEXT;

  const err = e as { code?: string; message?: string } | null;
  const msg = err?.message ?? '';

  if (err?.code === 'PGRST301' || /jwt expired/i.test(msg)) {
    return 'Deine Anmeldung ist abgelaufen. Lade die Seite einmal neu.';
  }

  if (err?.code === 'P0001' && msg) {
    // Die aeltesten Funktionen melden noch englisch. Nur der eine Satz, der
    // wirklich vorkommt, wird uebersetzt - die anderen erreichen den
    // Bildschirm nicht, weil die Aufrufer sie vorher abfangen.
    if (msg === 'not authenticated') return 'Bitte melde dich neu an.';
    return msg;
  }

  return ausweich;
}
