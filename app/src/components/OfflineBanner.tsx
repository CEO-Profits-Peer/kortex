import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnline } from '@/lib/online';
import { usePrefs } from '@/lib/prefs';
import { T } from '@/lib/sprache';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Der eine Hinweis, wenn das Netz weg ist.
 *
 * Er liegt ueber allem, an genau einer Stelle, statt dass jeder Bildschirm
 * seine eigene Fehlermeldung zeigt. Wer offline ist, soll das EINMAL und
 * ruhig erfahren - nicht in fuenf Varianten, je nachdem, welcher Bildschirm
 * gerade etwas nachladen wollte.
 *
 * Und er sagt, was trotzdem geht. "Offline" allein klingt nach Stillstand.
 * Tatsaechlich lassen sich die schon geladenen Karten weiterlesen, und die
 * Lesezeit liegt im Puffer (lib/eventBuffer.ts), der einen Neustart
 * uebersteht und von selbst nachschickt. Das zu wissen, aendert, ob man die
 * App zumacht oder weiterliest.
 *
 * Kommt die Verbindung zurueck, steht kurz "Wieder online" da und
 * verschwindet. Ohne diese Bestaetigung wuesste man nicht, ob der Hinweis
 * nur vergessen wurde.
 */

const WIEDER_MS = 2200;

export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const { reduceMotion } = usePrefs();
  const [wieder, setWieder] = useState(false);
  const warOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      warOffline.current = true;
      setWieder(false);
      return;
    }
    if (!warOffline.current) return;
    warOffline.current = false;
    setWieder(true);
    const t = setTimeout(() => setWieder(false), WIEDER_MS);
    return () => clearTimeout(t);
  }, [online]);

  if (online && !wieder) return null;

  return (
    <View style={[styles.root, { top: insets.top + 6 }]} pointerEvents="none">
      <Animated.View
        entering={reduceMotion ? undefined : FadeInUp.duration(220)}
        exiting={reduceMotion ? undefined : FadeOutUp.duration(180)}
        style={[styles.pille, { borderColor: online ? color.signal.success : color.signal.warn }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <View
          style={[
            styles.punkt,
            { backgroundColor: online ? color.signal.success : color.signal.warn },
          ]}
        />
        {online ? (
          <Text style={styles.titel}>Wieder online</Text>
        ) : (
          <View style={styles.text}>
            <Text style={styles.titel}>Offline</Text>
            {/* Ein Satz, der auf JEDEM Bildschirm stimmt. Die erste Fassung
                sagte "geladene Karten gehen weiter" - auf dem Startbildschirm,
                wo es noch keine einzige Karte gibt. */}
            <Text style={styles.unter}>{T('Was schon geladen ist, bleibt lesbar. Der Rest kommt von selbst zurück.')}</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.xl,
    zIndex: 1000,
  },
  pille: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 420,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: color.bgElevated,
  },
  punkt: { width: 7, height: 7, borderRadius: 4 },
  text: { flexShrink: 1, gap: 1 },
  titel: { ...type.label, fontSize: 13, lineHeight: 17, color: color.ink.max },
  unter: { ...type.meta, fontSize: 9.5, lineHeight: 13, color: color.ink.mid },
});
