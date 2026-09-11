import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, Layout } from 'react-native-reanimated';

import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Template "match_pairs" - Begriff links, Bedeutung rechts, verbinden.
 *
 * Zwei Antipp-Schritte statt einer Zieh-Linie: links wählen, rechts wählen.
 * Eine gezogene Verbindungslinie sieht in einer Demo besser aus, ist auf
 * einem 5-Zoll-Display mit dem Daumen aber fummelig - und sie kollidiert
 * wieder mit der Feed-Geste.
 *
 * Rückmeldung kommt sofort pro Paar, nicht erst am Ende. Bei einer
 * Zuordnungsaufgabe ist das der Lernmoment: man merkt beim dritten Paar,
 * dass die Systematik anders ist als gedacht.
 */

export type MatchData = {
  prompt: string;
  pairs: { left: string; right: string; explanation?: string }[];
  distractors?: string[];
  reveal_after_ms?: number;
};

function shuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 48271) + 11) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function MatchPairs({
  data,
  onSolved,
}: {
  data: MatchData;
  onSolved?: (correct: boolean) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [solved, setSolved] = useState<Record<number, true>>({});
  const [wrongRight, setWrongRight] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const rights = useMemo(
    () => shuffle([...data.pairs.map((p) => p.right), ...(data.distractors ?? [])], data.prompt),
    [data.pairs, data.distractors, data.prompt],
  );

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), data.reveal_after_ms ?? 2500);
    return () => clearTimeout(t);
  }, [data.reveal_after_ms]);

  const done = Object.keys(solved).length === data.pairs.length;

  useEffect(() => {
    if (done) onSolved?.(mistakes === 0);
    // onSolved bewusst nicht in den Abhängigkeiten: soll genau einmal feuern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const pickLeft = (i: number) => {
    if (!armed || solved[i]) return;
    haptics.select();
    setActiveLeft(activeLeft === i ? null : i);
    setWrongRight(null);
  };

  const pickRight = (value: string) => {
    if (!armed || activeLeft === null) return;
    const pair = data.pairs[activeLeft];
    if (pair.right === value) {
      feedback.progress();
      setSolved((s) => ({ ...s, [activeLeft]: true }));
      setNote(pair.explanation ?? null);
      setActiveLeft(null);
      setWrongRight(null);
    } else {
      feedback.wrong();
      setMistakes((m) => m + 1);
      setWrongRight(value);
      setNote(null);
    }
  };

  const usedRights = new Set(
    Object.keys(solved).map((k) => data.pairs[Number(k)].right),
  );

  return (
    <View style={styles.root}>
      <Text style={styles.prompt}>{data.prompt}</Text>
      <Text style={styles.hint}>
        {armed
          ? activeLeft === null
            ? 'Links einen Begriff wählen'
            : 'Jetzt die passende Antwort rechts'
          : 'gleich geht es los …'}
      </Text>

      <View style={[styles.columns, !armed && styles.idle]}>
        <View style={styles.column}>
          {data.pairs.map((p, i) => {
            const isSolved = Boolean(solved[i]);
            const isActive = activeLeft === i;
            return (
              <Animated.View key={p.left} layout={Layout.springify().damping(18)}>
                <Pressable
                  onPress={() => pickLeft(i)}
                  style={[
                    styles.chip,
                    isActive && { borderColor: color.signal.primary, borderWidth: 1.5 },
                    isSolved && { borderColor: color.signal.success, opacity: 0.55 },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isActive && { color: color.signal.primary },
                      isSolved && { color: color.signal.success },
                    ]}
                  >
                    {p.left}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.column}>
          {rights.map((value) => {
            const isUsed = usedRights.has(value);
            const isWrong = wrongRight === value;
            return (
              <Animated.View key={value} layout={Layout.springify().damping(18)}>
                <Pressable
                  onPress={() => pickRight(value)}
                  disabled={isUsed}
                  style={[
                    styles.chip,
                    isUsed && { borderColor: color.signal.success, opacity: 0.4 },
                    isWrong && { borderColor: color.signal.error, borderWidth: 1.5 },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      styles.chipRight,
                      isUsed && { color: color.signal.success },
                      isWrong && { color: color.signal.error },
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </View>

      {note ? (
        <Animated.Text entering={FadeIn.duration(150)} style={styles.note}>
          {note}
        </Animated.Text>
      ) : null}

      {done ? (
        <Text
          style={[
            styles.verdict,
            { color: mistakes === 0 ? color.signal.success : color.signal.warn },
          ]}
        >
          {mistakes === 0
            ? 'Alle Paare auf Anhieb'
            : `Fertig · ${mistakes} Fehlversuch${mistakes === 1 ? '' : 'e'}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  prompt: { ...type.deck, color: color.ink.max },
  hint: { ...type.meta, color: color.ink.low, letterSpacing: 0.5 },

  columns: { flexDirection: 'row', gap: space.sm },
  idle: { opacity: 0.5 },
  column: { flex: 1, gap: space.sm },

  chip: {
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    minHeight: 52,
    justifyContent: 'center',
  },
  chipText: { ...type.body, fontSize: 15, color: color.ink.high },
  chipRight: { fontSize: 14, lineHeight: 20 },

  note: { ...type.body, fontSize: 14, color: color.ink.mid },
  verdict: { ...type.label, fontSize: 16 },
});
