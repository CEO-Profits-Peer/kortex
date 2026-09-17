import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';

import { track } from '@/lib/eventBuffer';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Quellen-Badge.
 *
 * Wir zeigen ALLE Quellen, nicht nur eine — bei Multi-Source-Synthese sind
 * das oft drei bis fuenf. Das ist gleichzeitig die rechtliche Absicherung
 * (Traffic-Zubringer statt Konkurrent, siehe docs/CONTENT-SOURCING.md) und
 * der Vertrauensanker der App: die Quelle ist immer einen Tap entfernt.
 */

type Props = {
  contentId: string;
  sources: { id: string; name: string; url: string }[];
};

export function SourceBadge({ contentId, sources }: Props) {
  if (sources.length === 0) return null;

  const open = async (url: string, sourceId: string) => {
    haptics.light();
    track(contentId, 'source_open', { payload: { source_id: sourceId } });
    analytics.sourceOpened(sourceId);
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: color.akzent,
      toolbarColor: color.bgElevated,
      enableBarCollapsing: true,
    });
  };

  return (
    <View style={styles.row}>
      {sources.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => open(s.url, s.id)}
          hitSlop={8}
          style={({ pressed }) => [styles.badge, pressed && styles.badgePressed]}
          accessibilityRole="link"
          accessibilityLabel={`Original bei ${s.name} öffnen`}
        >
          <Text style={styles.label} numberOfLines={1}>
            {s.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  badgePressed: { borderColor: color.akzent, opacity: 0.85 },
  label: { ...type.meta, color: color.ink.mid },
});
