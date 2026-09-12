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
 *
 * Zwischenstaende
 * ---------------
 * Gemeldet wurde die Zeit frueher AUSSCHLIESSLICH beim Wegwischen. Solange
 * eine Karte im Bild stand, wusste der Server nichts von ihr - nicht einmal,
 * dass sie ueberhaupt jemand gesehen hatte. Das war der Grund, warum der
 * Repost-Knopf nicht ging: `set_repost` prueft `user_content_state`, und
 * genau in dem Moment, in dem man tippt, gibt es dort noch keine Zeile.
 * Eine Schwelle von fuenf Sekunden (Migration 0063) hilft nicht, wenn null
 * Sekunden gemeldet sind.
 *
 * Deshalb laesst sich die Zeit jetzt auch ZWISCHENDURCH melden - mit einem
 * Versatz (`gemeldet`), damit nichts doppelt zaehlt: geschickt wird immer nur
 * der noch nicht gemeldete Rest. Der Server summiert ohnehin.
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

/** Sehr kurze Sichtbarkeit ist ein Durchwischen, kein Anschauen. */
const MIN_MS = 400;

type Open = {
  id: string;
  item: ContentItem;
  /** Bereits an den Server gemeldete Millisekunden. */
  gemeldet: number;
  /** Beginn des laufenden Abschnitts; null, solange pausiert. */
  seit: number | null;
};

/**
 * Modulweit, nicht im Hook.
 *
 * Die Karte selbst (ContentCard) muss ihre Zeit melden koennen, bevor sie
 * einen Repost schickt - und sie hat keinen Zugriff auf den Zustand des
 * Feed-Hooks. Ein Context waere der andere Weg gewesen und haette bei jeder
 * Aenderung alle Karten neu gerendert; genau davor weicht lib/activeCard.ts
 * aus demselben Grund aus.
 *
 * Zwei Feeds gleichzeitig sind kein Problem: die Eintraege haengen an der
 * Karten-Kennung, und dieselbe Karte kann nicht in zwei sichtbaren Listen
 * stehen.
 */
const offen = new Map<string, Open>();

/** Wie lange die Karte insgesamt zu sehen war - gemeldet plus laufend. */
function gesehen(e: Open, now: number): number {
  return e.gemeldet + (e.seit === null ? 0 : now - e.seit);
}

/**
 * Den noch nicht gemeldeten Rest schicken und die Uhr neu stellen.
 *
 * `weiter = false` friert die Karte ein (Tab gewechselt): sie bleibt offen,
 * aber die Zeit laeuft nicht weiter. Lesezeit, die in einem anderen Tab
 * entsteht, waere geschenkte Lesezeit.
 */
function melden(e: Open, now: number, weiter: boolean): number {
  const rest = e.seit === null ? 0 : now - e.seit;
  e.seit = weiter ? now : null;
  if (rest < MIN_MS) return 0;
  e.gemeldet += rest;
  track(e.id, 'dwell', { dwell_ms: rest, visible_pct: 100 });
  return rest;
}

/**
 * Die bisher gesammelte Zeit dieser Karte sofort melden.
 *
 * Aufgerufen von der Karte, bevor sie etwas schickt, das der Server gegen
 * `user_content_state` prueft (Repost). Gibt zurueck, ob etwas rausging - wer
 * nichts zu melden hat, muss auch nicht auf das Netz warten.
 */
export function reportSeenNow(id: string): boolean {
  const e = offen.get(id);
  if (!e) return false;
  return melden(e, Date.now(), true) > 0;
}

export function useDwellTracking(onValidated?: (item: ContentItem) => void) {
  // In einer Ref gehalten, damit close() nicht bei jedem Render neu entsteht -
  // sonst wuerde die FlatList den Viewability-Handler austauschen, was React
  // Native mit einer Exception quittiert.
  const notify = useRef(onValidated);
  notify.current = onValidated;

  const close = useCallback((id: string) => {
    const entry = offen.get(id);
    if (!entry) return;
    offen.delete(id);

    // Eine Karte, die man nicht mehr sieht, redet nicht weiter. Ohne das
    // liest die App den Text einer Karte vor, die zwei Bildschirme weiter
    // oben steht - und der Knopf zum Anhalten ist nicht mehr erreichbar.
    if (speakingCardId() === id) stopSpeech();
    if (activeCardId() === id) setActiveCard(null);

    const now = Date.now();
    const rest = entry.seit === null ? 0 : now - entry.seit;
    const gesamt = gesehen(entry, now);

    if (gesamt < MIN_MS) return;

    if (gesamt >= entry.item.dwell_target_ms) {
      // Geschickt wird der REST, nicht die Gesamtzeit: der Server summiert,
      // und was zwischendurch gemeldet wurde, steht dort schon.
      if (rest > 0) track(entry.id, 'dwell', { dwell_ms: rest, visible_pct: 100 });
      notify.current?.(entry.item);
    } else {
      // Unter dem Ziel: als uebersprungen markieren. Diese Cards fallen aus
      // dem Fragen-Pool des Batch-Checkpoints heraus - es waere unfair,
      // etwas abzufragen, das nie gelesen wurde.
      track(entry.id, 'skip', { dwell_ms: rest, visible_pct: 100 });
    }
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ changed }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      const now = Date.now();

      for (const token of changed) {
        const item = token.item as ContentItem | undefined;
        if (!item?.id) continue;

        if (token.isViewable) {
          if (!offen.has(item.id)) {
            offen.set(item.id, { id: item.id, item, gemeldet: 0, seit: now });
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
    for (const id of Array.from(offen.keys())) close(id);
  }, [close]);

  /**
   * Tab gewechselt: Uhr anhalten, Karte offen lassen.
   *
   * Bewusst nicht schliessen. Die FlatList meldet beim Zurueckkommen keine
   * Aenderung der Sichtbarkeit - es hat sich ja nichts bewegt -, die Karte
   * ginge also nie wieder auf, und der Rest der Sitzung waere blind.
   */
  const pause = useCallback(() => {
    const now = Date.now();
    for (const e of offen.values()) melden(e, now, false);
  }, []);

  const resume = useCallback(() => {
    const now = Date.now();
    for (const e of offen.values()) if (e.seit === null) e.seit = now;
  }, []);

  return { onViewableItemsChanged, closeAll, pause, resume };
}
