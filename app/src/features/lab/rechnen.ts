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

/** Jetzt um hh:mm ins Bett - aufwachen nach 6, 5 und 4 Zyklen (umgekehrte Rechnung). */
export function aufwachzeiten(stunde: number, minute: number) {
  const bett = stunde * 60 + minute;
  return [6, 5, 4].map((zyklen) => {
    const t = (bett + 15 + zyklen * 90) % 1440;
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
    raten: VPI_RATE_AT,
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

/**
 * Pro Person. Beim Auto rechnet das UBA mit 1,13 Leuten im Schnitt
 * (Auslastung PV 2024). Sitzen mehr drin, teilt sich dasselbe Fahrzeug-CO2
 * auf mehr Koepfe: Wert x 1,13 = pro Fahrzeug, dann / Personen.
 */
export const PKW_BESETZUNG = 1.13;
export function co2ProPerson(mittel: Co2MittelId, km: number, personen: number | null): number {
  if ((mittel === 'auto' || mittel === 'eauto') && personen) {
    return (co2Kg(mittel, km) * PKW_BESETZUNG) / personen;
  }
  return co2Kg(mittel, km);
}

export function kg(n: number): string {
  if (n >= 1_000) return `${zahlFmt(n / 1000, 1)} t`;
  if (n >= 10) return `${zahlFmt(n)} kg`;
  if (n >= 0.1) return `${zahlFmt(n, 1)} kg`;
  if (n > 0) return `${zahlFmt(Math.max(1, n * 1000))} g`;
  return '0 kg';
}

// --- Ergebnis aus gespeicherten Eingaben -------------------------------------------

export type Ergebnis = {
  gross: string;
  satz: string;
  /**
   * Eine Zeile Einordnung - aus den EIGENEN Zahlen abgeleitet, nie
   * Allgemeinwissen. Wechselt mit dem Ergebnis, damit nicht jedes Teilen
   * gleich klingt; bei gleichen Eingaben immer derselbe Satz, damit ein
   * geteilter Beitrag bei jedem Aufruf gleich aussieht.
   */
  einordnung?: string;
  details: { label: string; wert: string }[];
  /** Optional: Anteil 0..1 fuer einen zweiteiligen Balken. */
  balken?: { anteil: number; links: string; rechts: string };
};

/**
 * Waehlt eine Formulierung fest aus den Eingaben - kein Zufall, sonst saehe
 * derselbe geteilte Beitrag bei jedem Oeffnen anders aus.
 */
function waehle<T>(varianten: T[], e: Record<string, unknown>): T {
  const s = JSON.stringify(e);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return varianten[Math.abs(h) % varianten.length];
}

/** "Dein Tipp": wie weit daneben, als Zeile fuer die Details und ein Satz. */
function tippAuswertung(tipp: number | null, echt: number, fmt: (n: number) => string) {
  if (tipp === null) return { detail: [] as { label: string; wert: string }[], satz: null as string | null };
  const abw = echt === 0 ? (tipp === 0 ? 0 : 1) : Math.abs(tipp - echt) / Math.abs(echt);
  const satz =
    abw <= 0.05
      ? 'Getippt und fast genau getroffen.'
      : abw <= 0.25
        ? `Getippt: ${fmt(tipp)} – ziemlich nah dran.`
        : tipp < echt
          ? `Getippt: ${fmt(tipp)} – deutlich zu wenig.`
          : `Getippt: ${fmt(tipp)} – deutlich zu viel.`;
  return { detail: [{ label: 'dein Tipp', wert: fmt(tipp) }], satz };
}

/** Kleinste Gruppe, ab der die Wahrscheinlichkeit 50 % erreicht - gerechnet, nicht gemerkt. */
function fuenfzigAb(p: (n: number) => number): number {
  for (let n = 2; n < 2_000; n++) if (p(n) >= 0.5) return n;
  return 2_000;
}

const WOCHEN_PRO_MONAT = 52 / 12;

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
      // Ab welchem Jahr bringen die Zinsen eines Jahres mehr als die
      // Einzahlungen desselben Jahres? Der Moment, in dem das Geld fuer
      // einen mitarbeitet.
      let kipp: number | null = null;
      if (monatlich > 0 && rendite > 0) {
        for (let j = 1; j <= jahre; j++) {
          const vorher = zinseszins(start, monatlich, rendite, j - 1);
          const jetzt = zinseszins(start, monatlich, rendite, j);
          if (jetzt.zinsen - vorher.zinsen > monatlich * 12) {
            kipp = j;
            break;
          }
        }
      }
      // Kaufkraft: mit der Durchschnittsteuerung 1990-2025 aus dem VPI oben.
      const inflSchnitt = Math.pow(VPI_AT[VPI_LETZTES] / VPI_AT[VPI_ERSTES], 1 / (VPI_LETZTES - VPI_ERSTES)) - 1;
      const real = z.endwert / Math.pow(1 + inflSchnitt, jahre);
      const anteilZinsen = z.endwert > 0 ? z.zinsen / z.endwert : 0;
      const einordnung =
        rendite === 0
          ? 'Ohne Rendite wächst nichts – und die Teuerung frisst jedes Jahr ein Stück.'
          : kipp !== null
            ? waehle(
                [
                  `Ab Jahr ${kipp} bringen die Zinsen mehr als du selbst einzahlst.`,
                  `Im Jahr ${kipp} kippt es: ab da arbeitet das Geld mehr als du.`,
                ],
                e,
              )
            : anteilZinsen < 0.25
              ? 'Noch kommt das meiste von dir. Zinseszins braucht vor allem Zeit.'
              : `${zahlFmt(anteilZinsen * 100)} % am Ende sind Zinsen – nicht eingezahlt.`;
      return {
        gross: `≈ ${euro(z.endwert)}`,
        satz: `nach ${zahlFmt(jahre)} Jahren – ${euro(monatlich)} im Monat${start > 0 ? `, ${euro(start)} zum Start` : ''}, ${zahlFmt(rendite, 1)} % Rendite`,
        einordnung,
        details: [
          { label: 'eingezahlt', wert: euro(z.eingezahlt) },
          { label: 'Zinsen', wert: euro(z.zinsen) },
          { label: 'in heutiger Kaufkraft', wert: `≈ ${euro(real)}` },
          ...(z.verdopplung ? [{ label: 'verdoppelt nach', wert: `≈ ${zahlFmt(z.verdopplung, 1)} Jahren` }] : []),
        ],
        balken: z.endwert > 0 ? { anteil: z.eingezahlt / z.endwert, links: 'eingezahlt', rechts: 'Zinsen' } : undefined,
      };
    }
    case 'geburtstag': {
      const n = zahl(e.leute, 2, 400);
      if (n === null) return null;
      const leute = Math.round(n);
      const ich = e.modus === 'ich';
      const pIch = (k: number) => 1 - Math.pow(364 / 365, k - 1);
      const p = ich ? pIch(leute) : geburtstag(leute);
      const grenze = fuenfzigAb(ich ? pIch : geburtstag);
      const tipp = zahl(e.tipp, 0, 100);
      const t = tippAuswertung(tipp, p * 100, (x) => `${zahlFmt(x)} %`);
      const einordnung =
        t.satz ??
        (ich
          ? leute < grenze
            ? `Damit jemand genau an DEINEM Tag feiert, braucht es ${grenze} Leute für 50 %.`
            : `Ab ${grenze} Leuten ist es wahrscheinlicher als nicht, dass einer mit dir feiert.`
          : leute < grenze
            ? waehle(
                [
                  `Ab ${grenze} Leuten kippt es über 50 %.`,
                  `Noch ${grenze - leute} Leute mehr, dann ist es eher ja als nein.`,
                ],
                e,
              )
            : p > 0.99
              ? 'Praktisch sicher – und trotzdem tippen die meisten auf viel mehr Leute.'
              : `Schon ab ${grenze} Leuten ist es eher ja als nein. Für DEINEN Tag bräuchte es ${fuenfzigAb(pIch)}.`);
      return {
        gross: `${zahlFmt(p * 100, 1)} %`,
        satz: ich
          ? `dass unter ${leute} Leuten jemand am selben Tag wie du Geburtstag hat`
          : `dass unter ${leute} Leuten zwei am selben Tag Geburtstag haben`,
        einordnung,
        details: [
          ...(ich ? [] : [{ label: 'Paare im Raum', wert: zahlFmt((leute * (leute - 1)) / 2) }]),
          { label: '50 % ab', wert: `${grenze} Leuten` },
          ...t.detail,
        ],
      };
    }
    case 'reaktion': {
      const liste = Array.isArray(e.versuche) ? e.versuche.map((v) => zahl(v, 80, 3_000)) : [];
      if (liste.length < 1 || liste.length > 10 || liste.some((v) => v === null)) return null;
      const ms = liste as number[];
      const schnitt = ms.reduce((a, b) => a + b, 0) / ms.length;
      const spanne = Math.max(...ms) - Math.min(...ms);
      const trend = ms.length >= 3 ? ms[ms.length - 1] - ms[0] : 0;
      // Nur Vergleiche mit sich selbst: eine "normale" Reaktionszeit haengt an
      // Geraet, Bildschirm und Browser - ein Richtwert waere hier geraten.
      const einordnung =
        ms.length < 3
          ? 'Mehr Runden, dann sieht man, wie gleichmäßig du bist.'
          : spanne < schnitt * 0.15
            ? waehle(['Sehr gleichmäßig – kaum Ausreißer.', 'Wie ein Uhrwerk: alle Runden fast gleich.'], e)
            : trend < -schnitt * 0.15
              ? 'Mit jeder Runde schneller – eingespielt.'
              : trend > schnitt * 0.15
                ? 'Zum Ende hin langsamer – die Konzentration lässt nach.'
                : `Zwischen bester und schlechtester Runde liegen ${zahlFmt(spanne)} ms.`;
      return {
        gross: `${zahlFmt(schnitt)} ms`,
        satz: 'Reaktionszeit im Schnitt',
        einordnung,
        details: [
          { label: 'bester Versuch', wert: `${zahlFmt(Math.min(...ms))} ms` },
          { label: 'Spanne', wert: `${zahlFmt(spanne)} ms` },
          { label: 'Versuche', wert: String(ms.length) },
        ],
      };
    }
    case 'anker': {
      const anker = zahl(e.anker, 10, 65);
      const schaetzung = zahl(e.schaetzung, 0, 100);
      if ((anker !== 10 && anker !== 65) || schaetzung === null) return null;
      const lesen = (x: unknown) => {
        const o = x as { n?: unknown; schnitt?: unknown } | undefined;
        const n = zahl(o?.n, 0, 1e6);
        const s = zahl(o?.schnitt, 0, 100);
        return n && s !== null ? { n, s } : null;
      };
      const niedrig = lesen(e.niedrig);
      const hoch = lesen(e.hoch);
      const g = (x: { n: number; s: number } | null) => (x ? `${zahlFmt(x.s)} % (${zahlFmt(x.n)} Leute)` : '–');
      const abstand = niedrig && hoch ? hoch.s - niedrig.s : null;
      const naeherAmAnker = Math.abs(schaetzung - anker) < Math.abs(schaetzung - (anker === 10 ? 65 : 10));
      const einordnung =
        abstand === null
          ? 'Noch zu wenige Antworten für einen Vergleich.'
          : abstand > 8
            ? waehle(
                [
                  `Wer die 65 sah, schätzt im Schnitt ${zahlFmt(abstand)} Punkte höher – wegen einer Zufallszahl.`,
                  `${zahlFmt(abstand)} Punkte Unterschied, nur durch das Rad.`,
                ],
                e,
              )
            : abstand > 2
              ? `Ein kleiner Sog: ${zahlFmt(abstand)} Punkte Unterschied zwischen den Gruppen.`
              : 'Hier hat das Rad kaum gewirkt – die Gruppen liegen fast gleich.';
      return {
        gross: `${zahlFmt(schaetzung)} %`,
        satz: `geschätzt, nachdem das Rad auf ${anker} stand${naeherAmAnker ? ' – näher an der Zahl vom Rad als an der anderen' : ''}`,
        einordnung,
        details: [
          { label: 'Schnitt nach 10', wert: g(niedrig) },
          { label: 'Schnitt nach 65', wert: g(hoch) },
        ],
      };
    }
    case 'schlaf': {
      const h = zahl(e.stunde, 0, 23);
      const m = zahl(e.minute, 0, 59);
      if (h === null || m === null) return null;
      const uhr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (e.modus === 'bett') {
        // Umgekehrt: jetzt ins Bett -> wann aufwachen, am Ende eines Zyklus.
        const [erste, ...rest] = aufwachzeiten(h, m);
        return {
          gross: erste.uhrzeit,
          satz: `aufstehen nach ${erste.zyklen} Zyklen (${zahlFmt(erste.stunden, 1)} h), ins Bett um ${uhr}`,
          einordnung: waehle(
            [
              'Lieber am Ende eines Zyklus aufwachen als eine halbe Stunde später mitten drin.',
              'Wer um diese Zeit aufsteht, erwischt eher einen leichten Schlafabschnitt.',
            ],
            e,
          ),
          details: rest.map((z) => ({ label: `${z.zyklen} Zyklen`, wert: z.uhrzeit })),
        };
      }
      const [erste, ...rest] = schlafzeiten(h, m);
      return {
        gross: erste.uhrzeit,
        satz: `ins Bett für ${erste.zyklen} Zyklen (${zahlFmt(erste.stunden, 1)} h), Wecker ${uhr}`,
        einordnung:
          h < 6
            ? 'Früher Wecker – dann zählt jeder Zyklus.'
            : waehle(
                [
                  `Schaffst du ${erste.uhrzeit} nicht, ist ${rest[0].uhrzeit} besser als irgendwas dazwischen.`,
                  'Fünf Zyklen sind der Notfallplan, nicht der Normalfall.',
                ],
                e,
              ),
        details: rest.map((z) => ({ label: `${z.zyklen} Zyklen`, wert: z.uhrzeit })),
      };
    }
    case 'lesetempo': {
      const woerter = zahl(e.woerter, 20, 600);
      const sekunden = zahl(e.sekunden, 3, 900);
      if (woerter === null || sekunden === null) return null;
      const wpm = woerter / (sekunden / 60);
      if (wpm < 30 || wpm > 1_500) return null;
      // 240 Woerter/Min = 4 Woerter/s: ab da zaehlt die App eine Karte als
      // gelesen (0070). Eine eigene Zahl, keine Norm von aussen.
      const einordnung =
        e.richtig === false && wpm > 240
          ? 'Schnell – aber die Frage ging daneben. Vielleicht einen Tick langsamer.'
          : e.richtig === true && wpm > 240
            ? 'Schnell UND verstanden.'
            : wpm > 240
              ? 'Schneller als die 4 Wörter pro Sekunde, ab denen eine Karte als gelesen zählt.'
              : waehle(
                  ['Gründlich gelesen – Tempo ist nicht alles.', 'Ruhiges Tempo. Was hängen bleibt, zählt mehr.'],
                  e,
                );
      return {
        gross: `${zahlFmt(wpm)} Wörter/Min`,
        satz: e.richtig === true ? 'und die Frage danach richtig' : e.richtig === false ? 'die Frage danach war daneben' : 'Lesetempo',
        einordnung,
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
      const tipp = zahl(e.tipp, 0, 100_000);
      const t = tippAuswertung(tipp, s, dauer);
      const einordnung =
        t.satz ??
        (s < 2
          ? 'Gut eine Sekunde – und trotzdem schon ein Blick in die Vergangenheit.'
          : waehle(
              [
                `Was du siehst, ist ${dauer(s)} alt.`,
                `Wäre es dort gerade weg, würdest du es ${dauer(s)} lang nicht merken.`,
              ],
              e,
            ));
      return {
        gross: dauer(s),
        satz: `braucht Licht ${ziel.satz}`,
        einordnung,
        details: [{ label: 'Entfernung', wert: `${zahlFmt(ziel.km)} km` }, ...t.detail],
      };
    }
    case 'inflation': {
      const betrag = zahl(e.betrag, 1, 100_000);
      const von = zahl(e.von, VPI_ERSTES, VPI_LETZTES - 1);
      const bis = zahl(e.bis, VPI_ERSTES + 1, VPI_LETZTES);
      if (betrag === null || von === null || bis === null) return null;
      if (!Number.isInteger(von) || !Number.isInteger(bis) || bis <= von) return null;
      const r = inflation(betrag, von, bis);
      const tipp = zahl(e.tipp, 0, 1_000_000);
      const t = tippAuswertung(tipp, r.heute, euro);
      // Welcher Teil der Teuerung kam aus den Jahren ueber 5 %? Log-Anteile,
      // damit sich die Jahre sauber addieren.
      let hochLog = 0;
      for (let j = von + 1; j <= bis; j++) if (r.raten[j] > 5) hochLog += Math.log(VPI_AT[j] / VPI_AT[j - 1]);
      const anteilHoch = r.gesamt > 0 ? hochLog / Math.log(VPI_AT[bis] / VPI_AT[von]) : 0;
      const einordnung =
        t.satz ??
        (anteilHoch > 0.3
          ? `${zahlFmt(anteilHoch * 100)} % dieser Teuerung kamen aus den Jahren mit über 5 %.`
          : r.proJahr < 2
            ? 'Ruhige Jahre: im Schnitt unter 2 % pro Jahr.'
            : waehle(
                [
                  `Jedes Jahr ein bisschen – über ${bis - von} Jahre wird daraus ${zahlFmt(r.gesamt)} %.`,
                  `Für ${euro(betrag)} bekommst du heute, was ${von} ${euro(r.kaufkraft)} gekostet hat.`,
                ],
                e,
              ));
      return {
        gross: `≈ ${euro(r.heute)}`,
        satz: `im Jahr ${bis} für das, was ${von} ${euro(betrag)} gekostet hat`,
        einordnung,
        details: [
          { label: 'teurer insgesamt', wert: `${zahlFmt(r.gesamt, 1)} %` },
          { label: 'im Schnitt pro Jahr', wert: `${zahlFmt(r.proJahr, 1)} %` },
          { label: 'teuerstes Jahr dazwischen', wert: `${r.spitze.jahr} (${zahlFmt(r.spitze.rate, 1)} %)` },
          ...t.detail,
        ],
        balken: { anteil: 1 / (1 + r.gesamt / 100), links: 'damals', rechts: 'Teuerung' },
      };
    }
    case 'netto': {
      const stunde = e.modus === 'stunde';
      let brutto: number | null;
      let stundenlohn: number | null = null;
      let stunden: number | null = null;
      if (stunde) {
        stundenlohn = zahl(e.lohn, 5, 100);
        stunden = zahl(e.stunden, 1, 60);
        brutto = stundenlohn !== null && stunden !== null ? stundenlohn * stunden * WOCHEN_PRO_MONAT : null;
        if (brutto !== null && (brutto < 50 || brutto > 10_000)) brutto = null;
      } else {
        brutto = zahl(e.brutto, 100, 10_000);
      }
      if (brutto === null) return null;
      const n = netto2026(brutto);
      // Grenzbelastung: was von 100 EUR MEHR brutto im Monat uebrig bliebe -
      // ehrlicher als der Durchschnitt, wenn es um eine Gehaltserhoehung geht.
      const mehr = netto2026(brutto + 100).monat - n.monat;
      const einordnung =
        n.lst === 0 && n.sv === 0
          ? 'Geringfügig: keine Beiträge, keine Lohnsteuer – brutto ist hier netto.'
          : n.lst === 0
            ? `Noch keine Lohnsteuer. Von 100 € mehr brutto blieben ${euro(mehr)}.`
            : waehle(
                [
                  `Von 100 € mehr brutto blieben dir ${euro(mehr)}.`,
                  `Jeder zusätzliche Euro brutto bringt hier etwa ${zahlFmt(mehr)} Cent netto.`,
                ],
                e,
              );
      return {
        gross: `≈ ${euro(n.monat)}`,
        satz: stunde
          ? `netto im Monat bei ${zahlFmt(stundenlohn ?? 0, 2)} € pro Stunde und ${zahlFmt(stunden ?? 0)} Stunden pro Woche (Österreich 2026)`
          : `netto im Monat von ${euro(brutto)} brutto (Österreich 2026)`,
        einordnung,
        details: [
          ...(stunde ? [{ label: 'brutto im Monat', wert: euro(brutto) }] : []),
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
      const retour = e.retour === true;
      const personen = zahl(e.personen, 1, 9) ?? null;
      const strecke = retour ? km * 2 : km;
      const eigen = co2ProPerson(mittel.id, strecke, personen);
      const bahn = co2Kg('bahn', strecke);
      const tipp = zahl(e.tipp, 0, 100_000);
      const t = tippAuswertung(tipp, eigen, kg);
      const vergleich = (['auto', 'bahn', 'flug'] as const).filter((id) => id !== mittel.id);
      const faktor = bahn > 0 ? eigen / bahn : 0;
      const einordnung =
        t.satz ??
        (mittel.id === 'rad'
          ? 'Im Betrieb kein Abgas – die Tabelle zählt hier nichts.'
          : mittel.id === 'bahn'
            ? waehle(
                [
                  `Mit dem Auto wären es ${zahlFmt(co2Kg('auto', strecke) / bahn)}-mal so viel.`,
                  'Das sauberste motorisierte Verkehrsmittel in der Tabelle.',
                ],
                e,
              )
            : faktor >= 2
              ? `${zahlFmt(faktor)}-mal so viel wie mit der Bahn.`
              : `Knapp über der Bahn – ${zahlFmt(faktor, 1)}-mal so viel.`);
      const autoGeteilt = (mittel.id === 'auto' || mittel.id === 'eauto') && personen !== null;
      return {
        gross: kg(eigen),
        satz: `CO₂ für ${zahlFmt(strecke)} km${retour ? ' hin und zurück' : ''} – ${mittel.label}${autoGeteilt ? ` mit ${personen} ${personen === 1 ? 'Person' : 'Leuten'}` : ''}, pro Person`,
        einordnung,
        details: [
          ...vergleich.map((id) => ({
            label: CO2_MITTEL.find((m) => m.id === id)?.label ?? id,
            wert: kg(co2Kg(id, strecke)),
          })),
          ...t.detail,
        ],
      };
    }
    default:
      return null;
  }
}
