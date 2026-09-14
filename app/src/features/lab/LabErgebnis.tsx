import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { ergebnis, werkzeug } from './rechnen';

/**
 * Ein LAB-Ergebnis als Karte - im Werkzeug vor dem Teilen und in jedem
 * geteilten Beitrag.
 *
 * Gerechnet wird hier jedes Mal neu aus den Eingaben (rechnen.ts). Passen
 * die Eingaben nicht zum Werkzeug, steht das so da - nie eine Zahl, die
 * nicht aus der Formel kommt.
 */
export function LabErgebnis({
  werkzeugId,
  eingaben,
  mitLink,
}: {
  werkzeugId: string;
  eingaben: Record<string, unknown> | null | undefined;
  /** Im Beitrag: "Selbst ausprobieren" fuehrt ins Werkzeug. */
  mitLink?: boolean;
}) {
  const w = werkzeug(werkzeugId);
  const e = w ? ergebnis(w.id, eingaben) : null;

  if (!w || !e) {
    return (
      <View style={styles.karte}>
        <Text style={styles.meta}>LAB</Text>
        <Text style={styles.satz}>Dieses Ergebnis lässt sich nicht mehr darstellen.</Text>
      </View>
    );
  }

  const eingezahlt = e.balken ? Math.min(1, Math.max(0, e.balken.anteil)) : null;

  return (
    <View style={styles.karte}>
      <View style={styles.kopf}>
        <Text style={[styles.meta, { color: w.farbe }]}>LAB · {w.titel}</Text>
        <Text style={styles.tag}>#{w.hashtag}</Text>
      </View>
      <Text style={styles.gross}>{e.gross}</Text>
      <Text style={styles.satz}>{e.satz}</Text>

      {eingezahlt !== null && e.balken ? (
        <View style={{ gap: 6 }}>
          <View style={styles.balken}>
            <View style={{ flex: eingezahlt, backgroundColor: color.ink.mid }} />
            <View style={{ flex: 1 - eingezahlt, backgroundColor: w.farbe }} />
          </View>
        </View>
      ) : null}

      {e.details.length > 0 ? (
        <View style={styles.details}>
          {e.details.map((d) => (
            <View key={d.label} style={styles.detail}>
              <Text style={styles.detailWert}>{d.wert}</Text>
              <Text style={styles.detailLabel}>{d.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.quelle}>{w.quelle}</Text>

      {mitLink ? (
        <Pressable
          onPress={() => {
            haptics.light();
            router.push(`/lab/${w.id}`);
          }}
          hitSlop={6}
          style={styles.link}
        >
          <Text style={[styles.linkText, { color: w.farbe }]}>Ausprobieren</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  karte: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
  },
  kopf: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  meta: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  tag: { ...type.meta, fontSize: 10, color: color.ink.low },
  gross: { ...type.display, fontSize: 34, lineHeight: 40, color: color.ink.max },
  satz: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.high },
  balken: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: color.ink.faint },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, paddingTop: 2 },
  detail: { gap: 1, minWidth: 90 },
  detailWert: { ...type.mono, fontSize: 13, color: color.ink.max },
  detailLabel: { ...type.meta, fontSize: 10, color: color.ink.low },
  quelle: {
    ...type.meta,
    fontSize: 10,
    lineHeight: 14,
    color: color.ink.low,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.ink.faint,
    paddingTop: space.sm,
  },
  link: { alignSelf: 'flex-start' },
  linkText: { ...type.label, fontSize: 13 },
});
