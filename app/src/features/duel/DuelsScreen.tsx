import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { DuelListEntry } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Die eigenen Duelle.
 *
 * Ein Duell laeuft asynchron: beide spielen dieselben fuenf Karten und
 * dieselben fuenf Fragen, aber jeder, wann er will - 24 Stunden lang. Kein
 * "dein Gegner wartet", keine Verabredung. Deshalb braucht es diese Liste:
 * sie ist der Ort, an dem ein Duell weitergeht.
 */

/** Was steht rechts an der Zeile? Eine Zeile, die alles erklaert. */
function stand(d: DuelListEntry): { text: string; ton: string } {
  if (d.mein_stand === 'fertig') {
    if (!d.gegner_fertig) return { text: 'wartet auf Gegner', ton: color.ink.low };
    const ich = d.meine_punkte ?? 0;
    const er = d.gegner_punkte ?? 0;
    if (ich > er) return { text: `gewonnen ${ich}:${er}`, ton: color.signal.success };
    if (ich < er) return { text: `verloren ${ich}:${er}`, ton: color.ink.mid };
    return { text: `unentschieden ${ich}:${er}`, ton: color.signal.warn };
  }
  if (!d.laeuft) return { text: 'abgelaufen', ton: color.ink.faint };
  if (d.mein_stand === 'laeuft') return { text: 'angefangen', ton: color.signal.warn };
  return { text: 'du bist dran', ton: color.signal.primary };
}

export function DuelsScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [duelle, setDuelle] = useState<DuelListEntry[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      setDuelle(await api.duelList());
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Duelle nicht ladbar');
      setDuelle([]);
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title="Duelle"
          eyebrow="fünf karten, eine minute"
          scrollY={scrollY}
          onBack={() => router.back()}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {duelle === null ? (
          <ActivityIndicator color={color.signal.primary} style={{ marginTop: space.xxl }} />
        ) : duelle.length === 0 ? (
          <Text style={styles.leer}>
            {fehler ??
              'Noch kein Duell. Öffne das Profil von jemandem, dem du folgst — dort steht der Knopf.'}
          </Text>
        ) : (
          <View style={styles.liste}>
            {duelle.map((d) => {
              const s = stand(d);
              const dran = d.laeuft && d.mein_stand !== 'fertig';
              return (
                <Pressable
                  key={d.id}
                  onPress={() => {
                    if (!dran) return;
                    haptics.light();
                    router.push(`/duel/${d.id}`);
                  }}
                  style={({ pressed }) => [
                    styles.zeile,
                    dran && styles.zeileDran,
                    pressed && dran && { opacity: 0.75 },
                  ]}
                >
                  <Avatar seed={d.gegner.avatar_seed} path={d.gegner.avatar_path} size={38} />
                  <View style={styles.text}>
                    <Text style={styles.name} numberOfLines={1}>
                      {d.gegner.name || d.gegner.handle}
                    </Text>
                    <Text style={[styles.stand, { color: s.ton }]} numberOfLines={1}>
                      {s.text}
                    </Text>
                  </View>
                  {dran ? <Text style={styles.los}>spielen</Text> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.regeln}>
          Beide bekommen dieselben fünf Karten und dieselbe Minute, danach dieselben
          fünf Fragen mit 20 Sekunden je Frage. Die Uhr läuft auf dem Server. Wer
          verliert, verliert nichts.
        </Text>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },

  liste: { gap: 2 },
  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  zeileDran: { borderColor: color.signal.primary },
  text: { flex: 1, gap: 2 },
  name: { ...type.body, fontSize: 15, color: color.ink.max },
  stand: { ...type.meta, fontSize: 9.5 },
  los: { ...type.label, fontSize: 13, color: color.signal.primary },

  leer: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid },
  regeln: { ...type.meta, fontSize: 9, lineHeight: 15, color: color.ink.faint },
});
