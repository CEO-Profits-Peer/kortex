import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';

import { api } from './supabase';
import type { ContentEvent, FlushEventsResult } from './types.db';

/**
 * Event-Puffer.
 *
 * Warum das existiert: ein Netzwerk-Write pro Card wuerde Akku, Latenz und
 * das Supabase-Kontingent gleichzeitig verbrennen — bei 100 Cards am Tag und
 * ein paar hundert Nutzern sind das schnell Zehntausende Requests. Stattdessen
 * sammelt der Client lokal und schickt gebuendelt.
 *
 * Ausgeliefert wird bei:
 *   - FLUSH_THRESHOLD erreichten Events (Normalfall: einmal pro Batch)
 *   - App geht in den Hintergrund (der haeufigste Abbruchmoment)
 *   - explizitem flush() vor dem Batch-Checkpoint
 *
 * Was nicht rausging, ueberlebt einen App-Neustart in AsyncStorage. Ohne das
 * verliert jeder Absturz die Lesezeit — und damit die XP des Nutzers.
 */

const STORAGE_KEY = 'event_buffer_v1';
const FLUSH_THRESHOLD = 10;
const MAX_BUFFER = 200; // entspricht dem Limit in flush_events()

type Listener = (result: FlushEventsResult) => void;

class EventBuffer {
  private queue: ContentEvent[] = [];
  private flushing = false;
  private hydrated = false;
  private listeners = new Set<Listener>();
  private appStateSub: { remove: () => void } | null = null;

  /** Einmal beim App-Start aufrufen (im Root-Layout). */
  async init() {
    if (this.hydrated) return;
    this.hydrated = true;

    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) this.queue = JSON.parse(raw) as ContentEvent[];
    } catch {
      // Kaputter Puffer darf den Start nicht blockieren.
      this.queue = [];
    }

    this.appStateSub = AppState.addEventListener('change', this.onAppStateChange);
    if (this.queue.length > 0) void this.flush();
  }

  dispose() {
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  private onAppStateChange = (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') void this.flush();
  };

  /** Auf Ergebnisse hoeren, z.B. um vergebene XP zu animieren. */
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(event: ContentEvent) {
    this.queue.push(event);
    if (this.queue.length > MAX_BUFFER) {
      // Aelteste zuerst verwerfen: frische Aufmerksamkeit ist wertvoller
      // als eine Impression von vor einer Stunde.
      this.queue = this.queue.slice(-MAX_BUFFER);
    }
    void this.persist();
    if (this.queue.length >= FLUSH_THRESHOLD) void this.flush();
  }

  private async persist() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      /* Speicher voll o.ae. — Events gehen im schlimmsten Fall verloren. */
    }
  }

  async flush(): Promise<FlushEventsResult | null> {
    if (this.flushing || this.queue.length === 0) return null;
    this.flushing = true;

    const batch = this.queue.slice(0, MAX_BUFFER);
    try {
      const result = await api.flushEvents(batch);
      this.queue = this.queue.slice(batch.length);
      await this.persist();
      this.listeners.forEach((fn) => fn(result));
      return result;
    } catch {
      // Netz weg oder Server down: Events bleiben im Puffer und gehen beim
      // naechsten Versuch raus. Nichts geht verloren, nichts blockiert die UI.
      return null;
    } finally {
      this.flushing = false;
    }
  }

  get pending() {
    return this.queue.length;
  }
}

export const eventBuffer = new EventBuffer();

/** Bequemer Wrapper — setzt den Zeitstempel selbst. */
export function track(
  contentId: string,
  eventType: ContentEvent['event_type'],
  extra: Omit<ContentEvent, 'content_id' | 'event_type' | 'client_ts'> = {},
) {
  eventBuffer.add({
    content_id: contentId,
    event_type: eventType,
    client_ts: new Date().toISOString(),
    ...extra,
  });
}
