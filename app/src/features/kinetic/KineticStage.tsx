import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { BlueprintVisual } from '@/components/BlueprintVisual';
import { color, motion, radius, space, type } from '@/theme/tokens';

import type { KineticShow } from './types';

/**
 * Das Bild eines Taktes.
 *
 * Die eine Regel, die alles andere bestimmt: **was schon da war, bleibt
 * stehen.** Eine Tabellenzeile, die im vorigen Takt schon sichtbar war,
 * wird nicht neu eingeblendet - nur die neue kommt dazu. Ein Balken, der
 * seinen Wert aendert, waechst dorthin, statt zu verschwinden und neu zu
 * erscheinen.
 *
 * Das ist der ganze Unterschied zwischen "es wird etwas erklaert" und "es
 * blinken Bilder". Wenn bei jedem Satz alles neu aufblendet, kann das Auge
 * nicht verfolgen, WAS sich geaendert hat - und genau das ist die
 * Information.
 */

// --- Aussage -----------------------------------------------------------------

function Statement({ show }: { show: Extract<KineticShow, { kind: 'statement' }> }) {
  return (
    <View style={styles.statement}>
      <Text style={styles.statementText} numberOfLines={3} adjustsFontSizeToFit>
        {show.text}
      </Text>
      {show.sub ? <Text style={styles.statementSub}>{show.sub}</Text> : null}
    </View>
  );
}

// --- Tabelle -----------------------------------------------------------------

function Row({
  cells,
  isNew,
  accent,
}: {
  cells: [string, string];
  isNew: boolean;
  accent: string;
}) {
  const p = useSharedValue(isNew ? 0 : 1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isNew) {
      p.value = 1;
      return;
    }
    p.value = reduceMotion ? 1 : withTiming(1, { duration: motion.base });
  }, [isNew, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateX: (1 - p.value) * 14 }],
  }));

  return (
    <Animated.View style={[styles.row, anim]}>
      <Text style={styles.cellLeft} numberOfLines={1}>
        {cells[0]}
      </Text>
      <Text style={[styles.cellRight, isNew && { color: accent }]} numberOfLines={1}>
        {cells[1]}
      </Text>
    </Animated.View>
  );
}

function Table({
  show,
  previous,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'table' }>;
  previous: KineticShow | null;
  accent: string;
}) {
  /**
   * Welche Zeilen sind neu?
   *
   * Verglichen wird gegen den vorigen Takt - aber nur, wenn er dieselbe
   * Tabelle meinte. Der Vergleich laeuft ueber die linke Spalte, weil sich
   * der Wert rechts aendern kann ("Jahr 3" bleibt "Jahr 3", auch wenn der
   * Betrag korrigiert wird).
   */
  const known = useMemo(() => {
    if (!previous || previous.kind !== 'table') return new Set<string>();
    if (previous.id !== show.id) return new Set<string>();
    return new Set(previous.rows.map((r) => r[0]));
  }, [previous, show.id]);

  return (
    <View style={styles.table}>
      {show.head ? (
        <View style={[styles.row, styles.headRow]}>
          <Text style={styles.headCell}>{show.head[0]}</Text>
          <Text style={[styles.headCell, styles.headRight]}>{show.head[1]}</Text>
        </View>
      ) : null}
      {show.rows.map((cells) => (
        <Row key={cells[0]} cells={cells} isNew={!known.has(cells[0])} accent={accent} />
      ))}
    </View>
  );
}

// --- Balken ------------------------------------------------------------------

function Bar({
  label,
  value,
  max,
  unit,
  accent,
  index,
  highlight,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  accent: string;
  index: number;
  highlight: boolean;
}) {
  const w = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const target = max > 0 ? Math.max(0.015, value / max) : 0;

  useEffect(() => {
    w.value = reduceMotion
      ? target
      : withDelay(index * 90, withTiming(target, { duration: motion.slow }));
  }, [target, index, w, reduceMotion]);

  const anim = useAnimatedStyle(() => ({ flex: w.value }));
  const rest = useAnimatedStyle(() => ({ flex: Math.max(0.0001, 1 - w.value) }));

  return (
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.barValue, highlight && { color: accent }]}>
          {formatNumber(value)}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View
          style={[styles.barFill, { backgroundColor: highlight ? accent : color.ink.mid }, anim]}
        />
        <Animated.View style={rest} />
      </View>
    </View>
  );
}

/** Tausendertrennung mit schmalem Leerzeichen - liest sich besser als Punkt. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '–';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} Mrd.`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} Mio.`;
  return n.toLocaleString('de-DE');
}

function Bars({
  show,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'bars' }>;
  accent: string;
}) {
  const max = Math.max(...show.values, 1);
  // Der letzte Balken ist fast immer die Pointe - der Wert, um den es geht.
  const last = show.values.length - 1;
  return (
    <View style={styles.bars}>
      {show.labels.map((label, i) => (
        <Bar
          key={`${show.id ?? 'b'}-${label}`}
          label={label}
          value={show.values[i] ?? 0}
          max={max}
          unit={show.unit ?? ''}
          accent={accent}
          index={i}
          highlight={i === last}
        />
      ))}
    </View>
  );
}

// --- Die Buehne --------------------------------------------------------------

export function KineticStage({
  show,
  previous,
  accent,
  cardSeed,
}: {
  show: KineticShow;
  /** Das Bild des vorigen Taktes - fuer "was ist neu?". */
  previous: KineticShow | null;
  accent: string;
  cardSeed: string;
}) {
  /**
   * Wechselt das Bild die Art oder die Identitaet, wird ueberblendet.
   * Bleibt es dasselbe Bild, laeuft die Bewegung INNERHALB weiter - dann
   * darf hier nichts blenden, sonst flackert die ganze Tabelle bei jeder
   * neuen Zeile.
   */
  const sameVisual =
    previous !== null &&
    previous.kind === show.kind &&
    ('id' in show && 'id' in previous ? show.id === previous.id : true);

  const fade = useSharedValue(sameVisual ? 1 : 0);
  const reduceMotion = useReducedMotion();
  const shown = useRef(show);
  shown.current = show;

  useEffect(() => {
    if (sameVisual) {
      fade.value = 1;
      return;
    }
    fade.value = 0;
    fade.value = reduceMotion ? 1 : withTiming(1, { duration: motion.base });
  }, [show, sameVisual, fade, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: 0.985 + 0.015 * fade.value }],
  }));

  return (
    <Animated.View style={[styles.stage, anim]}>
      {show.kind === 'statement' ? <Statement show={show} /> : null}
      {show.kind === 'table' ? (
        <Table show={show} previous={sameVisual ? previous : null} accent={accent} />
      ) : null}
      {show.kind === 'bars' ? <Bars show={show} accent={accent} /> : null}
      {show.kind === 'figure' ? (
        <View style={styles.figure}>
          <BlueprintVisual seed={show.seed ?? cardSeed} accentHex={accent} height={150} />
          {show.caption ? <Text style={styles.figureCaption}>{show.caption}</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { justifyContent: 'center' },

  statement: { gap: space.sm },
  statementText: {
    ...type.display,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1,
    color: color.ink.max,
  },
  statementSub: { ...type.deck, color: color.ink.mid },

  table: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  headRow: { borderBottomColor: color.ink.low, paddingBottom: 5 },
  headCell: {
    ...type.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.ink.low,
    flex: 1,
  },
  headRight: { textAlign: 'right' },
  cellLeft: { ...type.body, fontSize: 16, color: color.ink.high, flex: 1 },
  cellRight: {
    ...type.mono,
    fontSize: 16,
    color: color.ink.max,
    textAlign: 'right',
    flex: 1,
  },

  bars: { gap: space.lg },
  barBlock: { gap: 6 },
  barHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  barLabel: { ...type.body, fontSize: 15, color: color.ink.mid, flex: 1 },
  barValue: { ...type.mono, fontSize: 15, color: color.ink.high },
  barTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: color.ink.faint,
    overflow: 'hidden',
  },
  barFill: { borderRadius: radius.pill },

  figure: { gap: space.md },
  figureCaption: { ...type.meta, color: color.ink.low },
});
