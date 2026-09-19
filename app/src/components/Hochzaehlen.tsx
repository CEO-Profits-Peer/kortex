import React, { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useImBild } from '@/lib/imBild';
import { getPrefs } from '@/lib/prefs';

/**
 * Eine Zahl, die hochzaehlt, statt zu springen - fuer LAB-Ergebnisse, XP,
 * Statistik. Nimmt einen fertig formatierten Text ("≈ 253 500 €", "50,7 %")
 * und zaehlt nur die ERSTE Zahl darin hoch; Einheit und Zeichen drumherum
 * bleiben stehen. So muss kein Aufrufer seine Formatierung aendern.
 *
 * Die Endzahl ist exakt der uebergebene Text - hochgezaehlt wird nur der
 * Weg dorthin. "Bewegung reduzieren": sofort der Endwert.
 */

// Ziffern mit Tausender-Leerzeichen (auch schmal/geschuetzt) oder -Punkt und
// Komma-Nachkommastellen, wie toLocaleString('de-AT') sie liefert.
const ZAHL = /\d{1,3}(?:[   .]\d{3})*(?:,\d+)?|\d+(?:,\d+)?/;

function zerlegen(text: string) {
  // Uhrzeiten ("21:15") und Dauern aus zwei Teilen ("8 min 19 s") zaehlen
  // nicht: halbe Stunden oder "4 min 19 s" als Zwischenstand saehen falsch aus.
  if (/\d:\d/.test(text) || / min /.test(text)) return null;
  const m = ZAHL.exec(text);
  if (!m) return null;
  const roh = m[0];
  const trenner = /[   .]/.exec(roh.split(',')[0])?.[0] ?? null;
  const stellen = roh.includes(',') ? roh.split(',')[1].length : 0;
  const wert = Number(roh.replace(/[   .]/g, '').replace(',', '.'));
  return { vor: text.slice(0, m.index), nach: text.slice(m.index + roh.length), wert, stellen, trenner };
}

function formatieren(n: number, stellen: number, trenner: string | null) {
  const [ganz, komma] = n.toFixed(stellen).split('.');
  const mitTrenner = trenner ? ganz.replace(/\B(?=(\d{3})+(?!\d))/g, trenner) : ganz;
  return komma ? `${mitTrenner},${komma}` : mitTrenner;
}

export function Hochzaehlen({
  text,
  style,
  dauer = 900,
  verzoegerung = 0,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  dauer?: number;
  verzoegerung?: number;
}) {
  const teile = zerlegen(text);
  const [anzeige, setAnzeige] = useState(() => (teile && !getPrefs().reduceMotion ? teile.vor + formatieren(0, teile.stellen, teile.trenner) + teile.nach : text));
  const rahmen = useRef<number | null>(null);
  // Erst zaehlen, wenn die Zahl im Bild ist (19.09.) - sonst ist sie fertig,
  // bevor jemand hinscrollt.
  const { ref, imBild } = useImBild<Text>(0.6);

  useEffect(() => {
    if (!imBild) return;
    const t = zerlegen(text);
    if (!t || getPrefs().reduceMotion || typeof requestAnimationFrame === 'undefined') {
      setAnzeige(text);
      return;
    }
    let start: number | null = null;
    const schritt = (jetzt: number) => {
      if (start === null) start = jetzt;
      const p = Math.min(1, Math.max(0, (jetzt - start - verzoegerung) / dauer));
      // Zum Ende hin langsamer: die letzten Stellen soll man lesen koennen.
      const e = 1 - Math.pow(1 - p, 3);
      setAnzeige(p >= 1 ? text : t.vor + formatieren(t.wert * e, t.stellen, t.trenner) + t.nach);
      if (p < 1) rahmen.current = requestAnimationFrame(schritt);
    };
    rahmen.current = requestAnimationFrame(schritt);
    return () => {
      if (rahmen.current !== null) cancelAnimationFrame(rahmen.current);
    };
  }, [text, dauer, verzoegerung, imBild]);

  return (
    <Text ref={ref} style={style}>
      {anzeige}
    </Text>
  );
}

/**
 * Zahl, die nur im Test-Modus hochzaehlt (Profil, Statistik). Ohne Schalter
 * ein normaler Text - so kann man vor dem Release vergleichen.
 */
export function ZahlText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  if (!getPrefs().testAnimationen) return <Text style={style}>{text}</Text>;
  return <Hochzaehlen text={text} style={style} />;
}
