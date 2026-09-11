import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GridBackground } from '@/components/GridBackground';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Platzhalter fuer noch nicht gebaute Tabs.
 *
 * Nennt bewusst die Version, in der der Tab kommt. Ein leerer Screen ohne
 * Erklaerung sieht kaputt aus; einer mit Roadmap-Hinweis sieht nach Plan aus -
 * und beim Testen mit Mitschuelern erspart es zwanzig Mal dieselbe Frage.
 */
export function Placeholder({
  title,
  body,
  milestone,
}: {
  title: string;
  body: string;
  milestone: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <GridBackground>
      <View style={[styles.root, { paddingTop: insets.top + space.xxxl }]}>
        <Text style={styles.tag}>{milestone}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.xl, gap: space.md },
  tag: {
    ...type.meta,
    alignSelf: 'flex-start',
    color: color.signal.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.signal.primary,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  title: { ...type.display, color: color.ink.max },
  body: { ...type.body, color: color.ink.mid, maxWidth: 420 },
});
