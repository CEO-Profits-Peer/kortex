import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { haptics } from '@/lib/haptics';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Template "branch_choice" - entscheiden, Folge sehen, weiter entscheiden.
 *
 * Für Themen, bei denen es keine eine richtige Antwort gibt: Ethik,
 * Wirtschaftspolitik, Verhandlungen, Ressourcenverteilung. Ein
 * Multiple-Choice-Quiz würde hier so tun, als gäbe es eine, und damit das
 * Thema verfälschen.
 *
 * Deshalb bewertet dieses Template auch nicht mit richtig/falsch, sondern
 * mit outcome_quality: good, mixed, poor. Der Nutzer sieht den Pfad, den er
 * genommen hat, und kann ihn nochmal anders gehen.
 */

export type BranchNode = {
  id: string;
  text: string;
  is_terminal?: boolean;
  outcome_quality?: 'good' | 'mixed' | 'poor';
  choices?: { label: string; next: string; consequence?: string }[];
};

export type BranchData = {
  scenario: string;
  start: string;
  nodes: BranchNode[];
};

const QUALITY: Record<string, { label: string; color: string }> = {
  good: { label: 'Gut gelöst', color: '#7CFF6B' },
  mixed: { label: 'Gemischtes Ergebnis', color: '#FFD84D' },
  poor: { label: 'Teuer erkauft', color: '#FF5C7A' },
};

export function BranchChoice({
  data,
  onSolved,
}: {
  data: BranchData;
  onSolved?: (good: boolean) => void;
}) {
  const [path, setPath] = useState<string[]>([data.start]);
  const [trail, setTrail] = useState<string[]>([]);

  const byId = (id: string) => data.nodes.find((n) => n.id === id);
  const current = byId(path[path.length - 1]);

  if (!current) return null;

  const choose = (nextId: string, consequence?: string) => {
    haptics.light();
    if (consequence) setTrail((t) => [...t, consequence]);
    setPath((p) => [...p, nextId]);
    const next = byId(nextId);
    if (next?.is_terminal) onSolved?.(next.outcome_quality === 'good');
  };

  const restart = () => {
    haptics.select();
    setPath([data.start]);
    setTrail([]);
  };

  const quality = current.is_terminal
    ? QUALITY[current.outcome_quality ?? 'mixed']
    : null;

  return (
    <View style={styles.root}>
      <Text style={styles.scenario}>{data.scenario}</Text>

      {/* Der eigene Pfad bleibt sichtbar - sonst weiss am Ende niemand mehr,
          welche Entscheidung wohin geführt hat. */}
      {trail.length > 0 ? (
        <View style={styles.trail}>
          {trail.map((step, i) => (
            <Animated.View key={i} entering={FadeInDown.duration(180)} style={styles.trailRow}>
              <View style={styles.trailDot} />
              <Text style={styles.trailText}>{step}</Text>
            </Animated.View>
          ))}
        </View>
      ) : null}

      <Animated.View layout={Layout.springify().damping(18)} style={styles.node}>
        <Text style={styles.nodeText}>{current.text}</Text>
      </Animated.View>

      {current.is_terminal ? (
        <View style={styles.outcome}>
          <Text style={[styles.quality, { color: quality?.color }]}>{quality?.label}</Text>
          <Button label="Anders entscheiden" variant="ghost" onPress={restart} />
        </View>
      ) : (
        <View style={styles.choices}>
          {(current.choices ?? []).map((c, i) => (
            <Pressable
              key={i}
              onPress={() => choose(c.next, c.consequence)}
              style={({ pressed }) => [styles.choice, pressed && styles.choicePressed]}
            >
              <Text style={styles.choiceText}>{c.label}</Text>
              <Text style={styles.chevron}>→</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  scenario: { ...type.deck, color: color.ink.max },

  trail: { gap: space.xs, paddingLeft: space.xs },
  trailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  trailDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: color.ink.low,
  },
  trailText: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.low, flex: 1 },

  node: {
    padding: space.lg,
    borderRadius: radius.md,
    borderLeftWidth: 2,
    borderLeftColor: color.signal.primary,
    backgroundColor: color.bgElevated,
  },
  nodeText: { ...type.body, fontSize: 16, color: color.ink.high },

  choices: { gap: space.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  choicePressed: { borderColor: color.signal.primary },
  choiceText: { ...type.body, fontSize: 15, color: color.ink.high, flex: 1 },
  chevron: { fontSize: 15, color: color.ink.low },

  outcome: { gap: space.sm },
  quality: { ...type.label, fontSize: 16 },
});
