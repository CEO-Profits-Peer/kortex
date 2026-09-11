import React, { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { color, motion, space, type } from '@/theme/tokens';

/**
 * Ein Regler, ein Wahrheitsträger.
 *
 * DER FEHLER, DEN DAS BEHEBT:
 * Vorher gab es zwei Zustände nebeneinander — eine Pixelposition für den
 * Knopf und einen Zahlenwert für die Anzeige. Beide wurden getrennt
 * fortgeschrieben. Sobald die Breite erst nach dem ersten Rendern ankam
 * (Breite 0 → Verhältnis 0/1 → Wert sprang auf das Maximum), liefen sie
 * auseinander: Anzeige „100 %", Knopf ganz links.
 *
 * Jetzt gibt es nur noch das Verhältnis 0…1. Position, Füllung und Zahl
 * werden alle daraus abgeleitet. Eine Breitenänderung kann nichts mehr
 * kaputt machen, weil in Pixeln nichts gespeichert wird.
 *
 * Und die Geometrie stimmt: bei 0 ist die Schiene leer, bei 1 voll — mit
 * beidseitig um KNOB/2 eingerückter Schiene erreicht der Knopf tatsächlich
 * beide Enden.
 */

const KNOB = 30;
const TRACK = 4;

export type SliderProps = {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  /** Sperrt die Bedienung, ohne den Regler auszugrauen */
  locked?: boolean;
  tint?: string;
  /** Zweite Markierung, z.B. die richtige Antwort nach dem Abgeben */
  markerValue?: number;
  markerColor?: string;
  format?: (n: number) => string;
};

export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  locked,
  tint = color.signal.primary,
  markerValue,
  markerColor = color.signal.success,
  format = (n) => String(n),
}: SliderProps) {
  const [width, setWidth] = useState(0);
  const span = Math.max(1e-9, max - min);
  const usable = Math.max(width - KNOB, 1);

  // Einziger Zustand: das Verhältnis. Alles andere ist davon abgeleitet.
  const ratio = useSharedValue((value - min) / span);
  const startRatio = useSharedValue(0);

  // Von aussen gesetzte Werte übernehmen (z.B. Zurücksetzen).
  useEffect(() => {
    ratio.value = clamp((value - min) / span, 0, 1);
  }, [value, min, span, ratio]);

  const commit = useCallback(
    (r: number) => {
      const raw = min + r * span;
      const snapped = Math.round(raw / step) * step;
      const bounded = Math.min(max, Math.max(min, snapped));
      if (bounded !== value) onChange(bounded);
    },
    [min, max, span, step, value, onChange],
  );

  const pan = Gesture.Pan()
    .enabled(!locked)
    // Nur waagrecht greifen, damit der Feed weiter senkrecht wischen kann.
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      startRatio.value = ratio.value;
    })
    .onUpdate((e) => {
      ratio.value = clamp(startRatio.value + e.translationX / usable, 0, 1);
      runOnJS(commit)(ratio.value);
    })
    .onFinalize(() => {
      runOnJS(haptics.selectFromWorklet)();
    });

  // Antippen springt hin - schneller als ziehen, wenn man weit muss.
  const tap = Gesture.Tap()
    .enabled(!locked)
    .onEnd((e) => {
      const r = clamp((e.x - KNOB / 2) / usable, 0, 1);
      ratio.value = withSpring(r, motion.spring);
      runOnJS(commit)(r);
      runOnJS(haptics.selectFromWorklet)();
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: ratio.value * usable }],
  }));

  // Füllung endet exakt in der Knopfmitte: bei 0 leer, bei 1 voll.
  const fillStyle = useAnimatedStyle(() => ({ width: ratio.value * usable }));

  const markerLeft =
    markerValue != null && width > 0
      ? KNOB / 2 + clamp((markerValue - min) / span, 0, 1) * usable - 1
      : null;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* Derselbe Grund wie bei der Wischkarte: der Regler nimmt die
          waagrechte Bewegung, das senkrechte Scrollen bleibt beim Feed. */}
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)} touchAction="pan-y">
        <View style={styles.hitArea}>
          <View style={styles.track} />
          <Animated.View style={[styles.fill, { backgroundColor: tint }, fillStyle]} />

          {markerLeft != null ? (
            <View style={[styles.marker, { left: markerLeft, backgroundColor: markerColor }]} />
          ) : null}

          <Animated.View style={[styles.knob, { borderColor: tint }, knobStyle]}>
            <View style={[styles.knobCore, { backgroundColor: tint }]} />
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.bounds}>
        <Text style={styles.bound}>{format(min)}</Text>
        <Text style={styles.bound}>{format(max)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xs },
  hitArea: { height: KNOB + 12, justifyContent: 'flex-start' },

  // Beidseitig um KNOB/2 eingerückt - so deckt der Knopf an beiden Enden
  // exakt das Schienenende ab.
  track: {
    position: 'absolute',
    top: KNOB / 2 - TRACK / 2,
    left: KNOB / 2,
    right: KNOB / 2,
    height: TRACK,
    borderRadius: TRACK,
    backgroundColor: color.ink.faint,
  },
  fill: {
    position: 'absolute',
    top: KNOB / 2 - TRACK / 2,
    left: KNOB / 2,
    height: TRACK,
    borderRadius: TRACK,
  },
  marker: { position: 'absolute', top: KNOB / 2 - 11, width: 2, height: 22, borderRadius: 1 },

  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB,
    borderWidth: 1.5,
    backgroundColor: color.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobCore: { width: 8, height: 8, borderRadius: 4 },

  bounds: { flexDirection: 'row', justifyContent: 'space-between' },
  bound: { ...type.mono, fontSize: 11, color: color.ink.low },
});
