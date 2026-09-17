import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';

import { ZWEI, facette, goldVerlauf } from '@/theme/design';
import { color, motion, radius, type } from '@/theme/tokens';

type Variant = 'primary' | 'ghost' | 'quiet';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Druck-Physik.
 *
 * Ein Knopf, der beim Antippen nur die Deckkraft aendert, fuehlt sich nach
 * Webseite an. Einer, der unter dem Finger nachgibt und beim Loslassen
 * zurueckfedert, fuehlt sich nach App an.
 *
 * Runter mit withTiming (sofort), hoch mit withSpring (traege, lebendig).
 * Die Asymmetrie ist Absicht - echte Objekte verhalten sich so.
 */

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  accent,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  busy?: boolean;
  disabled?: boolean;
  /** Ueberschreibt die Signalfarbe, z.B. mit der Kategoriefarbe */
  accent?: string;
  style?: ViewStyle;
}) {
  const tint = accent ?? color.signal.primary;
  const off = disabled || busy;

  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.03 }],
    opacity: 1 - press.value * 0.14,
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        if (!off) press.value = withTiming(1, { duration: motion.instant });
      }}
      onPressOut={() => {
        press.value = withSpring(0, motion.spring);
      }}
      onPress={() => {
        if (off) return;
        haptics.light();
        onPress();
      }}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={[
        styles.base,
        variant === 'primary' && { backgroundColor: tint },
        // Design 2.0: Gold als Verlauf - aber nur, wenn keine eigene
        // Farbe (Kategorie, Mastery) gesetzt ist.
        variant === 'primary' && !accent ? goldVerlauf() : null,
        variant === 'ghost' &&
          (ZWEI
            ? { backgroundColor: color.bgElevated }
            : { borderWidth: StyleSheet.hairlineWidth, borderColor: color.ink.faint }),
        off && styles.off,
        animated,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? color.bg : tint} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'primary' ? { color: color.bg } : { color: color.ink.high },
            variant === 'quiet' && { color: color.ink.mid },
          ]}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    ...facette(9),
  },
  off: { opacity: 0.45 },
  label: { ...type.label, fontSize: 16 },
});
