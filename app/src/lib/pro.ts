import { useEffect, useState } from 'react';

import { api } from '@/lib/supabase';
import { lokale } from '@/lib/sprache';

/**
 * PRO in der App: anzeigen und rechtzeitig fragen - NICHT entscheiden.
 *
 * Ob jemand PRO ist, entscheidet der Server (public.ist_pro, 0091), und dort
 * werden auch alle Grenzen durchgesetzt. Die App kennt dieselben Zahlen nur,
 * damit das PRO-Fenster aufgeht, BEVOR man etwas abschickt, das der Server
 * ablehnt. Stimmt hier eine Zahl nicht, ist das ein Anzeigefehler - keine
 * Luecke.
 */

export const GRENZEN = {
  frei: { text: 500, umfrage: 4, quiz: 3, stapel: 10, anpinnen: 1 },
  pro: { text: 1500, umfrage: 6, quiz: 5, stapel: 50, anpinnen: 3 },
} as const;

export type ProStand = {
  pro: boolean;
  plan: 'free' | 'pro' | 'gifted';
  bis: string | null;
  /** false, solange nur die Voreinstellung gilt - "kein PRO" heisst dann "noch nicht gefragt". */
  geladen: boolean;
  /** 0096: wann der Streak-Schutz zuletzt gegriffen hat. */
  schutzAm: string | null;
  /** 0098: Profil-Theme der Kopfkarte. */
  profilTheme: string | null;
};

const FREI: ProStand = { pro: false, plan: 'free', bis: null, geladen: false, schutzAm: null, profilTheme: null };

let stand: ProStand = FREI;
let geladen: Promise<void> | null = null;
const hoerer = new Set<(s: ProStand) => void>();

function setzen(s: ProStand) {
  stand = s;
  hoerer.forEach((fn) => fn(s));
}

/** Aus dem eigenen Profil lesen. Ablauf wird hier nur fuer die Anzeige geprueft. */
export async function proNeuLaden(): Promise<void> {
  try {
    const p = await api.getMyProfile();
    if (!p) return setzen({ ...FREI, geladen: true });
    const bis = p.plan_expires_at ?? null;
    const aktiv = (p.plan === 'pro' || p.plan === 'gifted') && (!bis || new Date(bis).getTime() > Date.now());
    setzen({ pro: aktiv, plan: p.plan, bis, geladen: true, schutzAm: p.streak_schutz_am ?? null, profilTheme: p.profil_theme ?? null });
  } catch {
    // Kein Netz: beim alten Stand bleiben. Der Server prueft ohnehin.
  }
}

export function useIchPro(): ProStand {
  const [s, setS] = useState(stand);
  useEffect(() => {
    hoerer.add(setS);
    if (!geladen) geladen = proNeuLaden();
    setS(stand);
    return () => {
      hoerer.delete(setS);
    };
  }, []);
  return s;
}

/** Fuer Stellen ohne React (Vorlesen): gilt PRO gerade? Nur Anzeige-Wissen. */
export function proAktiv(): boolean {
  return stand.pro;
}

export function grenzen(pro: boolean) {
  return pro ? GRENZEN.pro : GRENZEN.frei;
}

/**
 * Meldungen des Servers, die mit "PRO:" beginnen, sind keine Fehler, sondern
 * ein Angebot. Gibt den Satz ohne Vorsilbe zurueck - oder null.
 */
export function proMeldung(e: unknown): string | null {
  const msg = (e as { message?: string } | null)?.message ?? '';
  return msg.startsWith('PRO:') ? msg.slice(4).trim() : null;
}

export function bisText(bis: string | null): string {
  if (!bis) return 'ohne Ablauf';
  return `bis ${new Date(bis).toLocaleDateString(lokale(), { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/**
 * Streak-Schutz (0096) als Satz: bereit, oder wann er wieder bereit ist.
 * Nur Anzeige - ob er greift, entscheidet touch_streak.
 */
export function schutzText(schutzAm: string | null): string {
  if (!schutzAm) return 'Streak-Schutz bereit';
  const wieder = new Date(`${schutzAm}T00:00:00`);
  wieder.setDate(wieder.getDate() + 7);
  if (wieder.getTime() <= Date.now()) return 'Streak-Schutz bereit';
  return `Streak-Schutz genutzt – wieder bereit ab ${wieder.toLocaleDateString(lokale(), { day: 'numeric', month: 'long' })}`;
}
