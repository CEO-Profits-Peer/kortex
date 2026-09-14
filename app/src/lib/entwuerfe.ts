import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { PostArt } from '@/lib/types.db';

/**
 * Entwuerfe - angefangene Beitraege, nur auf diesem Geraet.
 *
 * Gewuenscht: "Entwuerfe" als eigene Erstelloption. Bewusst lokal und nicht
 * in der Datenbank: ein Entwurf ist etwas Halbfertiges, das niemand ausser
 * einem selbst sehen soll, und ein Server, der Halbsaetze von Vierzehn-
 * jaehrigen aufbewahrt, braucht dafuer einen besseren Grund als Bequemlichkeit.
 * Der Preis: auf einem anderen Geraet ist der Entwurf nicht da.
 *
 * Gespeichert wird beim Schliessen des Schreibfensters, geloescht beim Posten.
 */

export type Entwurf = {
  id: string;
  art: PostArt;
  text: string;
  /** Antworten, Karten, LAB-Eingaben - je nach Art. */
  daten?: Record<string, unknown> | null;
  aktualisiert: string;
};

const SCHLUESSEL = 'elycic.entwuerfe.v1';
const HOECHSTENS = 20;

let stand: Entwurf[] | null = null;
const zuhoerer = new Set<(e: Entwurf[]) => void>();

function melden() {
  const liste = stand ?? [];
  zuhoerer.forEach((fn) => fn(liste));
}

async function laden(): Promise<Entwurf[]> {
  if (stand) return stand;
  try {
    const roh = await AsyncStorage.getItem(SCHLUESSEL);
    const liste = roh ? (JSON.parse(roh) as Entwurf[]) : [];
    stand = Array.isArray(liste) ? liste : [];
  } catch {
    stand = [];
  }
  return stand;
}

async function schreiben(liste: Entwurf[]) {
  stand = liste
    .sort((a, b) => b.aktualisiert.localeCompare(a.aktualisiert))
    .slice(0, HOECHSTENS);
  melden();
  try {
    await AsyncStorage.setItem(SCHLUESSEL, JSON.stringify(stand));
  } catch {
    // Speicher voll oder gesperrt: der Entwurf lebt bis zum Neustart weiter.
  }
}

export function neueEntwurfId(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function entwurfSpeichern(e: Omit<Entwurf, 'aktualisiert'>) {
  const liste = await laden();
  await schreiben([
    { ...e, aktualisiert: new Date().toISOString() },
    ...liste.filter((x) => x.id !== e.id),
  ]);
}

export async function entwurfLoeschen(id: string) {
  const liste = await laden();
  await schreiben(liste.filter((x) => x.id !== id));
}

export async function entwurfHolen(id: string): Promise<Entwurf | null> {
  const liste = await laden();
  return liste.find((x) => x.id === id) ?? null;
}

export function useEntwuerfe(): Entwurf[] {
  const [liste, setListe] = useState<Entwurf[]>(stand ?? []);
  useEffect(() => {
    zuhoerer.add(setListe);
    void laden().then(setListe);
    return () => {
      zuhoerer.delete(setListe);
    };
  }, []);
  return liste;
}
