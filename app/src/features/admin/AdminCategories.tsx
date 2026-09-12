import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

import { Balken, Doppelbalken, Gruppe, Marke, anteil, seit, zahl } from './parts';
import type { AdminCategory } from './types';

/**
 * Alle Kategorien auf einem Blatt.
 *
 * Die Uebersicht sagt "N Kategorien ohne Karte". Das ist die Warnlampe, und
 * eine Warnlampe ohne Werkstatt hilft nicht: leer und unbeliebt sehen von
 * oben gleich aus und sind zwei verschiedene Probleme. Das eine loest die
 * Pipeline (mehr Themen), das andere nicht (niemand will es lesen).
 *
 * Deshalb steht neben jeder Kategorie beides: wie viel da ist UND was damit
 * passiert. Sortieren nach Bestand, Lesequote oder Interesse, weil die
 * Rangfolge die eigentliche Auswertung ist - eine alphabetische Liste von
 * fuenfundvierzig Zeilen beantwortet gar nichts.
 */

type Sortierung = 'karten' | 'lesequote' | 'interesse' | 'leer';

const SORTIERUNGEN: { key: Sortierung; label: string }[] = [
  { key: 'karten', label: 'Bestand' },
  { key: 'lesequote', label: 'Lesequote' },
  { key: 'interesse', label: 'Interesse' },
  { key: 'leer', label: 'Lücken' },
];

export function AdminCategories({ data }: { data: AdminCategory[] }) {
  const [sort, setSort] = useState<Sortierung>('karten');

  const liste = useMemo(() => {
    const kopie = [...data];
    switch (sort) {
      case 'lesequote':
        // Kategorien ohne Sichtungen ans Ende: eine Quote aus null Sichtungen
        // ist keine Null, sondern keine Zahl.
        return kopie.sort(
          (a, b) =>
            (b.gesehen ? b.gelesen / b.gesehen : -1) - (a.gesehen ? a.gelesen / a.gesehen : -1),
        );
      case 'interesse':
        return kopie.sort((a, b) => b.interessiert - a.interessiert);
      case 'leer':
        return kopie.sort((a, b) => a.karten - b.karten || a.id.localeCompare(b.id));
      default:
        return kopie.sort((a, b) => b.karten - a.karten);
    }
  }, [data, sort]);

  const max = Math.max(1, ...data.map((c) => c.karten));
  const leer = data.filter((c) => c.karten === 0).length;
  const gesamt = data.reduce((n, c) => n + c.karten, 0);

  return (
    <View style={styles.root}>
      <View style={styles.kopf}>
        <Text style={styles.kopfZahl}>{zahl(gesamt)}</Text>
        <Text style={styles.kopfText}>
          Karten in {data.length - leer} von {data.length} Kategorien
        </Text>
        {leer > 0 ? <Marke text={`${leer} leer`} ton="warnung" /> : null}
      </View>

      <View style={styles.sortierungen}>
        {SORTIERUNGEN.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => {
              haptics.select();
              setSort(s.key);
            }}
            style={[styles.chip, sort === s.key && styles.chipAn]}
          >
            <Text style={[styles.chipText, sort === s.key && styles.chipTextAn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Gruppe titel={`nach ${SORTIERUNGEN.find((s) => s.key === sort)?.label}`}>
        {liste.map((c) => (
          <View key={c.id} style={styles.zeile}>
            <View style={styles.titelZeile}>
              <View style={styles.punkt}>
                <View
                  style={[
                    styles.punktInnen,
                    { backgroundColor: c.karten === 0 ? color.ink.faint : c.farbe ?? color.ink.mid },
                  ]}
                />
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={[styles.karten, c.karten === 0 && { color: color.signal.warn }]}>
                {c.karten}
              </Text>
            </View>

            {/* Der Balken zeigt den Bestand im Verhaeltnis zur groessten
                Kategorie. Absolute Zahlen stehen daneben - der Balken ist
                fuer den Vergleich da, nicht fuer den Wert. */}
            <Balken
              anteil={c.karten / max}
              hoehe={3}
              farbe={c.karten === 0 ? color.ink.faint : c.farbe ?? color.signal.primary}
            />

            <View style={styles.metaZeile}>
              <Text style={[styles.meta, styles.metaId]} numberOfLines={1}>
                {c.id}
              </Text>
              {/* numberOfLines: ohne das rutscht ein einzelnes Herz in eine
                  zweite Zeile und die Liste bekommt unterschiedlich hohe
                  Zeilen - bei fuenfundvierzig Kategorien sieht man nichts
                  anderes mehr. */}
              <Text style={[styles.meta, styles.metaRechts]} numberOfLines={1}>
                {c.gesehen > 0 ? `${anteil(c.gelesen, c.gesehen)} gelesen` : 'nie gesehen'}
                {c.interessiert > 0 ? `  ·  ${c.interessiert} interessiert` : ''}
                {c.likes > 0 ? `  ·  ${c.likes} ♥` : ''}
              </Text>
            </View>

            {c.karten > 0 ? (
              <View style={styles.spracheZeile}>
                <View style={styles.spracheBalken}>
                  <Doppelbalken links={c.de} rechts={c.en} />
                </View>
                <Text style={styles.meta}>
                  {c.de} DE · {c.en} EN
                  {c.erklaerkarten > 0 ? `  ·  ${c.erklaerkarten} Spezial` : ''}
                  {c.neuste ? `  ·  neuste ${seit(c.neuste)}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </Gruppe>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },

  kopf: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  kopfZahl: { ...type.mono, fontSize: 26, color: color.ink.max, letterSpacing: -0.8 },
  kopfText: { ...type.meta, fontSize: 9.5, color: color.ink.low, flex: 1 },

  sortierungen: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  chipAn: { borderColor: color.signal.primary, backgroundColor: color.bgElevated },
  chipText: { ...type.meta, fontSize: 9.5, color: color.ink.mid },
  chipTextAn: { color: color.signal.primary },

  zeile: { gap: 4, paddingVertical: space.sm },
  titelZeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  punkt: { width: 8, alignItems: 'center' },
  punktInnen: { width: 6, height: 6, borderRadius: 3 },
  name: { ...type.body, fontSize: 14, lineHeight: 18, color: color.ink.high, flex: 1 },
  karten: { ...type.mono, fontSize: 13, color: color.ink.max },

  metaZeile: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  meta: { ...type.meta, fontSize: 8.5, color: color.ink.faint },
  metaId: { flexShrink: 1, maxWidth: '42%' },
  metaRechts: { flexShrink: 0, textAlign: 'right' },

  spracheZeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  spracheBalken: { width: 56 },
});
