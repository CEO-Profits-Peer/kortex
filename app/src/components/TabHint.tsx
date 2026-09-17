import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { usePrefs } from '@/lib/prefs';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Ein Satz beim ersten Besuch eines Tabs.
 *
 * Nicht dasselbe wie das Feed-Tutorial: dort gibt es etwas zu ueben - wischen,
 * doppeltippen -, und die Schritte gehen mit der Handlung weiter. Hier gibt es
 * nur etwas zu SAGEN. Ein Bildschirm, auf dem man nichts falsch machen kann,
 * braucht keine Anleitung in drei Schritten, sondern einen Satz, der die Frage
 * beantwortet, mit der man ihn aufmacht: "was ist das hier".
 *
 * Deshalb auch kein Schleier ueber dem Bild: der Hinweis legt sich unten an
 * den Rand, der Inhalt bleibt sichtbar. Wer ihn wegtippt, sieht ihn nie
 * wieder - je Geraet.
 *
 * Gemerkt wird in AsyncStorage, nicht am Konto. Das ist Absicht: der Hinweis
 * erklaert die Bedienung, und Bedienung haengt am Geraet. Wer die App auf dem
 * Tablet zum ersten Mal oeffnet, ist dort auch zum ersten Mal.
 */

const PRAEFIX = 'hint_v1_';

export function useTabHint(key: string) {
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => {
    let lebt = true;
    void (async () => {
      try {
        const gesehen = await AsyncStorage.getItem(PRAEFIX + key);
        if (lebt && gesehen === null) setZeigen(true);
      } catch {
        /* Kein Speicher lesbar - dann lieber nicht zeigen als jedes Mal. */
      }
    })();
    return () => {
      lebt = false;
    };
  }, [key]);

  const weg = useCallback(() => {
    setZeigen(false);
    void AsyncStorage.setItem(PRAEFIX + key, new Date().toISOString()).catch(() => {});
  }, [key]);

  return { zeigen, weg };
}

/** Alle Tab-Hinweise wieder einschalten (Einstellungen). */
export async function resetTabHints(keys: string[]): Promise<void> {
  try {
    await AsyncStorage.multiRemove(keys.map((k) => PRAEFIX + k));
  } catch {
    /* egal */
  }
}

export function TabHint({
  icon,
  titel,
  text,
  onDone,
  /** Platz fuer die Tab-Leiste, wenn der Hinweis in einem Tab liegt. */
  bottom = 0,
}: {
  icon: IconName;
  titel: string;
  text: string;
  onDone: () => void;
  bottom?: number;
}) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = usePrefs();

  return (
    <View
      style={[styles.root, { paddingBottom: insets.bottom + bottom + space.md }]}
      pointerEvents="box-none"
    >
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(320).delay(400)}
        exiting={reduceMotion ? undefined : FadeOut.duration(160)}
        style={styles.panel}
      >
        <View style={styles.kopf}>
          <View style={styles.iconBox}>
            <Icon name={icon} size={17} color={color.akzent} />
          </View>
          <Text style={styles.titel}>{titel}</Text>
        </View>
        <Text style={styles.text}>{text}</Text>
        <Pressable
          onPress={() => {
            haptics.light();
            onDone();
          }}
          hitSlop={8}
          style={styles.knopf}
        >
          <Text style={styles.knopfText}>Verstanden</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    paddingHorizontal: space.xl,
  },
  panel: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  kopf: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  titel: { ...type.title, fontSize: 17, lineHeight: 22, color: color.ink.max, flex: 1 },
  text: { ...type.body, fontSize: 14.5, lineHeight: 21, color: color.ink.mid },
  knopf: { alignSelf: 'flex-end', paddingTop: 2 },
  knopfText: { ...type.label, fontSize: 14, color: color.akzent },
});
