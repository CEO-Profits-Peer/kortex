import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { BRAND } from '@/lib/brand';
import { usePrefs } from '@/lib/prefs';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

import { CURRENT } from './changelog';

const KEY = 'seen_version';

/**
 * Hook: soll die Neuerungen gezeigt werden?
 *
 * Beim allerersten Start ausdrücklich nicht — da ist alles neu, und ein
 * Änderungsprotokoll vor der ersten Nutzung ist sinnlos. Deshalb wird beim
 * ersten Mal nur still die Version gemerkt.
 */
export function useWhatsNew() {
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const seen = await AsyncStorage.getItem(KEY);
        if (seen === null) {
          await AsyncStorage.setItem(KEY, CURRENT.version);
        } else if (seen !== CURRENT.version) {
          setShow(true);
        }
      } catch {
        /* Nicht lesbar - dann eben nicht anzeigen. */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const dismiss = async () => {
    setShow(false);
    try {
      await AsyncStorage.setItem(KEY, CURRENT.version);
    } catch {
      /* egal */
    }
  };

  return { show, ready, dismiss };
}

export function WhatsNew({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = usePrefs();

  const step = (n: number) =>
    reduceMotion ? undefined : FadeInDown.duration(360).delay(180 + n * 90);

  return (
    <GridBackground>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
        ]}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>
            {BRAND.name} · Version {CURRENT.version}
          </Text>
          <Text style={styles.headline}>{CURRENT.headline}</Text>
        </View>

        <View style={styles.list}>
          {CURRENT.entries.map((e, i) => (
            <Animated.View key={e.title} entering={step(i)} style={styles.entry}>
              <View style={styles.iconWrap}>
                <Icon name={e.icon} size={19} color={color.akzent} />
              </View>
              <View style={styles.entryText}>
                <Text style={styles.entryTitle}>{e.title}</Text>
                <Text style={styles.entryBody}>{e.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <View style={styles.footer}>
          <Button label={T('Weiter')} onPress={onDone} />
          <Text style={styles.note}>{T('Danke fürs Testen — jede Rückmeldung landet direkt in der nächsten Version.')}</Text>
        </View>
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'space-between' },

  hero: { gap: space.sm, paddingTop: space.lg },
  eyebrow: { ...type.meta, color: color.akzent, letterSpacing: 1, textTransform: 'uppercase' },
  headline: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },

  list: { flex: 1, justifyContent: 'center', gap: space.lg },
  entry: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    ...flaeche(10),
  },
  entryText: { flex: 1, gap: 2 },
  entryTitle: { ...type.label, fontSize: 15, color: color.ink.max },
  entryBody: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.mid },

  footer: { gap: space.md },
  note: { ...type.meta, color: color.ink.low, textAlign: 'center', lineHeight: 16 },
});

