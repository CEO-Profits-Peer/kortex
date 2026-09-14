import React, { memo, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { Category, ContentItem } from '@/lib/types.db';
import { type } from '@/theme/tokens';

/**
 * Die Hashtags einer Karte, oben in einer Zeile - und wenn sie nicht
 * hineinpassen, laufen sie langsam durch.
 *
 * Gewuenscht: "Mehrere #s fuer einen Reel, werden oben horizontal
 * durchgeflogen, langsam".
 *
 * Drei Entscheidungen:
 *   - Es laeuft nur, was nicht passt. Zwei kurze Hashtags, die nebeneinander
 *     Platz haben, stehen still - Bewegung ohne Grund lenkt vom Lesen ab.
 *   - Es laeuft nur auf der Karte, die im Bild ist. Drei Karten sind
 *     gleichzeitig gerendert (FeedScreen, windowSize 3); drei Laufbaender,
 *     von denen zwei niemand sieht, kosten Bildrate beim Wischen.
 *   - Vor jeder Runde eine Pause am Anfang, damit der erste Hashtag - die
 *     Hauptkategorie - lesbar ist, bevor er wegwandert.
 *
 * Mit "Bewegung reduzieren" (Einstellungen) steht die Zeile still.
 */

/** Pixel je Sekunde. "Langsam" - lesbar im Vorbeiziehen. */
const TEMPO = 26;
const PAUSE_MS = 1600;
const ABSTAND = 28;
const HOEHE = 18;

export type Hashtag = {
  key: string;
  label: string;
  /** Kategorie -> Kategorie-Seite; Schlagwort -> Suche. */
  ziel: { art: 'kategorie'; id: string } | { art: 'suche'; q: string };
};

function normal(s: string): string {
  return s.toLocaleLowerCase('de').replace(/[\s\-_&.]+/g, '');
}

/**
 * Hashtags einer Karte: erst die Kategorien (die Hauptkategorie vorn), dann
 * die Schlagworte aus der Pipeline (media.tags), soweit sie nicht dasselbe
 * sagen wie eine Kategorie. Hoechstens sechs.
 */
export function hashtagsFuer(item: ContentItem, categories: Record<string, Category>): Hashtag[] {
  const out: Hashtag[] = [];
  const schon = new Set<string>();

  const ids = [item.primary_category_id, ...(item.category_ids ?? [])];
  for (const id of ids) {
    const c = categories[id];
    if (!c || schon.has(`k:${id}`)) continue;
    schon.add(`k:${id}`);
    schon.add(normal(c.slug));
    schon.add(normal(c.display_name));
    out.push({ key: `k:${id}`, label: c.slug, ziel: { art: 'kategorie', id } });
  }

  const tags = (item.media as { tags?: unknown } | null)?.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (typeof t !== 'string' || !t.trim()) continue;
      const n = normal(t);
      if (!n || schon.has(n)) continue;
      schon.add(n);
      out.push({ key: `t:${n}`, label: n, ziel: { art: 'suche', q: t.trim() } });
    }
  }
  return out.slice(0, 6);
}

// Im Browser misst ein absolut gesetzter Streifen sonst nur so breit wie sein
// Fenster - dann passt scheinbar alles, und nichts laeuft.
const INHALTSBREITE: ViewStyle =
  Platform.OS === 'web' ? ({ width: 'max-content' } as unknown as ViewStyle) : {};

// Rechts ausblenden, wenn es weitergeht: so sieht man, dass da noch etwas kommt.
const MASKE: ViewStyle =
  Platform.OS === 'web'
    ? ({
        maskImage: 'linear-gradient(90deg, #000 0, #000 calc(100% - 22px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(90deg, #000 0, #000 calc(100% - 22px), transparent 100%)',
      } as unknown as ViewStyle)
    : {};

function HashtagLaufBase({
  tags,
  farbe,
  aktiv,
  ruhig,
  onPress,
}: {
  tags: Hashtag[];
  farbe: string;
  /** Diese Karte ist im Bild. */
  aktiv: boolean;
  /** Bewegung reduzieren. */
  ruhig: boolean;
  onPress: (t: Hashtag) => void;
}) {
  const [fenster, setFenster] = useState(0);
  const [inhalt, setInhalt] = useState(0);
  const x = useSharedValue(0);

  const zuBreit = fenster > 0 && inhalt > fenster + 1;
  const laeuft = zuBreit && aktiv && !ruhig;

  useEffect(() => {
    cancelAnimation(x);
    x.value = 0;
    if (!laeuft) return;
    const weg = inhalt + ABSTAND;
    // Zwei Kopien hintereinander: am Ende der Strecke steht die zweite genau
    // dort, wo die erste angefangen hat - der Sprung zurueck ist unsichtbar.
    x.value = withRepeat(
      withSequence(
        withDelay(PAUSE_MS, withTiming(-weg, { duration: (weg / TEMPO) * 1000, easing: Easing.linear })),
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [laeuft, inhalt, x]);

  const bewegung = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  if (tags.length === 0) return null;

  const reihe = (kopie: boolean) => (
    <View
      style={[styles.reihe, INHALTSBREITE]}
      onLayout={kopie ? undefined : (e) => setInhalt(e.nativeEvent.layout.width)}
    >
      {tags.map((t) => (
        <Pressable key={t.key} onPress={() => onPress(t)} hitSlop={6} style={styles.tag}>
          <Text style={[styles.tagText, { color: farbe }]} numberOfLines={1}>
            #{t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={[styles.fenster, zuBreit && MASKE]} onLayout={(e) => setFenster(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.band, INHALTSBREITE, bewegung]}>
        {reihe(false)}
        {laeuft ? <View style={{ width: ABSTAND }} /> : null}
        {laeuft ? reihe(true) : null}
      </Animated.View>
    </View>
  );
}

export const HashtagLauf = memo(HashtagLaufBase);

const styles = StyleSheet.create({
  fenster: { flex: 1, minWidth: 0, height: HOEHE, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center' },
  reihe: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'nowrap' },
  tag: { flexShrink: 0 },
  tagText: { ...type.meta, textTransform: 'lowercase', letterSpacing: 0.6 },
});
