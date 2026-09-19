import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { BlueprintVisual } from '@/components/BlueprintVisual';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Icon } from '@/components/Icon';
import { FeedScreen } from '@/features/feed/FeedScreen';
import { api } from '@/lib/supabase';
import type { CourseDetail } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Kurs-Detail und Kurs-Player.
 *
 * Der Player ist derselbe FeedScreen wie ueberall - nur mit einem Loader, der
 * die Lektionen in fester Reihenfolge liefert, ohne Checkpoint und ohne
 * Tagesziel. Eine Lektion ist eine Karte; es gibt keinen zweiten Renderer,
 * der auseinanderlaufen koennte.
 */
export function CourseDetailScreen({ slug }: { slug: string }) {
  const insets = useSafeAreaInsets();
  // Vor jedem fruehen return: Hooks duerfen nicht bedingt laufen.
  const scrollY = useSharedValue(0);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const load = useCallback(async () => {
    try {
      setCourse(await api.courseDetail(slug));
    } catch (e) {
      setError(fehlerText(e, 'Kurs nicht ladbar'));
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const loader = useCallback(async () => {
    if (!course) return [];
    return api.courseFeed(course.id);
  }, [course]);

  if (playing && course) {
    return (
      <View style={styles.screen}>
        <FeedScreen
          loader={loader}
          withCheckpoint={false}
          reserveBottom={0}
          emptyTitle="Keine Lektionen"
          emptyBody="Diesem Kurs sind noch keine Lektionen zugeordnet."
        />
        <Pressable
          onPress={() => {
            setPlaying(false);
            void load();
          }}
          style={[styles.close, { top: insets.top + space.md }]}
          hitSlop={10}
        >
          <Icon name="close" size={16} color={color.ink.high} />
        </Pressable>
      </View>
    );
  }

  if (!course) {
    return (
      <GridBackground>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <Laden color={color.signal.primary} />}
        </View>
      </GridBackground>
    );
  }

  const accent = categoryAccent(course.accent);
  const doneCount = course.lessons.filter((l) => l.done).length;
  const total = course.lessons.length;

  const start = async () => {
    try {
      await api.startCourse(course.id);
    } catch {
      /* Fortschritt anzulegen darf den Start nicht blockieren. */
    }
    setPlaying(true);
  };

  return (
    <GridBackground>
      {/* Kopfzeile ausserhalb der Liste - sie bleibt stehen und
          klappt beim Scrollen zusammen. */}
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={course.title} titleInBarOnly scrollY={scrollY} />
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
        <BlueprintVisual seed={course.id} accentHex={course.accent} height={120} />

        <View style={styles.head}>
          <Text style={[styles.category, { color: accent }]}>
            {course.emoji ?? '◇'}  {course.category}
          </Text>
          <Text style={styles.title}>{course.title}</Text>
          <Text style={styles.description}>{course.description}</Text>
        </View>

        <View style={styles.stats}>
          <Text style={styles.statLine}>
            <Text style={{ color: accent }}>{doneCount}</Text> von {total} Lektionen
            {course.completed ? ' · abgeschlossen' : ''}
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${total ? Math.round((doneCount / total) * 100) : 0}%`, backgroundColor: accent },
              ]}
            />
          </View>
        </View>

        <View style={styles.lessons}>
          {course.lessons.map((l) => (
            <View key={l.position} style={styles.lesson}>
              <View
                style={[
                  styles.marker,
                  l.done
                    ? { backgroundColor: accent, borderColor: accent }
                    : { borderColor: color.ink.faint },
                ]}
              >
                {l.done ? (
                  <Icon name="check" size={15} color={color.bg} />
                ) : (
                  <Text style={styles.markerText}>{l.position}</Text>
                )}
              </View>
              <View style={styles.lessonText}>
                <Text style={[styles.lessonTitle, l.done && { color: color.ink.mid }]}>
                  {l.title}
                </Text>
                {l.deck ? (
                  <Text style={styles.lessonDeck} numberOfLines={1}>
                    {l.deck}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <Button
          label={doneCount === 0 ? 'Kurs starten' : course.completed ? 'Nochmal durchgehen' : 'Weitermachen'}
          accent={accent}
          onPress={start}
        />
        <Text style={styles.note}>
          Lektionen zählen wie normale Karten: gelesen zählt, gelöste Aufgaben
          geben Mastery, und die Fragen kommen später zur Wiederholung zurück.
        </Text>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  body: { paddingHorizontal: space.xl, gap: space.lg },


  head: { gap: space.xs },
  category: { ...type.meta },
  title: { ...type.display, fontSize: 28, lineHeight: 34, color: color.ink.max },
  description: { ...type.body, fontSize: 15, color: color.ink.mid },

  stats: { gap: space.sm },
  statLine: { ...type.body, fontSize: 15, color: color.ink.high },
  track: { height: 3, borderRadius: 3, backgroundColor: color.ink.faint },
  fill: { height: 3, borderRadius: 3 },

  lessons: { gap: space.sm },
  lesson: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  marker: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerText: { ...type.meta, color: color.ink.mid },
  lessonText: { flex: 1 },
  lessonTitle: { ...type.body, fontSize: 16, color: color.ink.high },
  lessonDeck: { ...type.meta, color: color.ink.low },

  note: { ...type.meta, color: color.ink.low, lineHeight: 17 },
  close: {
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
