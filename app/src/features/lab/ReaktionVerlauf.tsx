import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { color, space, type } from '@/theme/tokens';
import { T } from '@/lib/sprache';

/**
 * Reaktionszeit ueber Wochen (19.09.): jede fertige Messung (Schnitt aus
 * fuenf Runden) landet auf dem Geraet, die Kurve zeigt den Wochenschnitt.
 *
 * Nur lokal: die Werte haengen am Geraet (Bildschirm und Browser verzoegern
 * mit, siehe Quelle des Werkzeugs) - ein Vergleich ueber Geraete hinweg
 * waere ohnehin schief.
 */

const KEY = 'lab_reaktion_verlauf_v1';
type Messung = { am: string; ms: number };

export async function reaktionMerken(ms: number): Promise<Messung[]> {
  let liste: Messung[] = [];
  try {
    const roh = await AsyncStorage.getItem(KEY);
    liste = roh ? (JSON.parse(roh) as Messung[]) : [];
  } catch {
    liste = [];
  }
  liste = [...liste, { am: new Date().toISOString(), ms: Math.round(ms) }].slice(-200);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(liste));
  } catch {
    /* nur diese Sitzung */
  }
  return liste;
}

/** Montag der Woche als Schluessel "YYYY-MM-DD". */
function woche(iso: string): string {
  const d = new Date(iso);
  const tag = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - tag);
  return d.toISOString().slice(0, 10);
}

export function ReaktionVerlauf({ liste, farbe }: { liste: Messung[]; farbe: string }) {
  const { width } = useWindowDimensions();
  const [wochen, setWochen] = useState<{ w: string; ms: number; n: number }[]>([]);

  useEffect(() => {
    const m = new Map<string, number[]>();
    for (const x of liste) m.set(woche(x.am), [...(m.get(woche(x.am)) ?? []), x.ms]);
    setWochen(
      [...m.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([w, v]) => ({ w, ms: v.reduce((a, b) => a + b, 0) / v.length, n: v.length })),
    );
  }, [liste]);

  if (liste.length < 2) {
    return <Text style={{ ...type.meta, color: color.ink.low }}>{T('Miss dich nächste Woche nochmal – dann entsteht hier deine Kurve.')}</Text>;
  }

  const b = Math.min(width, 440) - 2 * space.xl - 2 * space.lg;
  const h = 90;
  const werte = wochen.length >= 2 ? wochen.map((x) => x.ms) : liste.slice(-12).map((x) => x.ms);
  const min = Math.min(...werte) * 0.95;
  const max = Math.max(...werte) * 1.05;
  const x = (i: number) => (werte.length === 1 ? b / 2 : (i / (werte.length - 1)) * b);
  // Schneller = besser = weiter OBEN: die Kurve steigt, wenn man besser wird.
  const y = (v: number) => (max === min ? h / 2 : ((v - min) / (max - min)) * h);
  const erste = werte[0];
  const letzte = werte[werte.length - 1];
  const diff = Math.round(erste - letzte);

  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 }}>
        {wochen.length >= 2 ? `Wochenschnitt · ${wochen.length} Wochen` : `Letzte ${werte.length} Messungen`}
      </Text>
      <Svg width={b} height={h + 8}>
        <Line x1={0} y1={h + 4} x2={b} y2={h + 4} stroke={color.ink.faint} strokeWidth={1} />
        <Polyline points={werte.map((v, i) => `${x(i)},${y(v) + 4}`).join(' ')} fill="none" stroke={farbe} strokeWidth={2} />
        {werte.map((v, i) => (
          <Circle key={i} cx={x(i)} cy={y(v) + 4} r={i === werte.length - 1 ? 4 : 2.5} fill={farbe} />
        ))}
      </Svg>
      <Text style={{ ...type.body, fontSize: 13, color: color.ink.mid }}>
        {diff > 5
          ? `${diff} ms schneller als am Anfang – oben ist schneller.`
          : diff < -5
            ? `${-diff} ms langsamer als am Anfang – vielleicht müde?`
            : 'Ziemlich gleich geblieben – oben ist schneller.'}
      </Text>
    </View>
  );
}
