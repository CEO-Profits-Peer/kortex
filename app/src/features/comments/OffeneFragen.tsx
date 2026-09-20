import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { OffeneFrage } from '@/lib/types.db';
import { T } from '@/lib/sprache';
import { color, radius, space, type } from '@/theme/tokens';

import { CommentSheet } from './CommentSheet';

/**
 * "Kannst du helfen?" (0115): offene Fragen zu Karten, die man selbst
 * gelesen hat. Antippen oeffnet direkt die Kommentare der Karte - dort
 * "Antworten". Leer = gar nicht da; eine leere Ueberschrift waere Laerm.
 */
export function OffeneFragen() {
  const [fragen, setFragen] = useState<OffeneFrage[]>([]);
  const [offen, setOffen] = useState<OffeneFrage | null>(null);

  const laden = useCallback(() => {
    api
      .offeneFragen(3)
      .then(setFragen)
      .catch(() => setFragen([]));
  }, []);
  useFocusEffect(laden);

  if (fragen.length === 0) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.titel}>{T('Kannst du helfen?')}</Text>
      {fragen.map((f) => (
        <Pressable
          key={f.id}
          onPress={() => {
            haptics.light();
            setOffen(f);
          }}
          style={({ pressed }) => [styles.frage, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.body} numberOfLines={2}>
            „{f.body}“
          </Text>
          <View style={styles.fuss}>
            <Pressable onPress={() => router.push(`/reel/${encodeURIComponent(f.content_id)}`)} hitSlop={6} style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.karte} numberOfLines={1}>
                {f.title}
              </Text>
            </Pressable>
            <Text style={styles.zahl}>
              {f.antworten === 0 ? 'noch keine Antwort' : `${f.antworten} ${f.antworten === 1 ? 'Antwort' : 'Antworten'}`}
            </Text>
          </View>
        </Pressable>
      ))}
      {offen ? (
        <CommentSheet
          contentId={offen.content_id}
          cardTitle={offen.title}
          visible
          onClose={() => {
            setOffen(null);
            laden();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  titel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  frage: {
    gap: 4,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.akzent,
    backgroundColor: color.bgElevated,
  },
  body: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.max },
  fuss: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  karte: { ...type.meta, fontSize: 11, color: color.ink.mid, textDecorationLine: 'underline' },
  zahl: { ...type.meta, fontSize: 11, color: color.ink.low },
});
