import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Button } from '@/components/Button';
import { Slider } from '@/components/Slider';
import { feedback } from '@/lib/feedback';
import { color, space, type } from '@/theme/tokens';

/**
 * Template "estimate_slider" - schätzen statt ankreuzen.
 *
 * Der Lerneffekt entsteht nicht durch die richtige Antwort, sondern durch
 * die eigene Fehleinschätzung. Wer erst tippt und dann sieht, wie weit er
 * danebenlag, behält die Zahl. Wer sie nur liest, nicht.
 *
 * Die Regler-Mechanik steckt in components/Slider.tsx - dort ist auch
 * beschrieben, warum sie einen einzigen Wahrheitsträger hat.
 */

export type EstimateData = {
  question: string;
  min: number;
  max: number;
  step?: number;
  answer: number;
  tolerance_pct?: number;
  unit: string;
  log_scale?: boolean;
  reveal_text?: string;
  reveal_after_ms?: number;
};

function format(value: number): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return rounded.toLocaleString('de-DE');
}

export function EstimateSlider({
  data,
  onSolved,
}: {
  data: EstimateData;
  onSolved?: (correct: boolean) => void;
}) {
  const { min, max, step = 1, answer, unit } = data;
  const tolerance = (data.tolerance_pct ?? 15) / 100;

  // Die Ergebniszahl ist der größte Block. Auf einem kompakten Gerät frisst
  // sie sonst den Platz, den der Regler braucht.
  const { height: screenH } = useWindowDimensions();
  const valueSize = screenH < 700 ? 34 : screenH < 820 ? 42 : 50;

  const [value, setValue] = useState(() => {
    // Auf ein Vielfaches der Schrittweite runden, sonst springt der Regler
    // beim ersten Antippen.
    const mid = (min + max) / 2;
    return Math.min(max, Math.max(min, Math.round(mid / step) * step));
  });
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), data.reveal_after_ms ?? 2000);
    return () => clearTimeout(t);
  }, [data.reveal_after_ms]);

  const off = Math.abs(value - answer) / (Math.abs(answer) || 1);
  const correct = off <= tolerance;
  const tint = done ? (correct ? color.signal.success : color.signal.error) : color.signal.primary;

  const submit = () => {
    if (!armed) return feedback.blocked();
    setDone(true);
    correct ? feedback.correct() : feedback.wrong();
    onSolved?.(correct);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.question} numberOfLines={3}>
        {data.question}
      </Text>

      <View style={styles.readout}>
        <Text
          style={[styles.value, { color: tint, fontSize: valueSize, lineHeight: valueSize + 4 }]}
          numberOfLines={1}
        >
          {format(value)}
        </Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>

      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={setValue}
        locked={!armed || done}
        tint={tint}
        markerValue={done ? answer : undefined}
        format={format}
      />

      {done ? (
        <View style={styles.result}>
          <Text style={[styles.verdict, { color: tint }]}>
            {correct ? 'Gut geschätzt' : 'Daneben'} · tatsächlich {format(answer)} {unit}
          </Text>
          {data.reveal_text ? (
            <Text style={styles.reveal} numberOfLines={3}>
              {data.reveal_text}
            </Text>
          ) : null}
        </View>
      ) : (
        <Button label={armed ? 'Schätzung abgeben' : 'Lies zuerst die Frage …'} onPress={submit} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  question: { ...type.deck, color: color.ink.max },

  readout: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  value: { ...type.display, letterSpacing: -1.5 },
  unit: { ...type.label, color: color.ink.mid },

  result: { gap: space.xs },
  verdict: { ...type.label, fontSize: 15 },
  reveal: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.mid },
});
