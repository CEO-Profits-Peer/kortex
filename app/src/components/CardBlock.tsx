import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BodyBlock } from '@/lib/types.db';
import { color, space, type } from '@/theme/tokens';

/**
 * Ein Textblock einer Karte.
 *
 * Aus ContentCard herausgeloest, weil die Datei auf ueber 700 Zeilen
 * gewachsen war und dieser Teil nichts davon braucht: keine Gesten, keine
 * Animation, keinen Zustand. Vier Blockarten, eine Funktion, fertig.
 *
 * Was hier NICHT passiert: abschneiden. Frueher stand auf jedem Absatz
 * eine Zeilenbegrenzung mit der Begruendung "abgeschnitten ist lesbar,
 * verkleinert nicht". Das galt, solange es nichts Besseres gab -
 * inzwischen verkleinert FitBox passgenau, und reicht das nicht, teilt
 * paginate() auf eine zweite Seite. Drei Mechanismen fuer dasselbe
 * Problem waren einer zu viel, und ausgerechnet der schlechteste gewann,
 * weil er zuerst greift: Saetze endeten mitten im Wort mit "...".
 *
 * Der Hauptblock
 * --------------
 * `hero` macht aus dem ERSTEN Block einer Karte den Traeger der Karte,
 * wenn er eine Kennzahl oder ein Zitat ist. Das ist die Antwort auf
 * "es fuehlt sich nicht an, als wuerde ich durch 160 Karten scrollen":
 * jede Karte hatte denselben Aufbau - Titel, Unterzeile, Grafik, Absaetze
 * -, und zwar unabhaengig davon, ob ihr Inhalt eine Zahl, ein Satz oder
 * eine Aufzaehlung war. Gleiches Bild fuer Ungleiches.
 *
 * Wichtig ist, WORAN es haengt: an der Form des Inhalts, nicht am Zufall
 * und nicht an der Position im Feed. Eine Karte sieht anders aus, WEIL sie
 * anders ist. Ein zufaellig verteiltes Sonderlayout waere Dekoration -
 * beim zweiten Durchlauf fiele auf, dass dieselbe Karte einmal so und
 * einmal anders aussieht, und damit waere die Form bedeutungslos.
 *
 * Deshalb entscheidet auch nicht dieser Block, sondern ContentCard: nur
 * der erste Block einer Seite kann Hauptblock sein. Zwei Kennzahlen
 * gross untereinander waeren zwei Hauptsachen, also keine.
 */
export function CardBlock({
  block,
  accent,
  hero = false,
}: {
  block: BodyBlock;
  accent: string;
  hero?: boolean;
}) {
  switch (block.type) {
    case 'para':
      return <Text style={styles.para}>{block.text}</Text>;

    case 'bullet':
      return (
        <View style={styles.bullets}>
          {block.items.slice(0, 4).map((line, i) => (
            <View key={i} style={styles.bulletRow}>
              {/* Die Ziffer statt eines Punkts. Eine Aufzaehlung in einer
                  Lernkarte ist fast immer eine Anzahl ("drei Dinge, die
                  ..."), und die Anzahl ist die halbe Aussage. Monospace,
                  damit 01 und 02 exakt uebereinander stehen - mit einer
                  Proportionalschrift wackelt die linke Kante. */}
              <Text style={[styles.bulletNum, i === 0 && { color: accent }]}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text style={styles.para}>{line}</Text>
            </View>
          ))}
        </View>
      );

    case 'stat':
      if (!hero) {
        return (
          <View style={styles.stat}>
            {/* Die Zahl bleibt einzeilig: eine umgebrochene Kennzahl ist
                keine Kennzahl mehr, sondern ein Absatz in Grossschrift. */}
            <Text style={[styles.statValue, { color: accent }]} numberOfLines={1}>
              {block.value}
            </Text>
            <Text style={styles.statLabel}>{block.label}</Text>
          </View>
        );
      }
      return (
        <View style={styles.heroStat}>
          <Text style={[styles.heroValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
            {block.value}
          </Text>
          {/* Der Strich laeuft nur unter der Zahl, nicht ueber die ganze
              Breite: er gehoert zur Zahl, nicht zur Karte. */}
          <View style={[styles.heroRule, { backgroundColor: accent }]} />
          <Text style={styles.heroLabel}>{block.label}</Text>
        </View>
      );

    case 'quote':
      if (!hero) {
        return (
          <View style={[styles.quote, { borderLeftColor: accent }]}>
            <Text style={styles.quoteText}>{block.text}</Text>
            {block.attribution ? (
              <Text style={styles.quoteAttr}>— {block.attribution}</Text>
            ) : null}
          </View>
        );
      }
      return (
        <View style={styles.heroQuote}>
          {/* Das Anfuehrungszeichen ist Zeichnung, kein Zeichensatz-Rest:
              gross, sehr blass, und der Text liegt DARUEBER statt daneben.
              Ein Zitat, das eine Karte traegt, braucht keinen Balken links
              - der macht es zum Randvermerk. */}
          <Text style={styles.heroQuoteMark} pointerEvents="none">
            “
          </Text>
          <Text style={styles.heroQuoteText}>{block.text}</Text>
          {block.attribution ? (
            <Text style={styles.heroQuoteAttr}>— {block.attribution}</Text>
          ) : null}
        </View>
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  para: { ...type.body, color: color.ink.high, flex: 1 },

  bullets: { gap: space.md },
  bulletRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  bulletNum: {
    ...type.mono,
    fontSize: 12,
    lineHeight: 27,
    color: color.ink.low,
    // Feste Breite, damit der Text aller Zeilen auf derselben Kante
    // beginnt - auch wenn spaeter einmal zehn Punkte kommen.
    width: 22,
  },

  stat: { gap: space.xs },
  statValue: { ...type.display },
  statLabel: { ...type.label, color: color.ink.mid },

  heroStat: { gap: space.sm, paddingVertical: space.sm },
  heroValue: {
    ...type.display,
    fontSize: 60,
    lineHeight: 66,
    letterSpacing: -2,
  },
  heroRule: { height: 2, width: 56, borderRadius: 1 },
  heroLabel: {
    ...type.deck,
    color: color.ink.high,
    marginTop: space.xs,
  },

  heroQuote: { paddingTop: space.xl, gap: space.md },
  heroQuoteMark: {
    ...type.display,
    fontSize: 96,
    lineHeight: 96,
    color: color.ink.faint,
    position: 'absolute',
    top: -14,
    left: -6,
  },
  heroQuoteText: {
    ...type.title,
    fontSize: 22,
    lineHeight: 32,
    color: color.ink.max,
  },
  heroQuoteAttr: { ...type.meta, color: color.ink.low },

  quote: { borderLeftWidth: 2, paddingLeft: space.lg, gap: space.sm },
  quoteText: { ...type.deck, color: color.ink.high, fontStyle: 'italic' },
  quoteAttr: { ...type.meta, color: color.ink.low },
});
