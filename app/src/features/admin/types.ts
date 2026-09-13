/**
 * Die Formen, die das Kontrollzentrum vom Server bekommt.
 *
 * In einer eigenen Datei, weil sie inzwischen vier Bildschirme betreffen und
 * eine davon (das Atelier) sie mit erfundenen Zahlen fuellt. Ein Typ, der in
 * der Datei steht, die ihn anzeigt, wandert sonst mit jeder Umbenennung.
 *
 * Die Schluessel sind deutsch, weil die SQL-Funktionen sie so bauen
 * (Migrationen 0064 und 0068). Dort ist die Sprache der Fachbegriffe deutsch,
 * hier auch - alles andere waere eine Uebersetzungsschicht ohne Zweck.
 */

export type AdminData = {
  betrieb: {
    quellen_aktiv: number;
    quellen_mit_fehler: { id: string; fehler: string; zuletzt: string | null }[];
    quelle_am_laengsten_still: { id: string; zuletzt: string | null } | null;
    wartet_auf_freigabe: number;
    karten_24h: number;
    karten_7t: number;
    datenbank_bytes: number;
  };
  bestand: {
    freigegeben: number;
    wartend: number;
    abgelehnt: number;
    erklaerkarten: number;
    je_sprache: { sprache: string; karten: number; erklaerkarten: number }[];
    kategorien_leer: string[];
    kategorien_gross: { id: string; karten: number }[];
  };
  nutzung: {
    aktiv_15min: number;
    aktiv_24h: number;
    aktiv_7t: number;
    aktiv_30t: number;
    konten: number;
    konten_neu_7t: number;
    ereignisse_7t: { art: string; anzahl: number }[];
  };
  aufmerksamkeit: {
    paare: number;
    gelesen: number;
    geskippt: number;
    geliked: number;
    verweildauer_median_ms: number;
    verweildauer_p90_ms: number;
  };
  inhalt: {
    beliebt: { titel: string; likes: number; kategorie: string }[];
    weggewischt: { titel: string; anzahl: number; kategorie: string }[];
    lesequote_je_kategorie: { id: string; gesehen: number; gelesen: number }[];
    zu_leicht: number;
    zu_schwer: number;
  };
  stand: string;
};

export type AdminCategory = {
  id: string;
  name: string;
  eltern: string | null;
  art: 'knowledge' | 'news' | 'meta' | string;
  farbe: string | null;
  karten: number;
  de: number;
  en: number;
  erklaerkarten: number;
  likes: number;
  gesehen: number;
  gelesen: number;
  /** Wie viele Leute die Kategorie im Onboarding ausdruecklich gewaehlt haben. */
  interessiert: number;
  neuste: string | null;
};

/** Eine Zeile aus pipeline_runs (Migration 0074). */
export type AdminRun = {
  id: number;
  skript: 'ingest' | 'evergreen' | 'backfill' | string;
  ausloeser: 'schedule' | 'workflow_dispatch' | 'lokal' | string;
  github_run_id: number | null;
  gestartet_at: string;
  beendet_at: string | null;
  /** 'abgebrochen' setzt admin_runs() fuer Zeilen, die nach 45 min noch 'laeuft' sind. */
  status: 'laeuft' | 'fertig' | 'fehler' | 'abgebrochen' | string;
  stopp: string | null;
  karten: number;
  gemini_aufrufe: number;
  wiederholungen: number;
  modell: string | null;
  schluessel: number | null;
  zahlen: Record<string, number | string | null>;
  fehler: string | null;
  trockenlauf: boolean;
};

export type AdminRuns = {
  laeufe: AdminRun[];
  tage: {
    tag: string;
    geplant: number;
    laeufe: number;
    aufrufe: number;
    kontingent_leer: number;
    fehler: number;
    karten_db: number;
  }[];
  stand: string;
};

export type AdminPersonHit = {
  handle: string;
  name: string | null;
  avatar_seed: string;
  avatar_path: string | null;
  seit: string;
  zuletzt: string | null;
  land: string | null;
  region: string | null;
  sprache: string;
  plan: string;
  xp: number;
  mastery: number;
  streak: number;
  gelesen: number;
  ist_admin: boolean;
};

export type AdminPerson = {
  person: {
    handle: string;
    name: string | null;
    bio: string | null;
    avatar_seed: string;
    avatar_path: string | null;
    seit: string;
    zuletzt: string | null;
    land: string | null;
    region: string | null;
    sprache: string;
    englisch_pct: number;
    jahrgang: number | null;
    plan: string;
    tagesziel: number;
    rangliste: boolean;
    onboarding: string | null;
    ist_admin: boolean;
  };
  lernen: {
    xp: number;
    mastery: number;
    streak: number;
    streak_best: number;
    gelesen: number;
    fokus_sekunden: number;
    wiederholungen_faellig: number;
  };
  aufmerksamkeit: {
    paare: number;
    gelesen: number;
    geskippt: number;
    geliked: number;
    verweildauer_median_ms: number;
  };
  aktivitaet: {
    tage_30: number;
    letztes_ereignis: string | null;
    ereignisse_30: { art: string; anzahl: number }[];
    tage: { tag: string; anzahl: number }[];
  };
  sicht: {
    interessen: {
      id: string;
      name: string;
      gewicht: number;
      gewaehlt: boolean;
      level: number;
      mastery: number;
    }[];
    letzte_100: { id: string; anzahl: number; sprache_de: number }[];
  };
  sozial: {
    folgt: number;
    follower: number;
    reposts: number;
    kommentare: number;
  };
  stand: string;
};
