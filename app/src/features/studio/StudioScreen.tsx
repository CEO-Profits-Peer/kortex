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
import type { CollectionEntry, CourseSummary } from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Studio - der Tab, in dem man selbst etwas tut.
 *
 * War vorher "Kurse", und Kurse allein trugen keinen Tab. Jetzt oben das
 * Erstellen - Beitrag, Frage, eine gelikte Karte weiterempfehlen -, darunter
 * alles, wofuer man sich absichtlich hinsetzt: Wiederholung, Duelle,
 * Tagesaufgabe, Kurse.
 *
 * Das Erstellen steht OBEN, weil es der Grund fuer den Namen und das Plus im
 * Tab ist. Die erste Fassung hatte es nur im Namen - "man kann im Studio
 * noch nicht wirklich Posts erstellen" war die richtige Rueckmeldung darauf.
 */
export function StudioScreen() {
  const hinweis = useTabHint('studio');
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [geliked, setGeliked] = useState<CollectionEntry[]>([]);
  const [faellig, setFaellig] = useState(0);
  const [duelle, setDuelle] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Zaehler und Karten duerfen fehlen, die Kurse nicht: ein kaputter
    // Zaehler soll nicht den ganzen Tab leer machen.
    void api
      .reviewSummary()
      .then((r) => setFaellig(r?.due_now ?? 0))
      .catch(() => setFaellig(0));
    void api
      .duelList()
      .then((d) => setDuelle(d.filter((x) => x.laeuft && x.mein_stand !== 'fertig').length))
      .catch(() => setDuelle(0));
    void api
      .myCollection('likes', 12)
      .then(setGeliked)
      .catch(() => setGeliked([]));
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
          <Text style={styles.pageSub}>Selbst etwas machen: posten, fragen, lernen, herausfordern.</Text>
        </View>

        {/* --- Erstellen --------------------------------------------------- */}
        <View style={styles.erstellen}>
          <Erstellen
            icon="plus"
            label="Beitrag"
            unter="was du gelernt hast"
            haupt
            onPress={() => router.push('/compose')}
          />
          <Erstellen
            icon="comment"
            label="Frage"
            unter="deine Leute antworten"
            onPress={() => router.push('/compose?art=frage')}
          />
        </View>

        {geliked.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Text style={styles.abschnitt}>Karte empfehlen - aus deinen Likes</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.likes}
              style={styles.bleed}
            >
              {geliked.map((k) => (
                <Pressable
                  key={k.content_id}
                  onPress={() => {
                    haptics.light();
                    router.push(
                      `/compose?card=${encodeURIComponent(k.content_id)}&titel=${encodeURIComponent(k.title)}`,
                    );
                  }}
                  style={({ pressed }) => [styles.like, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.likeTitel} numberOfLines={3}>
                    {k.title}
                  </Text>
                  <View style={styles.likeFuss}>
                    <Text style={styles.likeTag} numberOfLines={1}>
                      #{k.category.split('.').pop()}
                    </Text>
                    <Text style={styles.likeAktion}>Empfehlen</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* --- Lernen ------------------------------------------------------ */}
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
          text="Oben schreibst du Beiträge und Fragen für deine Follower oder empfiehlst eine Karte. Darunter: Wiederholung, Duelle und Kurse, die aufeinander aufbauen."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
    </GridBackground>
  );
}

function Erstellen({
  icon,
  label,
  unter,
  haupt,
  onPress,
}: {
  icon: IconName;
  label: string;
  unter: string;
  haupt?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [styles.erstellKnopf, haupt && styles.erstellHaupt, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={[styles.erstellIcon, haupt && { backgroundColor: color.signal.primary }]}>
        <Icon name={icon} size={18} color={haupt ? color.bg : color.signal.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.erstellLabel}>{label}</Text>
        <Text style={styles.erstellUnter} numberOfLines={1}>
          {unter}
        </Text>
      </View>
    </Pressable>
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

  erstellen: { flexDirection: 'row', gap: space.md },
  erstellKnopf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  erstellHaupt: { borderColor: color.signal.primary },
  erstellIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgSunken,
  },
  erstellLabel: { ...type.label, fontSize: 15, color: color.ink.high },
  erstellUnter: { ...type.meta, fontSize: 10, color: color.ink.low },

  bleed: { marginHorizontal: -space.xl },
  likes: { paddingHorizontal: space.xl, gap: space.md },
  like: {
    width: 150,
    minHeight: 110,
    justifyContent: 'space-between',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  likeTitel: { ...type.body, fontSize: 14, lineHeight: 19, color: color.ink.high },
  likeFuss: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  likeTag: { ...type.meta, fontSize: 10, color: color.ink.low, flexShrink: 1 },
  likeAktion: { ...type.meta, fontSize: 10, color: color.signal.primary },

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
