import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { SechseckLinse } from '@/components/Sechseck';
import { haptics } from '@/lib/haptics';
import { T } from '@/lib/sprache';
import { LINSE_SYMBOL, ZWEI } from '@/theme/design';
import { color, motion, radius, space, type } from '@/theme/tokens';

/**
 * Die Aktionsleiste am rechten Rand.
 *
 * Senkrecht statt waagrecht, weil der Daumen dort von selbst liegt, wenn man
 * einhändig wischt — dieselbe Stelle wie bei jedem Feed, den die Zielgruppe
 * kennt. Waagrecht unten wäre eine Umgewöhnung ohne Gegenwert.
 *
 * Vier Aktionen auf jeder Karte — Like, Repost, Kommentar, Teilen —, plus
 * Vorlesen auf allen ausser den Erklaerkarten, die selbst sprechen. Jede
 * weitere macht die Leiste zu einem Menü, und ein Menü liest niemand
 * während des Wischens.
 *
 * (Hier stand "Vier Aktionen, mehr nicht", während fünf Knöpfe daruntert
 * standen. Ein Kommentar, der die eigene Regel falsch wiedergibt, ist
 * schlimmer als keiner: beim nächsten Mal streicht jemand den richtigen
 * Knopf.)
 *
 * Vorlesen steht ganz oben, nicht unten. Es ist die einzige Aktion, die man
 * VOR dem Lesen braucht — alle anderen kommen danach.
 */

/**
 * Design 2.0: jeder Knopf ist ein Sechseck aus dunklem Glas mit warmer
 * Linie. Gedrueckt (geliked, empfohlen, spricht) wird er zu demselben
 * Bordeaux-Gold-Sechseck wie der aktive Tab - dieselbe Bedeutung, dieselbe
 * Form, egal wo man hinschaut.
 *
 * Die Kategoriefarbe faellt hier weg: neben Bordeaux und Gold sah jede
 * Kategorie anders aus, und die Leiste wirkte je nach Karte wie aus einer
 * anderen App. Die Zahlen darunter bekommen einen Schatten, weil die Leiste
 * ueber Bildern und hellen Grafiken liegen kann.
 */
const KNOPF_B = 46;
const KNOPF_H = 52;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function RailButton({
  icon,
  label,
  active,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  tint: string;
  onPress: () => void;
}) {
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.12 }],
  }));

  return (
    <View style={styles.item}>
      <AnimatedPressable
        onPressIn={() => {
          press.value = withTiming(1, { duration: motion.instant });
        }}
        onPressOut={() => {
          press.value = withSpring(0, motion.spring);
        }}
        onPress={() => {
          haptics.light();
          onPress();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[ZWEI ? styles.buttonZwei : styles.button, !ZWEI && active && { borderColor: tint }, animated]}
      >
        {ZWEI ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <SechseckLinse b={KNOPF_B} h={KNOPF_H} an={!!active} />
          </View>
        ) : null}
        {/* Im Browser malt ein absolut positioniertes Element UEBER seine
            nicht positionierten Geschwister - das Sechseck lag also ueber dem
            Symbol, und auf dem gefuellten Stein war das Herz unsichtbar.
            Eine eigene Ebene legt das Symbol wieder nach oben. */}
        <View style={styles.symbol}>
          <Icon
            name={icon}
            size={21}
            color={ZWEI ? (active ? (LINSE_SYMBOL ?? color.signal.primary) : color.ink.high) : active ? tint : color.ink.mid}
          />
        </View>
      </AnimatedPressable>
      <Text
        style={[styles.label, active && { color: ZWEI ? color.ink.max : tint }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** Grosse Zahlen kurz: 1234 -> 1,2k. Auf einer Leiste ist Platz knapp. */
function short(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k < 10 ? k.toFixed(1).replace('.', ',') : Math.round(k)}k`;
}

export function ActionRail({
  liked,
  likeCount,
  reposted,
  speaking,
  tint,
  commentCount,
  onLike,
  onRepost,
  onShare,
  onComment,
  onListen,
  onMehr,
  mehrOffen,
}: {
  liked: boolean;
  /** Gesamtzahl der Likes, einschliesslich des eigenen. */
  likeCount: number;
  reposted: boolean;
  speaking: boolean;
  tint: string;
  /** Sichtbare Fragen zu dieser Karte. */
  commentCount: number;
  onLike: () => void;
  onRepost: () => void;
  onShare: () => void;
  onComment: () => void;
  /**
   * Die drei Punkte (20.09.). Alles, was nicht beim Lesen gebraucht wird,
   * steht dahinter - Repost, Notiz, Quelle, Sprache.
   */
  onMehr?: () => void;
  mehrOffen?: boolean;
  /**
   * Fehlt auf Erklaerkarten - und das ist kein Versehen.
   *
   * Eine Erklaerkarte spricht von sich aus und hat ihren eigenen
   * Pause-Knopf. Stuende hier ein zweiter, griffen beide auf dieselbe
   * Stimme zu: "Stopp" haette die laufende Aeusserung abgebrochen, der
   * Abspieler haette das als "Takt fertig" gelesen und weitergeschaltet -
   * und "Hoeren" haette zusaetzlich den ganzen Kartentext daruebergelegt.
   * Zwei Bedienelemente fuer eine Sache sind hier nicht doppelt gemoppelt,
   * sondern kaputt.
   */
  onListen?: () => void;
}) {
  return (
    <View style={styles.rail} pointerEvents="box-none">
      {onListen ? (
        <RailButton
          icon={speaking ? 'listening' : 'listen'}
          label={speaking ? 'Stopp' : 'Hören'}
          active={speaking}
          tint={tint}
          onPress={onListen}
        />
      ) : null}
      <RailButton
        icon={liked ? 'like-filled' : 'like'}
        // Die Zahl statt des Wortes, sobald es etwas zu zaehlen gibt.
        // "Like" sagt nur, was der Knopf tut - das sieht man am Symbol.
        // Die Zahl sagt, was andere von der Karte hielten, und das ist die
        // Auskunft, die man an dieser Stelle sucht.
        label={likeCount > 0 ? short(likeCount) : liked ? 'geliked' : 'Like'}
        active={liked}
        tint={tint}
        onPress={onLike}
      />
      {/* 20.09.: Repost steht jetzt im Menue. Er ist das oeffentliche
          Signal - aber keins, das man beim Lesen jeder Karte braucht, und
          die Leiste traegt nur, was dabei gebraucht wird. */}
      {/**
        * Die Sprechblase steht dort, wo vorher die Lupe stand.
        *
        * Die Lupe fuehrte in die Kategorie - dasselbe Ziel wie das
        * Hashtag oben links, das ohnehin antippbar ist. Zwei Wege zum
        * selben Ort auf einem Schirm, auf dem vier Knoepfe Platz haben,
        * ist eine Verschwendung. Die Fragen zur Karte hatten dagegen gar
        * keinen.
        */}
      <RailButton
        icon="comment"
        label={commentCount > 0 ? short(commentCount) : 'Kommentar'}
        tint={tint}
        onPress={onComment}
      />
      <RailButton icon="share" label={T('Teilen')} tint={tint} onPress={onShare} />
      {onMehr ? (
        <RailButton icon="mehr" label={T('Mehr')} active={mehrOffen} tint={tint} onPress={onMehr} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    gap: ZWEI ? space.md : space.lg,
    alignItems: 'center',
  },
  item: { alignItems: 'center', gap: 4, maxWidth: 68 },
  button: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: { position: 'relative', zIndex: 1 },
  buttonZwei: {
    width: KNOPF_B,
    height: KNOPF_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: ZWEI
    ? {
        ...type.meta,
        fontSize: 10,
        color: color.ink.high,
        textAlign: 'center',
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }
    : { ...type.meta, fontSize: 9.5, color: color.ink.low, textAlign: 'center' },
});
