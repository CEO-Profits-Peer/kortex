/**
 * Das LAB: Werkzeuge und ihre Rechnung.
 *
 * Grundregel (entschieden am 14.09.2026): Die Zahlen im LAB rechnet eine
 * Formel, nie das Sprachmodell. Wo ein Wert von aussen kommt, steht die
 * Quelle unter dem Ergebnis.
 *
 * Diese Datei ist die EINZIGE Stelle, an der gerechnet wird - fuer das
 * Werkzeug selbst und fuer jedes geteilte Ergebnis. Gespeichert werden beim
 * Teilen nur die Eingaben (posts.daten, 0088); ein geteiltes Ergebnis wird
 * bei jeder Anzeige hieraus neu gerechnet. Eine Zahl, die jemand von Hand in
 * die Datenbank schreibt, erscheint deshalb nie.
 *
 * Inflation, Brutto-Netto und Wege & CO2 fehlen noch: sie brauchen amtliche
 * Tabellen (Preisindex, Steuertarif, Emissionsfaktoren), die erst belegt
 * eingetragen werden - nicht aus dem Gedaechtnis.
 */

export type WerkzeugId = 'zinseszins' | 'geburtstag' | 'reaktion' | 'anker' | 'schlaf' | 'lesetempo' | 'licht';

export type Werkzeug = {
  id: WerkzeugId;
  titel: string;
  /** Eine Zeile, was man herausfindet. */
  kurz: string;
  /** Kategorie - fuer Hashtag und Farbe. */
  kategorie: string;
  hashtag: string;
  farbe: string;
  quelle: string;
};

export const WERKZEUGE: Werkzeug[] = [
  {
    id: 'zinseszins', titel: 'Zinseszins', kurz: 'Wie Sparen über Jahre wächst',
    kategorie: 'finance.compound', hashtag: 'zinseszins', farbe: '#7CFF6B',
    quelle: 'Formel, monatlich verzinst · angenommene Rendite, keine Anlageberatung',
  },
  {
    id: 'geburtstag', titel: 'Geburtstage', kurz: 'Wann zwei am selben Tag feiern',
    kategorie: 'science.math', hashtag: 'mathematik', farbe: '#B78BFF',
    quelle: 'Formel · 365 gleich wahrscheinliche Tage, ohne 29. Februar',
  },
  {
    id: 'reaktion', titel: 'Reaktion', kurz: 'Wie schnell du wirklich bist',
    kategorie: 'body.training', hashtag: 'training', farbe: '#FF9F45',
    quelle: 'Eigene Messung auf diesem Gerät · Bildschirm und Browser verzögern mit',
  },
  {
    id: 'anker', titel: 'Ankereffekt', kurz: 'Ob eine Zufallszahl dich lenkt',
    kategorie: 'mind.bias', hashtag: 'denkfehler', farbe: '#FF6BA8',
    quelle: 'Antworten aller, die mitgemacht haben · anonym, nur als Schnitt',
  },
  {
    id: 'schlaf', titel: 'Schlaf', kurz: 'Wann du ins Bett solltest',
    kategorie: 'body.sleep', hashtag: 'schlaf', farbe: '#FF9F45',
    quelle: 'Faustregel: Schlafzyklen von rund 90 Minuten, 15 Minuten zum Einschlafen',
  },
  {
    id: 'lesetempo', titel: 'Lesetempo', kurz: 'Wörter pro Minute – und was hängen bleibt',
    kategorie: 'mind.learning', hashtag: 'lernen', farbe: '#FF6BA8',
    quelle: 'Eigene Messung an einer echten Karte',
  },
  {
    id: 'licht', titel: 'Lichtlaufzeit', kurz: 'Wie lange Licht unterwegs ist',
    kategorie: 'science.space', hashtag: 'weltraum', farbe: '#B78BFF',
    quelle: 'Lichtgeschwindigkeit 299.792,458 km/s · Entfernungen: Mittelwerte (IAU, NASA)',
  },
];

/** Kommen, sobald die amtlichen Zahlen belegt eingetragen sind. */
export const BALD = [
  { titel: 'Inflation', hashtag: 'wirtschaft', farbe: '#7CFF6B' },
  { titel: 'Brutto → Netto', hashtag: 'gehalt', farbe: '#7CFF6B' },
  { titel: 'Wege & CO₂', hashtag: 'klima', farbe: '#B78BFF' },
];

export function werkzeug(id: string): Werkzeug | undefined {
  return WERKZEUGE.find((w) => w.id === id);
}

// --- Formatierung --------------------------------------------------------------

const zahlFmt = (n: number, stellen = 0) =>
  n.toLocaleString('de-AT', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

export function euro(n: number): string {
  // Grosse Betraege gerundet: "≈ 253.500 €" sagt mehr als "253.462,17 €",
  // und die Nachkommastellen einer Annahme sind ohnehin erfunden genau.
  if (Math.abs(n) >= 10_000) return `${zahlFmt(Math.round(n / 100) * 100)} €`;
  return `${zahlFmt(Math.round(n))} €`;
}

function zahl(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

// --- Rechnungen ------------------------------------------------------------------

export function zinseszins(start: number, monatlich: number, rendite: number, jahre: number) {
  const n = Math.round(jahre * 12);
  const r = rendite / 1200;
  const faktor = Math.pow(1 + r, n);
  const endwert = r === 0 ? start + monatlich * n : start * faktor + (monatlich * (faktor - 1)) / r;
  const eingezahlt = start + monatlich * n;
  return { endwert, eingezahlt, zinsen: endwert - eingezahlt, verdopplung: rendite > 0 ? 72 / rendite : null };
}

/** Wahrscheinlichkeit, dass unter n Leuten mindestens zwei am selben Tag Geburtstag haben. */
export function geburtstag(n: number): number {
  let alleVerschieden = 1;
  for (let i = 0; i < n; i++) alleVerschieden *= (365 - i) / 365;
  return n > 365 ? 1 : 1 - alleVerschieden;
}

/** Zu Bett, wenn der Wecker um hh:mm klingelt - fuer 6, 5 und 4 Zyklen. */
export function schlafzeiten(stunde: number, minute: number) {
  const wecker = stunde * 60 + minute;
  return [6, 5, 4].map((zyklen) => {
    const t = (((wecker - zyklen * 90 - 15) % 1440) + 1440) % 1440;
    return {
      zyklen,
      stunden: (zyklen * 90) / 60,
      uhrzeit: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
    };
  });
}

export const LICHT_C = 299_792.458; // km/s, per Definition

export const LICHT_ZIELE = [
  { id: 'mond', label: 'Mond', km: 384_400, satz: 'vom Mond bis zur Erde' },
  { id: 'sonne', label: 'Sonne', km: 149_597_870.7, satz: 'von der Sonne bis zur Erde' },
  { id: 'mars_nah', label: 'Mars, nah', km: 54_600_000, satz: 'zum Mars, wenn er am nächsten ist' },
  { id: 'mars_fern', label: 'Mars, fern', km: 401_000_000, satz: 'zum Mars, wenn er am weitesten weg ist' },
] as const;

export function dauer(sekunden: number): string {
  if (sekunden < 60) return `${zahlFmt(sekunden, sekunden < 10 ? 2 : 1)} s`;
  const min = Math.floor(sekunden / 60);
  const s = Math.round(sekunden - min * 60);
  return s === 0 ? `${min} min` : `${min} min ${s} s`;
}

// --- Ergebnis aus gespeicherten Eingaben -------------------------------------------

export type Ergebnis = {
  gross: string;
  satz: string;
  details: { label: string; wert: string }[];
  /** Optional: Anteil 0..1 fuer einen zweiteiligen Balken. */
  balken?: { anteil: number; links: string; rechts: string };
};

/**
 * Das Ergebnis eines geteilten LAB-Beitrags - oder null, wenn die Eingaben
 * nicht zu den Grenzen des Werkzeugs passen. Dann zeigt die App nichts statt
 * einer unsinnigen Zahl.
 */
export function ergebnis(id: string, e: Record<string, unknown> | null | undefined): Ergebnis | null {
  if (!e) return null;
  switch (id) {
    case 'zinseszins': {
      const start = zahl(e.start, 0, 100_000);
      const monatlich = zahl(e.monatlich, 0, 2_000);
      const rendite = zahl(e.rendite, 0, 15);
      const jahre = zahl(e.jahre, 1, 70);
      if (start === null || monatlich === null || rendite === null || jahre === null) return null;
      const z = zinseszins(start, monatlich, rendite, jahre);
      return {
        gross: `≈ ${euro(z.endwert)}`,
        satz: `nach ${zahlFmt(jahre)} Jahren – ${euro(monatlich)} im Monat${start > 0 ? `, ${euro(start)} zum Start` : ''}, ${zahlFmt(rendite, 1)} % Rendite`,
        details: [
          { label: 'eingezahlt', wert: euro(z.eingezahlt) },
          { label: 'Zinsen', wert: euro(z.zinsen) },
          ...(z.verdopplung ? [{ label: 'verdoppelt nach', wert: `≈ ${zahlFmt(z.verdopplung, 1)} Jahren` }] : []),
        ],
        balken: z.endwert > 0 ? { anteil: z.eingezahlt / z.endwert, links: 'eingezahlt', rechts: 'Zinsen' } : undefined,
      };
    }
    case 'geburtstag': {
      const n = zahl(e.leute, 2, 100);
      if (n === null) return null;
      const p = geburtstag(Math.round(n));
      return {
        gross: `${zahlFmt(p * 100, 1)} %`,
        satz: `dass unter ${Math.round(n)} Leuten zwei am selben Tag Geburtstag haben`,
        details: [{ label: 'Paare im Raum', wert: zahlFmt((n * (n - 1)) / 2) }],
      };
    }
    case 'reaktion': {
      const liste = Array.isArray(e.versuche) ? e.versuche.map((v) => zahl(v, 80, 3_000)) : [];
      if (liste.length < 1 || liste.length > 10 || liste.some((v) => v === null)) return null;
      const ms = liste as number[];
      const schnitt = ms.reduce((a, b) => a + b, 0) / ms.length;
      return {
        gross: `${zahlFmt(schnitt)} ms`,
        satz: 'Reaktionszeit im Schnitt',
        details: [
          { label: 'bester Versuch', wert: `${zahlFmt(Math.min(...ms))} ms` },
          { label: 'Versuche', wert: String(ms.length) },
        ],
      };
    }
    case 'anker': {
      const anker = zahl(e.anker, 10, 65);
      const schaetzung = zahl(e.schaetzung, 0, 100);
      if ((anker !== 10 && anker !== 65) || schaetzung === null) return null;
      const g = (x: unknown) => {
        const o = x as { n?: unknown; schnitt?: unknown } | undefined;
        const n = zahl(o?.n, 0, 1e6);
        const s = zahl(o?.schnitt, 0, 100);
        return n && s !== null ? `${zahlFmt(s)} % (${zahlFmt(n)} Leute)` : '–';
      };
      return {
        gross: `${zahlFmt(schaetzung)} %`,
        satz: `geschätzt, nachdem das Rad auf ${anker} stand`,
        details: [
          { label: 'Schnitt nach 10', wert: g(e.niedrig) },
          { label: 'Schnitt nach 65', wert: g(e.hoch) },
        ],
      };
    }
    case 'schlaf': {
      const h = zahl(e.stunde, 0, 23);
      const m = zahl(e.minute, 0, 59);
      if (h === null || m === null) return null;
      const [erste, ...rest] = schlafzeiten(h, m);
      return {
        gross: erste.uhrzeit,
        satz: `ins Bett für ${erste.zyklen} Zyklen (${zahlFmt(erste.stunden, 1)} h), Wecker ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        details: rest.map((z) => ({ label: `${z.zyklen} Zyklen`, wert: z.uhrzeit })),
      };
    }
    case 'lesetempo': {
      const woerter = zahl(e.woerter, 20, 600);
      const sekunden = zahl(e.sekunden, 3, 900);
      if (woerter === null || sekunden === null) return null;
      const wpm = woerter / (sekunden / 60);
      if (wpm < 30 || wpm > 1_500) return null;
      return {
        gross: `${zahlFmt(wpm)} Wörter/Min`,
        satz: e.richtig === true ? 'und die Frage danach richtig' : e.richtig === false ? 'die Frage danach war daneben' : 'Lesetempo',
        details: [
          { label: 'Wörter', wert: zahlFmt(woerter) },
          { label: 'Zeit', wert: dauer(sekunden) },
        ],
      };
    }
    case 'licht': {
      const ziel = LICHT_ZIELE.find((z) => z.id === e.ziel);
      if (!ziel) return null;
      const s = ziel.km / LICHT_C;
      return {
        gross: dauer(s),
        satz: `braucht Licht ${ziel.satz}`,
        details: [{ label: 'Entfernung', wert: `${zahlFmt(ziel.km)} km` }],
      };
    }
    default:
      return null;
  }
}
