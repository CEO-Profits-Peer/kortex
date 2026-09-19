import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Icon } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { ProAbzeichen } from '@/components/ProSperre';
import { ProfilKopf } from '@/features/pro/ProfilKopf';
import { namensfarbe } from '@/lib/meisterwege';
import { api } from '@/lib/supabase';
import { UserPosts } from '@/features/posts/UserPosts';
import type { FolgenQuelle, PublicProfile, RepostRef } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { ZWEI } from '@/theme/design';
import { color, gewaehlt, gewaehltText, radius, space, type } from '@/theme/tokens';

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

export function PublicProfileScreen({
  handle,
  herkunft,
}: {
  handle: string;
  /** Woher man kam - fuer die Follower-Statistik (0080). Ohne: 'profil'. */
  herkunft?: { quelle: FolgenQuelle; post?: string };
}) {
  const insets = useSafeAreaInsets();
  // Vor jedem fruehen return: Hooks duerfen nicht bedingt laufen.
  const scrollY = useSharedValue(0);
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'posts' | 'reposts' | 'likes'>('posts');
  const [postAnzahl, setPostAnzahl] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setP(await api.publicProfile(handle));
      setError(null);
    } catch (e) {
      setError(fehlerText(e, 'Profil nicht gefunden'));
    }
  }, [handle]);

  useEffect(() => {
    void load();
  }, [load]);

  const [duellBusy, setDuellBusy] = useState(false);
  const [duellFehler, setDuellFehler] = useState<string | null>(null);

  /**
   * Ein Duell starten.
   *
   * Die Fehlermeldungen kommen woertlich aus der Datenbank und werden hier
   * nur weitergereicht. Sie sagen etwas Konkretes ("nicht genug gemeinsame
   * Karten", "ihr habt schon ein offenes Duell") - das ist mehr wert als ein
   * eigener Satz, der alle Faelle zu "hat nicht geklappt" verwischt.
   */
  const duellStarten = async () => {
    if (!p || duellBusy) return;
    setDuellBusy(true);
    setDuellFehler(null);
    try {
      const id = await api.duelStart(p.id);
      router.push(`/duel/${id}`);
    } catch (e) {
      // Die Saetze aus 0069 kommen als P0001 an und gehen woertlich durch;
      // ein Funkloch wird zu einem Satz statt zu "Failed to fetch".
      setDuellFehler(fehlerText(e, 'Duell ging nicht'));
    } finally {
      setDuellBusy(false);
    }
  };

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
      await api.setFollowing(p.id, next, herkunft ?? { quelle: 'profil' });
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
            <Laden color={color.signal.primary} />
          )}
        </View>
      </GridBackground>
    );
  }

  const list = tab === 'reposts' ? p.reposts : p.likes;

  return (
    <GridBackground>
      {/* Kopfzeile ausserhalb der Liste - sie bleibt stehen und
          klappt beim Scrollen zusammen. */}
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={`@${p.handle}`} titleInBarOnly scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <ProfilKopf theme={p.profil_theme}>
        <View style={styles.head}>
          <Avatar
            seed={p.avatar_seed}
            path={p.avatar_path}
            size={72}
            ring={p.is_me ? color.signal.primary : undefined}
            rahmen={p.rahmen}
          />
          <View style={styles.headText}>
            {/* Name gross, Handle klein: das Handle braucht man nur, um die
                Person weiterzuempfehlen, nicht um sie zu erkennen. */}
            <View style={styles.nameZeile}>
              <Text
                style={[styles.handle, { flexShrink: 1 }, namensfarbe(p.namensfarbe) ? { color: namensfarbe(p.namensfarbe) } : null]}
                numberOfLines={1}
              >
                {personName(p)}
              </Text>
              {p.pro ? <ProAbzeichen /> : null}
            </View>
            <Text style={styles.name}>@{p.handle}</Text>
            {/* 0095: erreichte Meisterwege - Thema und Stufe, keine Mastery-Zahl. */}
            {p.meister && p.meister.length > 0 ? (
              <Text style={styles.name} numberOfLines={1}>
                {p.meister.slice(0, 5).map((m) => `${m.emoji ?? ''} ${m.stufe}`).join('  ·  ')}
              </Text>
            ) : null}
          </View>
        </View>
        </ProfilKopf>

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
          {p.likes_bekommen ? (
            <View style={styles.statCol}>
              <Text style={[styles.statValue, { color: ZWEI ? color.ink.max : color.signal.primary }]}>{p.likes_bekommen}</Text>
              <Text style={styles.statLabel}>Likes bekommen</Text>
            </View>
          ) : null}
        </View>

        {/* 0083: wie lange schon, und wie viel geschrieben - das, was man
            wissen will, bevor man jemandem folgt. */}
        {p.dabei_seit ? (
          <Text style={styles.dabei}>
            Dabei seit {new Date(p.dabei_seit).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })}
            {p.beitraege ? ` · ${p.beitraege} ${p.beitraege === 1 ? 'Beitrag' : 'Beiträge'}` : ''}
          </Text>
        ) : null}

        {!p.is_me ? (
          <View style={styles.knoepfe}>
            <View style={{ flex: 1 }}>
              <Button
                label={p.i_follow ? 'Folge ich' : 'Folgen'}
                variant={p.i_follow ? 'ghost' : 'primary'}
                busy={busy}
                onPress={toggleFollow}
              />
            </View>
            {/* Nur wenn man folgt. Ein Duell ist eine Einladung, und der
                Server laesst es auch nur dann zu (Migration 0069) - ein
                Knopf, der zuverlaessig eine Fehlermeldung bringt, ist
                schlimmer als keiner. */}
            {p.i_follow ? (
              <View style={{ flex: 1 }}>
                <Button
                  label="Duell"
                  variant="ghost"
                  busy={duellBusy}
                  onPress={duellStarten}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {duellFehler ? <Text style={styles.duellFehler}>{duellFehler}</Text> : null}

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab('posts')}
            style={[styles.tab, tab === 'posts' && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === 'posts' && styles.tabTextOn]}>
              Beiträge{postAnzahl !== null ? ` · ${postAnzahl}` : ''}
            </Text>
          </Pressable>
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

        {tab === 'posts' ? (
          <UserPosts handle={p.handle} eigene={p.is_me} onAnzahl={setPostAnzahl} />
        ) : tab === 'likes' && p.likes === null ? (
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
  nameZeile: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  knoepfe: { flexDirection: 'row', gap: space.sm },
  duellFehler: { ...type.body, fontSize: 13.5, color: color.signal.warn },

  body: { paddingHorizontal: space.xl, gap: space.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },


  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headText: { flex: 1, gap: 2 },
  handle: { ...type.title, fontSize: 22, color: color.ink.max },
  name: { ...type.body, fontSize: 15, color: color.ink.mid },
  bio: { ...type.body, fontSize: 15, color: color.ink.high },

  stats: { flexDirection: 'row', gap: space.xl, flexWrap: 'wrap' },
  statCol: { gap: 2 },
  statValue: { ...type.title, fontSize: 20, color: color.ink.max },
  statLabel: { ...type.meta, color: color.ink.low },
  dabei: { ...type.meta, color: color.ink.low, marginTop: -space.sm },

  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  tabOn: gewaehlt({ borderColor: color.signal.primary, backgroundColor: color.bgElevated }),
  tabText: { ...type.meta, color: color.ink.mid },
  tabTextOn: gewaehltText({ color: color.signal.primary }),

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
  refComment: { ...type.body, fontSize: 14, color: color.akzent, fontStyle: 'italic' },
  refMeta: { ...type.meta, color: color.ink.low },

  private: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  privateText: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },

  empty: { ...type.body, fontSize: 15, color: color.ink.mid, paddingVertical: space.lg },
  errorTitle: { ...type.title, color: color.ink.max },
  errorBody: { ...type.mono, color: color.ink.low },
});
