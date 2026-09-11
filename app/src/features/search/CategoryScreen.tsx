import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { haptics } from '@/lib/haptics';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { FeedScreen } from '@/features/feed/FeedScreen';
import { api } from '@/lib/supabase';
import type { CategoryDetail } from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Kategorie-Ansicht - hier wird die Level-Idee konkret.
 *
 * #zinseszins öffnen -> Fortschritt sehen -> Feed starten -> Karten lesen und
 * Quiz lösen -> mastery_score steigt -> Level steigt -> die naechsten Karten
 * in dieser Kategorie sind schwerer (get_category_feed sortiert nach
 * difficulty_pref).
 *
 * News-Kategorien sind bewusst nicht levelbar: News hat Tiefe, keine
 * Schwierigkeitsstufe. Bei denen zeigt der Kopf stattdessen nur, wie viel man
 * schon gelesen hat.
 */

const RING = 78;
const STROKE = 5;

function LevelRing({ level, max, progress, accent }: {
  level: number;
  max: number;
  progress: number;
  accent: string;
}) {
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={color.ink.faint}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={accent}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * Math.min(1, progress)} ${circumference}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text style={[styles.ringLevel, { color: accent }]}>{level}</Text>
        <Text style={styles.ringMax}>/{max}</Text>
      </View>
    </View>
  );
}

export function CategoryScreen({ categoryId }: { categoryId: string }) {
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<CategoryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [following, setFollowing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.categoryDetail(categoryId);
      setDetail(d);
      setFollowing(d.is_following);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kategorie nicht ladbar');
    }
  }, [categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loader = useCallback(
    (n: number) => api.categoryFeed(categoryId, n),
    [categoryId],
  );

  const toggleFollow = async () => {
    const next = !following;
    setFollowing(next);
    haptics.light();
    try {
      await api.setCategoryFollowing(categoryId, next);
    } catch {
      setFollowing(!next);
    }
  };

  if (reading && detail) {
    return (
      <View style={styles.fill}>
        <FeedScreen
          loader={loader}
          withCheckpoint={false}
          reserveBottom={0}
          emptyTitle={`Nichts Neues in #${detail.slug}`}
          emptyBody="Du hast hier alles gelesen, was freigegeben ist. Die Pipeline bringt laufend Neues nach."
        />
        <Pressable
          onPress={() => {
            setReading(false);
            void load();
          }}
          style={[styles.closeFeed, { top: insets.top + space.md }]}
          hitSlop={10}
        >
          <Icon name="close" size={16} color={color.ink.high} />
        </Pressable>
      </View>
    );
  }

  if (!detail) {
    return (
      <GridBackground>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={color.signal.primary} />}
        </View>
      </GridBackground>
    );
  }

  const accent = categoryAccent(detail.accent);
  const progress = detail.mastery_for_next
    ? Math.min(1, detail.mastery / detail.mastery_for_next)
    : 1;
  const readRatio = detail.cards_total ? detail.cards_read / detail.cards_total : 0;

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
          <>
            <Icon name="back" size={15} color={color.ink.mid} />
            <Text style={styles.backText}>zurück</Text>
          </>
        </Pressable>

        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.emoji}>{detail.emoji ?? '◇'}</Text>
            <Text style={[styles.slug, { color: accent }]}>#{detail.slug}</Text>
            <Text style={styles.name}>{detail.name}</Text>
          </View>

          {detail.levelable ? (
            <LevelRing
              level={detail.level}
              max={detail.max_level}
              progress={progress}
              accent={accent}
            />
          ) : null}
        </View>

        {detail.description ? <Text style={styles.description}>{detail.description}</Text> : null}

        {detail.levelable ? (
          <View style={styles.progressBox}>
            <Text style={styles.progressLine}>
              <Text style={{ color: accent }}>{detail.mastery}</Text>
              {detail.mastery_for_next
                ? ` von ${detail.mastery_for_next} Mastery bis Level ${detail.level + 1}`
                : ' Mastery · Maximallevel erreicht'}
            </Text>
            <Text style={styles.progressHint}>
              Mastery kommt nur aus gelösten Aufgaben und Wiederholungen — Lesen
              allein bringt hier nichts.
            </Text>
          </View>
        ) : (
          <View style={styles.progressBox}>
            <Text style={styles.progressHint}>
              News-Kategorie. Kein Level: Nachrichten haben Tiefe, keine
              Schwierigkeitsstufe.
            </Text>
          </View>
        )}

        <View style={styles.stats}>
          <View style={styles.statCol}>
            <Text style={styles.statValue}>{detail.cards_read}</Text>
            <Text style={styles.statLabel}>gelesen</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={styles.statValue}>{detail.cards_total}</Text>
            <Text style={styles.statLabel}>verfügbar</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={[styles.statValue, { color: accent }]}>
              {Math.round(readRatio * 100)}%
            </Text>
            <Text style={styles.statLabel}>abgedeckt</Text>
          </View>
        </View>

        {detail.children.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unterthemen</Text>
            <View style={styles.tagRow}>
              {detail.children.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`/category/${encodeURIComponent(c.id)}`)}
                  style={styles.tag}
                >
                  <Text style={[styles.tagText, { color: accent }]}>#{c.slug}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={detail.cards_total > 0 ? 'Feed starten' : 'Noch keine Karten'}
            accent={accent}
            disabled={detail.cards_total === 0}
            onPress={() => setReading(true)}
          />
          <Button
            label={following ? 'Folge ich' : 'Folgen'}
            variant="ghost"
            onPress={toggleFollow}
          />
          <Text style={styles.followHint}>
            Gefolgte Kategorien tauchen häufiger im Haupt-Feed auf.
          </Text>
        </View>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  body: { paddingHorizontal: space.xl, gap: space.lg },

  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
  },
  backText: { ...type.meta, color: color.ink.mid },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.lg },
  headText: { flex: 1, gap: 2 },
  emoji: { fontSize: 30 },
  slug: { ...type.meta, letterSpacing: 0.6 },
  name: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },

  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', flexDirection: 'row', alignItems: 'baseline' },
  ringLevel: { ...type.title, fontSize: 26 },
  ringMax: { ...type.meta, color: color.ink.low },

  description: { ...type.body, fontSize: 15, color: color.ink.mid },

  progressBox: {
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  progressLine: { ...type.body, fontSize: 15, color: color.ink.high },
  progressHint: { ...type.meta, color: color.ink.low, lineHeight: 17 },

  stats: { flexDirection: 'row', gap: space.xxl },
  statCol: { gap: 2 },
  statValue: { ...type.title, fontSize: 24, color: color.ink.max },
  statLabel: { ...type.meta, color: color.ink.low },

  section: { gap: space.sm },
  sectionTitle: { ...type.label, color: color.ink.mid, textTransform: 'uppercase', letterSpacing: 1 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  tagText: { ...type.meta },

  actions: { gap: space.sm, paddingTop: space.md },
  followHint: { ...type.meta, color: color.ink.low, textAlign: 'center' },

  closeFeed: {
    position: 'absolute',
    right: space.xl,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.overlay,
  },
  closeGlyph: { fontSize: 16, color: color.ink.high },

  error: { ...type.body, color: color.signal.error, textAlign: 'center' },
});
