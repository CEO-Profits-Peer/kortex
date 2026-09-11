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
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { GridBackground } from '@/components/GridBackground';
import { Icon, type IconName } from '@/components/Icon';
import { KnowledgeRadar } from '@/components/KnowledgeRadar';
import { haptics } from '@/lib/haptics';
import { InstallBanner } from '@/components/InstallBanner';
import { personName } from '@/lib/name';
import { api } from '@/lib/supabase';
import type { MySocial, Stats } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das eigene Profil.
 *
 * Überarbeitet mit einem Ziel: weniger Kästen.
 *
 * Die erste Fassung hatte für jede Sache einen umrandeten Block — Kopf,
 * Kacheln, drei Verweiskarten, zwei Abschnitte. Sieben Rahmen auf einem
 * Bildschirm lassen alles gleich wichtig aussehen, und dann wirkt nichts
 * mehr ruhig.
 *
 * Jetzt trägt Abstand die Gliederung, nicht Umrandung. Rahmen gibt es nur
 * noch dort, wo etwas antippbar ist — dann bedeutet ein Rahmen etwas.
 */

function Count({
  value,
  label,
  tint,
  onPress,
}: {
  value: number | string;
  label: string;
  tint?: string;
  /** Gesetzt, wenn hinter der Zahl eine Liste steht. */
  onPress?: () => void;
}) {
  const inner = (
    <>
      <Text style={[styles.countValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </>
  );
  if (!onPress) return <View style={styles.count}>{inner}</View>;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.count, pressed && { opacity: 0.7 }]}
    >
      {inner}
    </Pressable>
  );
}

/** Kompakte Kachel statt breiter Verweiskarte — drei nebeneinander. */
function Shortcut({
  icon,
  label,
  badge,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  badge?: number;
  tint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.75 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.shortcutIcon}>
        <Icon name={icon} size={19} color={tint ?? color.ink.mid} />
        {badge ? (
          <View style={[styles.badge, { backgroundColor: tint ?? color.signal.primary }]}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.shortcutLabel, tint ? { color: tint } : null]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [social, setSocial] = useState<MySocial | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<'reposts' | 'likes'>('reposts');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api.getMySocial(), api.getMyStats()]);
      setSocial(s);
      setStats(st);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Profil konnte nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!social) {
    return (
      <GridBackground>
        <View style={styles.center}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <ActivityIndicator color={color.signal.primary} />
          )}
        </View>
      </GridBackground>
    );
  }

  const p = stats?.profile;
  const focusMin = Math.round((p?.focus_seconds_total ?? 0) / 60);
  const list = tab === 'reposts' ? social.reposts : social.likes;
  const due = stats?.reviews_due ?? 0;

  return (
    <GridBackground>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xxxl },
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
        {/* --- Kopf: Bild, Name, Zahlen ---------------------------------- */}
        <View style={styles.head}>
          <Pressable onPress={() => router.push('/account')} hitSlop={6}>
            <Avatar seed={social.avatar_seed} path={social.avatar_path} size={64} />
          </Pressable>

          <View style={styles.identity}>
            <Text style={styles.handle} numberOfLines={1}>
              {personName(social)}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              @{social.handle}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={10}
            accessibilityLabel="Einstellungen"
          >
            <Icon name="settings" size={20} color={color.ink.low} />
          </Pressable>
        </View>

        {social.bio ? <Text style={styles.bio}>{social.bio}</Text> : null}

        <View style={styles.counts}>
          <Count value={social.repost_count} label="Empfohlen" />
          <View style={styles.divider} />
          <Count
            value={social.follower_count}
            label="Follower"
            onPress={() =>
              router.push(`/people/${encodeURIComponent(social.handle)}?mode=followers`)
            }
          />
          <View style={styles.divider} />
          <Count
            value={social.following_count}
            label="Folgt"
            onPress={() =>
              router.push(`/people/${encodeURIComponent(social.handle)}?mode=following`)
            }
          />
          <View style={styles.divider} />
          <Count value={p?.mastery_total ?? 0} label="Mastery" tint={color.signal.mastery} />
        </View>

        <Pressable
          onPress={() => router.push('/account')}
          style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.editText}>Profil bearbeiten</Text>
        </Pressable>

        {/* --- Drei Wege, kompakt ----------------------------------------- */}
        <View style={styles.shortcuts}>
          <Shortcut
            icon="refresh"
            label="Wiederholen"
            badge={due}
            tint={due > 0 ? color.signal.mastery : undefined}
            onPress={() => router.push('/review')}
          />
          <Shortcut icon="profile" label="Deine Leute" onPress={() => router.push('/following')} />
          <Shortcut
            icon="leaderboard"
            label="Rangliste"
            onPress={() => router.push('/leaderboard')}
          />
        </View>

        {/* Verschwindet von selbst, sobald die App installiert ist - und
            ist auf dem Handy und im installierten Fenster nie da. */}
        <InstallBanner />

        {/* --- Eigene Inhalte ---------------------------------------------- */}
        <View style={styles.tabs}>
          {(['reposts', 'likes'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                haptics.select();
                setTab(k);
              }}
              style={styles.tab}
            >
              <Icon
                name={k === 'reposts' ? 'refresh' : 'like'}
                size={16}
                color={tab === k ? color.ink.max : color.ink.low}
              />
              <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>
                {k === 'reposts' ? social.repost_count : social.like_count}
              </Text>
              {/* Unterstrich statt Pille - ruhiger und eindeutig. */}
              <View style={[styles.tabRule, tab === k && styles.tabRuleOn]} />
            </Pressable>
          ))}
        </View>

        {list.length === 0 ? (
          <Text style={styles.empty}>
            {tab === 'reposts'
              ? 'Noch nichts empfohlen. Der Repost-Knopf sitzt rechts an jeder Karte.'
              : 'Noch nichts geliked. Doppeltippen auf eine Karte reicht.'}
          </Text>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={styles.grid}>
            {list.map((r) => (
              <Pressable
                key={r.content_id}
                onPress={() => router.push(`/category/${encodeURIComponent(r.category)}`)}
                style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.tileTitle} numberOfLines={3}>
                  {r.title}
                </Text>
                <View style={styles.tileFoot}>
                  <Text style={styles.tileTag} numberOfLines={1}>
                    #{r.category.split('.').pop()}
                  </Text>
                  {r.likes > 0 ? (
                    <View style={styles.tileLikes}>
                      <Icon name="like-filled" size={9} color={color.ink.low} />
                      <Text style={styles.tileTag}>{r.likes}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* --- Lernstand ----------------------------------------------------- */}
        <Text style={styles.sectionTitle}>Lernstand</Text>

        <View style={styles.learnRow}>
          <Count value={p?.xp_total ?? 0} label="XP" tint={color.signal.primary} />
          <Count
            value={p?.streak_current ?? 0}
            label="Streak"
            tint={(p?.streak_current ?? 0) > 0 ? color.signal.warn : undefined}
          />
          <Count value={p?.cards_read_total ?? 0} label="Gelesen" />
          <Count value={`${focusMin}m`} label="Fokus" />
        </View>

        <Text style={styles.todayLine}>
          Heute: {stats?.read_today ?? 0} von {p?.daily_goal_cards ?? 60} Grids
        </Text>
        {(stats?.read_today ?? 0) >= (p?.daily_goal_cards ?? 60) ? (
          <Text style={styles.enough}>
            Das reicht für heute. Was hängen geblieben ist, fragen wir morgen.
          </Text>
        ) : null}

        <KnowledgeRadar data={stats?.radar ?? []} />
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  // Ein durchgehender Abstandsrhythmus statt wechselnder Kastenabstände.
  body: { paddingHorizontal: space.xl, gap: space.lg },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  identity: { flex: 1, gap: 1 },
  handle: { ...type.title, fontSize: 21, color: color.ink.max },
  name: { ...type.body, fontSize: 14, color: color.ink.mid },
  bio: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.high, marginTop: -space.sm },

  counts: { flexDirection: 'row', alignItems: 'center' },
  count: { flex: 1, alignItems: 'center', gap: 1 },
  countValue: { ...type.title, fontSize: 18, color: color.ink.max },
  countLabel: { ...type.meta, fontSize: 9.5, color: color.ink.low },
  divider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: color.ink.faint },

  editButton: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  editText: { ...type.label, fontSize: 13, color: color.ink.high },

  shortcuts: { flexDirection: 'row', gap: space.sm },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  shortcutIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { ...type.meta, fontSize: 9.5, color: color.ink.mid },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...type.meta, fontSize: 8.5, color: color.bg },

  tabs: { flexDirection: 'row', gap: space.xl, paddingTop: space.xs },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: space.sm },
  tabText: { ...type.meta, color: color.ink.low },
  tabTextOn: { color: color.ink.max },
  tabRule: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'transparent',
  },
  tabRuleOn: { backgroundColor: color.signal.primary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48.5%',
    minHeight: 92,
    justifyContent: 'space-between',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  tileTitle: { ...type.body, fontSize: 13.5, lineHeight: 19, color: color.ink.high },
  tileFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileTag: { ...type.meta, fontSize: 9, color: color.ink.low },
  tileLikes: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  sectionTitle: {
    ...type.meta,
    color: color.ink.low,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingTop: space.sm,
  },
  learnRow: { flexDirection: 'row' },

  todayLine: { ...type.body, fontSize: 14, color: color.ink.mid },
  enough: { ...type.body, fontSize: 14, color: color.signal.warn, marginTop: -space.sm },

  empty: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.mid },
  error: { ...type.body, fontSize: 15, color: color.signal.error, textAlign: 'center' },
});
