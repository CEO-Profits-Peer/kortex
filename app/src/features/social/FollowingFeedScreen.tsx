import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { personName } from '@/lib/name';
import { api } from '@/lib/supabase';
import type { FollowingItem } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Was die Leute empfohlen haben, denen ich folge.
 *
 * Bewusst NUR Reposts, keine Likes: ein Repost ist eine bewusste Empfehlung,
 * ein Like eine private Regung. Einen Feed aus Likes zu bauen würde Leute
 * dazu bringen, ihr Like-Verhalten zu inszenieren — und damit das Signal
 * zerstören, das der Feed-Algorithmus daraus liest.
 *
 * Kein unendliches Nachladen: wer 30 Empfehlungen gelesen hat, hat gesehen,
 * was seine Leute empfehlen. Danach führt der Weg zurück in den Feed.
 */

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `vor ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}

export function FollowingFeedScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FollowingItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.followingFeed(30));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht geladen werden');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (items === null) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={color.ink.low}
          />
        }
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={15} color={color.ink.mid} />
          <Text style={styles.backText}>zurück</Text>
        </Pressable>

        <View>
          <Text style={styles.pageTitle}>Von deinen Leuten</Text>
          <Text style={styles.pageSub}>
            Empfehlungen der Personen, denen du folgst. Likes bleiben privat.
          </Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {error ??
                'Noch nichts hier. Folge jemandem über die Suche — tipp einen Namen mit @ ein.'}
            </Text>
            <Button label="Zur Suche" variant="ghost" onPress={() => router.push('/search')} />
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((it) => (
              <View key={`${it.handle}-${it.content_id}`} style={styles.card}>
                <Pressable
                  onPress={() => router.push(`/u/${encodeURIComponent(it.handle)}`)}
                  style={styles.who}
                >
                  <Avatar seed={it.avatar_seed} path={it.avatar_path} size={30} />
                  <Text style={styles.handle} numberOfLines={1}>
                    {personName(it)}
                  </Text>
                  <Text style={styles.when}>{timeAgo(it.at)}</Text>
                </Pressable>

                {it.comment ? <Text style={styles.comment}>„{it.comment}"</Text> : null}

                <Pressable
                  onPress={() => router.push(`/category/${encodeURIComponent(it.category)}`)}
                  style={({ pressed }) => [styles.ref, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.refBody}>
                    <Text style={styles.refTitle} numberOfLines={2}>
                      {it.title}
                    </Text>
                    {it.deck ? (
                      <Text style={styles.refDeck} numberOfLines={1}>
                        {it.deck}
                      </Text>
                    ) : null}
                    <Text style={styles.refMeta}>#{it.category.split('.').pop()}</Text>
                  </View>
                  <Icon name="chevron" size={14} color={color.ink.low} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  back: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: space.xs },
  backText: { ...type.meta, color: color.ink.mid },

  pageTitle: { ...type.display, fontSize: 28, lineHeight: 34, color: color.ink.max },
  pageSub: { ...type.body, fontSize: 14, color: color.ink.mid, marginTop: space.xs },

  list: { gap: space.md },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  handle: { ...type.label, color: color.ink.high, flex: 1 },
  when: { ...type.meta, color: color.ink.low },

  comment: { ...type.body, fontSize: 15, color: color.signal.primary, fontStyle: 'italic' },

  ref: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
  },
  refBody: { flex: 1, gap: 2 },
  refTitle: { ...type.body, fontSize: 15, color: color.ink.high },
  refDeck: { ...type.meta, color: color.ink.mid },
  refMeta: { ...type.meta, color: color.ink.low },

  empty: { gap: space.lg, paddingTop: space.xl },
  emptyText: { ...type.body, fontSize: 15, color: color.ink.mid },
});
