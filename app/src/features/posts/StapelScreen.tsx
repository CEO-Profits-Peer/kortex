import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { FeedScreen } from '@/features/feed/FeedScreen';
import { fehlerText } from '@/lib/fehler';
import { api } from '@/lib/supabase';
import type { ContentItem, StapelDaten } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Einen Karten-Stapel durchwischen (0088).
 *
 * Derselbe Feed wie ueberall, nur mit genau diesen Karten in genau dieser
 * Reihenfolge - ab der angetippten. Danach ist Schluss: ein Stapel ist eine
 * Auswahl, und wer "die 5 besten zu KI" teilt, will nicht, dass danach
 * irgendetwas anderes kommt.
 */
export function StapelScreen({ postId, start = 0 }: { postId: string; start?: number }) {
  const insets = useSafeAreaInsets();
  const [ids, setIds] = useState<string[] | null>(null);
  const [wer, setWer] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const geliefert = useRef(false);

  useEffect(() => {
    void api
      .postDetail(postId)
      .then((d) => {
        if (d.gesperrt || d.post.art !== 'stapel' || !d.post.daten) {
          setFehler(d.gesperrt ? `Diesen Stapel sehen nur Leute, die @${d.wer.handle} folgen.` : 'Das ist kein Stapel.');
          return;
        }
        const karten = (d.post.daten as StapelDaten).karten ?? [];
        const alle = karten.map((k) => k.content_id);
        setIds([...alle.slice(start), ...alle.slice(0, start)]);
        setWer(d.post.wer.handle);
      })
      .catch((e) => setFehler(fehlerText(e, 'Stapel nicht ladbar')));
  }, [postId, start]);

  const loader = useCallback(async (): Promise<ContentItem[]> => {
    if (geliefert.current || !ids) return [];
    geliefert.current = true;
    return api.contentByIds(ids);
  }, [ids]);

  const zurueck = (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={[styles.zurueck, { top: insets.top + space.md }]}
      accessibilityLabel="Zurück"
    >
      <Icon name="back" size={18} color={color.ink.high} />
      <Text style={styles.zurueckText}>
        {wer ? `Stapel · @${wer}` : 'Stapel'}
        {ids ? ` · ${ids.length}` : ''}
      </Text>
    </Pressable>
  );

  if (!ids) {
    return (
      <GridBackground>
        <View style={styles.mitte}>
          {fehler ? <Text style={styles.fehler}>{fehler}</Text> : <ActivityIndicator color={color.signal.primary} />}
        </View>
        {zurueck}
      </GridBackground>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FeedScreen
        loader={loader}
        withCheckpoint={false}
        reserveBottom={0}
        emptyTitle="Die Karten gibt es nicht mehr"
        emptyBody="Sie wurden zurückgezogen."
      />
      {zurueck}
    </View>
  );
}

const styles = StyleSheet.create({
  mitte: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  fehler: { ...type.body, color: color.ink.mid, textAlign: 'center' },
  zurueck: {
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
  zurueckText: { ...type.mono, fontSize: 12, color: color.ink.high },
});
