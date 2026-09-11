import { useEffect, useState } from 'react';

/**
 * Welche Karte gerade im Bild ist.
 *
 * Bisher wusste das nur useDwellTracking, und alles, was davon abhing, wurde
 * von dort aus angestossen (Ton, Musik). Fuer die Erklaerkarten reicht das
 * nicht: die Karte selbst muss wissen, ob sie dran ist - sie soll anfangen
 * zu sprechen, wenn sie erscheint, und aufhoeren, wenn sie weg ist.
 *
 * Bewusst kein React-Context: der Wert aendert sich bei jedem Wischen, und
 * ein Context wuerde bei jeder Aenderung ALLE Karten neu rendern. Hier
 * horcht nur, wer will, und nur die betroffene Karte rendert neu.
 */

let activeId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export function setActiveCard(id: string | null) {
  if (activeId === id) return;
  activeId = id;
  listeners.forEach((fn) => fn(id));
}

export function activeCardId(): string | null {
  return activeId;
}

/** true, solange genau diese Karte im Bild ist. */
export function useIsActiveCard(id: string): boolean {
  const [active, setActive] = useState(() => activeId === id);
  useEffect(() => {
    const fn = (next: string | null) => setActive(next === id);
    listeners.add(fn);
    fn(activeId);
    return () => {
      listeners.delete(fn);
    };
  }, [id]);
  return active;
}
