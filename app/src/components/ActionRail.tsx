import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { color, motion, radius, space, type } from '@/theme/tokens';

/**
 * Die Aktionsleiste am rechten Rand.
 *
 * Senkrecht statt waagrecht, weil der Daumen dort von selbst liegt, wenn man
 * einhändig wischt — dieselbe Stelle wie bei jedem Feed, den die Zielgruppe
 * kennt. Waagrecht unten wäre eine Umgewöhnung ohne Gegenwert.
 *
 * Vier Aktionen, mehr nicht. Jede weitere macht die Leiste zu einem Menü,
 * und ein Menü liest niemand während des Wischens.
 *
 * Vorlesen steht ganz oben, nicht unten. Es ist die einzige Aktion, die man
 * VOR dem Lesen braucht — alle anderen kommen danach.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function RailButton({
  icon,
  label,
  active,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  tint: string;
  onPress: () => void;
}) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.12 }],
  }));

  return (
    <View style={styles.item}>
      <AnimatedPressable
        onPressIn={() => {
          press.value = withTiming(1, { duration: motion.instant });
        }}
        onPressOut={() => {
          press.value = withSpring(0, motion.spring);
        }}
        onPress={() => {
          haptics.light();
          onPress();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.button, active && { borderColor: tint }, animated]}
      >
        <Icon name={icon} size={21} color={active ? tint : color.ink.mid} />
      </AnimatedPressable>
      <Text style={[styles.label, active && { color: tint }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ActionRail({
  liked,
  reposted,
  speaking,
  tint,
  categoryLabel,
  onLike,
  onRepost,
  onShare,
  onSurf,
  onListen,
}: {
  liked: boolean;
  reposted: boolean;
  speaking: boolean;
  tint: string;
  categoryLabel?: string;
  onLike: () => void;
  onRepost: () => void;
  onShare: () => void;
  onSurf: () => void;
  onListen: () => void;
}) {
  return (
    <View style={styles.rail} pointerEvents="box-none">
      <RailButton
        icon={speaking ? 'listening' : 'listen'}
        label={speaking ? 'Stopp' : 'Hören'}
        active={speaking}
        tint={tint}
        onPress={onListen}
      />
      <RailButton
        icon={liked ? 'like-filled' : 'like'}
        label={liked ? 'geliked' : 'Like'}
        active={liked}
        tint={tint}
        onPress={onLike}
      />
      {/* Repost steht zwischen Like und Teilen: Like ist privat, Teilen
          verlaesst die App, Repost ist das oeffentliche Signal dazwischen. */}
      <RailButton
        icon="refresh"
        label={reposted ? 'empfohlen' : 'Repost'}
        active={reposted}
        tint={tint}
        onPress={onRepost}
      />
      <RailButton icon="share" label="Teilen" tint={tint} onPress={onShare} />
      {categoryLabel ? (
        <RailButton
          icon="search"
          label={`#${categoryLabel}`}
          tint={tint}
          onPress={onSurf}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    gap: space.lg,
    alignItems: 'center',
  },
  item: { alignItems: 'center', gap: 4, maxWidth: 68 },
  button: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...type.meta, fontSize: 9.5, color: color.ink.low, textAlign: 'center' },
});
