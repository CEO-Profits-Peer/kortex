import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import type { ContentType } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Schildchen oben links auf jeder Karte.
 *
 * Kommt aus einer konkreten Rückmeldung: "Tests klar als Tests erkennbar".
 * Vorher sah eine Karte mit Aufgabe genauso aus wie eine zum Lesen — man
 * merkte erst nach dem Scrollen, dass etwas von einem erwartet wird.
 *
 * Aufgaben-Karten bekommen deshalb nicht nur ein anderes Wort, sondern eine
 * eigene Farbe (Signalfarbe statt Grau) und einen durchgezogenen Rahmen. Das
 * ist die einzige Stelle im Ruhezustand, an der Farbe ohne Interaktion
 * erscheint — und genau deshalb fällt sie auf.
 */

const CONFIG: Record<
  ContentType,
  { label: string; icon: IconName; accent: boolean }
> = {
  news: { label: 'News', icon: 'news', accent: false },
  knowledge: { label: 'Wissen', icon: 'knowledge', accent: false },
  interactive: { label: 'Aufgabe', icon: 'interactive', accent: true },
  course_lesson: { label: 'Lektion', icon: 'lesson', accent: false },
  sponsor: { label: 'Empfehlung', icon: 'source', accent: false },
};

export function CardTypeBadge({
  contentType,
  tint,
}: {
  contentType: ContentType;
  /** Kategoriefarbe — nur Aufgaben-Karten nutzen sie */
  tint?: string;
}) {
  const cfg = CONFIG[contentType] ?? CONFIG.knowledge;
  const c = cfg.accent ? (tint ?? color.signal.primary) : color.ink.mid;

  return (
    <View
      style={[
        styles.badge,
        cfg.accent
          ? { borderColor: c, borderWidth: 1 }
          : { borderColor: color.ink.faint, borderWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Icon name={cfg.icon} size={13} color={c} />
      <Text style={[styles.label, { color: c }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: space.sm,
    paddingRight: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: color.bgElevated,
  },
  label: { ...type.meta, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
});
