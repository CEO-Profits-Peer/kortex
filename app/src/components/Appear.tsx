import React, { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

/**
 * Einblenden, das sich auf Bewegung verlassen kann.
 *
 * Reanimated bringt fuer sowas `entering={FadeInDown}` mit, und in der Karte
 * wird das auch benutzt. Hier nicht: der eingeblendete Block steckt in einem
 * Elternteil mit `layout`-Animation, und zwei ineinander verschachtelte
 * Layout-Animationen sind eine Wette darauf, welche zuerst fertig wird -
 * im Web beginnt eine Einblendung mit `visibility: hidden`, und wer die
 * wieder einschaltet, ist dann nicht mehr eindeutig.
 *
 * Hier wird deshalb kein Layout-Animationssystem bemueht, sondern schlicht
 * ein Stil animiert: Deckkraft und ein paar Pixel Versatz. Das kann von
 * keiner Eltern-Animation abgeraeumt werden.
 *
 * Beim Wechsel der Kategorie wird ueber `key` neu eingehaengt, damit die
 * Bewegung erneut laeuft.
 */
export function Appear({
  delay = 0,
  distance = 8,
  style,
  children,
}: {
  delay?: number;
  /** Wie weit von unten hereingeschoben wird. 0 = reines Aufblenden. */
  distance?: number;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  const p = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    p.value = reduceMotion
      ? 1
      : withDelay(delay, withTiming(1, { duration: motion.fast }));
  }, [delay, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * distance }],
  }));

  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
