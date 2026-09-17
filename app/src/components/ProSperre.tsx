import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { BordeauxMuster, SechseckLinse } from '@/components/Sechseck';
import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { ZWEI, facette, sechseckRegelPunkte } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das PRO-Fenster: erscheint, wenn jemand an eine Grenze stoesst.
 *
 * Aufrufbar von ueberall mit `zeigeProSperre(satz)` - wie RewardLayer liegt
 * der Host einmal ueber der ganzen App (_layout.tsx). So muss kein
 * Bildschirm ein eigenes Fenster mitbringen.
 *
 * Zwei Knoepfe, und "Später" ist gleich leicht zu treffen wie "Ansehen".
 * Ein Fenster, aus dem man schwer herauskommt, verkauft einmal und
 * vertreibt dauerhaft.
 */

type Sperre = { satz: string } | null;

let aktuell: Sperre = null;
const hoerer = new Set<(s: Sperre) => void>();

export function zeigeProSperre(satz: string) {
  aktuell = { satz };
  haptics.light();
  analytics.proGeoeffnet();
  hoerer.forEach((fn) => fn(aktuell));
}

function schliessen() {
  aktuell = null;
  hoerer.forEach((fn) => fn(null));
}

/** Kleines Schloss-Sechseck, fuer Optionen, die PRO brauchen. */
export function ProMarke({ klein }: { klein?: boolean }) {
  const g = klein ? 16 : 20;
  return (
    <View style={{ width: g, height: g, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={g} height={g} style={StyleSheet.absoluteFill}>
        <Polygon points={sechseckRegelPunkte(g, 0.5)} fill={color.bordeaux} stroke={color.signal.primary} strokeWidth={1} />
      </Svg>
      <Icon name="lock" size={klein ? 9 : 11} color={color.signal.primary} />
    </View>
  );
}

/** Das Abzeichen neben Namen: "PRO" auf Bordeaux. */
export function ProAbzeichen() {
  return (
    <View style={styles.abzeichen}>
      <Text style={styles.abzeichenText}>PRO</Text>
    </View>
  );
}

export function ProSperreHost() {
  const [s, setS] = useState<Sperre>(aktuell);
  useEffect(() => {
    hoerer.add(setS);
    return () => {
      hoerer.delete(setS);
    };
  }, []);

  if (!s) return null;

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.huelle}>
      <Pressable style={StyleSheet.absoluteFill} onPress={schliessen} accessibilityLabel="Schließen" />
      <View style={styles.karte}>
        {ZWEI ? <BordeauxMuster /> : null}
        <View style={styles.zeichen}>
          <SechseckLinse b={52} h={60} />
          <View style={styles.zeichenMitte}>
            <Icon name="mastery" size={22} color={color.signal.primary} />
          </View>
        </View>
        <Text style={styles.titel}>Das ist PRO</Text>
        <Text style={styles.satz}>{s.satz}</Text>
        <View style={styles.knoepfe}>
          <Button
            label="Ansehen"
            onPress={() => {
              schliessen();
              router.push('/pro');
            }}
          />
          <Pressable onPress={schliessen} style={styles.spaeter} hitSlop={6} accessibilityRole="button">
            <Text style={styles.spaeterText}>Später</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  huelle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: color.overlay,
  },
  karte: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: space.sm,
    padding: space.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: color.signal.primary,
    backgroundColor: color.bgElevated,
    overflow: 'hidden',
    ...(ZWEI ? { borderWidth: 0, backgroundColor: color.bordeaux, ...facette(14) } : null),
  },
  zeichen: { width: 52, height: 60, alignItems: 'center', justifyContent: 'center' },
  zeichenMitte: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  titel: { ...type.title, fontSize: 22, color: color.ink.max },
  satz: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.high, textAlign: 'center' },
  knoepfe: { alignSelf: 'stretch', gap: space.sm, marginTop: space.sm },
  spaeter: { alignItems: 'center', paddingVertical: space.sm },
  spaeterText: { ...type.label, color: ZWEI ? color.ink.high : color.ink.mid },

  abzeichen: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: color.bordeaux,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.signal.primary,
    alignSelf: 'center',
  },
  abzeichenText: { ...type.meta, fontSize: 9, lineHeight: 12, letterSpacing: 0.8, color: color.signal.primary },
});
