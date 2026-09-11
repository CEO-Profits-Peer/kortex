import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { api } from '@/lib/supabase';
import type { PersonHit } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Wer folgt wem.
 *
 * Erreichbar, indem man im Profil auf "Folgen dir" oder "Folgt" tippt.
 * Vorher waren das Zahlen ohne Ziel - und damit eine Sackgasse an der
 * Stelle, an der man im sozialen Teil eigentlich weiterkommt.
 *
 * Der Folgen-Knopf steht direkt in der Liste. Wer sich anschaut, wem
 * jemand folgt, will genau das tun: selbst folgen. Erst aufs Profil zu
 * muessen waere ein Umweg ohne Gewinn.
 */
export function PeopleListScreen({
  handle,
  mode,
}: {
  handle: string;
  mode: 'followers' | 'following';
}) {
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<PersonHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = mode === 'followers' ? api.followers(handle) : api.following(handle);
    void load
      .then((r) => alive && setPeople(r))
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Liste nicht ladbar');
        setPeople([]);
      });
    return () => {
      alive = false;
    };
  }, [handle, mode]);

  const toggleFollow = useCallback(async (person: PersonHit) => {
    haptics.light();
    const next = !person.i_follow;

    // Sofort umschalten, Schreiben laeuft nebenher. Wer folgt, will das
    // Ergebnis sehen und nicht auf das Netz warten.
    setPeople((prev) =>
      (prev ?? []).map((p) => (p.id === person.id ? { ...p, i_follow: next } : p)),
    );
    setBusy((b) => new Set(b).add(person.id));

    try {
      await api.setFollowing(person.id, next);
    } catch {
      setPeople((prev) =>
        (prev ?? []).map((p) => (p.id === person.id ? { ...p, i_follow: !next } : p)),
      );
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(person.id);
        return n;
      });
    }
  }, []);

  const title = mode === 'followers' ? 'Folgen dieser Person' : 'Folgt';

  return (
    <GridBackground>
      <ScrollView
        contentContainerStyle={[
          styles.root,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Icon name="back" size={18} color={color.ink.mid} />
          <Text style={styles.backText}>@{handle}</Text>
        </Pressable>

        <Text style={styles.title}>{title}</Text>

        {people === null ? (
          <ActivityIndicator color={color.ink.low} />
        ) : people.length === 0 ? (
          <Text style={styles.empty}>
            {error ??
              (mode === 'followers'
                ? 'Noch niemand. Wer etwas Gutes repostet, wird gefunden.'
                : 'Folgt noch niemandem.')}
          </Text>
        ) : (
          <View style={styles.list}>
            {people.map((p) => (
              <View key={p.id} style={styles.row}>
                <Pressable
                  onPress={() => router.push(`/u/${encodeURIComponent(p.handle)}`)}
                  style={styles.who}
                  hitSlop={4}
                >
                  <Avatar seed={p.avatar_seed} path={p.avatar_path} size={40} />
                  <View style={styles.names}>
                    <Text style={styles.name} numberOfLines={1}>
                      {personName(p)}
                      {p.is_me ? '  ·  du' : ''}
                    </Text>
                    <Text style={styles.meta}>
                      {p.follower_count === 1
                        ? '1 Follower'
                        : `${p.follower_count} Follower`}
                    </Text>
                  </View>
                </Pressable>

                {p.is_me ? null : (
                  <Pressable
                    onPress={() => void toggleFollow(p)}
                    disabled={busy.has(p.id)}
                    style={({ pressed }) => [
                      styles.follow,
                      p.i_follow && styles.following,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text
                      style={[styles.followText, p.i_follow && { color: color.ink.mid }]}
                    >
                      {p.i_follow ? 'Folge ich' : 'Folgen'}
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.xl, gap: space.lg, flexGrow: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { ...type.mono, fontSize: 12, color: color.ink.mid },
  title: { ...type.title, fontSize: 24, color: color.ink.max },
  empty: { ...type.body, color: color.ink.mid },

  list: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  names: { flex: 1, gap: 1 },
  name: { ...type.body, fontSize: 16, color: color.ink.max },
  meta: { ...type.meta, color: color.ink.low },

  follow: {
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.signal.primary,
  },
  following: { borderColor: color.ink.faint },
  followText: { ...type.label, fontSize: 13, color: color.signal.primary },
});
