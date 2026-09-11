import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

import { useMeasuredHeight } from './useMeasuredHeight';

/**
 * Inhalt, der sich an den Bildschirm anpasst statt abgeschnitten zu werden.
 *
 * Das Problem: eine Karte hat genau so viel Platz wie der Bildschirm hoch ist,
 * und im Reel wird nicht gescrollt. Manche Texte und vor allem manche Quizze
 * sind aber laenger als andere. Bisher wurde geschaetzt, wie viele Zeilen
 * hineinpassen, und alles darueber auf eine zweite Seite geschoben. Schaetzen
 * heisst: mal zu frueh umbrechen, mal zu spaet - und zu spaet bedeutet
 * abgeschnittener Text.
 *
 * Die Loesung ist, nicht mehr zu schaetzen, sondern zu messen. Der Inhalt wird
 * in seiner natuerlichen Groesse vermessen und, wenn er nicht passt, genau um
 * den Faktor verkleinert, der noetig ist. Kein Abschneiden, kein leerer Rand,
 * kein Scrollen.
 *
 * Warum das sauber funktioniert und nicht in einer Endlosschleife endet: eine
 * Transformation in React Native veraendert das Layout nicht, nur die
 * Darstellung. Die innere Ansicht meldet deshalb immer ihre unskalierte Hoehe,
 * egal was aussen passiert. Eine Messung, ein Faktor, fertig.
 *
 * FitBox misst BEIDE Hoehen selbst - die verfuegbare und die noetige. Der
 * Umweg ueber useMeasuredHeight ist dabei kein Zierrat, siehe dort.
 *
 * Der Faktor wird NICHT animiert, und das ist Absicht. Ein Uebergang von
 * grosser auf kleine Schrift beim Erscheinen der Karte waere kein Gewinn,
 * sondern ein Zucken - der Nutzer soll die Karte in ihrer richtigen Groesse
 * sehen, nicht beim Zurechtruecken zuschauen. Deshalb bleibt der Inhalt
 * unsichtbar, bis beide Hoehen bekannt sind (ein Bildaufbau), und erscheint
 * dann fertig. Die Karte hat ohnehin ihre eigene Einblendung; dieses eine
 * Bild faellt darin nicht auf.
 *
 * Die Untergrenze ist Absicht. Waere sie nicht da, wuerde eine sehr lange
 * Karte auf Briefmarkengroesse schrumpfen statt auf zwei Seiten zu gehen -
 * lesbar bleibt wichtiger als auf einer Seite bleiben. Unterhalb der Grenze
 * uebernimmt wieder die Seitenaufteilung in paginate.ts.
 */

/** Kleiner darf Text nicht werden. 0.72 * 15px Fliesstext = knapp 11px. */
const MIN_SCALE = 0.72;

export function FitBox({
  style,
  children,
  onOverflow,
}: {
  style?: ViewStyle;
  children: React.ReactNode;
  /**
   * Wird einmal gemeldet, wenn der Inhalt selbst beim Mindestfaktor noch
   * uebersteht. Die Karte teilt dann auf zwei Seiten - das ist die einzige
   * Antwort, die dann noch bleibt.
   */
  onOverflow?: () => void;
}) {
  const [available, availableProps] = useMeasuredHeight();
  const [natural, naturalProps] = useMeasuredHeight();

  const measured = available > 0 && natural > 0;
  const scale = measured && natural > available
    ? Math.max(MIN_SCALE, available / natural)
    : 1;

  const overflows = measured && natural * MIN_SCALE > available + 1;
  const reported = useRef(false);
  useEffect(() => {
    if (overflows && !reported.current) {
      reported.current = true;
      onOverflow?.();
    }
  }, [overflows, onOverflow]);

  /**
   * Der Faktor laeuft ueber eine Shared Value und wird in einem Effekt
   * gesetzt - nicht direkt im Stil-Worklet.
   *
   * Das ist keine Geschmacksfrage: liest das Worklet den gerechneten Wert
   * direkt aus dem Umfeld, bemerkt Reanimated dessen Aenderung im Web nicht
   * und laesst den Faktor auf eins stehen. Von aussen sieht das aus, als
   * wuerde gar nicht gemessen. Ueber eine Shared Value kommt die Aenderung
   * verlaesslich an.
   */
  return (
    <View style={styles.fill} {...availableProps}>
      <View
        style={[
          styles.outer,
          { transform: [{ scale }], opacity: measured ? 1 : 0 },
          style,
        ]}
      >
        {/* Diese Ansicht darf NICHT schrumpfen - sonst quetscht das Layout sie
            vorher zusammen, und wir messen die gequetschte statt der echten
            Hoehe. */}
        <View style={styles.inner} {...naturalProps}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fuellt den Platz, den die Karte hergibt, und zentriert darin. Was trotz
  // Verkleinerung nicht passt, wird hier abgeschnitten statt ueber die
  // Kartenkante zu laufen.
  fill: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  outer: { alignSelf: 'stretch', flexShrink: 0 },
  inner: { flexShrink: 0 },
});
