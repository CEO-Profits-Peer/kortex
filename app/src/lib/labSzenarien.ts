import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/**
 * LAB-Szenarien (PRO, 19.09.): Eingaben eines Werkzeugs merken und
 * untereinander vergleichen - "50 EUR ab 16 vs. 100 EUR ab 25".
 *
 * Nur auf dem Geraet, wie die Entwuerfe (lib/entwuerfe.ts): gemerkt werden
 * Eingaben, das Ergebnis rechnet rechnen.ts bei jeder Anzeige neu. So
 * aendert eine neue Steuertabelle im Jaenner auch alte Szenarien mit.
 */

export type Szenario = { id: string; eingaben: Record<string, unknown>; am: string };

const KEY = 'lab_szenarien_v1';
/** Mehr passt nicht sinnvoll untereinander auf einen Handy-Bildschirm. */
export const MAX_SZENARIEN = 6;

async function lesen(): Promise<Record<string, Szenario[]>> {
  try {
    const roh = await AsyncStorage.getItem(KEY);
    return roh ? (JSON.parse(roh) as Record<string, Szenario[]>) : {};
  } catch {
    return {};
  }
}

async function schreiben(alle: Record<string, Szenario[]>) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(alle));
  } catch {
    /* Nicht speicherbar: dann gilt es nur fuer diese Sitzung. */
  }
}

export function useSzenarien(werkzeug: string) {
  const [liste, setListe] = useState<Szenario[]>([]);

  useEffect(() => {
    void lesen().then((a) => setListe(a[werkzeug] ?? []));
  }, [werkzeug]);

  const merken = useCallback(
    async (eingaben: Record<string, unknown>) => {
      const alle = await lesen();
      const alt = alle[werkzeug] ?? [];
      // Dieselben Eingaben zweimal merken bringt nichts.
      if (alt.some((s) => JSON.stringify(s.eingaben) === JSON.stringify(eingaben))) return false;
      const neu = [{ id: `${Date.now()}`, eingaben, am: new Date().toISOString() }, ...alt].slice(0, MAX_SZENARIEN);
      alle[werkzeug] = neu;
      await schreiben(alle);
      setListe(neu);
      return true;
    },
    [werkzeug],
  );

  const entfernen = useCallback(
    async (id: string) => {
      const alle = await lesen();
      const neu = (alle[werkzeug] ?? []).filter((s) => s.id !== id);
      alle[werkzeug] = neu;
      await schreiben(alle);
      setListe(neu);
    },
    [werkzeug],
  );

  return { liste, merken, entfernen };
}
