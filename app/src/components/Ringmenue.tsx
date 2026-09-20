import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import type { MenuEintrag } from '@/components/KartenMenue';
import { haptics } from '@/lib/haptics';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Der Ring (20.09., einschaltbar).
 *
 * Langer Druck auf die Karte, und die Symbole legen sich um den Finger.
 * Kein Knopf, keine Leiste - nichts ist sichtbar, bis man es will.
 *
 * Warum der Ring nicht ueber dem Finger sitzt, sondern darum herum: was
 * unter dem Daumen liegt, sieht man nicht. Der Ring laesst die Mitte frei.
 *
 * Warum nur sechs: mehr Symbole im Kreis liegen so eng, dass man daneben
 * trifft. Was nicht in den Ring passt, steht weiter im Menue.
 *
 * Standard ist AUS. Nach 50 gelesenen Karten fragt die App einmal, ob man
 * es will - vorher weiss niemand, wovon die Rede ist.
 */
const RADIUS = 78;
const MAX = 6;

export function Ringmenue({
  x,
  y,
  eintraege,
  onClose,
}: {
  /** Druckpunkt in der Karte. */
  x: number;
  y: number;
  eintraege: MenuEintrag[];
  onClose: () => void;
}) {
  const sichtbar = eintraege.slice(0, MAX);
  return (
    <>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={T('Schließen')} />
      <Animated.View
        entering={FadeIn.duration(140)}
        exiting={FadeOut.duration(120)}
        pointerEvents="box-none"
        style={[styles.mitte, { left: x, top: y }]}
      >
        <View style={styles.punkt} pointerEvents="none" />
        {sichtbar.map((e, i) => {
          // Oben anfangen und im Uhrzeigersinn verteilen.
          const w = (Math.PI * 2 * i) / sichtbar.length - Math.PI / 2;
          const dx = Math.cos(w) * RADIUS;
          const dy = Math.sin(w) * RADIUS;
          return (
            <Animated.View
              key={e.id}
              entering={ZoomIn.delay(i * 28).duration(160)}
              style={[styles.platz, { transform: [{ translateX: dx }, { translateY: dy }] }]}
            >
              <Pressable
                onPress={() => {
                  haptics.light();
                  e.onPress();
                }}
                style={({ pressed }) => [styles.knopf, e.aktiv && { borderColor: color.akzent }, pressed && { opacity: 0.8 }]}
                accessibilityLabel={e.label}
              >
                <Icon name={e.icon} size={18} color={e.aktiv ? color.akzent : color.ink.max} />
              </Pressable>
              <Text style={styles.label} numberOfLines={1}>
                {e.label}
              </Text>
            </Animated.View>
          );
        })}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  mitte: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  punkt: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    marginLeft: -7,
    marginTop: -7,
  },
  platz: { position: 'absolute', alignItems: 'center', gap: 3, width: 84, marginLeft: -42, marginTop: -26 },
  knopf: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    ...flaeche(12),
  },
  label: {
    ...type.meta,
    fontSize: 9.5,
    color: color.ink.high,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export const RING_MAX = MAX;
export const RING_SPACING = space.xs;
