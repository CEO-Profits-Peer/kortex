import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { api } from '@/lib/supabase';
import type { PublicProfile, RepostRef } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Profil einer anderen Person.
 *
 * Zeigt Reposts immer, Likes nur wenn die Person das eingeschaltet hat.
 * Diese Unterscheidung ist Absicht und steht auch für den Betrachter da:
 * ein Repost ist eine bewusste Empfehlung, ein Like nicht.
 *
 * Wo nichts steht, steht auch nichts Entschuldigendes — ein leeres Profil
 * ist kein Fehler, sondern jemand, der noch nichts empfohlen hat.
 */

function RefRow({
  item,
  muted,
  handle,
}: {
  item: RepostRef;
  muted?: boolean;
  /** Wessen Profil das ist - damit der Feed danach mit dieser Person weitergeht. */
  handle: string;
}) {
  return (
    <Pressable
      // Direkt auf die Karte, nicht in die Kategorie. Wer hier tippt, will
      // sehen, was diese Person empfohlen hat - und danach mehr davon.
      onPress={() =>
        router.push(
          `/reel/${encodeURIComponent(item.content_id)}?from=${encodeURIComponent(handle)}`,
        )
      }
      style={({ pressed }) => [styles.ref, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.refBody}>
        <Text style={[styles.refTitle, muted && { color: color.ink.mid }]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.comment ? <Text style={styles.refComment}>„{item.comment}"</Text> : null}
        <Text style={styles.refMeta}>#{item.category.split('.').pop()}</Text>
      </View>
      <Icon name="chevron" size={14} color={color.ink.low} />
    </Pressable>
  );
}

export function PublicProfileScreen({ handle }: { handle: string }) {
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'reposts' | 'likes'>('reposts');

  const load = useCallback(async () => {
    try {
      setP(await api.publicProfile(handle));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Profil nicht gefunden');
    }
  }, [handle]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async () => {
    if (!p || p.is_me) return;
    const next = !p.i_follow;
    // Optimistisch: der Knopf soll sofort reagieren, nicht nach 200 ms.
    setP({
      ...p,
      i_follow: next,
      follower_count: Math.max(0, p.follower_count + (next ? 1 : -1)),
    });
    haptics.medium();
    setBusy(true);
    try {
      await api.setFollowing(p.id, next);
    } catch {
      void load(); // zurückrollen über die Wahrheit vom Server
    } finally {
      setBusy(false);
    }
  };

  if (!p) {
    return (
      <GridBackground>
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.errorTitle}>Nicht gefunden</Text>
              <Text style={styles.errorBody}>@{handle}</Text>
              <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
            </>
          ) : (
            <ActivityIndicator color={color.signal.primary} />
          )}
        </View>
      </GridBackground>
    );
  }

  const list = tab === 'reposts' ? p.reposts : p.likes;

  return (
    <GridBackground>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={15} color={color.ink.mid} />
          <Text style={styles.backText}>zurück</Text>
        </Pressable>

        <View style={styles.head}>
          <Avatar
            seed={p.avatar_seed}
            path={p.avatar_path}
            size={72}
            ring={p.is_me ? color.signal.primary : undefined}
          />
          <View style={styles.headText}>
            {/* Name gross, Handle klein: das Handle braucht man nur, um die
                Person weiterzuempfehlen, nicht um sie zu erkennen. */}
            <Text style={styles.handle} numberOfLines={1}>{personName(p)}</Text>
            <Text style={styles.name}>@{p.handle}</Text>
          </View>
        </View>

        {p.bio ? <Text style={styles.bio}>{p.bio}</Text> : null}

        <View style={styles.stats}>
          {/* Antippbar: hinter der Zahl steht die Liste, und die ist der
              Weg, auf dem man neue Leute findet. Eine Zahl ohne Ziel ist
              an dieser Stelle eine Sackgasse. */}
          <Pressable
            onPress={() => router.push(`/people/${encodeURIComponent(p.handle)}?mode=followers`)}
            style={({ pressed }) => [styles.statCol, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <Text style={styles.statValue}>{p.follower_count}</Text>
            <Text style={styles.statLabel}>Folgen dir</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/people/${encodeURIComponent(p.handle)}?mode=following`)}
            style={({ pressed }) => [styles.statCol, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <Text style={styles.statValue}>{p.following_count}</Text>
            <Text style={styles.statLabel}>Folgt</Text>
          </Pressable>
          {p.mastery_total !== null ? (
            <View style={styles.statCol}>
              <Text style={[styles.statValue, { color: color.signal.mastery }]}>
                {p.mastery_total}
              </Text>
              <Text style={styles.statLabel}>Mastery</Text>
            </View>
          ) : null}
          {p.streak_current ? (
            <View style={styles.statCol}>
              <Text style={[styles.statValue, { color: color.signal.warn }]}>
                {p.streak_current}
              </Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
          ) : null}
        </View>

        {!p.is_me ? (
          <Button
            label={p.i_follow ? 'Folge ich' : 'Folgen'}
            variant={p.i_follow ? 'ghost' : 'primary'}
            busy={busy}
            onPress={toggleFollow}
          />
        ) : null}

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab('reposts')}
            style={[styles.tab, tab === 'reposts' && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === 'reposts' && styles.tabTextOn]}>
              Empfohlen · {p.reposts.length}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('likes')}
            style={[styles.tab, tab === 'likes' && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === 'likes' && styles.tabTextOn]}>
              Likes{p.likes ? ` · ${p.likes.length}` : ''}
            </Text>
          </Pressable>
        </View>

        {tab === 'likes' && p.likes === null ? (
          <View style={styles.private}>
            <Icon name="lock" size={18} color={color.ink.low} />
            <Text style={styles.privateText}>
              {p.is_me
                ? 'Deine Likes sind privat. In den Einstellungen kannst du sie sichtbar machen.'
                : 'Diese Person hält ihre Likes privat.'}
            </Text>
          </View>
        ) : (list?.length ?? 0) === 0 ? (
          <Text style={styles.empty}>
            {tab === 'reposts' ? 'Noch nichts empfohlen.' : 'Noch nichts geliked.'}
          </Text>
        ) : (
          <View style={styles.list}>
            {list!.map((r) => (
              <RefRow key={r.content_id} item={r} muted={tab === 'likes'} handle={p.handle} />
            ))}
          </View>
        )}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },

  back: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: space.xs },
  backText: { ...type.meta, color: color.ink.mid },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headText: { flex: 1, gap: 2 },
  handle: { ...type.title, fontSize: 22, color: color.ink.max },
  name: { ...type.body, fontSize: 15, color: color.ink.mid },
  bio: { ...type.body, fontSize: 15, color: color.ink.high },

  stats: { flexDirection: 'row', gap: space.xl, flexWrap: 'wrap' },
  statCol: { gap: 2 },
  statValue: { ...type.title, fontSize: 20, color: color.ink.max },
  statLabel: { ...type.meta, color: color.ink.low },

  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  tabOn: { borderColor: color.signal.primary, backgroundColor: color.bgElevated },
  tabText: { ...type.meta, color: color.ink.mid },
  tabTextOn: { color: color.signal.primary },

  list: { gap: 2 },
  ref: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  refBody: { flex: 1, gap: 2 },
  refTitle: { ...type.body, fontSize: 15, color: color.ink.high },
  refComment: { ...type.body, fontSize: 14, color: color.signal.primary, fontStyle: 'italic' },
  refMeta: { ...type.meta, color: color.ink.low },

  private: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  privateText: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },

  empty: { ...type.body, fontSize: 15, color: color.ink.mid, paddingVertical: space.lg },
  errorTitle: { ...type.title, color: color.ink.max },
  errorBody: { ...type.mono, color: color.ink.low },
});
