import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { feedback } from '@/lib/feedback';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Template "fill_blank" - das fehlende Wort einsetzen.
 *
 * Das billigste Template im Bestand und trotzdem eines der nützlichsten:
 * Es prüft, ob jemand die genaue Aussage verstanden hat, nicht nur das
 * Thema wiedererkennt. Und die Pipeline kann es aus fast jedem Satz mit
 * einer Zahl oder einem Fachbegriff erzeugen.
 *
 * Kein reveal_after_ms: Der Satz IST der Kontext, hier gibt es nichts,
 * was man vorher lesen müsste.
 */

export type FillBlankData = {
  sentence_before: string;
  sentence_after: string;
  options: string[];
  correct_index: number;
  explanation?: string;
};

export function FillBlank({
  data,
  onSolved,
}: {
  data: FillBlankData;
  onSolved?: (correct: boolean) => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);
  const done = chosen !== null;
  const correct = chosen === data.correct_index;

  const pick = (i: number) => {
    if (done) return;
    setChosen(i);
    i === data.correct_index ? feedback.correct() : feedback.wrong();
    onSolved?.(i === data.correct_index);
  };

  const tint = !done
    ? color.signal.primary
    : correct
      ? color.signal.success
      : color.signal.error;

  return (
    <View style={styles.root}>
      <Text style={styles.sentence}>
        {data.sentence_before}
        <Text style={[styles.blank, { color: tint, borderBottomColor: tint }]}>
          {done ? ` ${data.options[chosen]} ` : '  ______  '}
        </Text>
        {data.sentence_after}
      </Text>

      <View style={styles.options}>
        {data.options.map((opt, i) => {
          const isChosen = chosen === i;
          const isAnswer = done && i === data.correct_index;
          return (
            <Pressable
              key={i}
              onPress={() => pick(i)}
              disabled={done}
              style={[
                styles.option,
                isAnswer && { borderColor: color.signal.success, borderWidth: 1.5 },
                isChosen && !correct && { borderColor: color.signal.error, borderWidth: 1.5 },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  isAnswer && { color: color.signal.success },
                  isChosen && !correct && { color: color.signal.error },
                ]}
              >
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {done && data.explanation ? (
        <Animated.Text entering={FadeIn.duration(150)} style={styles.explanation}>
          {data.explanation}
        </Animated.Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  sentence: { ...type.deck, fontSize: 19, lineHeight: 30, color: color.ink.high },
  blank: {
    ...type.deck,
    fontSize: 19,
    fontWeight: '700',
    borderBottomWidth: 1.5,
  },

  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  optionText: { ...type.body, fontSize: 16, color: color.ink.high },

  explanation: { ...type.body, fontSize: 15, color: color.ink.mid },
});
