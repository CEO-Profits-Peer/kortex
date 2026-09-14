import { useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  RefreshControl,
  type RefreshControlProps,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';

import { Icon } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { color } from '@/theme/tokens';

/**
 * Herunterziehen zum Neuladen - auch im Browser.
 *
 * Home und Profil hatten schon eine RefreshControl. Nur laeuft die App als
 * Web-App, und dort tut RefreshControl nichts: react-native-web zeichnet sie
 * gar nicht. Gemeldet wurde es als "fehlt", und von aussen war es genau das.
 *
 * Im Browser deshalb von Hand: Beruehrung am oberen Ende merken, Zug nach
 * unten mit Widerstand in einen Kreis uebersetzen, ab SCHWELLE loslassen =
 * neu laden. Auf dem Handy bleibt die echte RefreshControl.
 *
 * Dazu `overscroll-behavior: contain` auf der Liste: sonst laedt Chrome auf
 * Android beim selben Zug die GANZE Seite neu - und die App startet von vorn.
 */

const SCHWELLE = 64;
const MAX_ZUG = 110;
const WIDERSTAND = 0.5;

type Beruehrung = (e: GestureResponderEvent) => void;

export type Neuladen = {
  laedt: boolean;
  /** Programmatisch, mit sichtbarem Kreis - fuer den zweiten Tipp auf den Tab. */
  ausloesen: () => Promise<void>;
  /** Aus onScroll aufrufen: nur ganz oben darf gezogen werden. */
  beiScroll: (y: number) => void;
  /** An die ScrollView/FlatList. */
  listenProps: {
    refreshControl?: React.ReactElement<RefreshControlProps>;
    onTouchStart?: Beruehrung;
    onTouchMove?: Beruehrung;
    onTouchEnd?: Beruehrung;
    onTouchCancel?: Beruehrung;
    style?: ViewStyle;
  };
  /** Ueber der Liste zeichnen (absolut positioniert). */
  anzeige: React.ReactElement | null;
};

export function useNeuladen(onRefresh: () => Promise<void>, oben: number): Neuladen {
  const [laedt, setLaedt] = useState(false);
  const zug = useRef(new Animated.Value(0)).current;
  const scrollOben = useRef(0);
  const start = useRef<number | null>(null);
  const weit = useRef(0);
  const laeuft = useRef(false);
  const schwelleGemeldet = useRef(false);
  const rueckruf = useRef(onRefresh);
  rueckruf.current = onRefresh;

  const zurueck = useCallback(() => {
    Animated.timing(zug, { toValue: 0, duration: 220, useNativeDriver: false }).start();
  }, [zug]);

  const ausloesen = useCallback(async () => {
    if (laeuft.current) return;
    laeuft.current = true;
    setLaedt(true);
    Animated.timing(zug, { toValue: SCHWELLE, duration: 160, useNativeDriver: false }).start();
    try {
      await rueckruf.current();
    } catch {
      // Die Bildschirme zeigen ihre Fehler selbst an.
    } finally {
      laeuft.current = false;
      setLaedt(false);
      zurueck();
    }
  }, [zug, zurueck]);

  const beiScroll = useCallback((y: number) => {
    scrollOben.current = y;
  }, []);

  const web = Platform.OS === 'web';

  const listenProps: Neuladen['listenProps'] = web
    ? {
        onTouchStart: (e) => {
          weit.current = 0;
          schwelleGemeldet.current = false;
          // Nur wer GANZ OBEN anfaengt, zieht. Wer mitten in der Liste nach
          // oben wischt und dabei oben ankommt, will scrollen, nicht laden.
          start.current = scrollOben.current <= 0 && !laeuft.current ? e.nativeEvent.pageY : null;
        },
        onTouchMove: (e) => {
          if (start.current === null) return;
          const dy = e.nativeEvent.pageY - start.current;
          if (dy <= 0 || scrollOben.current > 0) {
            if (weit.current > 0) {
              weit.current = 0;
              zug.setValue(0);
            }
            return;
          }
          weit.current = Math.min(MAX_ZUG, dy * WIDERSTAND);
          zug.setValue(weit.current);
          if (weit.current >= SCHWELLE && !schwelleGemeldet.current) {
            schwelleGemeldet.current = true;
            haptics.select();
          }
        },
        onTouchEnd: () => {
          if (start.current === null) return;
          start.current = null;
          if (weit.current >= SCHWELLE) void ausloesen();
          else zurueck();
          weit.current = 0;
        },
        onTouchCancel: () => {
          start.current = null;
          weit.current = 0;
          zurueck();
        },
        style: { overscrollBehaviorY: 'contain' } as unknown as ViewStyle,
      }
    : {
        refreshControl: (
          <RefreshControl refreshing={laedt} onRefresh={() => void ausloesen()} tintColor={color.ink.low} />
        ),
      };

  const anzeige = web ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.anzeige,
        {
          top: oben,
          opacity: zug.interpolate({ inputRange: [0, 24, SCHWELLE], outputRange: [0, 0.6, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: zug.interpolate({ inputRange: [0, MAX_ZUG], outputRange: [-36, MAX_ZUG - 36], extrapolate: 'clamp' }) },
          ],
        },
      ]}
    >
      <View style={styles.kreis}>
        {laedt ? (
          <ActivityIndicator size="small" color={color.signal.primary} />
        ) : (
          <Animated.View
            style={{
              transform: [
                { rotate: zug.interpolate({ inputRange: [0, SCHWELLE], outputRange: ['0deg', '300deg'], extrapolate: 'clamp' }) },
              ],
            }}
          >
            <Icon name="refresh" size={18} color={color.signal.primary} />
          </Animated.View>
        )}
      </View>
    </Animated.View>
  ) : null;

  return { laedt, ausloesen, beiScroll, listenProps, anzeige };
}

/**
 * Zweiter Tipp auf den Tab, auf dem man schon ist: nach oben und neu laden.
 *
 * Nur Home und Profil benutzen das (Wunsch: "Neu laden, nur bei Home &
 * Profil"). Im Feed hiesse ein Sprung nach oben, die Stelle zu verlieren.
 *
 * Die Tab-Leiste sendet tabPress schon immer, auch fuer den aktiven Tab
 * (BlueprintTabBar) - sie hat es bisher nur niemandem gesagt.
 */
export function useTabNochmal(fn: () => void) {
  const navigation = useNavigation();
  const rueckruf = useRef(fn);
  rueckruf.current = fn;

  useEffect(() => {
    const nav = navigation as unknown as {
      addListener: (typ: string, cb: () => void) => () => void;
      isFocused: () => boolean;
    };
    return nav.addListener('tabPress', () => {
      // tabPress kommt VOR dem Wechsel: fokussiert heisst, man war schon hier.
      if (nav.isFocused()) {
        haptics.light();
        rueckruf.current();
      }
    });
  }, [navigation]);
}

const styles = StyleSheet.create({
  anzeige: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  kreis: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
});
