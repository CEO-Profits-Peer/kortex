import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { Avatar } from '@/components/Avatar';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { GridBackground } from '@/components/GridBackground';
import { useNeuladen, useTabNochmal } from '@/components/Neuladen';
import { TabHint, useTabHint } from '@/components/TabHint';
import { Icon, type IconName } from '@/components/Icon';
import { KnowledgeRadar } from '@/components/KnowledgeRadar';
import { haptics } from '@/lib/haptics';
import { InstallBanner } from '@/components/InstallBanner';
import { personName } from '@/lib/name';
import { shareInvite } from '@/lib/share';
import { api } from '@/lib/supabase';
import { UserPosts } from '@/features/posts/UserPosts';
import type { MySocial, Stats } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { ProBanner } from '@/features/pro/ProBanner';
import { ProAbzeichen } from '@/components/ProSperre';
import { useIchPro } from '@/lib/pro';
import { beiWiederOnline } from '@/lib/online';
import { color, radius, space, type } from '@/theme/tokens';
import { flaeche } from '@/theme/design';

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

/**
 * Wie viele Kacheln im Profil stehen.
 *
 * Vorher standen ALLE hier - der Server hat trotz `limit 24` alles geliefert
 * (das Limit stand hinter dem Aggregat und traf nie eine Zeile, siehe
 * Migration 0065). Sechs sind eine Handbreit, danach kommt der Lernstand,
 * und der Rest liegt hinter "Alle ansehen".
 */
const VORSCHAU = 6;

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
  const hinweis = useTabHint('profil');
  const ichPro = useIchPro();
  const insets = useSafeAreaInsets();
  const [social, setSocial] = useState<MySocial | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<'posts' | 'reposts' | 'likes'>('posts');
  const [postAnzahl, setPostAnzahl] = useState<number | null>(null);
  // Zaehlt beim Neuladen hoch und laedt damit auch die Beitraege neu.
  const [neu, setNeu] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const geladenAm = useRef(0);
  const [einladeNotiz, setEinladeNotiz] = useState<string | null>(null);

  /**
   * Freunde einladen.
   *
   * Der Code wird erst beim Tippen geholt, nicht beim Laden des Profils: die
   * meisten oeffnen das Profil, um ihren Stand zu sehen, und eine Anfrage
   * mehr bei jedem Oeffnen fuer einen Knopf, den selten jemand drueckt, ist
   * ein schlechter Tausch.
   */
  const einladen = useCallback(async () => {
    haptics.light();
    setEinladeNotiz(null);
    try {
      const mein = await api.myInvite();
      if (!mein?.code) throw new Error('kein Code');
      const res = await shareInvite({ code: mein.code });
      if (res === 'copied') setEinladeNotiz('Link kopiert. Wer darüber startet, folgt dir automatisch.');
      if (res === 'failed') setEinladeNotiz('Teilen ging nicht.');
    } catch (e) {
      setEinladeNotiz(fehlerText(e, 'Einladen geht gerade nicht.'));
    }
    setTimeout(() => setEinladeNotiz(null), 4000);
  }, []);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    geladenAm.current = Date.now();
    try {
      const [s, st] = await Promise.all([api.getMySocial(), api.getMyStats()]);
      setSocial(s);
      setStats(st);
      setError(null);
    } catch (e) {
      setError(fehlerText(e, 'Profil konnte nicht geladen werden'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Offline gescheitert: sobald der Server wieder antwortet, von selbst neu.
  useEffect(() => {
    if (!error) return;
    return beiWiederOnline(() => void load());
  }, [error, load]);

  const neuladen = useNeuladen(async () => {
    await load();
    setNeu((n) => n + 1);
  }, insets.top + space.sm);

  // Zweiter Tipp auf "Profil": nach oben, neu laden.
  useTabNochmal(() => {
    scroll.current?.scrollTo({ y: 0, animated: true });
    void neuladen.ausloesen();
  });

  // Zurueck nach mehr als 30 Sekunden: still nachladen. Wer im Feed drei
  // Karten empfohlen hat, soll sie hier sehen, ohne selbst zu ziehen.
  useFocusEffect(
    useCallback(() => {
      if (geladenAm.current && Date.now() - geladenAm.current > 30_000) {
        void load();
        setNeu((n) => n + 1);
      }
    }, [load]),
  );

  if (!social) {
    return (
      <GridBackground>
        <View style={styles.center}>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <Laden color={color.signal.primary} />
          )}
        </View>
      </GridBackground>
    );
  }

  const p = stats?.profile;
  const focusMin = Math.round((p?.focus_seconds_total ?? 0) / 60);
  const list = tab === 'reposts' ? social.reposts : social.likes;
  const gesamt = tab === 'reposts' ? social.repost_count : social.like_count;
  const due = stats?.reviews_due ?? 0;

  return (
    <GridBackground>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.body,
          // Unten: die Tab-Leiste schwebt ueber dem Inhalt.
          { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => neuladen.beiScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        {...neuladen.listenProps}
      >
        {/* --- Kopf: Bild, Name, Zahlen ---------------------------------- */}
        <View style={styles.head}>
          <Pressable onPress={() => router.push('/account')} hitSlop={6}>
            <Avatar seed={social.avatar_seed} path={social.avatar_path} size={64} />
          </Pressable>

          <View style={styles.identity}>
            <View style={styles.nameZeile}>
              <Text style={[styles.handle, { flexShrink: 1 }]} numberOfLines={1}>
                {personName(social)}
              </Text>
              {ichPro.pro ? <ProAbzeichen /> : null}
            </View>
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

        <View style={styles.knopfReihe}>
          <Pressable
            onPress={() => router.push('/account')}
            style={({ pressed }) => [styles.editButton, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.editText}>Profil bearbeiten</Text>
          </Pressable>
          {/* Neben "Profil bearbeiten", nicht in den Kacheln darunter: die
              Kacheln fuehren an Orte in der App, dieser Knopf fuehrt hinaus. */}
          <Pressable
            onPress={() => void einladen()}
            style={({ pressed }) => [
              styles.editButton,
              styles.inviteButton,
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.editText, { color: color.akzent }]}>
              Freunde einladen
            </Text>
          </Pressable>
        </View>
        {einladeNotiz ? <Text style={styles.einladeNotiz}>{einladeNotiz}</Text> : null}

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
          <Shortcut icon="xp" label="Duelle" onPress={() => router.push('/duels')} />
          <Shortcut
            icon="leaderboard"
            label="Rangliste"
            onPress={() => router.push('/leaderboard')}
          />
          <Shortcut icon="chart" label="Statistik" onPress={() => router.push('/statistik')} />
        </View>

        {/* Mit PRO nichts an seiner Stelle: den Stand zeigen die Einstellungen
            und das Abzeichen. Ein "Du bist PRO"-Banner waere nur Werbung fuer
            etwas, das man schon hat. */}
        {ichPro.pro ? null : <ProBanner />}

        {/* Verschwindet von selbst, sobald die App installiert ist - und
            ist auf dem Handy und im installierten Fenster nie da. */}
        <InstallBanner />

        {/* --- Eigene Inhalte ---------------------------------------------- */}
        <View style={styles.tabs}>
          {(['posts', 'reposts', 'likes'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => {
                haptics.select();
                setTab(k);
              }}
              style={styles.tab}
            >
              <Icon
                name={k === 'posts' ? 'feed' : k === 'reposts' ? 'refresh' : 'like'}
                size={16}
                color={tab === k ? color.ink.max : color.ink.low}
              />
              <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>
                {k === 'posts' ? (postAnzahl ?? '') : k === 'reposts' ? social.repost_count : social.like_count}
              </Text>
              {/* Unterstrich statt Pille - ruhiger und eindeutig. */}
              <View style={[styles.tabRule, tab === k && styles.tabRuleOn]} />
            </Pressable>
          ))}
        </View>

        {/* Eigene Beitraege zuerst: sie sind das, was man selbst geschrieben
            hat, Empfohlenes und Likes sind Reaktionen auf andere. */}
        {tab === 'posts' ? (
          <UserPosts handle={social.handle} eigene onAnzahl={setPostAnzahl} neuladen={neu} />
        ) : list.length === 0 ? (
          <Text style={styles.empty}>
            {tab === 'reposts'
              ? 'Noch nichts empfohlen. Der Repost-Knopf sitzt rechts an jeder Karte.'
              : 'Noch nichts geliked. Doppeltippen auf eine Karte reicht.'}
          </Text>
        ) : (
          <Animated.View entering={FadeIn.duration(180)} style={styles.grid}>
            {list.slice(0, VORSCHAU).map((r) => (
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

        {/* Nur wenn es wirklich mehr gibt. Ein Knopf, der auf eine Liste
            fuehrt, die genauso lang ist wie das, was daneben steht, ist ein
            Versprechen ohne Inhalt. */}
        {tab !== 'posts' && gesamt > Math.min(list.length, VORSCHAU) ? (
          <Pressable
            onPress={() => {
              haptics.light();
              router.push(`/collection/${tab}`);
            }}
            style={({ pressed }) => [styles.allButton, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.allText}>Alle {gesamt} ansehen</Text>
          </Pressable>
        ) : null}

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
      {neuladen.anzeige}
      {hinweis.zeigen ? (
        <TabHint
          icon="profile"
          titel="Dein Stand"
          text="Hier steht, was hängen geblieben ist: Empfohlenes, Likes, Streak und der Radar, der zeigt, wo du stark bist. Die Zahlen oben führen auf Listen."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
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

  knopfReihe: { flexDirection: 'row', gap: space.sm },
  inviteButton: { borderColor: color.akzent },
  einladeNotiz: { ...type.meta, fontSize: 10, color: color.ink.mid, marginTop: -space.sm },
  editButton: {
    flex: 1,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    ...flaeche(6),
  },
  editText: { ...type.label, fontSize: 13, color: color.ink.high },

  shortcuts: { flexDirection: 'row', gap: space.sm },
  nameZeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(8),
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
    ...flaeche(8),
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

  allButton: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    ...flaeche(6),
  },
  allText: { ...type.label, fontSize: 13, color: color.ink.mid },

  empty: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.mid },
  error: { ...type.body, fontSize: 15, color: color.signal.error, textAlign: 'center' },
});
