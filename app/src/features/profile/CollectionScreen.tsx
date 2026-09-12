import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { api } from '@/lib/supabase';
import type { CollectionEntry } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Alles Empfohlene bzw. alles Gelikte - der Bildschirm hinter "Alle ansehen".
 *
 * Warum ueberhaupt getrennt: das Profil hatte beide Listen vollstaendig
 * untereinander. Nach ein paar Wochen scrollt man damit minutenlang an der
 * eigenen Vergangenheit vorbei, bevor der Lernstand kommt - und der ist der
 * Grund, warum man das Profil aufmacht. Ein Auszug beantwortet "habe ich
 * das?", die ganze Liste beantwortet "was hatte ich alles?". Zwei Fragen,
 * zwei Orte.
 *
 * Nachgeladen wird seitenweise mit Versatz. Kein unendliches Scrollen ohne
 * Boden: der Knopf sagt, dass es weitergeht, und wer nicht will, hoert auf.
 */

const SEITE = 40;

export function CollectionScreen({ kind }: { kind: 'reposts' | 'likes' }) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [items, setItems] = useState<CollectionEntry[] | null>(null);
  const [mehr, setMehr] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // In einer Ref, nicht im State: die Laenge steht schon in `items`, und ein
  // zweiter Zaehler im State waere eine zweite Wahrheit.
  const laeuft = useRef(false);

  const laden = useCallback(
    async (offset: number) => {
      if (laeuft.current) return;
      laeuft.current = true;
      setBusy(true);
      try {
        const seite = await api.myCollection(kind, SEITE, offset);
        setItems((prev) => (offset === 0 ? seite : [...(prev ?? []), ...seite]));
        setMehr(seite.length === SEITE);
        setFehler(null);
      } catch (e) {
        setFehler(e instanceof Error ? e.message : 'Liste nicht ladbar');
        setItems((prev) => prev ?? []);
      } finally {
        laeuft.current = false;
        setBusy(false);
      }
    },
    [kind],
  );

  useEffect(() => {
    void laden(0);
  }, [laden]);

  const titel = kind === 'reposts' ? 'Empfohlen' : 'Geliked';

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title={titel}
          eyebrow={items ? `${items.length}${mehr ? '+' : ''}` : undefined}
          scrollY={scrollY}
          onBack={() => router.back()}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + space.xxxl },
        ]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {items === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={color.signal.primary} />
          </View>
        ) : items.length === 0 ? (
          <Text style={styles.empty}>
            {fehler ??
              (kind === 'reposts'
                ? 'Noch nichts empfohlen. Der Repost-Knopf sitzt rechts an jeder Karte.'
                : 'Noch nichts geliked. Doppeltippen auf eine Karte reicht.')}
          </Text>
        ) : (
          <View style={styles.list}>
            {items.map((r) => (
              <Pressable
                key={r.content_id}
                onPress={() => router.push(`/category/${encodeURIComponent(r.category)}`)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.text}>
                  <Text style={styles.title} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    #{r.category.split('.').pop()}
                    {r.comment ? `  ·  ${r.comment}` : ''}
                  </Text>
                </View>
                {r.likes > 0 ? (
                  <View style={styles.likes}>
                    <Icon name="like-filled" size={10} color={color.ink.low} />
                    <Text style={styles.meta}>{r.likes}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {items && items.length > 0 && mehr ? (
          <Pressable
            onPress={() => void laden(items.length)}
            disabled={busy}
            style={({ pressed }) => [styles.more, pressed && { opacity: 0.75 }]}
          >
            {busy ? (
              <ActivityIndicator color={color.ink.low} />
            ) : (
              <Text style={styles.moreText}>Weitere laden</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  center: { paddingVertical: space.xxxl, alignItems: 'center' },

  list: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  text: { flex: 1, gap: 3 },
  title: { ...type.body, fontSize: 14.5, lineHeight: 20, color: color.ink.high },
  meta: { ...type.meta, fontSize: 9.5, color: color.ink.low },
  likes: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  more: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  moreText: { ...type.label, fontSize: 13, color: color.ink.mid },

  empty: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid },
});
