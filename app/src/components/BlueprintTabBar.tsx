import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { haptics } from '@/lib/haptics';

import { TabIcon, type TabName } from '@/components/TabIcon';
import { color, space, type } from '@/theme/tokens';

/**
 * Die untere Leiste im Blueprint-Stil.
 *
 * Statt der Standard-Tab-Bar: eine Skala. Ueber jedem Tab sitzen feine
 * Teilstriche wie auf einem Lineal, und der aktive Tab bekommt einen
 * leuchtenden Messschieber-Marker, der beim Wechsel weiterfaehrt.
 *
 * Das ist der eine Ort, an dem Signalfarbe dauerhaft zu sehen ist - deshalb
 * traegt er die visuelle Identitaet: monochrome Skala, ein heller Marker.
 *
 * Der Marker war ein harter Block von 28 Pixeln mit einer Feder, die leicht
 * ueber das Ziel hinausschwang. Gewuenscht war: weich, und nach links und
 * rechts auslaufend. Deshalb jetzt eine Linie mit Verlauf zu beiden Seiten
 * ins Transparente, ein Schein als Ellipse, die nach unten und zur Seite
 * auslaeuft, und eine Bewegung mit Abbremsen statt Nachfedern - ein
 * Messschieber schwingt nicht nach.
 *
 * Kein Abdecken der Raender in Leistenfarbe: das haette die Teilstriche
 * unter dem Marker mit verdeckt. Die Ellipse blendet von selbst aus.
 */

export const TAB_BAR_HEIGHT = 60;

/** Breite des Markers, hoechstens so breit wie ein Tab. */
const MARKER_MAX = 88;
const SCHEIN_HOEHE = 18;

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
  courses: 'courses',
  index: 'feed',
  search: 'search',
  profile: 'profile',
};

export function BlueprintTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tabWidth = width / state.routes.length;
  const marker = Math.min(MARKER_MAX, tabWidth * 0.8);

  const slide = useRef(new Animated.Value(state.index * tabWidth)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: state.index * tabWidth,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [state.index, tabWidth, slide]);

  return (
    <View style={[styles.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
      {/* Skala: feine Teilstriche ueber die ganze Breite */}
      <View style={styles.scale} pointerEvents="none">
        {Array.from({ length: Math.ceil(width / 8) }).map((_, i) => (
          <View key={i} style={[styles.tick, i % 5 === 0 && styles.tickMajor]} />
        ))}
      </View>

      {/* Der Messschieber */}
      <Animated.View
        pointerEvents="none"
        style={[styles.cursor, { width: tabWidth, transform: [{ translateX: slide }] }]}
      >
        <Svg width={marker} height={SCHEIN_HOEHE}>
          <Defs>
            {/* Waagrecht: aus dem Nichts, volle Farbe in der Mitte, ins Nichts. */}
            <LinearGradient id="tabMarkerLinie" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={color.signal.primary} stopOpacity={0} />
              <Stop offset="0.5" stopColor={color.signal.primary} stopOpacity={1} />
              <Stop offset="1" stopColor={color.signal.primary} stopOpacity={0} />
            </LinearGradient>
            {/* Oben in der Mitte am hellsten, nach unten und zu beiden
                Seiten auslaufend. */}
            <RadialGradient id="tabMarkerSchein" cx="0.5" cy="0" rx="0.5" ry="1" fx="0.5" fy="0">
              <Stop offset="0" stopColor={color.signal.primary} stopOpacity={0.22} />
              <Stop offset="1" stopColor={color.signal.primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={marker} height={SCHEIN_HOEHE} fill="url(#tabMarkerSchein)" />
          <Rect x={0} y={0} width={marker} height={2} fill="url(#tabMarkerLinie)" />
        </Svg>
      </Animated.View>

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
              <TabIcon name={icon} color={focused ? color.signal.primary : color.ink.low} />
              <Text style={[styles.label, focused && styles.labelOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.bgSunken,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.ink.faint,
  },

  scale: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tick: { width: 1, height: 3, backgroundColor: color.gridLineMajor },
  tickMajor: { height: 6, backgroundColor: color.ink.faint },

  cursor: { position: 'absolute', top: 0, left: 0, alignItems: 'center' },

  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: space.xs },
  label: { ...type.meta, fontSize: 11, color: color.ink.low },
  labelOn: { color: color.signal.primary },
});
