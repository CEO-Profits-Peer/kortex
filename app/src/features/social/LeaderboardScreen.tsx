import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

import { Avatar } from '@/components/Avatar';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { api } from '@/lib/supabase';
import type { LeaderboardRow } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Rangliste.
 *
 * Läuft über mastery_total, NICHT über xp_total. Das ist die wichtigste
 * einzelne Entscheidung in diesem Bildschirm: Mastery entsteht ausschliesslich
 * aus geloesten Aufgaben und Wiederholungen. Wuerde hier XP stehen, gewaenne
 * schlicht, wer am meisten scrollt - und die App waere genau die
 * Aufmerksamkeitsmaschine, gegen die sie antritt.
 *
 * Deshalb steht der Hinweis darauf auch sichtbar im Bildschirm und nicht nur
 * im Code.
 */

type Scope = 'region' | 'friends' | 'global';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'region', label: 'Region' },
  { key: 'friends', label: 'Freunde' },
  { key: 'global', label: 'Global' },
];

export function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  // Vor jedem fruehen return: Hooks duerfen nicht bedingt laufen.
  const scrollY = useSharedValue(0);
  const [scope, setScope] = useState<Scope>('region');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (s: Scope) => {
    setRows(null);
    try {
      setRows(await api.leaderboard(s, 50));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rangliste nicht ladbar');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load(scope);
  }, [scope, load]);

  const me = rows?.find((r) => r.is_me);

  return (
    <GridBackground>
      {/* Die Kopfzeile liegt AUSSERHALB der Liste: sie muss stehen
          bleiben, um beim Scrollen zusammenklappen zu koennen. */}
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Rangliste" scrollY={scrollY} />
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

        <View style={styles.scopes}>
          {SCOPES.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => {
                haptics.select();
                setScope(s.key);
              }}
              style={[styles.scope, scope === s.key && styles.scopeOn]}
            >
              <Text style={[styles.scopeText, scope === s.key && styles.scopeTextOn]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.note}>
          Gewertet wird <Text style={{ color: color.signal.mastery }}>Mastery</Text> — nur
          gelöste Aufgaben und Wiederholungen. Gelesene Grids zählen hier nicht.
        </Text>

        {rows === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={color.signal.mastery} />
          </View>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>
            {error ??
              (scope === 'friends'
                ? 'Freunde sind gegenseitige Follows. Noch keine — such jemanden über @handle und folge. Wer zurückfolgt, steht hier.'
                : 'Noch niemand hier. Sei die erste Person.')}
          </Text>
        ) : (
          <View style={styles.list}>
            {rows.map((row) => (
              <Pressable
                key={row.handle}
                onPress={() => {
                  haptics.light();
                  router.push(`/u/${encodeURIComponent(row.handle)}`);
                }}
                style={({ pressed }) => [
                  styles.row,
                  row.is_me && styles.rowMe,
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={personName(row)}
              >
                <Text style={[styles.rank, row.rank_pos <= 3 && styles.rankTop]}>
                  {row.rank_pos}
                </Text>
                <Avatar seed={row.avatar_seed} path={row.avatar_path} size={32} />
                <View style={styles.who}>
                  <Text
                    style={[styles.handle, row.is_me && { color: color.signal.primary }]}
                    numberOfLines={1}
                  >
                    {personName(row)}
                    {row.is_me ? '  ·  du' : ''}
                  </Text>
                  {row.streak_current > 0 ? (
                    <Text style={styles.streak}>{row.streak_current} Tage Streak</Text>
                  ) : null}
                </View>
                <Text style={[styles.mastery, { color: color.signal.mastery }]}>
                  {row.mastery_total}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {rows && rows.length > 0 && !me ? (
          <Text style={styles.empty}>
            Du erscheinst nicht in dieser Liste. In den Einstellungen lässt sich
            das umschalten.
          </Text>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.lg },
  center: { paddingVertical: space.xxxl, alignItems: 'center' },


  scopes: { flexDirection: 'row', gap: space.sm },
  scope: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  scopeOn: { borderColor: color.signal.mastery, backgroundColor: color.bgElevated },
  scopeText: { ...type.meta, color: color.ink.mid },
  scopeTextOn: { color: color.signal.mastery },

  note: { ...type.meta, color: color.ink.low, lineHeight: 17 },

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
  rowMe: { borderWidth: 1, borderColor: color.signal.primary },
  rank: { ...type.mono, width: 26, color: color.ink.low, textAlign: 'right' },
  rankTop: { color: color.ink.max },
  who: { flex: 1 },
  handle: { ...type.body, fontSize: 15, color: color.ink.high },
  streak: { ...type.meta, color: color.signal.warn },
  mastery: { ...type.label, fontSize: 16 },

  empty: { ...type.body, fontSize: 15, color: color.ink.mid, paddingTop: space.lg },
});
