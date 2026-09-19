import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from './supabase';
import type { ContentItem } from './types.db';

/**
 * Offline-Vorrat (19.09.): 20 Karten auf dem Geraet, fuer U-Bahn und Tunnel.
 *
 * Der Feed fuellt den Vorrat still nach, solange Netz da ist, und greift nur
 * darauf zurueck, wenn der Server nicht antwortet. Was man offline liest,
 * landet im Ereignis-Puffer (eventBuffer) und geht beim naechsten Netz raus -
 * XP und "gelesen" rechnet weiterhin der Server, nichts davon entsteht hier.
 *
 * Karten aelter als drei Tage fliegen raus: Nachrichten sollen offline nicht
 * frischer wirken, als sie sind.
 */

const KEY = 'feed_vorrat_v1';
const GROESSE = 20;
const HALTBAR_MS = 3 * 24 * 60 * 60 * 1000;

type Vorrat = { am: number; karten: ContentItem[] };

async function lesen(): Promise<Vorrat> {
  try {
    const roh = await AsyncStorage.getItem(KEY);
    const v = roh ? (JSON.parse(roh) as Vorrat) : { am: 0, karten: [] };
    return Date.now() - v.am > HALTBAR_MS ? { am: 0, karten: [] } : v;
  } catch {
    return { am: 0, karten: [] };
  }
}

async function schreiben(v: Vorrat) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* voll oder gesperrt: dann eben ohne Vorrat */
  }
}

let fuellt = false;

/** Nachfuellen, wenn weniger als die Haelfte da ist. Still - Fehler egal. */
export async function vorratAuffuellen(schonGezeigt: string[]): Promise<void> {
  if (fuellt) return;
  fuellt = true;
  try {
    const v = await lesen();
    const gezeigt = new Set(schonGezeigt);
    const uebrig = v.karten.filter((k) => !gezeigt.has(k.id));
    if (uebrig.length >= GROESSE / 2) {
      if (uebrig.length !== v.karten.length) await schreiben({ am: v.am, karten: uebrig });
      return;
    }
    const neu = await api.getFeed(GROESSE, [...schonGezeigt, ...uebrig.map((k) => k.id)]);
    const karten = [...uebrig, ...neu.filter((k) => !gezeigt.has(k.id))].slice(0, GROESSE);
    await schreiben({ am: Date.now(), karten });
  } catch {
    /* kein Netz - dann beim naechsten Mal */
  } finally {
    fuellt = false;
  }
}

/** Offline: bis zu n Karten aus dem Vorrat nehmen (und dort entfernen). */
export async function vorratNehmen(n: number, schonGezeigt: string[]): Promise<ContentItem[]> {
  const v = await lesen();
  const gezeigt = new Set(schonGezeigt);
  const frei = v.karten.filter((k) => !gezeigt.has(k.id));
  const raus = frei.slice(0, n);
  await schreiben({ am: v.am, karten: frei.slice(n) });
  return raus;
}
