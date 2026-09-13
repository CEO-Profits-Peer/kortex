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

import { BlueprintVisual } from '@/components/BlueprintVisual';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { GridBackground } from '@/components/GridBackground';
import { TabHint, useTabHint } from '@/components/TabHint';
import { DailyBanner } from '@/features/daily/DailyBanner';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { CourseSummary } from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Kurs-Übersicht.
 *
 * Der Gegenpol zum Feed: dort spontanes Scrollen, hier eine gezielte
 * Lern-Session mit Anfang und Ende. Beides braucht die App - der Feed bringt
 * Leute täglich zurück, die Kurse geben ihnen einen Grund, absichtlich zu
 * kommen.
 */
export function CoursesScreen() {
  const hinweis = useTabHint('kurse');
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCourses(await api.listCourses());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kurse nicht ladbar');
      setCourses([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (courses === null) {
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
        <View>
          <Text style={styles.pageTitle}>Kurse</Text>
          <Text style={styles.pageSub}>
            Zusammenhängende Lektionen statt Zufallskarten. Mit Anfang und Ende.
          </Text>
        </View>

        {/* Ganz oben, vor den Kursen: die Tagesaufgabe gilt nur heute, ein
            Kurs wartet auch morgen noch. */}
        <DailyBanner />

        {courses.length === 0 ? (
          <Text style={styles.empty}>
            {error ?? 'Noch keine Kurse in deiner Sprache freigegeben.'}
          </Text>
        ) : (
          courses.map((c) => {
            const accent = categoryAccent(c.accent);
            const done = c.lessons > 0 ? c.position / c.lessons : 0;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  haptics.light();
                  router.push(`/course/${encodeURIComponent(c.slug)}`);
                }}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
              >
                <BlueprintVisual seed={c.id} accentHex={c.accent} height={96} />

                <View style={styles.cardBody}>
                  <View style={styles.cardHead}>
                    <Text style={[styles.category, { color: accent }]}>
                      {c.emoji ?? '◇'}  {c.category}
                    </Text>
                    <View style={styles.difficulty}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <View
                          key={n}
                          style={[
                            styles.diffDot,
                            { backgroundColor: n <= c.difficulty ? color.ink.mid : color.ink.faint },
                          ]}
                        />
                      ))}
                    </View>
                  </View>

                  <Text style={styles.title}>{c.title}</Text>
                  <Text style={styles.description} numberOfLines={2}>
                    {c.description}
                  </Text>

                  <View style={styles.progressRow}>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${Math.round(done * 100)}%`, backgroundColor: accent },
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>
                      {c.completed
                        ? 'abgeschlossen'
                        : c.started
                          ? `${c.position} / ${c.lessons}`
                          : `${c.lessons} Lektionen`}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

        <Text style={styles.footnote}>
          Weitere Kurse entstehen aus den Wissenskarten der Pipeline. Ein Kurs
          ist technisch nichts anderes als eine feste Reihenfolge davon.
        </Text>
      </ScrollView>
      {hinweis.zeigen ? (
        <TabHint
          icon="courses"
          titel="Kurse sind eine Reihenfolge"
          text="Anders als im Feed bauen die Karten aufeinander auf: Lektion 1 setzt nichts voraus, die letzte ist der Punkt, wegen dem sich die davor gelohnt haben."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.xl, gap: space.lg },

  pageTitle: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  pageSub: { ...type.body, fontSize: 15, color: color.ink.mid, marginTop: space.xs },

  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    overflow: 'hidden',
  },
  cardBody: { padding: space.lg, gap: space.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { ...type.meta },
  difficulty: { flexDirection: 'row', gap: 3 },
  diffDot: { width: 5, height: 5, borderRadius: 3 },

  title: { ...type.deck, fontSize: 19, color: color.ink.max },
  description: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.mid },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  track: { flex: 1, height: 3, borderRadius: 3, backgroundColor: color.ink.faint },
  fill: { height: 3, borderRadius: 3 },
  progressText: { ...type.meta, color: color.ink.low },

  empty: { ...type.body, fontSize: 15, color: color.ink.mid },
  footnote: { ...type.meta, color: color.ink.low, lineHeight: 17, paddingTop: space.md },
});
