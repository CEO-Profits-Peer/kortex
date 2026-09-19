import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SechseckLinse } from '@/components/Sechseck';
import { haptics } from '@/lib/haptics';
import { LINSE_SYMBOL, ZWEI, facette } from '@/theme/design';

import { TabIcon, type TabName } from '@/components/TabIcon';
import { color, type } from '@/theme/tokens';

/**
 * Die untere Leiste: eine schwebende Glas-Pille.
 *
 * Halb durchsichtig, weichgezeichnet, mit einer helleren Linse hinter dem
 * aktiven Tab, die beim Wechsel hinuebergleitet.
 *
 * Der duenne Strich in Signalfarbe oben auf der Linse ist wieder weg: auf der
 * Pille sah er aus wie ein verrutschter Rest der alten Skala ("sieht doof
 * aus"). Den aktiven Tab zeigen jetzt Linse und Farbe von Symbol und Text -
 * das reicht, und es ist genau das, was man von Liquid Glass erwartet.
 *
 * Schwebend heisst: die Leiste liegt UEBER dem Inhalt, nicht darunter. Jeder
 * Bildschirm in einem Tab muss unten TAB_BAR_HEIGHT (plus Sicherheitsabstand)
 * frei lassen, sonst verschwindet sein letztes Element unter dem Glas. Der
 * Feed haelt den Platz ganz frei (FeedScreen), weil seine Karten auf die
 * sichtbare Hoehe einrasten muessen.
 *
 * Die Weichzeichnung gibt es nur im Browser (backdropFilter). Die App laeuft
 * dort; nativ faellt die Pille auf eine fast deckende Flaeche zurueck.
 */

/** So viel muss ein Tab-Bildschirm unten frei lassen, zusaetzlich zu insets.bottom. */
export const TAB_BAR_HEIGHT = 72;

const PILLE = 58;
const ABSTAND_UNTEN = 8;
const RAND = 14;
const LINSE_INNEN = 5;

/**
 * Design 2.0, zweite Fassung: eine eckige Glasleiste, alle vier Ecken klein
 * abgeschraegt, OHNE Goldrahmen. Die erste Fassung hatte eine Goldlinie um
 * die ganze Leiste und eine kleine Sechseck-Linse, durch deren Kante die
 * Beschriftung lief - "wie ein Aufkleber", und das Glas ging unter.
 *
 * Jetzt traegt der aktive Tab ein Sechseck in Bordeaux und Gold, das Symbol
 * UND Beschriftung ganz umschliesst und oben und unten ein paar Pixel ueber
 * die Leiste hinausragt ("minimal groesser als die Leiste"). Damit es nicht
 * mit abgeschnitten wird, liegt es NEBEN dem Glas, nicht darin: clip-path
 * schneidet alles, was im geschnittenen Element steckt.
 *
 * Beim Wechsel gleitet das Sechseck hinueber, ohne Drehung - die Drehung
 * wirkte verspielt statt edel. Flach oder Stein: Einstellungen > Design.
 */
const FACETTE_LEISTE = 10;
const LINSE_B = 60;
const LINSE_H = 70;

const GLAS: ViewStyle = ZWEI
  ? Platform.OS === 'web'
    ? ({
        backgroundColor: 'rgba(24, 20, 23, 0.72)',
        backdropFilter: 'blur(24px) saturate(160%)',
        ...facette(FACETTE_LEISTE),
      } as unknown as ViewStyle)
    : { backgroundColor: 'rgba(24, 20, 23, 0.96)' }
  : Platform.OS === 'web'
    ? ({
        backgroundColor: 'rgba(11, 12, 14, 0.58)',
        // react-native-web reicht beides durch und setzt die Praefixe selbst.
        backdropFilter: 'blur(22px) saturate(170%)',
        boxShadow: '0 10px 34px rgba(0, 0, 0, 0.45)',
      } as unknown as ViewStyle)
    : { backgroundColor: 'rgba(11, 12, 14, 0.94)' };

/**
 * Nur die Felder, die diese Leiste wirklich benutzt.
 *
 * Bewusst NICHT BottomTabBarProps aus @react-navigation/bottom-tabs: expo-router
 * bringt eine eigene Kopie dieser Typen mit, und die beiden sind nicht
 * zuweisungskompatibel. Ein eigener, minimaler Typ entkoppelt uns davon und
 * ueberlebt Versionswechsel.
 */
export type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
};

const ROUTE_ICONS: Record<string, TabName> = {
  home: 'home',
  studio: 'studio',
  index: 'feed',
  search: 'search',
  profile: 'profile',
};

export function BlueprintTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  // Die Breite der Pille, nicht des Fensters: sie hat seitlich Abstand, und
  // die Linse muss genau unter dem Tab stehen.
  const [breite, setBreite] = useState(0);
  const tabBreite = breite / Math.max(1, state.routes.length);

  const slide = useRef(new Animated.Value(0)).current;
  const erstesMal = useRef(true);

  useEffect(() => {
    if (!breite) return;
    const ziel = state.index * tabBreite;
    // Beim ersten Messen hinspringen, nicht hingleiten: sonst faehrt die
    // Linse bei jedem Start einmal von links durch die ganze Leiste.
    if (erstesMal.current) {
      erstesMal.current = false;
      slide.setValue(ziel);
      return;
    }
    Animated.timing(slide, {
      toValue: ziel,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [state.index, tabBreite, breite, slide]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.huelle, { paddingBottom: insets.bottom + ABSTAND_UNTEN }]}
    >
      <View
        style={ZWEI ? styles.leisteZwei : [styles.pille, GLAS]}
        onLayout={(e) => setBreite(e.nativeEvent.layout.width)}
      >
        {ZWEI ? (
          <>
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, GLAS]} />
            <View pointerEvents="none" style={styles.lichtkanteZwei} />
          </>
        ) : (
          /* Lichtkante: ein Hauch Helligkeit oben, wie eine Glaskante. */
          <View pointerEvents="none" style={styles.lichtkante} />
        )}

        {breite > 0 && ZWEI ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.linseZwei, { width: tabBreite, transform: [{ translateX: slide }] }]}
          >
            <SechseckLinse b={LINSE_B} h={LINSE_H} />
          </Animated.View>
        ) : null}

        {breite > 0 && !ZWEI ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.linse, { width: tabBreite, transform: [{ translateX: slide }] }]}
          >
            <View style={styles.linseInnen} />
          </Animated.View>
        ) : null}

        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label = options.title ?? route.name;
            const icon = ROUTE_ICONS[route.name] ?? 'feed';

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (focused || event.defaultPrevented) return;
              haptics.select();
              navigation.navigate(route.name);
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                style={styles.tab}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
              >
                <TabIcon name={icon} color={focused ? (ZWEI && LINSE_SYMBOL ? LINSE_SYMBOL : color.signal.primary) : color.ink.mid} />
                <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  huelle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: RAND,
  },
  pille: {
    height: PILLE,
    borderRadius: PILLE / 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  lichtkante: {
    position: 'absolute',
    top: 0,
    left: PILLE / 2,
    right: PILLE / 2,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },

  leisteZwei: { height: PILLE },
  lichtkanteZwei: {
    position: 'absolute',
    top: 0,
    left: FACETTE_LEISTE,
    right: FACETTE_LEISTE,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  linseZwei: {
    position: 'absolute',
    top: (PILLE - LINSE_H) / 2,
    height: LINSE_H,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linse: { position: 'absolute', top: 0, bottom: 0, left: 0, padding: LINSE_INNEN },
  linseInnen: {
    flex: 1,
    borderRadius: (PILLE - 2 * LINSE_INNEN) / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },

  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: PILLE },
  label: { ...type.meta, fontSize: 10, color: color.ink.mid },
  // Design 2.0: das Symbol ist gold, die Schrift hell - zwei Goldtoene auf
  // dem Bordeaux-Sechseck waeren zu viel.
  labelOn: { color: ZWEI ? color.ink.max : color.signal.primary },
});
