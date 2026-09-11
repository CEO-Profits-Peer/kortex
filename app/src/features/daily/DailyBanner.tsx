import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Appear } from '@/components/Appear';
import { Icon } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Der Einstieg in die Tagesaufgabe.
 *
 * Steht ganz oben in den Kursen und aendert sich mit dem Zustand des Tages -
 * das ist der eigentliche Zweck. Ein Knopf, der immer gleich aussieht, wird
 * nach drei Tagen nicht mehr wahrgenommen. Einer, der "heute noch offen" und
 * spaeter "4 von 5" sagt, ist jedes Mal eine neue Information.
 *
 * Verschwindet, solange es keine Tagesaufgabe gibt. Ein Feld mit dem Text
 * "heute leider nichts" waere schlechter als gar keins: es macht auf etwas
 * aufmerksam, das gerade nicht da ist.
 */
export function DailyBanner() {
  const [state, setState] = useState<
    { kind: 'hidden' } | { kind: 'open' } | { kind: 'done'; correct: number; total: number }
  >({ kind: 'hidden' });

  useEffect(() => {
    let alive = true;
    void api
      .dailyChallenge()
      .then((c) => {
        if (!alive) return;
        if (!c.available) return setState({ kind: 'hidden' });
        if (c.result) {
          return setState({ kind: 'done', correct: c.result.correct, total: c.result.total });
        }
        setState({ kind: 'open' });
      })
      .catch(() => alive && setState({ kind: 'hidden' }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === 'hidden') return null;

  const open = state.kind === 'open';
  const tint = open ? color.signal.primary : color.signal.mastery;

  return (
    <Appear distance={6}>
      <Pressable
        onPress={() => {
          haptics.medium();
          router.push('/daily');
        }}
        style={({ pressed }) => [
          styles.card,
          { borderColor: tint },
          pressed && { opacity: 0.88 },
        ]}
      >
        <View style={[styles.mark, { borderColor: tint }]}>
          <Icon name={open ? 'streak' : 'check'} size={18} color={tint} />
        </View>

        <View style={styles.body}>
          <Text style={[styles.kicker, { color: tint }]}>Tagesaufgabe</Text>
          <Text style={styles.title}>
            {open ? 'Fünf Fragen. Für alle dieselben.' : `${state.correct} von ${state.total} richtig`}
          </Text>
          <Text style={styles.sub}>
            {open
              ? 'Heute noch offen — danach siehst du, wie die anderen abgeschnitten haben.'
              : 'Erledigt. Morgen früh gibt es fünf neue.'}
          </Text>
        </View>

        <Icon name="chevron" size={16} color={color.ink.low} />
      </Pressable>
    </Appear>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: color.bgElevated,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  kicker: { ...type.label, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { ...type.deck, color: color.ink.max },
  sub: { ...type.meta, color: color.ink.low },
});
