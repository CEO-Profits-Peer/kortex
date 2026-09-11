import { useEffect, useState } from 'react';

import { api } from './supabase';

/**
 * Was ICH mit einer Karte gemacht habe: geliked, repostet.
 *
 * Warum es das gibt
 * -----------------
 * Die Karte merkte sich das bisher in ihrem eigenen Zustand. Wegscrollen
 * und zurueckscrollen genuegte, und das Herz war wieder leer - die Karte
 * wird beim Wiedereinblenden neu aufgebaut. Nach einem Neuladen sowieso.
 *
 * Geschrieben wurde der Like durchaus; gelesen hat ihn nur nie jemand.
 *
 * Warum ein Modul und kein Context
 * --------------------------------
 * Ein Context haette bei jeder Aenderung ALLE Karten neu gerendert - und
 * eine Karte, die neu rendert, verliert ihre laufenden Animationen. Hier
 * horcht jede Karte nur auf ihre eigene Kennung.
 *
 * Der Zustand ist bewusst optimistisch: ein Tipp aendert ihn sofort, das
 * Schreiben laeuft nebenher. Wer liked, will das Herz sehen und nicht auf
 * das Netz warten.
 */

type State = { liked: boolean; reposted: boolean };

const NONE: State = { liked: false, reposted: false };

const store = new Map<string, State>();
const listeners = new Map<string, Set<(s: State) => void>>();
/** Schon abgefragte Kennungen - damit derselbe Stapel nicht mehrfach laedt. */
const known = new Set<string>();

function emit(id: string) {
  const s = store.get(id) ?? NONE;
  listeners.get(id)?.forEach((fn) => fn(s));
}

export function contentState(id: string): State {
  return store.get(id) ?? NONE;
}

export function setContentState(id: string, patch: Partial<State>) {
  store.set(id, { ...(store.get(id) ?? NONE), ...patch });
  emit(id);
}

/**
 * Den Zustand fuer einen frisch geladenen Stapel nachholen.
 *
 * Eine Anfrage pro Stapel, nicht pro Karte. Bereits bekannte Kennungen
 * fallen raus - beim Nachladen ueberschneiden sich die Stapel sonst.
 */
export async function hydrateContentState(ids: string[]): Promise<void> {
  const fresh = ids.filter((id) => !known.has(id));
  if (fresh.length === 0) return;
  fresh.forEach((id) => known.add(id));

  try {
    const map = await api.myContentState(fresh);
    for (const [id, s] of Object.entries(map)) {
      store.set(id, { liked: Boolean(s.liked), reposted: Boolean(s.reposted) });
      emit(id);
    }
  } catch {
    // Ohne den Zustand sieht man Likes nicht - das ist ein
    // Schoenheitsfehler, kein Grund, den Feed anzuhalten. Beim naechsten
    // Stapel wird es erneut versucht.
    fresh.forEach((id) => known.delete(id));
  }
}

/** Beim Abmelden: der naechste Nutzer hat andere Likes. */
export function resetContentState() {
  store.clear();
  known.clear();
  listeners.forEach((set, id) => set.forEach((fn) => fn(NONE)));
}

export function useContentState(id: string): State {
  const [state, setState] = useState<State>(() => contentState(id));

  useEffect(() => {
    let set = listeners.get(id);
    if (!set) {
      set = new Set();
      listeners.set(id, set);
    }
    set.add(setState);
    setState(contentState(id));

    return () => {
      set?.delete(setState);
      if (set && set.size === 0) listeners.delete(id);
    };
  }, [id]);

  return state;
}
