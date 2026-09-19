import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { GridBackground } from '@/components/GridBackground';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { wann } from '@/features/posts/PostParts';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types.db';
import { ZWEI, sechseckRegel } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Die Glocke.
 *
 * Es gab sie nicht. Benachrichtigungen landeten seit 0051 in einer Tabelle,
 * und die Edge Function hakt Meldungen ohne angemeldetes Geraet mit dem
 * Kommentar "in der App unter der Glocke sichtbar" ab - nur war da keine.
 * Wer Push nicht eingeschaltet hatte, hat nie erfahren, dass ihm jemand
 * folgt.
 *
 * Beim Oeffnen wird alles als gelesen markiert, angezeigt wird aber der Stand
 * VOR dem Oeffnen: die neuen Zeilen sollen noch als neu erkennbar sein.
 */

const ICON: Record<string, IconName> = {
  follow: 'profile',
  repost: 'refresh',
  post_repost: 'refresh',
  post_like: 'like-filled',
  comment_like: 'like-filled',
  mention: 'comment',
  post_comment: 'comment',
  comment_reply: 'comment',
  duel: 'xp',
  review: 'clock',
  streak: 'streak',
};

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [liste, setListe] = useState<AppNotification[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async () => {
    try {
      const n = await api.myNotifications(60);
      setListe(n);
      setFehler(null);
      if (n.some((x) => !x.read_at)) void api.markNotificationsRead().catch(() => undefined);
    } catch (e) {
      setListe((alt) => alt ?? []);
      setFehler(fehlerText(e, 'Benachrichtigungen nicht ladbar'));
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Benachrichtigungen" titleInBarOnly scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={laedt}
            onRefresh={async () => {
              setLaedt(true);
              await laden();
              setLaedt(false);
            }}
            tintColor={color.ink.low}
          />
        }
      >
        {liste === null ? (
          <Laden color={color.signal.primary} style={{ marginTop: space.xxl }} />
        ) : liste.length === 0 ? (
          <View style={styles.leer}>
            <Text style={styles.leerText}>
              {fehler ??
                'Noch nichts. Wenn dir jemand folgt, deinen Beitrag kommentiert, dir antwortet oder dich zum Duell fordert, steht es hier.'}
            </Text>
            <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
              <Text style={styles.link}>Push aufs Handy einschalten</Text>
            </Pressable>
          </View>
        ) : (
          liste.map((n) => {
            const neu = !n.read_at;
            return (
              <Pressable
                key={n.id}
                onPress={() => {
                  if (!n.url) return;
                  haptics.light();
                  router.push(n.url as never);
                }}
                style={({ pressed }) => [styles.zeile, neu && styles.zeileNeu, pressed && { opacity: 0.8 }]}
              >
                <View style={[styles.icon, neu && { backgroundColor: color.bgElevated }]}>
                  <Icon name={ICON[n.kind] ?? 'bell'} size={17} color={neu ? color.signal.primary : color.ink.mid} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.titel, neu && { color: color.ink.max }]} numberOfLines={2}>
                    {n.title}
                  </Text>
                  {n.body ? (
                    <Text style={styles.text} numberOfLines={2}>
                      {n.body}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.rechts}>
                  <Text style={styles.wann}>{wann(n.created_at)}</Text>
                  {neu ? <View style={styles.punkt} /> : null}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingTop: space.md, gap: 2 },
  leer: { gap: space.md, padding: space.lg },
  leerText: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid },
  link: { ...type.meta, color: color.akzent },

  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
  },
  zeileNeu: { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgSunken,
    // Design 2.0: Sechseck statt Kreis, etwas heller als die Zeile.
    ...(ZWEI ? { width: 40, height: 40, backgroundColor: '#2A2227', ...sechseckRegel() } : null),
  },
  titel: { ...type.body, fontSize: 15, color: color.ink.high },
  text: { ...type.meta, color: color.ink.mid, lineHeight: 16 },
  rechts: { alignItems: 'flex-end', gap: 6 },
  wann: { ...type.meta, fontSize: 10, color: color.ink.low },
  punkt: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.signal.primary },
});
