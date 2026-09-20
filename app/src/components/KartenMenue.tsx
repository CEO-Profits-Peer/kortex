import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Menue hinter den drei Punkten (20.09.).
 *
 * Warum es das gibt
 * -----------------
 * Die Karte trug zuletzt zehn Bedienelemente. Jedes einzelne war richtig,
 * zusammen war es eine Werkzeugleiste mit Text dahinter. Sichtbar bleibt
 * jetzt, was BEIM Lesen passiert - Vorlesen, Like, Kommentar, Teilen -,
 * alles andere steht hier.
 *
 * Drei Entscheidungen, die es von einem Blatt unterscheiden:
 *
 *   1. ES IST KEIN MODAL. Ein Blatt von unten legt sich ueber die Karte
 *      und haelt sie an. Dieses Menue liegt IN der Karte: die Erklaerkarte
 *      laeuft weiter, die Stimme spricht weiter, man kann dabei zusehen.
 *   2. ES SCHLIESST ueberall. Das × oben, ein Tipp daneben, ein Tipp auf
 *      denselben Knopf - drei Wege, und keiner haelt die Karte an.
 *   3. ES SCROLLT. Zehn Eintraege passen auf kein Telefon; statt sie zu
 *      verkleinern, darf die Liste laufen.
 */
export type MenuEintrag = {
  id: string;
  icon: IconName;
  label: string;
  /** Rechts in der Zeile - ein Haken, eine Zahl, ein Zustand. */
  rechts?: string;
  aktiv?: boolean;
  gefahr?: boolean;
  onPress: () => void;
};

export function KartenMenue({
  eintraege,
  onClose,
}: {
  eintraege: MenuEintrag[];
  onClose: () => void;
}) {
  return (
    <>
      {/* Faengt den Tipp daneben. Deckt die Karte NICHT ab: sie soll
          sichtbar bleiben und weiterlaufen. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={T('Menü schließen')} />

      <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} style={styles.menue}>
        <View style={styles.kopf}>
          <Text style={styles.titel}>{T('Mehr')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={T('Schließen')}>
            <Icon name="close" size={15} color={color.ink.mid} />
          </Pressable>
        </View>

        <ScrollView style={styles.liste} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          {eintraege.map((e, i) => (
            <Animated.View key={e.id} entering={FadeIn.delay(Math.min(i, 6) * 25)}>
              <Pressable
                onPress={() => {
                  haptics.light();
                  e.onPress();
                }}
                style={({ pressed }) => [styles.zeile, pressed && { backgroundColor: color.bgSunken }]}
              >
                <Icon
                  name={e.icon}
                  size={16}
                  color={e.gefahr ? color.signal.error : e.aktiv ? color.akzent : color.ink.mid}
                />
                <Text
                  style={[
                    styles.label,
                    e.aktiv && { color: color.akzent },
                    e.gefahr && { color: color.signal.error },
                  ]}
                  numberOfLines={1}
                >
                  {e.label}
                </Text>
                {e.rechts ? <Text style={styles.rechts}>{e.rechts}</Text> : null}
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  menue: {
    position: 'absolute',
    right: 0,
    bottom: 56,
    width: 232,
    // Zehn Eintraege passen nicht auf ein Telefon - die Liste darf laufen.
    maxHeight: 320,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    paddingVertical: space.xs,
    ...flaeche(16),
  },
  kopf: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  titel: { ...type.meta, fontSize: 10, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  liste: { flexGrow: 0 },
  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: 11,
  },
  label: { ...type.label, fontSize: 14, color: color.ink.high, flex: 1, minWidth: 0 },
  rechts: { ...type.meta, fontSize: 11, color: color.ink.low },
});
