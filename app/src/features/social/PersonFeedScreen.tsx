import { router } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { FeedScreen } from '@/features/feed/FeedScreen';
import { api } from '@/lib/supabase';
import type { ContentItem } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Der Feed, der bei einer bestimmten Karte anfaengt.
 *
 * Erreicht man, indem man im Profil einer Person auf einen Repost oder ein
 * Like tippt. Vorher fuehrte derselbe Tipp in die KATEGORIE der Karte - was
 * die Frage "was hat diese Person empfohlen?" mit "was gibt es sonst noch
 * zu diesem Thema?" beantwortete. Zwei verschiedene Fragen.
 *
 * Die Reihenfolge ist der ganze Sinn:
 *
 *   1. die angetippte Karte
 *   2. die uebrigen Empfehlungen dieser Person
 *   3. danach der normale Feed
 *
 * Punkt 3 ist der wichtige. Ohne ihn endet das Wischen irgendwann im Nichts,
 * und ein Feed, der aufhoert, ist kaputt. Deshalb faellt der Lader still auf
 * `api.feed()` zurueck, sobald die Person nichts mehr beigetragen hat - der
 * Nutzer merkt den Uebergang nicht, und genau so soll es sein.
 */
export function PersonFeedScreen({
  startId,
  handle,
}: {
  startId: string;
  handle?: string;
}) {
  const insets = useSafeAreaInsets();

  /**
   * Ob die Karten der Person schon durch sind.
   *
   * In einer Ref, nicht im State: eine Zustandsaenderung hier wuerde den
   * FeedScreen neu aufbauen und das Scrollen zuruecksetzen. Der Lader
   * braucht die Information, die Anzeige nicht.
   */
  const personExhausted = useRef(false);
  const seen = useRef<Set<string>>(new Set());

  const loader = useCallback(
    async (batchSize: number): Promise<ContentItem[]> => {
      if (!personExhausted.current && handle) {
        try {
          const items = await api.personFeed(handle, seen.current.size === 0 ? startId : undefined);
          const fresh = items.filter((i) => !seen.current.has(i.id));
          fresh.forEach((i) => seen.current.add(i.id));
          // Weniger als angefragt heisst: das war alles, was diese Person hat.
          if (fresh.length > 0) {
            if (fresh.length < batchSize) personExhausted.current = true;
            return fresh;
          }
          personExhausted.current = true;
        } catch {
          // Profil geloescht, Handle geaendert - dann eben der normale Feed.
          personExhausted.current = true;
        }
      }

      // Ohne Handle (direkter Link auf eine Karte) oder wenn die Person
      // durch ist: der gewoehnliche Feed, aber ohne Wiederholungen von dem,
      // was gerade schon gezeigt wurde.
      const rest = await api.getFeed(batchSize);
      const fresh = rest.filter((i) => !seen.current.has(i.id));
      fresh.forEach((i) => seen.current.add(i.id));
      return fresh;
    },
    [handle, startId],
  );

  return (
    <View style={styles.fill}>
      <FeedScreen
        loader={loader}
        withCheckpoint={false}
        reserveBottom={0}
        emptyTitle="Diese Karte gibt es nicht mehr"
        emptyBody="Sie wurde zurückgezogen oder ist abgelaufen."
      />

      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={[styles.back, { top: insets.top + space.md }]}
        accessibilityLabel="Zurück"
      >
        <Icon name="back" size={18} color={color.ink.high} />
        {handle ? <Text style={styles.backText}>@{handle}</Text> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: {
    position: 'absolute',
    left: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: color.overlay,
  },
  backText: { ...type.mono, fontSize: 12, color: color.ink.high },
});
