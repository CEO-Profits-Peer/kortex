import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { feedback } from '@/lib/feedback';
import { color, motion, radius, space, type } from '@/theme/tokens';

/**
 * Template "true_false_swipe" - Aussagen nach links oder rechts wischen.
 *
 * Nutzt bewusst dieselbe Geste wie der Feed, nur horizontal: null Lernkurve,
 * hohes Tempo. Der Nutzer muss nichts Neues begreifen, um sofort mitzumachen.
 *
 * Die Karte federt zurueck, wenn zu wenig gewischt wurde - haptisch spuerbar
 * statt stumm. Ein Fehlversuch soll sich wie Physik anfuehlen, nicht wie ein
 * Fehler.
 */

export type TrueFalseData = {
  prompt: string;
  statements: { text: string; is_true: boolean; explanation?: string }[];
  reveal_after_ms?: number;
};

const SWIPE_RATIO = 0.28; // Anteil der Bildschirmbreite bis zum Auslösen

export function TrueFalseSwipe({
  data,
  onSolved,
}: {
  data: TrueFalseData;
  onSolved?: (correct: number, total: number) => void;
}) {
  const { width } = useWindowDimensions();
  const threshold = width * SWIPE_RATIO;

  const [index, setIndex] = useState(0);
  const [armed, setArmed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [last, setLast] = useState<{ ok: boolean; text?: string } | null>(null);

  const x = useSharedValue(0);
  const y = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), data.reveal_after_ms ?? 1500);
    return () => clearTimeout(t);
  }, [data.reveal_after_ms]);

  const current = data.statements[index];
  const finished = index >= data.statements.length;

  const answer = (saidTrue: boolean) => {
    if (!current) return;
    const ok = saidTrue === current.is_true;
    ok ? feedback.correct() : feedback.wrong();
    const nextCorrect = correct + (ok ? 1 : 0);
    setCorrect(nextCorrect);
    setLast({ ok, text: current.explanation });

    const nextIndex = index + 1;
    setIndex(nextIndex);
    x.value = 0;
    y.value = 0;

    if (nextIndex >= data.statements.length) {
      onSolved?.(nextCorrect, data.statements.length);
    }
  };

  const pan = Gesture.Pan()
    .enabled(armed && !finished)
    // Links/rechts gehoert der Karte, oben/unten dem Feed.
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = e.translationY * 0.25;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > threshold) {
        const saidTrue = e.translationX > 0;
        x.value = withTiming(saidTrue ? width : -width, { duration: motion.fast });
        runOnJS(answer)(saidTrue);
      } else {
        // Zurueckfedern statt still liegenbleiben.
        x.value = withSpring(0, motion.spring);
        y.value = withSpring(0, motion.spring);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotateZ: `${interpolate(x.value, [-width, 0, width], [-8, 0, 8])}deg` },
    ],
  }));

  const trueHint = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, threshold], [0, 1], 'clamp'),
  }));
  const falseHint = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-threshold, 0], [1, 0], 'clamp'),
  }));

  if (finished) {
    const all = correct === data.statements.length;
    return (
      <View style={styles.root}>
        <Text style={styles.prompt}>{data.prompt}</Text>
        <View style={styles.summary}>
          <Text
            style={[
              styles.score,
              { color: all ? color.signal.success : color.signal.primary },
            ]}
          >
            {correct}
            <Text style={styles.scoreTotal}>/{data.statements.length}</Text>
          </Text>
          <Text style={styles.scoreLabel}>richtig eingeordnet</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.prompt}>{data.prompt}</Text>

      <View style={styles.stage}>
        <Animated.View style={[styles.hint, styles.hintLeft, falseHint]}>
          <Text style={[styles.hintText, { color: color.signal.error }]}>FALSCH</Text>
        </Animated.View>
        <Animated.View style={[styles.hint, styles.hintRight, trueHint]}>
          <Text style={[styles.hintText, { color: color.signal.success }]}>STIMMT</Text>
        </Animated.View>

        {/* pan-y: waagrecht zieht die Karte, senkrecht scrollt der Feed.
            Ohne das waere die Wischkarte ein zweiter toter Fleck, an dem
            man nicht weiterkommt. */}
        <GestureDetector gesture={pan} touchAction="pan-y">
          <Animated.View style={[styles.card, cardStyle, !armed && styles.cardIdle]}>
            <Text style={styles.statement}>{current?.text}</Text>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.footer}>
        <Text style={styles.progress}>
          {index + 1} / {data.statements.length}
        </Text>
        <Text style={styles.instruction}>
          {armed ? '← falsch     stimmt →' : 'gleich geht es los …'}
        </Text>
      </View>

      {last ? (
        <Text
          style={[
            styles.feedback,
            { color: last.ok ? color.signal.success : color.signal.error },
          ]}
        >
          {last.ok ? 'Richtig' : 'Daneben'}
          {last.text ? ` · ${last.text}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  prompt: { ...type.deck, color: color.ink.max },

  stage: { minHeight: 168, justifyContent: 'center' },
  card: {
    minHeight: 140,
    justifyContent: 'center',
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  cardIdle: { opacity: 0.55 },
  statement: { ...type.body, fontSize: 18, lineHeight: 27, color: color.ink.high },

  hint: { position: 'absolute', top: 12, zIndex: 2 },
  hintLeft: { left: 14 },
  hintRight: { right: 14 },
  hintText: { ...type.label, fontSize: 13, letterSpacing: 2 },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { ...type.mono, color: color.ink.low },
  instruction: { ...type.meta, color: color.ink.low, letterSpacing: 1 },

  feedback: { ...type.body, fontSize: 15 },

  summary: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  score: { ...type.display, fontSize: 64, lineHeight: 68, letterSpacing: -2 },
  scoreTotal: { fontSize: 32, color: color.ink.low },
  scoreLabel: { ...type.meta, color: color.ink.mid },
});
