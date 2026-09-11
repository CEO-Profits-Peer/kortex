import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { onReward, type Reward } from '@/lib/rewards';
import { color, motion, radius, space, type } from '@/theme/tokens';

/**
 * Die Schicht, auf der Belohnungen erscheinen.
 *
 * Liegt einmal ueber der ganzen App und faengt alles ab, was lib/rewards.ts
 * meldet. Keine Karte, kein Bildschirm muss davon etwas wissen.
 *
 * Drei Regeln, die verhindern, dass daraus Konfetti-Kitsch wird:
 *
 * 1. **Nichts blockiert.** pointerEvents="none" auf allem. Wer weiterwischen
 *    will, waehrend eine Zahl hochfliegt, wischt weiter. Eine Belohnung, die
 *    man wegtippen muss, ist eine Strafe.
 *
 * 2. **Oben, nicht mittig.** Die Mitte gehoert dem Inhalt. Die Zahl steigt
 *    dorthin, wo im Profil auch die Punkte stehen - die Bewegung erklaert,
 *    wohin das Ganze fliesst.
 *
 * 3. **Kurz.** Neunhundert Millisekunden, dann ist es weg. Wer drei Aufgaben
 *    schnell hintereinander loest, soll drei Zahlen sehen und keine Warteschlange.
 */

type Flying = { id: number; kind: 'xp' | 'mastery' | 'text'; label: string };

let nextId = 1;

function FlyingChip({ item, onDone }: { item: Flying; onDone: (id: number) => void }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: 900 }, (finished) => {
      if (finished) runOnJS(onDone)(item.id);
    });
  }, [item.id, onDone, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value < 0.15 ? p.value / 0.15 : 1 - Math.max(0, (p.value - 0.6) / 0.4),
    transform: [
      { translateY: -46 * p.value },
      // Kurz ueber die Zielgroesse hinaus: das liest sich als Aufschlag,
      // nicht als Einblendung.
      { scale: 0.86 + 0.22 * Math.min(1, p.value * 4) - 0.08 * p.value },
    ],
  }));

  const tint =
    item.kind === 'mastery' ? color.signal.mastery
    : item.kind === 'xp' ? color.signal.primary
    : color.ink.max;

  return (
    <Animated.View style={[styles.chip, { borderColor: tint }, style]} pointerEvents="none">
      {item.kind !== 'text' ? (
        <Icon name={item.kind === 'mastery' ? 'mastery' : 'xp'} size={14} color={tint} />
      ) : null}
      <Text style={[styles.chipText, { color: tint }]}>{item.label}</Text>
    </Animated.View>
  );
}

function ComboBadge({ count, at }: { count: number; at: number }) {
  const p = useSharedValue(0);

  useEffect(() => {
    // Anspringen, halten, verschwinden. Das Halten ist wichtig: eine Serie
    // will man kurz ansehen koennen.
    p.value = withSequence(
      withSpring(1, motion.spring),
      withDelay(1100, withTiming(0, { duration: motion.base })),
    );
  }, [at, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.8 + 0.2 * p.value }, { translateY: (1 - p.value) * 8 }],
  }));

  // Die Farbe steigt mit der Serie. Erst Cyan, ab acht Mastery-Violett,
  // ab zwoelf Lime - man sieht am Rand, wie gut es gerade laeuft, ohne die
  // Zahl zu lesen.
  const tint =
    count >= 12 ? color.signal.success
    : count >= 8 ? color.signal.mastery
    : color.signal.primary;

  return (
    <Animated.View style={[styles.combo, { borderColor: tint }, style]} pointerEvents="none">
      <Text style={[styles.comboCount, { color: tint }]}>{count}×</Text>
      <Text style={styles.comboLabel}>richtig in Folge</Text>
    </Animated.View>
  );
}

export function RewardLayer() {
  const insets = useSafeAreaInsets();
  const [flying, setFlying] = useState<Flying[]>([]);
  const [combo, setCombo] = useState<{ count: number; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drop = useCallback((id: number) => {
    setFlying((prev) => prev.filter((f) => f.id !== id));
  }, []);

  useEffect(() => {
    const off = onReward((r: Reward) => {
      if (r.kind === 'combo') {
        setCombo({ count: r.count, at: Date.now() });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCombo(null), 1700);
        return;
      }
      const label =
        r.kind === 'xp' ? `+${r.amount} XP`
        : r.kind === 'mastery' ? `+${r.amount}`
        : r.text;
      setFlying((prev) => {
        // Hoechstens vier gleichzeitig. Mehr ist keine Belohnung mehr,
        // sondern ein Stau.
        const next = [...prev, { id: nextId++, kind: r.kind, label }];
        return next.slice(-4);
      });
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <View style={[styles.root, { top: insets.top + 8 }]} pointerEvents="none">
      {combo ? <ComboBadge count={combo.count} at={combo.at} /> : null}
      <View style={styles.stack} pointerEvents="none">
        {flying.map((f) => (
          <FlyingChip key={f.id} item={f} onDone={drop} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: space.sm,
    zIndex: 50,
  },
  stack: { alignItems: 'center', gap: 4 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: color.overlay,
  },
  chipText: { ...type.mono, fontSize: 13 },

  combo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: color.overlay,
  },
  comboCount: { ...type.title, fontSize: 19 },
  comboLabel: { ...type.meta, color: color.ink.mid },
});
