import { useCallback, useRef } from 'react';
import type { ViewToken } from 'react-native';

import { track } from '@/lib/eventBuffer';
import { activeCardId, setActiveCard } from '@/lib/activeCard';
import { musicForCard } from '@/lib/music';
import { sound } from '@/lib/sound';
import { speakingCardId, stopSpeech } from '@/lib/speech';
import type { ContentItem } from '@/lib/types.db';

/**
 * Verweildauer-Messung.
 *
 * Die Regel aus docs/XP-ECONOMY.md: eine Card gilt als gelesen, wenn sie
 * mindestens `dwell_target_ms` lang zu >= 80 % sichtbar war. Das Ziel kommt
 * vom Server und haengt an der Wortzahl (`content_items.dwell_target_ms`,
 * ca. Wortzahl / 3 Sekunden, gedeckelt auf 4-20 s).
 *
 * Warum nicht pauschal 3 Sekunden: eine 60-Wort-Card in 3 Sekunden zu lesen
 * hiesse 20 Woerter pro Sekunde. Das ist Scrollen, nicht Lesen — und genau
 * das wollen wir nicht mit XP belohnen.
 *
 * Gemessen wird hier nur; ob XP fliessen, entscheidet ausschliesslich der
 * Server in flush_events(). Der Client kann sich keine Lesezeit erfinden.
 */

export const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 80,
  /**
   * Untergrenze, ab der onViewableItemsChanged ueberhaupt feuert. Bewusst
   * niedriger als jedes echte Leseziel — die eigentliche Schwelle rechnen
   * wir selbst, damit sie pro Card unterschiedlich sein kann.
   */
  minimumViewTime: 300,
} as const;

type Open = { id: string; startedAt: number; item: ContentItem };

export function useDwellTracking(onValidated?: (item: ContentItem) => void) {
  const open = useRef<Map<string, Open>>(new Map());
  // In einer Ref gehalten, damit close() nicht bei jedem Render neu entsteht -
  // sonst wuerde die FlatList den Viewability-Handler austauschen, was React
  // Native mit einer Exception quittiert.
  const notify = useRef(onValidated);
  notify.current = onValidated;

  const close = useCallback((id: string) => {
    const entry = open.current.get(id);
    if (!entry) return;
    open.current.delete(id);

    // Eine Karte, die man nicht mehr sieht, redet nicht weiter. Ohne das
    // liest die App den Text einer Karte vor, die zwei Bildschirme weiter
    // oben steht - und der Knopf zum Anhalten ist nicht mehr erreichbar.
    if (speakingCardId() === id) stopSpeech();
    if (activeCardId() === id) setActiveCard(null);

    const dwellMs = Date.now() - entry.startedAt;

    // Sehr kurze Sichtbarkeit ist ein Durchwischen, kein Anschauen.
    if (dwellMs < 400) return;

    if (dwellMs >= entry.item.dwell_target_ms) {
      track(entry.id, 'dwell', { dwell_ms: dwellMs, visible_pct: 100 });
      notify.current?.(entry.item);
    } else {
      // Unter dem Ziel: als uebersprungen markieren. Diese Cards fallen aus
      // dem Fragen-Pool des Batch-Checkpoints heraus - es waere unfair,
      // etwas abzufragen, das nie gelesen wurde.
      track(entry.id, 'skip', { dwell_ms: dwellMs, visible_pct: 100 });
    }
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ changed }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      const now = Date.now();

      for (const token of changed) {
        const item = token.item as ContentItem | undefined;
        if (!item?.id) continue;

        if (token.isViewable) {
          if (!open.current.has(item.id)) {
            open.current.set(item.id, { id: item.id, startedAt: now, item });
            track(item.id, 'impression', { visible_pct: 100 });
            // Das Einrasten hoerbar machen. Sehr leise und sehr kurz - ein
            // Ton, den man hundertmal pro Sitzung hoert, darf nicht
            // auffallen, sondern nur das Gefuehl geben, dass etwas einrastet.
            sound.tick();
            // Jede Karte bekommt ihre eigene Klangfarbe. Ueberblendet, nicht
            // geschnitten - siehe lib/music.ts.
            musicForCard(item.id);
            // Die Karte selbst darf wissen, dass sie dran ist - eine
            // Erklaerkarte faengt daraufhin an zu sprechen.
            setActiveCard(item.id);
          }
        } else {
          close(item.id);
        }
      }
    },
    [close],
  );

  /** Beim Verlassen des Feeds aufrufen, sonst geht die letzte Card verloren. */
  const closeAll = useCallback(() => {
    for (const id of Array.from(open.current.keys())) close(id);
  }, [close]);

  return { onViewableItemsChanged, closeAll };
}
