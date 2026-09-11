import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, View } from 'react-native';

/**
 * Die Hoehe, die eine Ansicht tatsaechlich einnimmt.
 *
 * `onLayout` ist das dafuer gebaute Bordmittel und reicht auf dem Handy.
 *
 * Im Web kommt es aus zwei Gruenden nicht allein aus:
 *
 *   1. react-native-web setzt `onLayout` auf einen ResizeObserver auf. Der
 *      liefert seinen ersten Wert erst nach dem naechsten Bildaufbau. Bis
 *      dahin ist die Hoehe null, und wer darauf rechnet, rechnet einmal
 *      falsch.
 *   2. Schriften kommen nach. Solange Space Grotesk nicht geladen ist,
 *      rechnet der Browser mit der Ersatzschrift, und die ist anders hoch.
 *
 * Deshalb hier vier Wege zur selben Zahl: die sofortige Messung beim
 * Anhaengen, `onLayout`, ein eigener ResizeObserver fuer spaetere
 * Aenderungen, und eine Nachmessung, sobald die Schriften da sind. Alle
 * schreiben in denselben Zustand und alle sind gegen denselben Wert
 * abgesichert, also kostet die Mehrfachmessung nichts ausser ein paar
 * Zeilen.
 *
 * Rueckgabe: die gerundete Hoehe und die Requisiten, die an die zu messende
 * Ansicht gehoeren. Gerundet, weil sonst jede Nachkommastelle ein erneutes
 * Rendern ausloest und die Anzeige flackert.
 */
export function useMeasuredHeight(): [
  number,
  { ref: (node: View | null) => void; onLayout: (e: LayoutChangeEvent) => void },
] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setHeight((cur) => (cur === h ? cur : h));
  }, []);

  const ref = useCallback((node: View | null) => {

    if (Platform.OS !== 'web') return;
    observer.current?.disconnect();
    observer.current = null;
    // Im Web ist die Ansicht ein DOM-Element. Der Umweg ueber unknown ist
    // ehrlicher als ein erfundener Typ.
    const el = node as unknown as HTMLElement | null;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const read = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      setHeight((cur) => (cur === h ? cur : h));
    };

    read();

    // Der ResizeObserver faengt spaetere Aenderungen - aufgeklappte Bloecke,
    // gedrehtes Geraet, geaenderte Fenstergroesse.
    //
    // Immer `getBoundingClientRect`, nie `contentRect`: das eine misst
    // einschliesslich Innenabstand, das andere ohne. Zwei Messwege fuer
    // dieselbe Groesse sind eine Fehlerquelle, die man erst bemerkt, wenn
    // irgendwo ein Innenabstand dazukommt.
    const obs = new ResizeObserver(read);
    obs.observe(el);
    observer.current = obs;

    // Zwei Nachmessungen, die der Beobachter nicht zuverlaessig liefert:
    //
    //   · das naechste Bild - beim ersten Anhaengen steht das Layout
    //     manchmal noch nicht endgueltig;
    //   · nach dem Laden der Schriften - bis Space Grotesk da ist, rechnet
    //     der Browser mit der Ersatzschrift, und die ist anders hoch. Ohne
    //     das blieb eine Karte um rund fuenfzehn Pixel zu gross und wurde
    //     unten angeschnitten.
    requestAnimationFrame(read);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(read).catch(() => {});
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [height, { ref, onLayout }];
}
