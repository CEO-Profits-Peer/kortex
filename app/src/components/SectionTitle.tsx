import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';

/**
 * Die Ueberschrift eines Abschnitts - mit Linie.
 *
 * Der Unterschied zu einem fetten Wort ist klein und genau deshalb wichtig:
 * die Linie laeuft vom Text bis zum rechten Rand und macht aus einer
 * Beschriftung eine ABSCHNITTSMARKE. Genau so sind technische Zeichnungen
 * beschriftet, und genau das ist die Sprache dieser App (siehe den Kopf von
 * theme/tokens.ts: Blueprint / Grid Canvas).
 *
 * Vorher stand in den Einstellungen und im Konto je eine eigene Fassung,
 * beide nur Grossbuchstaben mit Sperrung. Das ist die Voreinstellung jeder
 * Einstellungsliste auf jedem Telefon - korrekt, aber austauschbar. Hier
 * kostet die Unterscheidung eine Zeile Code und ein Element.
 *
 * Die Linie sitzt auf der Mitte der Schriftzeile, nicht darunter: sie ist
 * die Fortsetzung des Wortes, keine Unterstreichung.
 */
export function SectionTitle({ children }: { children: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>{children}</Text>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: {
    ...type.meta,
    color: color.ink.mid,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.ink.faint },
});
