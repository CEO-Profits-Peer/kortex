import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * Karten-Notizen (0107): eigene Stichworte, privat, auf dem Server.
 *
 * Ein kleiner Zwischenspeicher, damit der Feed nicht pro Karte fragt: wer
 * Karten laedt, holt die Notizen dazu gebuendelt (notizenLaden), jede Karte
 * liest dann nur noch hier.
 */

const cache = new Map<string, string>();
const hoerer = new Set<() => void>();
const melden = () => hoerer.forEach((fn) => fn());

export async function notizenLaden(ids: string[]): Promise<void> {
  const offen = ids.filter((id) => !cache.has(id));
  if (offen.length === 0) return;
  try {
    const { data } = await supabase.rpc('notizen', { p_ids: offen.slice(0, 100) });
    // Auch "keine Notiz" merken, sonst wird dieselbe Karte immer wieder gefragt.
    for (const id of offen) cache.set(id, '');
    for (const [id, text] of Object.entries((data ?? {}) as Record<string, string>)) cache.set(id, text);
    melden();
  } catch {
    /* ohne Netz: keine Notizen anzeigen, nichts kaputt */
  }
}

export async function notizSpeichern(id: string, text: string): Promise<void> {
  const { error } = await supabase.rpc('notiz_setzen', { p_content: id, p_text: text });
  if (error) throw error;
  cache.set(id, text.trim());
  melden();
}

export function useNotiz(id: string): string {
  const [text, setText] = useState(cache.get(id) ?? '');
  useEffect(() => {
    const fn = () => setText(cache.get(id) ?? '');
    hoerer.add(fn);
    fn();
    return () => {
      hoerer.delete(fn);
    };
  }, [id]);
  return text;
}
