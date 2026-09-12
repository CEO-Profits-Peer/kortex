import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, radius, space, type } from '@/theme/tokens';

/**
 * Die Bausteine des Kontrollzentrums.
 *
 * Warum eigene und nicht die der App: hier steht auf einem Bildschirm mehr
 * Zahl als im Rest der App zusammen. Die normalen Karten- und Listenbausteine
 * sind fuer Lesetext gebaut - grosszuegige Zeilenhoehe, viel Luft, eine Sache
 * je Block. Genau das macht eine Betriebsuebersicht unlesbar: man will alles
 * gleichzeitig sehen und Unterschiede vergleichen, nicht lesen.
 *
 * Drei Regeln, die den Unterschied machen:
 *
 *   1. ZAHLEN IN MONO, immer. In einer Proportionalschrift ist die 1 schmal,
 *      und zwei untereinanderstehende Zahlen sind nicht vergleichbar. Das ist
 *      der Grund, warum Tabellen in jeder Buchhaltung mono gesetzt sind.
 *   2. KEINE KAESTEN UM KAESTEN. Die erste Fassung hatte jede Kennzahl in
 *      einem umrandeten Feld; bei zwanzig Kennzahlen sieht das aus wie ein
 *      Formular. Jetzt tragen Haarlinien und Abstand die Gliederung, und ein
 *      Rahmen bedeutet wieder etwas.
 *   3. FARBE NUR, WENN SIE ETWAS HEISST. Gelb heisst "sieh hin", Cyan heisst
 *      "das ist die Zahl, um die es geht". Alles andere bleibt grau - sonst
 *      heisst Farbe nichts mehr.
 */

// --- Zahlen lesbar machen ----------------------------------------------------

/** Prozent, aber ohne Division durch null. */
export function anteil(teil: number, ganz: number): string {
  if (!ganz) return '—';
  return `${Math.round((100 * teil) / ganz)} %`;
}

export function sekunden(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)} s`;
  return `${(ms / 60_000).toFixed(1)} min`.replace('.', ',');
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * Tausendertrennung mit schmalem Leerzeichen.
 *
 * Ein Punkt waere deutsche Gewohnheit, kollidiert hier aber mit den
 * Kategorie-Kennungen (finanzen.zinseszins), die ueberall danebenstehen.
 */
export function zahl(n: number): string {
  return n.toLocaleString('de-AT').replace(/\./g, ' ');
}

/** "vor 3 Tagen", "heute" - relativ, weil absolut hier niemand rechnen will. */
export function seit(iso: string | null | undefined): string {
  if (!iso) return 'nie';
  const ms = Date.now() - new Date(iso).getTime();
  const tage = Math.floor(ms / 86_400_000);
  if (tage <= 0) {
    const std = Math.floor(ms / 3_600_000);
    if (std <= 0) return `vor ${Math.max(1, Math.floor(ms / 60_000))} min`;
    return `vor ${std} h`;
  }
  if (tage === 1) return 'gestern';
  if (tage < 31) return `vor ${tage} Tagen`;
  return new Date(iso).toLocaleDateString('de-AT');
}

// --- Bausteine ---------------------------------------------------------------

export type Ton = 'still' | 'signal' | 'warnung' | 'gut' | 'mastery';

export function tonFarbe(ton?: Ton): string {
  switch (ton) {
    case 'signal':
      return color.signal.primary;
    case 'warnung':
      return color.signal.warn;
    case 'gut':
      return color.signal.success;
    case 'mastery':
      return color.signal.mastery;
    default:
      return color.ink.max;
  }
}

/**
 * Die grossen drei oben auf einem Bildschirm.
 *
 * Getrennt von `Kennzahl`, weil eine Uebersicht eine Rangfolge braucht: wenn
 * alle Zahlen gleich gross sind, sucht man jedes Mal von vorn. Oben stehen
 * die drei, die man morgens ansieht; alles andere ist Nachschlagewerk.
 */
export function Gross({
  wert,
  label,
  ton,
  fuss,
}: {
  wert: string | number;
  label: string;
  ton?: Ton;
  fuss?: string;
}) {
  return (
    <View style={styles.gross}>
      <Text style={[styles.grossWert, { color: tonFarbe(ton) }]} numberOfLines={1}>
        {wert}
      </Text>
      <Text style={styles.grossLabel}>{label}</Text>
      {fuss ? <Text style={styles.grossFuss}>{fuss}</Text> : null}
    </View>
  );
}

/** Eine Kennzahl im Raster. Zwei je Zeile auf dem Telefon. */
export function Kennzahl({
  wert,
  label,
  ton,
}: {
  wert: string | number;
  label: string;
  ton?: Ton;
}) {
  return (
    <View style={styles.kennzahl}>
      <Text style={[styles.kennzahlWert, { color: tonFarbe(ton) }]} numberOfLines={1}>
        {wert}
      </Text>
      <Text style={styles.kennzahlLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Links was, rechts wie viel. */
export function Zeile({
  links,
  rechts,
  ton,
  unter,
}: {
  links: string;
  rechts: string;
  ton?: Ton;
  unter?: string;
}) {
  return (
    <View style={styles.zeile}>
      <View style={styles.zeileText}>
        <Text style={styles.zeileLinks} numberOfLines={1}>
          {links}
        </Text>
        {unter ? (
          <Text style={styles.zeileUnter} numberOfLines={1}>
            {unter}
          </Text>
        ) : null}
      </View>
      {/* numberOfLines + shrink: ein langer Fehlertext einer Quelle hat die
          ganze Seite breiter gemacht als den Bildschirm. Eine Tabelle, die
          waagrecht scrollt, weil EINE Zelle lang ist, ist keine Tabelle. */}
      <Text
        style={[styles.zeileRechts, ton ? { color: tonFarbe(ton) } : null]}
        numberOfLines={1}
      >
        {rechts}
      </Text>
    </View>
  );
}

/**
 * Ein Balken, der einen Anteil zeigt.
 *
 * Kein SVG: ein gefuelltes View in einem View ist hier genauso genau und
 * kostet keinen zweiten Renderweg. SVG lohnt sich ab dem Moment, wo Kurven
 * oder Achsen dazukommen - hier gibt es nur Rechtecke.
 */
export function Balken({
  anteil: a,
  farbe,
  hoehe = 4,
}: {
  /** 0 bis 1. */
  anteil: number;
  farbe?: string;
  hoehe?: number;
}) {
  const p = Math.max(0, Math.min(1, Number.isFinite(a) ? a : 0));
  return (
    <View style={[styles.balken, { height: hoehe, borderRadius: hoehe / 2 }]}>
      <View
        style={{
          width: `${p * 100}%`,
          height: '100%',
          borderRadius: hoehe / 2,
          backgroundColor: farbe ?? color.signal.primary,
        }}
      />
    </View>
  );
}

/**
 * Zwei Anteile in einem Balken (Deutsch / Englisch, gelesen / gesehen).
 *
 * Zwei getrennte Balken untereinander wuerden dieselbe Information zeigen und
 * die Frage "wie steht das zueinander" trotzdem offenlassen.
 */
export function Doppelbalken({
  links,
  rechts,
  farbeLinks,
  farbeRechts,
}: {
  links: number;
  rechts: number;
  farbeLinks?: string;
  farbeRechts?: string;
}) {
  const gesamt = links + rechts;
  if (gesamt <= 0) return <View style={[styles.balken, { height: 4, borderRadius: 2 }]} />;
  return (
    <View style={[styles.balken, { height: 4, borderRadius: 2, flexDirection: 'row' }]}>
      <View
        style={{
          flex: links,
          backgroundColor: farbeLinks ?? color.ink.mid,
        }}
      />
      <View
        style={{
          flex: rechts,
          backgroundColor: farbeRechts ?? color.signal.primary,
        }}
      />
    </View>
  );
}

/**
 * Dreissig Tage als Saeulen.
 *
 * Die einzige Frage, die dieser Verlauf beantworten muss, ist: kommt die
 * Person wieder, oder war sie einmal da? Dafuer braucht es keine Achse, keine
 * Beschriftung und keine Werte - nur die Silhouette.
 */
export function Verlauf({ tage }: { tage: { tag: string; anzahl: number }[] }) {
  const max = Math.max(1, ...tage.map((t) => t.anzahl));
  return (
    <View style={styles.verlauf}>
      {tage.map((t) => (
        <View
          key={t.tag}
          style={[
            styles.saeule,
            {
              height: Math.max(2, Math.round((t.anzahl / max) * 40)),
              backgroundColor: t.anzahl > 0 ? color.signal.primary : color.ink.faint,
              opacity: t.anzahl > 0 ? 0.35 + 0.65 * (t.anzahl / max) : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Kleines Etikett, z.B. "PRO", "ADMIN", "EN". */
export function Marke({ text, ton }: { text: string; ton?: Ton }) {
  const f = tonFarbe(ton);
  return (
    <View style={[styles.marke, { borderColor: ton ? f : color.ink.faint }]}>
      <Text style={[styles.markeText, { color: ton ? f : color.ink.mid }]}>{text}</Text>
    </View>
  );
}

/** Eine Gruppe mit Titel. Haarlinie statt Rahmen - siehe Regel 2 oben. */
export function Gruppe({
  titel,
  rechts,
  children,
}: {
  titel: string;
  rechts?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.gruppe}>
      <View style={styles.gruppeKopf}>
        <Text style={styles.gruppeTitel}>{titel}</Text>
        <View style={styles.gruppeLinie} />
        {rechts}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gross: { flex: 1, gap: 2 },
  grossWert: { ...type.mono, fontSize: 30, lineHeight: 34, letterSpacing: -1 },
  grossLabel: { ...type.meta, fontSize: 9.5, color: color.ink.low },
  grossFuss: { ...type.meta, fontSize: 9, color: color.ink.faint },

  kennzahl: {
    flexGrow: 1,
    flexBasis: 96,
    // ohne das waechst eine lange Zahl ueber die Spalte hinaus statt zu
    // schrumpfen - flex-basis allein begrenzt nichts.
    minWidth: 0,
    gap: 1,
    paddingVertical: space.sm,
    // Nur oben eine Linie: das Raster entsteht aus den Linien, nicht aus
    // Kaesten. Vier Rahmen nebeneinander waeren vier Formularfelder.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.ink.faint,
  },
  kennzahlWert: { ...type.mono, fontSize: 19, lineHeight: 24 },
  kennzahlLabel: { ...type.meta, fontSize: 9, color: color.ink.low, lineHeight: 13 },

  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 6,
  },
  zeileText: { flex: 1, gap: 1 },
  zeileLinks: { ...type.body, fontSize: 13.5, lineHeight: 18, color: color.ink.high },
  zeileUnter: { ...type.meta, fontSize: 9, color: color.ink.faint },
  zeileRechts: { ...type.mono, fontSize: 12.5, color: color.ink.mid, flexShrink: 1, maxWidth: '55%', textAlign: 'right' },

  balken: { width: '100%', backgroundColor: color.ink.faint, overflow: 'hidden' },

  verlauf: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 40 },
  saeule: { flex: 1, minWidth: 0, borderRadius: 1 },

  marke: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  markeText: { ...type.meta, fontSize: 8.5 },

  gruppe: { gap: space.sm },
  gruppeKopf: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  gruppeTitel: {
    ...type.meta,
    fontSize: 9.5,
    color: color.ink.low,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  gruppeLinie: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.ink.faint },
});
