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
 */
export function CardBlock({ block, accent }: { block: BodyBlock; accent: string }) {
  switch (block.type) {
    case 'para':
      return <Text style={styles.para}>{block.text}</Text>;

    case 'bullet':
      return (
        <View style={styles.bullets}>
          {block.items.slice(0, 4).map((line, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bulletMark, { backgroundColor: accent }]} />
              <Text style={styles.para}>{line}</Text>
            </View>
          ))}
        </View>
      );

    case 'stat':
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

    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: accent }]}>
          <Text style={styles.quoteText}>{block.text}</Text>
          {block.attribution ? (
            <Text style={styles.quoteAttr}>— {block.attribution}</Text>
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
  bulletMark: { width: 6, height: 6, borderRadius: 1, marginTop: 10 },

  stat: { gap: space.xs },
  statValue: { ...type.display },
  statLabel: { ...type.label, color: color.ink.mid },

  quote: { borderLeftWidth: 2, paddingLeft: space.lg, gap: space.sm },
  quoteText: { ...type.deck, color: color.ink.high, fontStyle: 'italic' },
  quoteAttr: { ...type.meta, color: color.ink.low },
});
