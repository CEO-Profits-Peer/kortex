import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { GRID_CELL, color, space, type } from '@/theme/tokens';

/**
 * Die Kopfzeile jeder Unterseite.
 *
 * Warum es sie gibt
 * -----------------
 * Sie stand elfmal im Projekt, von Hand kopiert: Einstellungen, Konto,
 * Avatar, Kurs, Tagesziel, Kategorie, Rangliste, Personenliste,
 * Personen-Feed, oeffentliches Profil, Folgen-Feed. Neunmal gleich, zweimal
 * abgedriftet - in der Personenliste in `type.mono` bei 12px statt
 * `type.meta` bei 11, im Tagesziel absolut positioniert statt im Fluss.
 *
 * Genau solche Abweichungen sind der Unterschied zwischen "sauber" und
 * "irgendwie zusammengesucht". Man kann sie nicht benennen, wenn man die
 * Seiten nacheinander sieht - man spuert sie nur. Und sie entstehen nicht
 * aus Nachlaessigkeit, sondern zwangslaeufig: bei elf Kopien ist die
 * zwoelfte Aenderung immer nur in zehn davon angekommen.
 *
 * Was sie ueber das Vereinheitlichen hinaus tut
 * ---------------------------------------------
 * 1. Sie sitzt im RASTER. Die Kopfzeile ist genau drei Zellen des
 *    Hintergrundrasters hoch (3 x 24px). Der Hintergrund ist kariertes
 *    Papier - wenn die Kopfzeile auf einer Rasterlinie endet statt zwei
 *    Pixel daneben, sieht das gezeichnet aus statt gesetzt. Dasselbe gilt
 *    fuer den Einzug: `space.xl` sind 24px, also exakt eine Zelle.
 *
 * 2. Der grosse Titel weicht beim Scrollen einem kleinen. Das ist kein
 *    Zitat von iOS um des Zitats willen: eine Ueberschrift in 30px kostet
 *    auf einem Telefon ein Zehntel der Hoehe, und sobald man liest, ist sie
 *    nur noch im Weg. Gleichzeitig darf sie nicht einfach verschwinden -
 *    sonst weiss man nach zwei Wischern nicht mehr, wo man ist. Also
 *    wandert sie in die Leiste.
 *
 * 3. Die Haarlinie erscheint erst, wenn wirklich Inhalt darunter liegt.
 *    Eine Trennlinie ueber leerem Raum trennt nichts - sie ist dann bloss
 *    ein Strich.
 *
 * Ohne `scrollY` bleibt alles ruhig stehen. Bildschirme ohne Scrollen
 * (Avatar, Kurs) sollen keine Bewegung zeigen, die es nicht gibt.
 */

/** Ab hier ist die grosse Ueberschrift ganz weg. Drei Rasterzellen Weg. */
const COLLAPSE_AT = GRID_CELL * 3;

/** Die Leiste: drei Zellen. Alles andere waere neben dem Hintergrund. */
const BAR_HEIGHT = GRID_CELL * 3;

type Props = {
  title: string;
  /** Eine Zeile darueber - Kategorie, Abschnitt, Anzahl. */
  eyebrow?: string;
  /** Eine Zeile darunter, in Ink-Mid. Fuer Erklaerungen, nicht fuer Zahlen. */
  subtitle?: string;
  /** Rechts in der Leiste, auf Hoehe der Zurueck-Taste. */
  right?: React.ReactNode;
  /**
   * Scrollstand der Seite. Wird er uebergeben, wandert der Titel beim
   * Scrollen in die Leiste und die Haarlinie blendet auf.
   */
  scrollY?: SharedValue<number>;
  /** Standard ist zurueck. Ein eigener Weg nur, wo es einen gibt. */
  onBack?: () => void;
  /** Die grosse Ueberschrift weglassen - fuer Seiten mit eigenem Kopfbereich. */
  titleInBarOnly?: boolean;
};

export function ScreenHeader({
  title,
  eyebrow,
  subtitle,
  right,
  scrollY,
  onBack,
  titleInBarOnly = false,
}: Props) {
  const back = onBack ?? (() => router.back());

  /**
   * Die gemessene Hoehe des grossen Titels.
   *
   * Gebraucht, weil Ausblenden allein nicht reicht: beim ersten Versuch
   * wurde nur die Deckkraft animiert, und dann stand zwischen Leiste und
   * erster Zeile ein handbreiter leerer Streifen - unsichtbare Schrift,
   * die trotzdem Platz nimmt. Genau das, was die Kopfzeile vermeiden
   * sollte.
   *
   * Gemessen statt geschaetzt, weil die Hoehe vom Inhalt abhaengt: mit
   * Vorzeile und Unterzeile ist sie fast doppelt so gross wie ohne.
   */
  const [bigHeight, setBigHeight] = useState(0);

  // Ohne Scrollwert sind beide Zustaende fest: grosser Titel sichtbar,
  // kleiner nicht. Der Aufwand, dafuer Animationen zu bauen, waere
  // Bewegung ohne Anlass.
  const grosserTitel = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: titleInBarOnly ? 0 : 1, transform: [{ translateY: 0 }] };
    // Die Hoehe geht erst mit, wenn die Schrift fast weg ist.
    const p = interpolate(scrollY.value, [COLLAPSE_AT * 0.35, COLLAPSE_AT], [1, 0], Extrapolation.CLAMP);
    // ERST verblassen, DANN zusammengehen (19.09.). Vorher liefen beide
    // gleich schnell - und weil der Kasten den Text beschneidet, stand auf
    // halbem Weg eine 30px-Ueberschrift da, der die untere Haelfte fehlt.
    // Das sah kaputt aus, nicht animiert. Jetzt ist die Schrift weg, bevor
    // die Kante sie erreicht.
    const sichtbar = interpolate(scrollY.value, [0, COLLAPSE_AT * 0.45], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: sichtbar,
      // Die Hoehe geht mit. Solange nichts gemessen ist (erster
      // Bildaufbau), bleibt sie automatisch - sonst waere die Kopfzeile
      // einen Wimpernschlag lang zusammengeklappt.
      height: bigHeight > 0 ? bigHeight * p : undefined,
      // Nach OBEN, nicht nach unten: der Titel geht dorthin, wo er
      // gleich klein wieder auftaucht. Bewegung, die den Blick fuehrt.
      transform: [{ translateY: (1 - sichtbar) * -10 }],
    };
  });

  const kleinerTitel = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: titleInBarOnly ? 1 : 0 };
    const p = interpolate(
      scrollY.value,
      [COLLAPSE_AT * 0.55, COLLAPSE_AT],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity: p, transform: [{ translateY: (1 - p) * 8 }] };
  });

  const linie = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 0 };
    return {
      opacity: interpolate(scrollY.value, [0, COLLAPSE_AT], [0, 1], Extrapolation.CLAMP),
    };
  });

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable
          onPress={back}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <Icon name="back" size={15} color={color.ink.mid} />
          <Text style={styles.backText}>zurück</Text>
        </Pressable>

        {/* Der kleine Titel liegt MITTIG ueber der ganzen Leiste, nicht
            zwischen Taste und Aktion. Sonst springt er, sobald rechts
            etwas dazukommt oder wegfaellt. */}
        <Animated.Text
          numberOfLines={1}
          pointerEvents="none"
          style={[styles.barTitle, kleinerTitel]}
        >
          {title}
        </Animated.Text>

        <View style={styles.right}>{right}</View>
      </View>

      {titleInBarOnly ? null : (
        <Animated.View
          style={[styles.big, grosserTitel]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            // Nur den RUHENDEN Wert merken. Waehrend des Zusammenklappens
            // meldet onLayout laufend kleinere Hoehen, und die als neuen
            // Ausgangswert zu nehmen, waere eine Schleife nach unten.
            if (h > bigHeight) setBigHeight(h);
          }}
        >
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </Animated.View>
      )}

      <Animated.View style={[styles.hairline, linie]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  // Die Kopfzeile liegt UEBER dem Inhalt (19.09.). Sie steht im Baum vor
  // der Scrollflaeche, und ohne zIndex gewinnt die Flaeche: waehrend die
  // Hoehe des grossen Titels zusammengeht, schob sich der Inhalt fuer einen
  // Moment ueber die Ueberschrift - auf dem Telefon gut sichtbar.
  root: { paddingHorizontal: space.xl, zIndex: 2, elevation: 2 },

  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  backText: { ...type.meta, color: color.ink.mid },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 1 },

  barTitle: {
    ...type.label,
    color: color.ink.max,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },

  // Der grosse Titel haengt UNTER der Leiste und schiebt den Inhalt nach
  // unten - er ist Teil der Seite, nicht der Navigation. Deshalb darf er
  // beim Scrollen auch mitgehen und verschwinden.
  big: { paddingBottom: space.lg, gap: 2, overflow: 'hidden' },
  eyebrow: { ...type.meta, color: color.ink.low },
  title: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  subtitle: { ...type.label, color: color.ink.mid, marginTop: space.xs },

  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.ink.faint,
  },
});
