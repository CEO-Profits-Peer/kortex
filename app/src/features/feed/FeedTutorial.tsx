import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { useActiveCardId } from '@/lib/activeCard';
import { useContentState } from '@/lib/contentState';
import { haptics } from '@/lib/haptics';
import { usePrefs } from '@/lib/prefs';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Tutorial.
 *
 * Es liegt im Feed und nicht davor. Ein Erklaerbildschirm beim ersten Start
 * waere der bequeme Weg gewesen - man haette ihn in zwanzig Minuten gebaut -,
 * aber niemand liest eine Gebrauchsanweisung fuer etwas, das er noch nicht
 * gesehen hat. Der Onboarding-Flow fragt schon Region und Interessen ab; noch
 * drei Seiten davor, und die App faengt mit Hausaufgaben an.
 *
 * Deshalb erklaert es waehrend der Benutzung, und zwei von drei Schritten
 * gehen nicht mit einem Knopf weiter, sondern MIT DER HANDLUNG:
 *
 *   1. Hochwischen  -> weiter, sobald eine andere Karte im Bild ist.
 *   2. Doppeltippen -> weiter, sobald die Karte wirklich geliked ist.
 *   3. Die Leiste rechts -> hier gibt es nichts zu ueben, also ein Knopf.
 *
 * Das ist der Unterschied zwischen "ich habe gelesen, wie es geht" und "ich
 * habe es einmal gemacht". Wer den zweiten Schritt nicht machen will, tippt
 * "Weiter" - ein Tutorial, das den Weg versperrt, bis man liked, erzieht zu
 * Likes und nicht zur Bedienung.
 *
 * Gezeigt wird es einmal pro Geraet. Im Zweifel lieber einmal zu wenig: der
 * Speicher haengt am Browser, und wer die Seite im privaten Fenster oeffnet,
 * sieht es eben nochmal.
 */

const KEY = 'tutorial_feed_v1';

type Schritt = {
  eyebrow: string;
  titel: string;
  text: string;
  icon: IconName;
  /** Nur, wenn der Schritt nicht durch Tun weitergeht. */
  knopf?: string;
};

const SCHRITTE: Schritt[] = [
  {
    eyebrow: 'Schritt 1 von 3',
    titel: 'Nach oben wischen',
    text: 'Jede Karte ist eine Sache, die man in einer halben Minute versteht. Wisch nach oben für die nächste.',
    icon: 'feed',
  },
  {
    eyebrow: 'Schritt 2 von 3',
    titel: 'Doppeltippen',
    text: 'Zwei Tipps auf die Karte: gemerkt. Der Feed lernt daraus, was dich interessiert — und du findest sie im Profil wieder.',
    icon: 'like',
  },
  {
    eyebrow: 'Schritt 3 von 3',
    titel: 'Die Leiste rechts',
    text: 'Vorlesen lassen, weiterempfehlen, mitreden, teilen. Und unten: wo die Karte herkommt — jede Zahl lässt sich nachschlagen.',
    icon: 'listen',
    knopf: 'Los geht’s',
  },
];

/**
 * Soll das Tutorial laufen?
 *
 * Getrennt vom Bildschirm, damit der Feed nichts rendert, solange der
 * Speicher noch nicht gelesen ist - ein Overlay, das eine Zehntelsekunde
 * nach dem ersten Bild aufpoppt, wirkt wie ein Fehler.
 */
export function useFeedTutorial() {
  const [an, setAn] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        if ((await AsyncStorage.getItem(KEY)) === null) setAn(true);
      } catch {
        /* Kein Speicher lesbar - dann lieber nicht zeigen als doppelt. */
      }
    })();
  }, []);

  const fertig = useCallback(() => {
    setAn(false);
    void AsyncStorage.setItem(KEY, new Date().toISOString()).catch(() => {});
  }, []);

  return { an, fertig };
}

/** Von den Einstellungen aus: beim naechsten Feed wieder zeigen. */
export async function resetFeedTutorial(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* egal */
  }
}

export function FeedTutorial({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = usePrefs();
  const [i, setI] = useState(0);

  // Beobachtet statt gesteuert: das Tutorial haengt ueber dem Feed und
  // greift nicht in ihn ein. Es sieht nur, was ohnehin passiert.
  const aktiv = useActiveCardId();
  const { liked } = useContentState(aktiv ?? '');
  const erste = useRef<string | null>(null);
  if (erste.current === null && aktiv) erste.current = aktiv;

  const gewischt = Boolean(aktiv && erste.current && aktiv !== erste.current);

  const weiter = useCallback(() => {
    haptics.light();
    setI((n) => {
      if (n + 1 >= SCHRITTE.length) {
        onDone();
        return n;
      }
      return n + 1;
    });
  }, [onDone]);

  // Schritt 1 und 2 gehen von selbst weiter, sobald die Handlung passiert
  // ist. Kurz warten, sonst verschwindet der Text in derselben Bewegung,
  // die ihn beantwortet - und niemand merkt, dass er recht hatte.
  useEffect(() => {
    if (i !== 0 || !gewischt) return;
    const t = setTimeout(weiter, 700);
    return () => clearTimeout(t);
  }, [i, gewischt, weiter]);

  useEffect(() => {
    if (i !== 1 || !liked) return;
    const t = setTimeout(weiter, 700);
    return () => clearTimeout(t);
  }, [i, liked, weiter]);

  const s = SCHRITTE[i];
  const getan = (i === 0 && gewischt) || (i === 1 && liked);

  return (
    // box-none: die Wischgeste muss durch das Overlay hindurch beim Feed
    // ankommen. Sonst waere ausgerechnet der erste Schritt der einzige, den
    // man nicht machen kann.
    <View style={[styles.root, { paddingBottom: insets.bottom + 96 }]} pointerEvents="box-none">
      <Animated.View
        key={i}
        entering={reduceMotion ? undefined : FadeInDown.duration(320)}
        exiting={reduceMotion ? undefined : FadeOut.duration(160)}
        style={styles.panel}
      >
        <View style={styles.kopf}>
          <Text style={styles.eyebrow}>{s.eyebrow}</Text>
          <Pressable onPress={onDone} hitSlop={10} accessibilityLabel="Tutorial überspringen">
            <Text style={styles.skip}>Überspringen</Text>
          </Pressable>
        </View>

        <View style={styles.zeile}>
          <View style={styles.iconBox}>
            <Icon
              name={getan ? 'check' : s.icon}
              size={18}
              color={getan ? color.signal.success : color.signal.primary}
            />
          </View>
          <Text style={styles.titel}>{s.titel}</Text>
        </View>

        <Text style={styles.text}>{s.text}</Text>

        <View style={styles.fuss}>
          {/* Der Fortschritt als drei Striche, nicht als Zahl: man sieht auf
              einen Blick, dass es gleich vorbei ist. */}
          <View style={styles.punkte}>
            {SCHRITTE.map((_, n) => (
              <View key={n} style={[styles.punkt, n <= i && styles.punktAn]} />
            ))}
          </View>

          <Pressable onPress={weiter} hitSlop={8}>
            <Animated.Text entering={reduceMotion ? undefined : FadeIn} style={styles.weiter}>
              {s.knopf ?? 'Weiter'}
            </Animated.Text>
          </Pressable>
        </View>
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
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    // Kein Vollbild-Schleier: man soll die Karte sehen, ueber die geredet
    // wird. Ein Tutorial, das den Gegenstand verdeckt, erklaert sich selbst.
    backgroundColor: color.bgElevated,
  },

  kopf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...type.meta, color: color.ink.low, letterSpacing: 1.2 },
  skip: { ...type.meta, color: color.ink.low },

  zeile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconBox: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  titel: { ...type.title, fontSize: 19, color: color.ink.max, flex: 1 },
  text: { ...type.body, fontSize: 14.5, lineHeight: 21, color: color.ink.mid },

  fuss: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xs,
  },
  punkte: { flexDirection: 'row', gap: 5 },
  punkt: { width: 16, height: 2, backgroundColor: color.ink.faint },
  punktAn: { backgroundColor: color.signal.primary },
  weiter: { ...type.label, fontSize: 14, color: color.akzent },
});
