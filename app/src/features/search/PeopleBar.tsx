import { router } from 'expo-router';
import React, { memo, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Appear } from '@/components/Appear';
import { Avatar } from '@/components/Avatar';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { api } from '@/lib/supabase';
import type { PersonHit } from '@/lib/types.db';
import { color, space, type } from '@/theme/tokens';

/**
 * Die Personenleiste oben in der Suche.
 *
 * Waagrecht durchwischen, Bild und Name, ein Tipp fuehrt aufs Profil - das
 * Muster kennt jeder aus Instagram, und genau deshalb muss es niemand lernen.
 *
 * Zwei Entscheidungen, die nicht offensichtlich sind:
 *
 * 1. **Bei null Treffern verschwindet die Leiste ganz.** Kein Platzhalter,
 *    keine graue Zeile "noch keine Personen". Am Anfang hat hier niemand
 *    Follower, und eine leere Leiste sagt dem Nutzer nur, dass die App leer
 *    ist. Weg damit, bis es etwas zu zeigen gibt.
 *
 * 2. **Fehler sind still.** Wenn der Aufruf scheitert, fehlt die Leiste -
 *    das ist der ganze Schaden. Eine Fehlermeldung ueber der Suche waere
 *    schlimmer als die fehlende Leiste.
 */
export const PeopleBar = memo(function PeopleBar() {
  const [people, setPeople] = useState<PersonHit[]>([]);

  useEffect(() => {
    let alive = true;
    void api
      .topPeople(15)
      .then((r) => alive && setPeople(r))
      .catch(() => alive && setPeople([]));
    return () => {
      alive = false;
    };
  }, []);

  if (people.length === 0) return null;

  return (
    <Appear style={styles.wrap} distance={0}>
      <Text style={styles.title}>Leute</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Der Rand gehoert in den Inhalt, nicht auf die Ansicht: sonst
        // schneidet die Kante die erste und letzte Person ab, statt dass sie
        // sauber darunter wegwischen.
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {people.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => {
              haptics.select();
              router.push(`/u/${encodeURIComponent(p.handle)}`);
            }}
            style={({ pressed }) => [styles.person, pressed && styles.personPressed]}
          >
            <Avatar seed={p.avatar_seed} path={p.avatar_path} size={56} />
            <Text style={styles.name} numberOfLines={1}>
              {personName(p)}
            </Text>
            <Text style={styles.followers} numberOfLines={1}>
              {p.follower_count}
            </Text>
          </Pressable>
        ))}
        <View style={styles.tail} />
      </ScrollView>
    </Appear>
  );
});

const styles = StyleSheet.create({
  // Negativer Rand, damit die Leiste die Seitenraender der Suche ueberlaeuft
  // und die Karten am Bildschirmrand wegwischen statt davor stehenzubleiben.
  wrap: { marginHorizontal: -space.xl, gap: space.sm },
  title: {
    ...type.label,
    color: color.ink.mid,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: space.xl,
  },
  row: { paddingHorizontal: space.xl, gap: space.lg, alignItems: 'flex-start' },
  person: { width: 64, alignItems: 'center', gap: 6 },
  personPressed: { opacity: 0.7 },
  name: { ...type.meta, color: color.ink.high, textAlign: 'center' },
  followers: { ...type.mono, fontSize: 10, color: color.ink.low },
  tail: { width: space.md },
});
