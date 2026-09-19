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
 * Inflation, Brutto-Netto und Wege & CO2 (19.09.2026) rechnen mit amtlichen
 * Tabellen. Jede Zahl darin ist aus der genannten Quelle abgeschrieben, nicht
 * aus dem Gedaechtnis. Sie altern: Steuer und Beitraege jedes Jahr, der
 * Preisindex jeden Jaenner, die Emissionskennzahlen etwa jaehrlich. Wer sie
 * erneuert, aendert NUR die Tabelle und die Quellzeile - die Rechnung bleibt.
 */

export type WerkzeugId =
  | 'zinseszins' | 'geburtstag' | 'reaktion' | 'anker' | 'schlaf' | 'lesetempo' | 'licht'
  | 'inflation' | 'netto' | 'co2';

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
  {
    id: 'inflation', titel: 'Inflation', kurz: 'Was dein Geld früher wert war',
    kategorie: 'finance.macro', hashtag: 'wirtschaft', farbe: '#7CFF6B',
    quelle: 'Verbraucherpreisindex Österreich, Jahresschnitte 1990–2025 (Statistik Austria, VPI 86) · vor 2002 in Euro umgerechnet',
  },
  {
    id: 'netto', titel: 'Brutto → Netto', kurz: 'Was vom Gehalt übrig bleibt',
    kategorie: 'finance.basics', hashtag: 'gehalt', farbe: '#7CFF6B',
    quelle: 'Österreich 2026, Angestellte, 14 Gehälter, ohne Pendler, Kinder und Freibeträge · Tarif und Absetzbeträge: BMF · Beiträge: ÖGK · keine Steuerberatung',
  },
  {
    id: 'co2', titel: 'Wege & CO₂', kurz: 'Was ein Weg dem Klima kostet',
    kategorie: 'science.climate', hashtag: 'klima', farbe: '#B78BFF',
    quelle: 'Umweltbundesamt, Emissionskennzahlen Mai 2026 (Daten 2024) · pro Person bei üblicher Auslastung, inkl. Energie-Vorkette und Fahrzeugbau · Flug mit Faktor 2 für Nicht-CO₂-Effekte',
  },
];

/** Kommen, sobald die amtlichen Zahlen belegt eingetragen sind. Gerade leer. */
export const BALD: { titel: string; hashtag: string; farbe: string }[] = [];

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

// --- Inflation: Verbraucherpreisindex Oesterreich ------------------------------------
//
// Quelle: Statistik Austria, "Verbraucherpreisindizes ab 1990"
// (statistik.at/fileadmin/pages/214/2_Verbraucherpreisindizes_ab_1990.pdf,
// erstellt 17.07.2026), Jahresdurchschnitte der Spalte VPI 86. Diese eine
// Spalte laeuft ohne Bruch von 1990 bis 2025 - die neueren Basen (VPI 2000,
// 2010, ...) beginnen spaeter und muessten verkettet werden. Beim Abschreiben
// geprueft: aus jedem Indexpaar ergibt sich die veroeffentlichte Jahresrate
// auf 0,1 Prozentpunkte genau.
export const VPI_AT: Record<number, number> = {
  1990: 109.5, 1991: 113.1, 1992: 117.7, 1993: 121.9, 1994: 125.6, 1995: 128.4,
  1996: 130.8, 1997: 132.5, 1998: 133.7, 1999: 134.5, 2000: 137.6, 2001: 141.3,
  2002: 143.8, 2003: 145.8, 2004: 148.8, 2005: 152.2, 2006: 154.4, 2007: 157.8,
  2008: 162.8, 2009: 163.7, 2010: 166.6, 2011: 172.0, 2012: 176.3, 2013: 179.8,
  2014: 182.7, 2015: 184.4, 2016: 186.1, 2017: 189.9, 2018: 193.7, 2019: 196.7,
  2020: 199.5, 2021: 205.0, 2022: 222.5, 2023: 239.9, 2024: 247.0, 2025: 255.7,
};
export const VPI_ERSTES = 1990;
export const VPI_LETZTES = 2025;

/**
 * Die veroeffentlichten Jahresraten (% zum Vorjahr, dieselbe Tabelle). Aus
 * den gerundeten Indexwerten gerechnet kaeme fuer 2022 8,5 % heraus -
 * genannt wird aber 8,6 %, also steht hier die amtliche Zahl.
 */
const VPI_RATE_AT: Record<number, number> = {
  1991: 3.3, 1992: 4.1, 1993: 3.6, 1994: 3.0, 1995: 2.2, 1996: 1.9, 1997: 1.3,
  1998: 0.9, 1999: 0.6, 2000: 2.3, 2001: 2.7, 2002: 1.8, 2003: 1.3, 2004: 2.1,
  2005: 2.3, 2006: 1.5, 2007: 2.2, 2008: 3.2, 2009: 0.5, 2010: 1.9, 2011: 3.3,
  2012: 2.4, 2013: 2.0, 2014: 1.7, 2015: 0.9, 2016: 0.9, 2017: 2.1, 2018: 2.0,
  2019: 1.5, 2020: 1.4, 2021: 2.8, 2022: 8.6, 2023: 7.8, 2024: 2.9, 2025: 3.6,
};

export function inflation(betrag: number, von: number, bis: number) {
  const faktor = VPI_AT[bis] / VPI_AT[von];
  const jahre = bis - von;
  let spitze = { jahr: von + 1, rate: -Infinity };
  for (let j = von + 1; j <= bis; j++) {
    if (VPI_RATE_AT[j] > spitze.rate) spitze = { jahr: j, rate: VPI_RATE_AT[j] };
  }
  return {
    heute: betrag * faktor,
    gesamt: (faktor - 1) * 100,
    proJahr: (Math.pow(faktor, 1 / jahre) - 1) * 100,
    kaufkraft: betrag / faktor,
    spitze,
  };
}

// --- Brutto -> Netto, Oesterreich 2026 ------------------------------------------------
//
// Lohnsteuertarif 2026: BMF, "Steuertarif und Steuerabsetzbetraege"
//   (bmf.gv.at, Grenzen um 1,733 % angehoben).
// Verkehrsabsetzbetrag 2026 = 496 EUR, Werbungskostenpauschale 132 EUR,
//   Freigrenze fuer 13./14. = 2.615 EUR, davon 620 EUR frei, Rest 6 %:
//   BMF, "Das Steuerbuch 2026".
// Beitraege: OeGK, "Ihr Sozialversicherungsbeitrag" (18,07 %) und
//   "Sozialversicherungswerte fuer 2026" (Hoechstbeitragsgrundlage 6.930 EUR,
//   verminderte Arbeitslosenversicherung, Geringfuegigkeitsgrenze 551,10 EUR).
//   AK-Umlage und Wohnbaufoerderung fallen auf Sonderzahlungen NICHT an (WKO).
//
// Bewusst weggelassen: Pendlerpauschale, Familienbonus, Freibetraege und die
// Rueckerstattung bei kleinen Einkommen ("Negativsteuer") - die gibt es erst
// mit der Arbeitnehmerveranlagung, nicht am Lohnzettel.
const TARIF_2026: [number, number][] = [
  [13_539, 0],
  [21_992, 0.2],
  [36_458, 0.3],
  [70_365, 0.4],
  [104_859, 0.48],
  [1_000_000, 0.5],
  [Infinity, 0.55],
];
const SV = { kv: 3.87, pv: 10.25, ak: 0.5, wbf: 0.5, hbg: 6_930, gering: 551.1 };
const VERKEHRSABSETZBETRAG = 496;
const WERBUNGSKOSTEN = 132;
const SZ_FREIGRENZE = 2_615;
const SZ_FREIBETRAG = 620;

/** Einkommensteuer auf ein Jahreseinkommen nach dem Tarif 2026. */
export function tarif2026(einkommen: number): number {
  let steuer = 0;
  let unten = 0;
  for (const [oben, satz] of TARIF_2026) {
    if (einkommen <= unten) break;
    steuer += (Math.min(einkommen, oben) - unten) * satz;
    unten = oben;
  }
  return steuer;
}

/** Arbeitslosenversicherung, fuer kleine Einkommen vermindert (OeGK 2026). */
function alvSatz(grundlage: number): number {
  if (grundlage <= 2_225) return 0;
  if (grundlage <= 2_427) return 1;
  if (grundlage <= 2_630) return 2;
  return 2.95;
}

export function netto2026(brutto: number) {
  // Geringfuegig: keine Beitraege fuer Dienstnehmer, und 14 x 551 EUR liegen
  // weit unter der steuerfreien Grenze.
  const gering = brutto <= SV.gering;
  const basis = Math.min(brutto, SV.hbg);
  const alv = alvSatz(basis);
  const sv = gering ? 0 : (basis * (SV.kv + SV.pv + alv + SV.ak + SV.wbf)) / 100;
  const svSz = gering ? 0 : (basis * (SV.kv + SV.pv + alv)) / 100;

  const jahresBasis = Math.max(0, 12 * (brutto - sv) - WERBUNGSKOSTEN);
  const lst = Math.max(0, tarif2026(jahresBasis) - VERKEHRSABSETZBETRAG) / 12;

  // 13. und 14. zusammen: bei gleichem Gehalt genau das Jahressechstel.
  const sz = 2 * (brutto - svSz);
  const lstSz = sz <= SZ_FREIGRENZE ? 0 : 0.06 * (sz - SZ_FREIBETRAG);

  const monat = brutto - sv - lst;
  const szNetto = brutto - svSz - lstSz / 2;
  const jahrBrutto = 14 * brutto;
  const jahrNetto = 12 * monat + 2 * szNetto;
  return { sv, lst, monat, szNetto, jahrBrutto, jahrNetto };
}

// --- Wege & CO2 -------------------------------------------------------------------------
//
// Quelle: Umweltbundesamt, "Emissionskennzahlen Datenbasis 2024", aktualisiert
// Mai 2026 (umweltbundesamt.at/.../ekz_pkm_verkehrsmittel.pdf), g pro Pkm.
// Summe aus drei Spalten der Tabelle: direkte CO2-Aequivalente + vorgelagerte
// THG (Treibstoff bzw. Strom) + Fahrzeugherstellung. Nur die direkten Werte
// haetten das E-Auto auf null gesetzt - das ist nicht, was es kostet.
//   Pkw Durchschnitt 136,7 + 37,3 + 45,9  (1,13 Personen im Schnitt)
//   E-Auto (BEV)       0   + 25,4 + 69,7
//   Linienbus         40,1 + 10,6 +  3,8
//   Reisebus          34,6 +  9,2 +  4,6
//   Bahn in Oe.        2,8 +  4,4 +  1,1
//   Flug bis 1.000 km 236  + 25,0 +  0,5   } Nicht-CO2-Effekte stecken mit
//   Flug 1.000-4.000  248  + 26,3 +  0,4   } Faktor 2 schon im Wert des UBA
//   Flug ueber 4.000  154  + 16,3 +  0,3   }
// Rad und zu Fuss stehen nicht in der Tabelle: kein Treibstoff, keine
// Abgase. Die Herstellung eines Fahrrads fehlt dort, daher "0" im Betrieb.
export const CO2_MITTEL = [
  { id: 'auto', label: 'Auto', gProKm: 219.9 },
  { id: 'eauto', label: 'E-Auto', gProKm: 95.1 },
  { id: 'bus', label: 'Bus', gProKm: 54.5 },
  { id: 'reisebus', label: 'Reisebus', gProKm: 48.4 },
  { id: 'bahn', label: 'Bahn', gProKm: 8.3 },
  { id: 'flug', label: 'Flug', gProKm: 0 },
  { id: 'rad', label: 'Rad & zu Fuß', gProKm: 0 },
] as const;
export type Co2MittelId = (typeof CO2_MITTEL)[number]['id'];

function flugGProKm(km: number): number {
  if (km <= 1_000) return 261.5;
  if (km <= 4_000) return 274.7;
  return 170.6;
}

export function co2Kg(mittel: Co2MittelId, km: number): number {
  const m = CO2_MITTEL.find((x) => x.id === mittel);
  if (!m) return NaN;
  const g = mittel === 'flug' ? flugGProKm(km) : m.gProKm;
  return (g * km) / 1000;
}

export function kg(n: number): string {
  if (n >= 1_000) return `${zahlFmt(n / 1000, 1)} t`;
  if (n >= 10) return `${zahlFmt(n)} kg`;
  if (n > 0) return `${zahlFmt(n, 1)} kg`;
  return '0 kg';
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
    case 'inflation': {
      const betrag = zahl(e.betrag, 1, 100_000);
      const von = zahl(e.von, VPI_ERSTES, VPI_LETZTES - 1);
      const bis = zahl(e.bis, VPI_ERSTES + 1, VPI_LETZTES);
      if (betrag === null || von === null || bis === null) return null;
      if (!Number.isInteger(von) || !Number.isInteger(bis) || bis <= von) return null;
      const r = inflation(betrag, von, bis);
      return {
        gross: `≈ ${euro(r.heute)}`,
        satz: `im Jahr ${bis} für das, was ${von} ${euro(betrag)} gekostet hat`,
        details: [
          { label: 'teurer insgesamt', wert: `${zahlFmt(r.gesamt, 1)} %` },
          { label: 'im Schnitt pro Jahr', wert: `${zahlFmt(r.proJahr, 1)} %` },
          { label: `${euro(betrag)} (${bis}) im Jahr ${von}`, wert: euro(r.kaufkraft) },
          { label: 'teuerstes Jahr dazwischen', wert: `${r.spitze.jahr} (${zahlFmt(r.spitze.rate, 1)} %)` },
        ],
        balken: { anteil: 1 / (1 + r.gesamt / 100), links: 'damals', rechts: 'Teuerung' },
      };
    }
    case 'netto': {
      const brutto = zahl(e.brutto, 100, 10_000);
      if (brutto === null) return null;
      const n = netto2026(brutto);
      return {
        gross: `≈ ${euro(n.monat)}`,
        satz: `netto im Monat von ${euro(brutto)} brutto (Österreich 2026)`,
        details: [
          { label: 'Sozialversicherung', wert: euro(n.sv) },
          { label: 'Lohnsteuer', wert: euro(n.lst) },
          { label: '13. und 14. netto, je', wert: euro(n.szNetto) },
          { label: 'netto im Jahr', wert: euro(n.jahrNetto) },
        ],
        balken: { anteil: n.jahrNetto / n.jahrBrutto, links: 'netto', rechts: 'Abgaben' },
      };
    }
    case 'co2': {
      const km = zahl(e.km, 1, 20_000);
      const mittel = CO2_MITTEL.find((m) => m.id === e.mittel);
      if (km === null || !mittel) return null;
      const vergleich = (['auto', 'bahn', 'flug'] as const).filter((id) => id !== mittel.id);
      return {
        gross: kg(co2Kg(mittel.id, km)),
        satz: `CO₂ für ${zahlFmt(km)} km – ${mittel.label}, pro Person`,
        details: vergleich.map((id) => ({
          label: CO2_MITTEL.find((m) => m.id === id)?.label ?? id,
          wert: kg(co2Kg(id, km)),
        })),
      };
    }
    default:
      return null;
  }
}
