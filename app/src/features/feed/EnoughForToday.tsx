import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { analytics } from '@/lib/analytics';
import { BRAND } from '@/lib/brand';
import { T } from '@/lib/sprache';
import { color, space, type } from '@/theme/tokens';

/**
 * "Das reicht für heute."
 *
 * Das Feature, das diese App von jedem anderen Feed unterscheidet - und das
 * einzige, das gegen die eigene Nutzungsdauer arbeitet.
 *
 * Es ist bewusst KEINE Sperre. Wer weiterlesen will, liest weiter; der Knopf
 * dafür steht gleichberechtigt daneben. Was zählt, ist, dass die App den
 * Moment überhaupt anbietet, statt endlos weiterzuschieben.
 *
 * Wenn dieser Bildschirm jemals "wegen Engagement" verschwindet, ist es eine
 * andere App (docs/ARCHITECTURE.md, Abschnitt "Die ehrliche Version").
 */
export function EnoughForToday({
  cardsRead,
  reviewsDue,
  onContinue,
}: {
  cardsRead: number;
  reviewsDue: number;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();

  const stop = () => {
    analytics.enoughForToday(cardsRead, true);
    router.replace('/profile');
  };

  const keepGoing = () => {
    analytics.enoughForToday(cardsRead, false);
    onContinue();
  };

  return (
    <GridBackground>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
        ]}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Tagesziel erreicht</Text>
          <Text style={styles.number}>{cardsRead}</Text>
          <Text style={styles.label}>{BRAND.unit.many} heute gelesen</Text>

          <Text style={styles.body}>{T('Das reicht für heute. Was davon hängen geblieben ist, fragen wir dich in den nächsten Tagen — genau dann entsteht der Unterschied zwischen Gelesenem und Gewusstem.')}</Text>

          {reviewsDue > 0 ? (
            <View style={styles.reviewHint}>
              <Text style={[styles.reviewText, { color: color.signal.mastery }]}>
                {reviewsDue} Wiederholung{reviewsDue === 1 ? '' : 'en'} warten schon
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button label={T("Für heute reicht's")} onPress={stop} />
          <Button label={T('Trotzdem weiterlesen')} variant="quiet" onPress={keepGoing} />
        </View>
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', gap: space.sm },
  eyebrow: {
    ...type.meta,
    color: color.signal.warn,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  number: {
    ...type.display,
    fontSize: 88,
    lineHeight: 92,
    color: color.ink.max,
    letterSpacing: -3,
  },
  label: { ...type.deck, color: color.ink.mid },
  body: { ...type.body, color: color.ink.high, marginTop: space.lg, maxWidth: 420 },

  reviewHint: { marginTop: space.lg },
  reviewText: { ...type.label, fontSize: 15 },

  actions: { gap: space.sm },
});
