import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { BordeauxMuster } from '@/components/Sechseck';
import { haptics } from '@/lib/haptics';
import { getPrefs, loadPrefs } from '@/lib/prefs';
import { useIchPro } from '@/lib/pro';
import { T } from '@/lib/sprache';
import { sechseckPunkte } from '@/theme/design';
import { color, space, type } from '@/theme/tokens';

/**
 * "Willkommen bei PRO" - einmal, wenn PRO frisch aktiv wird.
 *
 * Ablauf (~5 s, jederzeit "Überspringen"):
 *   Bordeaux blendet ein -> die sechs Stein-Facetten fliegen aus den Ecken
 *   herein -> die Goldkante zeichnet sich einmal herum -> goldene Dreiecke
 *   spruehen -> "Willkommen bei PRO" -> Wischkarten mit "Ausprobieren".
 *
 * Wann: Der Host merkt sich pro Geraet, ob er das Willkommen schon gezeigt
 * hat. Sieht er PRO (geladen, nicht nur Voreinstellung) ohne Merker, zeigt
 * er es - das deckt auch einen Code, der auf einem ANDEREN Geraet
 * eingeloest wurde. Sieht er "kein PRO", loescht er den Merker, damit ein
 * spaeteres neues PRO wieder begruesst wird. Eine Verlaengerung (PRO bleibt
 * durchgehend aktiv) begruesst nicht noch einmal.
 *
 * "Bewegung reduzieren": kein Flug, keine Funken - Stein und Text blenden
 * ruhig ein, die Karten sind sofort da.
 */

const MERKER = 'elycic.pro.willkommen';

/** Wie STEIN_TOENE in Sechseck.tsx: oben hell, unten dunkel. */
const TOENE = ['#7A2B40', '#5E1E30', '#431523', '#4B1827', '#641F33', '#6E2438'];

const B = 120;
const H = 138;

/** Richtung, aus der jede Facette kommt: die naechste Bildschirmecke. */
const HERKUNFT: [number, number][] = [
  [0, -1],
  [1, -0.6],
  [1, 0.6],
  [0, 1],
  [-1, 0.6],
  [-1, -0.6],
];

const FUNKEN = 14;

type Karte = { icon: IconName; titel: string; text: string; ziel: string };

const KARTEN: Karte[] = [
  { icon: 'mastery', titel: 'Profilbild-Stile', text: 'Metall, Glas und vier besondere Gründe für deine Waben.', ziel: '/avatar' },
  { icon: 'courses', titel: 'Stapel mit 50', text: 'Bis zu 50 Karten in einem Stapel statt 10.', ziel: '/compose?art=stapel' },
  { icon: 'plus', titel: 'Anpinnen', text: 'Bis zu drei Beiträge oben in deinem Profil.', ziel: '/(tabs)/profile' },
  { icon: 'check', titel: 'Abzeichen', text: 'Das PRO-Zeichen steht jetzt neben deinem Namen.', ziel: '/(tabs)/profile' },
];

// --- Aufruf von aussen (Werkstatt-Vorschau) ------------------------------------
let offen = false;
const hoerer = new Set<(o: boolean) => void>();
export function zeigeProWillkommen() {
  offen = true;
  hoerer.forEach((fn) => fn(true));
}

function merkerLesen(): boolean {
  try {
    return globalThis.localStorage?.getItem(MERKER) === '1';
  } catch {
    return false;
  }
}
function merkerSetzen(an: boolean) {
  try {
    if (an) globalThis.localStorage?.setItem(MERKER, '1');
    else globalThis.localStorage?.removeItem(MERKER);
  } catch {
    /* Ohne Speicher begruesst es notfalls einmal zu oft - harmlos. */
  }
}

export function ProWillkommenHost() {
  const stand = useIchPro();
  const [auf, setAuf] = useState(offen);

  useEffect(() => {
    hoerer.add(setAuf);
    return () => {
      hoerer.delete(setAuf);
    };
  }, []);

  useEffect(() => {
    if (!stand.geladen) return;
    if (!stand.pro) {
      merkerSetzen(false);
      return;
    }
    if (!merkerLesen()) {
      merkerSetzen(true);
      zeigeProWillkommen();
    }
  }, [stand.geladen, stand.pro]);

  if (!auf) return null;
  return (
    <ProWillkommen
      onZu={() => {
        offen = false;
        setAuf(false);
      }}
    />
  );
}

function ProWillkommen({ onZu }: { onZu: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [ruhig, setRuhig] = useState(getPrefs().reduceMotion);
  const [kartenDa, setKartenDa] = useState(false);
  const [seite, setSeite] = useState(0);

  const grund = useSharedValue(0);
  const flug = useSharedValue(0);
  const kante = useSharedValue(0);
  const funken = useSharedValue(0);
  const titel = useSharedValue(0);
  const hoch = useSharedValue(0);

  const zeiten = useRef<ReturnType<typeof setTimeout>[]>([]);

  const zuDenKarten = () => {
    zeiten.current.forEach(clearTimeout);
    zeiten.current = [];
    grund.value = 1;
    flug.value = 1;
    kante.value = 1;
    funken.value = 0;
    titel.value = 1;
    hoch.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    setKartenDa(true);
  };

  useEffect(() => {
    let weg = false;
    void loadPrefs().then((p) => {
      if (weg) return;
      setRuhig(p.reduceMotion);
      const aus = Easing.out(Easing.cubic);
      if (p.reduceMotion) {
        grund.value = withTiming(1, { duration: 200 });
        flug.value = 1;
        kante.value = 1;
        titel.value = withDelay(150, withTiming(1, { duration: 300 }));
        hoch.value = 1;
        setKartenDa(true);
        return;
      }
      // ~5 s bis zu den Karten (Wunsch 19.09.; zuerst waren es 3 s).
      grund.value = withTiming(1, { duration: 400 });
      flug.value = withDelay(300, withTiming(1, { duration: 1600, easing: aus }));
      kante.value = withDelay(1950, withTiming(1, { duration: 950, easing: Easing.inOut(Easing.quad) }));
      funken.value = withDelay(2850, withTiming(1, { duration: 1100, easing: aus }));
      titel.value = withDelay(3200, withTiming(1, { duration: 700, easing: aus }));
      zeiten.current.push(setTimeout(() => haptics.success(), 2850));
      zeiten.current.push(
        setTimeout(() => {
          hoch.value = withTiming(1, { duration: 500, easing: aus });
          setKartenDa(true);
        }, 4700),
      );
    });
    return () => {
      weg = true;
      zeiten.current.forEach(clearTimeout);
    };
    // Nur einmal beim Oeffnen; die Werte sind stabile Shared Values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grundStil = useAnimatedStyle(() => ({ opacity: grund.value }));
  // Der Stein rueckt nach oben, sobald die Karten kommen.
  const buehneStil = useAnimatedStyle(() => ({
    transform: [{ translateY: -hoch.value * Math.min(150, height * 0.2) }, { scale: 1 - hoch.value * 0.28 }],
  }));
  const titelStil = useAnimatedStyle(() => ({
    opacity: titel.value,
    transform: [{ translateY: (1 - titel.value) * 12 }],
  }));

  const kartenBreite = Math.min(width, 440) - space.xl * 2;

  const schliessen = () => {
    zeiten.current.forEach(clearTimeout);
    onZu();
  };

  return (
    <Animated.View exiting={FadeOut.duration(180)} style={styles.huelle} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, styles.grund, grundStil]}>
        <BordeauxMuster voll />
      </Animated.View>

      <View style={[styles.oben, { top: insets.top + space.sm }]}>
        <Pressable
          onPress={kartenDa ? schliessen : zuDenKarten}
          hitSlop={10}
          accessibilityRole="button"
          style={styles.ueberspringen}
        >
          <Text style={styles.ueberspringenText}>{kartenDa ? 'Schließen' : 'Überspringen'}</Text>
        </Pressable>
      </View>

      <Animated.View style={[styles.buehne, buehneStil]} pointerEvents="none">
        <View style={{ width: B, height: H }}>
          {TOENE.map((_, i) => (
            <Facette key={i} i={i} flug={flug} weit={Math.max(width, height) * 0.6} ruhig={ruhig} />
          ))}
          <Kante fortschritt={kante} />
          {ruhig ? null : Array.from({ length: FUNKEN }, (_, i) => <Funke key={i} i={i} t={funken} />)}
        </View>
        <Animated.View style={[styles.titelBox, titelStil]}>
          <Text style={styles.titel}>{T('Willkommen bei PRO')}</Text>
          <Text style={styles.unter}>{T('Alles ist freigeschaltet.')}</Text>
        </Animated.View>
      </Animated.View>

      {kartenDa ? (
        <Animated.View entering={ruhig ? undefined : FadeIn.duration(320)} style={[styles.unten, { paddingBottom: insets.bottom + space.lg }]}>
          {/* alignSelf stretch: im zentrierten Elternteil wuerde die Leiste
              sonst so breit wie alle Karten und mittig verschoben. */}
          <ScrollView
            horizontal
            style={{ alignSelf: 'stretch' }}
            snapToInterval={kartenBreite + space.md}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: (width - kartenBreite) / 2, gap: space.md }}
            onScroll={(e) => setSeite(Math.round(e.nativeEvent.contentOffset.x / (kartenBreite + space.md)))}
            scrollEventThrottle={32}
          >
            {KARTEN.map((k) => (
              <View key={k.titel} style={[styles.karte, { width: kartenBreite }]}>
                <View style={styles.karteKopf}>
                  <Icon name={k.icon} size={18} color={color.signal.primary} />
                  <Text style={styles.karteTitel}>{k.titel}</Text>
                </View>
                <Text style={styles.karteText}>{k.text}</Text>
                <Button
                  label={T('Ausprobieren')}
                  variant="ghost"
                  onPress={() => {
                    schliessen();
                    router.push(k.ziel as never);
                  }}
                />
              </View>
            ))}
          </ScrollView>
          <View style={styles.punkte}>
            {KARTEN.map((k, i) => (
              <View key={k.titel} style={[styles.punkt, i === seite && styles.punktAn]} />
            ))}
          </View>
          <View style={{ paddingHorizontal: space.xl, alignSelf: 'stretch', maxWidth: 440, width: '100%' }}>
            <Button label={T('Los')} onPress={schliessen} />
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** Eine der sechs Facetten: ein Dreieck von der Kante zur Mitte. */
function Facette({ i, flug, weit, ruhig }: { i: number; flug: SharedValue<number>; weit: number; ruhig: boolean }) {
  const e = sechseckPunkte(B, H, 0.75)
    .split(' ')
    .map((p) => p.split(',').map(Number));
  const [x1, y1] = e[i];
  const [x2, y2] = e[(i + 1) % 6];
  const [dx, dy] = HERKUNFT[i];
  // Gestaffelt: jede Facette startet etwas spaeter, alle landen zusammen.
  const start = i * 0.07;

  const stil = useAnimatedStyle(() => {
    const t = ruhig ? 1 : Math.min(1, Math.max(0, (flug.value - start) / (1 - start)));
    const rest = 1 - t;
    return {
      opacity: ruhig ? flug.value : Math.min(1, t * 2.5),
      transform: [
        { translateX: dx * weit * rest },
        { translateY: dy * weit * rest },
        { rotate: `${(i % 2 ? 1 : -1) * 70 * rest}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, stil]}>
      <Svg width={B} height={H}>
        <Polygon points={`${x1},${y1} ${x2},${y2} ${B / 2},${H / 2}`} fill={TOENE[i]} />
      </Svg>
    </Animated.View>
  );
}

const AnimPolygon = Animated.createAnimatedComponent(Polygon);

/** Die Goldkante zeichnet sich einmal herum (Strichlaenge = Umfang). */
function Kante({ fortschritt }: { fortschritt: SharedValue<number> }) {
  const seite = Math.hypot(B / 2, H * 0.25);
  const umfang = 4 * seite + 2 * (H * 0.5);
  const props = useAnimatedProps(() => ({
    strokeDashoffset: umfang * (1 - fortschritt.value),
  }));
  return (
    <Svg width={B} height={H} style={StyleSheet.absoluteFill}>
      <AnimPolygon
        points={sechseckPunkte(B, H, 0.75)}
        fill="none"
        stroke={color.signal.primary}
        strokeWidth={1.6}
        strokeDasharray={`${umfang} ${umfang}`}
        animatedProps={props}
      />
    </Svg>
  );
}

/** Ein goldenes Dreieck, das aus der Mitte nach aussen spruehlt und verglimmt. */
function Funke({ i, t }: { i: number; t: SharedValue<number> }) {
  // Feste Streuung statt Zufall: sieht jedes Mal gleich ruhig aus.
  const winkel = (i / FUNKEN) * Math.PI * 2 + (i % 3) * 0.21;
  const weite = 95 + (i % 4) * 22;
  const groesse = 5 + (i % 3) * 2;
  const stil = useAnimatedStyle(() => {
    const v = t.value;
    return {
      opacity: v === 0 ? 0 : Math.max(0, 1 - v) * 0.95,
      transform: [
        { translateX: Math.cos(winkel) * weite * v },
        { translateY: Math.sin(winkel) * weite * v },
        { rotate: `${v * 160 + i * 25}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.funke, { left: B / 2 - groesse / 2, top: H / 2 - groesse / 2 }, stil]}>
      <Svg width={groesse} height={groesse}>
        <Polygon points={`${groesse / 2},0 ${groesse},${groesse} 0,${groesse}`} fill={color.signal.primary} />
      </Svg>
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
    zIndex: 1100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grund: { backgroundColor: '#3A0F1B', overflow: 'hidden' },
  oben: { position: 'absolute', right: space.lg, zIndex: 2 },
  ueberspringen: { paddingVertical: space.xs, paddingHorizontal: space.sm },
  ueberspringenText: { ...type.label, fontSize: 14, color: '#D6C3BE' },
  buehne: { alignItems: 'center', gap: space.xl },
  funke: { position: 'absolute' },
  titelBox: { alignItems: 'center', gap: space.xs, paddingHorizontal: space.xl },
  titel: { ...type.title, fontSize: 26, color: color.ink.max, textAlign: 'center' },
  unter: { ...type.body, fontSize: 15, color: '#D6C3BE', textAlign: 'center' },
  unten: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: space.md },
  karte: {
    gap: space.sm,
    padding: space.lg,
    backgroundColor: 'rgba(20, 8, 12, 0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217, 184, 114, 0.45)',
  },
  karteKopf: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  karteTitel: { ...type.label, fontSize: 17, color: color.ink.max },
  karteText: { ...type.body, fontSize: 15, lineHeight: 21, color: '#E6D8D3', minHeight: 42 },
  punkte: { flexDirection: 'row', gap: 6 },
  punkt: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(214, 195, 190, 0.35)' },
  punktAn: { backgroundColor: color.signal.primary, width: 16 },
});
