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

/**
 * Ab wann eine Nachricht nicht mehr als aktuell durchgeht.
 *
 * Vierzehn Tage - dieselbe Frist, nach der Nachrichtenkarten frueher aus
 * dem Feed VERSCHWUNDEN sind. Sie verschwinden nicht mehr (Migration
 * 0049): eine Meldung von letztem Monat ist nicht wertlos, sie ist
 * veraltet. Das ist etwas, das man anschreibt.
 */
const STALE_AFTER_DAYS = 14;

export function isStale(contentType: ContentType, when: string | null | undefined): boolean {
  if (contentType !== 'news' || !when) return false;
  const age = Date.now() - new Date(when).getTime();
  return age > STALE_AFTER_DAYS * 86400_000;
}

/**
 * „NICHT AKTUELL" plus Datum.
 *
 * Bewusst in der Warnfarbe und bewusst in Grossbuchstaben: wer eine alte
 * Meldung fuer die heutige Lage haelt, hat aus der Karte etwas Falsches
 * gelernt. Das Datum steht daneben, weil "alt" allein nichts sagt - zwei
 * Wochen und zwei Jahre sind ein Unterschied.
 */
export function StaleBadge({ when }: { when: string }) {
  const d = new Date(when);
  const label = Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <View style={styles.stale}>
      <Icon name="clock" size={12} color={color.signal.warn} />
      <Text style={styles.staleText}>
        NICHT AKTUELL{label ? ` · ${label}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.signal.warn,
  },
  staleText: {
    ...type.meta,
    fontSize: 10,
    letterSpacing: 0.6,
    color: color.signal.warn,
  },
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
