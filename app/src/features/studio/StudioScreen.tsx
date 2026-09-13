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
import { Icon, type IconName } from '@/components/Icon';
import { TabHint, useTabHint } from '@/components/TabHint';
import { DailyBanner } from '@/features/daily/DailyBanner';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { beiWiederOnline } from '@/lib/online';
import { api } from '@/lib/supabase';
import type { CourseSummary } from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Studio - der Tab, in dem man selbst etwas tut.
 *
 * War vorher "Kurse", und Kurse allein trugen keinen Tab: ein Bildschirm mit
 * einem einzigen Kurs ist eine Sackgasse. Zusammen mit Duellen, Wiederholung
 * und der Tagesaufgabe ist er der Ort fuer alles, wofuer man sich absichtlich
 * hinsetzt - der Gegenpol zum Feed, der einen einfach mitnimmt.
 *
 * "Studio", weil hier spaeter auch das hinkommt, was man selbst erstellt
 * (Momente, LAB). Das Tab-Symbol ist deshalb ein Plus.
 */
export function StudioScreen() {
  const hinweis = useTabHint('studio');
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [faellig, setFaellig] = useState(0);
  const [duelle, setDuelle] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Die Zaehler duerfen fehlen, die Kurse nicht: ein kaputter Zaehler
    // soll nicht den ganzen Tab leer machen.
    void api
      .reviewSummary()
      .then((r) => setFaellig(r?.due_now ?? 0))
      .catch(() => setFaellig(0));
    void api
      .duelList()
      .then((d) => setDuelle(d.filter((x) => x.laeuft && x.mein_stand !== 'fertig').length))
      .catch(() => setDuelle(0));
    try {
      setCourses(await api.listCourses());
      setError(null);
    } catch (e) {
      setError(fehlerText(e, 'Kurse nicht ladbar'));
      setCourses([]);
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
          {
            paddingTop: insets.top + space.xl,
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl,
          },
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
          <Text style={styles.pageTitle}>Studio</Text>
          <Text style={styles.pageSub}>Hier lernst du absichtlich: Kurse, Duelle, Wiederholung.</Text>
        </View>

        <View style={styles.kacheln}>
          <Kachel
            icon="refresh"
            label="Wiederholen"
            zahl={faellig}
            unter={faellig > 0 ? 'fällig' : 'nichts fällig'}
            ton={faellig > 0 ? color.signal.mastery : undefined}
            onPress={() => router.push('/review')}
          />
          <Kachel
            icon="xp"
            label="Duelle"
            zahl={duelle}
            unter={duelle > 0 ? 'offen' : 'jemanden fordern'}
            ton={duelle > 0 ? color.signal.warn : undefined}
            onPress={() => router.push('/duels')}
          />
        </View>

        {/* Die Tagesaufgabe gilt nur heute, ein Kurs wartet auch morgen. */}
        <DailyBanner />

        <Text style={styles.abschnitt}>Kurse</Text>

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
          Neue Kurse baut die Pipeline zweimal am Tag aus Wikipedia-Artikeln – jede
          Lektion wird gegen den Artikel geprüft wie jede Karte im Feed.
        </Text>
      </ScrollView>
      {hinweis.zeigen ? (
        <TabHint
          icon="plus"
          titel="Studio: selbst machen"
          text="Kurse bauen aufeinander auf, Duelle fordern deine Leute heraus, Wiederholungen holen zurück, was sonst verblasst. Später kommt hier auch dazu, was du selbst erstellst."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
    </GridBackground>
  );
}

function Kachel({
  icon,
  label,
  zahl,
  unter,
  ton,
  onPress,
}: {
  icon: IconName;
  label: string;
  zahl: number;
  unter: string;
  ton?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [styles.kachel, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={styles.kachelKopf}>
        <Icon name={icon} size={18} color={ton ?? color.ink.mid} />
        {zahl > 0 ? <Text style={[styles.kachelZahl, { color: ton ?? color.ink.max }]}>{zahl}</Text> : null}
      </View>
      <Text style={styles.kachelLabel}>{label}</Text>
      <Text style={styles.kachelUnter}>{unter}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.xl, gap: space.lg },

  pageTitle: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  pageSub: { ...type.body, fontSize: 15, color: color.ink.mid, marginTop: space.xs },

  kacheln: { flexDirection: 'row', gap: space.md },
  kachel: {
    flex: 1,
    gap: 2,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  kachelKopf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  kachelZahl: { ...type.mono, fontSize: 18 },
  kachelLabel: { ...type.label, fontSize: 15, color: color.ink.high },
  kachelUnter: { ...type.meta, color: color.ink.low },

  abschnitt: { ...type.meta, color: color.ink.low, paddingTop: space.sm },

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
