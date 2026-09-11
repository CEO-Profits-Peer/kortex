import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { color, motion, radius, space, type } from '@/theme/tokens';

/**
 * Geteilte Mechanik für alle drei Sortier-Aufgaben:
 * timeline_sort, rank_order und build_sequence.
 *
 * WARUM TIPPEN STATT ZIEHEN:
 * Der Feed wischt vertikal. Eine vertikale Zieh-Geste in der Karte würde
 * dauernd mit ihm kollidieren - man scrollt versehentlich weiter, statt zu
 * sortieren. Das lässt sich mit Aktivierungsverzögerung entschärfen, kostet
 * dann aber Auffindbarkeit: niemand hält von selbst 150 ms gedrückt.
 *
 * Also: antippen in der gewünschten Reihenfolge. Eindeutig, schnell,
 * keine Kollision. Die Kinetik bleibt trotzdem - Elemente federn in ihren
 * Platz, und eine falsche Lösung wackelt.
 */

export type OrderItem = {
  label: string;
  /** Die richtige Position, 1-basiert */
  order: number;
  detail?: string;
  /** Nur bei build_sequence: Ablenker, die gar nicht dazugehören */
  is_decoy?: boolean;
  indent?: number;
};

export type OrderTaskData = {
  prompt: string;
  criterion?: string;
  language_hint?: string;
  result_text?: string;
  items: OrderItem[];
  reveal_after_ms?: number;
};

type Props = {
  data: OrderTaskData;
  /** Beeinflusst nur die Beschriftung, nicht die Mechanik */
  variant: 'timeline' | 'rank' | 'sequence';
  onSolved?: (correct: boolean) => void;
};

const LABEL: Record<Props['variant'], { hint: string; check: string }> = {
  timeline: { hint: 'In zeitlicher Reihenfolge antippen', check: 'Reihenfolge prüfen' },
  rank: { hint: 'Nach Größe antippen, beginnend beim größten', check: 'Reihenfolge prüfen' },
  sequence: { hint: 'In der richtigen Ablauf-Reihenfolge antippen', check: 'Ablauf prüfen' },
};

/** Deterministisch mischen, damit dieselbe Karte immer gleich aussieht. */
function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 48271) + 11) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function Row({
  item,
  position,
  state,
  onPress,
  monospace,
}: {
  item: OrderItem;
  position: number | null;
  state: 'idle' | 'correct' | 'wrong';
  onPress: () => void;
  monospace: boolean;
}) {
  const shake = useSharedValue(0);

  useEffect(() => {
    if (state === 'wrong') {
      // Falsch platziert: kurzes Wackeln statt einer stummen roten Umrandung.
      shake.value = withSequence(
        withTiming(-6, { duration: 55 }),
        withTiming(6, { duration: 55 }),
        withTiming(-3, { duration: 45 }),
        withSpring(0, motion.spring),
      );
    }
  }, [state, shake]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const tint =
    state === 'correct'
      ? color.signal.success
      : state === 'wrong'
        ? color.signal.error
        : position != null
          ? color.signal.primary
          : color.ink.faint;

  return (
    <Animated.View layout={Layout.springify().damping(18)} style={style}>
      <Pressable
        onPress={onPress}
        style={[
          styles.row,
          { borderColor: tint },
          position != null && state === 'idle' && styles.rowPicked,
          item.indent ? { marginLeft: item.indent * 18 } : null,
        ]}
      >
        <View style={[styles.slot, position != null && { borderColor: tint }]}>
          {position != null ? (
            <Animated.Text entering={FadeIn.duration(120)} style={[styles.slotNum, { color: tint }]}>
              {position}
            </Animated.Text>
          ) : null}
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.label, monospace && styles.mono]}>{item.label}</Text>
          {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function OrderTask({ data, variant, onSolved }: Props) {
  const [armed, setArmed] = useState(false);
  const [picked, setPicked] = useState<number[]>([]); // Indizes in Antipp-Reihenfolge
  const [checked, setChecked] = useState(false);

  const items = useMemo(
    () => shuffled(data.items, data.prompt),
    [data.items, data.prompt],
  );

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), data.reveal_after_ms ?? 2500);
    return () => clearTimeout(t);
  }, [data.reveal_after_ms]);

  const real = items.filter((i) => !i.is_decoy);
  // Mindestens so viele wie echte Elemente. Wer zusaetzlich den Ablenker
  // antippt, hat einen Fehler gemacht - den findet check(), nicht der Knopf.
  const complete = picked.length >= real.length;
  const remaining = Math.max(0, real.length - picked.length);

  const toggle = (index: number) => {
    if (!armed || checked) return;
    haptics.select();
    setPicked((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const check = () => {
    setChecked(true);
    const expected = [...real].sort((a, b) => a.order - b.order);
    const chosen = picked.map((i) => items[i]);
    const ok =
      chosen.length === expected.length &&
      chosen.every((item, i) => item.order === expected[i].order && !item.is_decoy);
    ok ? feedback.correct() : feedback.wrong();
    onSolved?.(ok);
  };

  const stateOf = (index: number): 'idle' | 'correct' | 'wrong' => {
    if (!checked) return 'idle';
    const at = picked.indexOf(index);
    if (at === -1) return items[index].is_decoy ? 'correct' : 'wrong';
    const expected = [...real].sort((a, b) => a.order - b.order);
    return expected[at] && expected[at].order === items[index].order ? 'correct' : 'wrong';
  };

  const allCorrect = checked && items.every((_, i) => stateOf(i) === 'correct');

  return (
    <View style={styles.root}>
      <Text style={styles.prompt}>{data.prompt}</Text>
      {data.criterion ? <Text style={styles.criterion}>{data.criterion}</Text> : null}

      <Text style={styles.hint}>{armed ? LABEL[variant].hint : 'gleich geht es los …'}</Text>

      <View style={[styles.list, !armed && styles.listIdle]}>
        {items.map((item, i) => (
          <Row
            key={`${item.label}-${i}`}
            item={item}
            position={picked.indexOf(i) === -1 ? null : picked.indexOf(i) + 1}
            state={stateOf(i)}
            onPress={() => toggle(i)}
            monospace={variant === 'sequence'}
          />
        ))}
      </View>

      {checked ? (
        <View style={styles.result}>
          <Text
            style={[
              styles.verdict,
              { color: allCorrect ? color.signal.success : color.signal.error },
            ]}
          >
            {allCorrect ? 'Alles richtig' : 'Nicht ganz'}
          </Text>
          {!allCorrect ? (
            <View style={styles.solution}>
              {[...real]
                .sort((a, b) => a.order - b.order)
                .map((item, i) => (
                  <Text key={i} style={styles.solutionLine}>
                    <Text style={{ color: color.signal.success }}>{i + 1}</Text>  {item.label}
                    {item.detail ? <Text style={styles.detail}>  ·  {item.detail}</Text> : null}
                  </Text>
                ))}
            </View>
          ) : null}
          {data.result_text ? <Text style={styles.resultText}>{data.result_text}</Text> : null}
        </View>
      ) : (
        <Button
          label={complete ? LABEL[variant].check : `Noch ${remaining} antippen`}
          onPress={complete ? check : () => feedback.blocked()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  prompt: { ...type.deck, color: color.ink.max },
  criterion: { ...type.body, fontSize: 15, color: color.ink.mid, marginTop: -space.xs },
  hint: { ...type.meta, color: color.ink.low, letterSpacing: 0.5 },

  list: { gap: space.sm },
  listIdle: { opacity: 0.5 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: color.bgElevated,
  },
  rowPicked: { borderWidth: 1.5 },

  slot: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.ink.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotNum: { ...type.label, fontSize: 13 },

  rowText: { flex: 1 },
  label: { ...type.body, fontSize: 16, color: color.ink.high },
  mono: { fontFamily: 'monospace', fontSize: 14 },
  detail: { ...type.meta, color: color.ink.low },

  result: { gap: space.sm },
  verdict: { ...type.label, fontSize: 16 },
  solution: { gap: 4, paddingLeft: space.xs },
  solutionLine: { ...type.body, fontSize: 15, color: color.ink.mid },
  resultText: { ...type.body, fontSize: 15, color: color.ink.mid },
});
