import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Slider } from '@/components/Slider';
import { color, space, type } from '@/theme/tokens';

import { evaluate } from './formula';

/**
 * Template "parameter_slider" - Regler bewegen, Kurve reagiert live.
 *
 * Der Fall aus dem Konzept: "Verschiebe den Zinseszins-Regler von 1 auf 10
 * Jahre und sieh, wie sich die Kurve steil nach oben biegt."
 *
 * Der Punkt ist nicht die Kurve, sondern die Verbindung zwischen der eigenen
 * Handbewegung und der Form. Wer den Regler selbst geschoben hat, erinnert
 * sich an die Krümmung; wer ein fertiges Diagramm gesehen hat, nicht.
 *
 * Die Formel wird von einem eigenen Parser ausgewertet, nicht von eval() -
 * siehe formula.ts.
 */

export type ParameterData = {
  prompt: string;
  param: {
    key: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    default: number;
    unit?: string;
  };
  formula: string;
  axes?: { x_label?: string; y_label?: string; x_min?: number; x_max?: number };
  checkpoint?: { question: string; target_param: number; tolerance?: number };
  reveal_after_ms?: number;
};

const W = 320;                 // nur das viewBox-Koordinatensystem
const KNOB = 30;
const SAMPLES = 48;

/**
 * Diagrammhoehe nach Bildschirm.
 *
 * Die Karte kann nicht scrollen - was zu hoch ist, wird abgeschnitten. Auf
 * einem kleinen Geraet muss das Diagramm also schrumpfen, statt Regler und
 * Checkpoint hinauszudraengen.
 */
function chartHeight(screenH: number): number {
  if (screenH < 700) return 108;   // kompakte Geraete
  if (screenH < 820) return 132;
  return 152;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString('de-DE');
  if (Math.abs(n) >= 100) return Math.round(n).toString();
  return (Math.round(n * 10) / 10).toString();
}

export function ParameterSlider({
  data,
  onSolved,
}: {
  data: ParameterData;
  onSolved?: (correct: boolean) => void;
}) {
  const { param, axes } = data;
  const step = param.step ?? 1;
  const xMin = axes?.x_min ?? 0;
  const xMax = axes?.x_max ?? 10;

  const { height: screenH } = useWindowDimensions();
  const H = chartHeight(screenH);

  const [value, setValue] = useState(param.default);
  const [armed, setArmed] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setArmed(true), data.reveal_after_ms ?? 3000);
    return () => clearTimeout(t);
  }, [data.reveal_after_ms]);

  const onChange = useCallback((v: number) => {
    setValue(v);
    setTouched(true);
  }, []);

  // Kurve für den aktuellen Parameterwert abtasten.
  const { path, yMax, endValue } = useMemo(() => {
    const points: { x: number; y: number }[] = [];
    let max = -Infinity;
    for (let i = 0; i <= SAMPLES; i++) {
      const xv = xMin + ((xMax - xMin) * i) / SAMPLES;
      const yv = evaluate(data.formula, { x: xv, [param.key]: value });
      if (Number.isFinite(yv)) {
        points.push({ x: xv, y: yv });
        if (yv > max) max = yv;
      }
    }
    if (points.length < 2 || !Number.isFinite(max) || max <= 0) {
      return { path: '', yMax: 1, endValue: NaN };
    }
    const d = points
      .map((p, i) => {
        const px = 24 + ((p.x - xMin) / (xMax - xMin || 1)) * (W - 40);
        const py = H - 22 - (p.y / max) * (H - 46);
        return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');
    return { path: d, yMax: max, endValue: points[points.length - 1].y };
  }, [data.formula, param.key, value, xMin, xMax, H]);

  // Checkpoint: erst nach dem Ausprobieren, und nur wenn definiert.
  const cp = data.checkpoint;
  const hit =
    cp && Math.abs(value - cp.target_param) <= (cp.tolerance ?? Math.max(1, step));

  useEffect(() => {
    if (cp && hit && touched) onSolved?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit, touched]);

  return (
    <View style={styles.root}>
      <Text style={styles.prompt}>{data.prompt}</Text>

      <View style={styles.chart}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Achsen */}
          <Line x1={24} y1={H - 22} x2={W - 12} y2={H - 22} stroke={color.ink.faint} strokeWidth={1} />
          <Line x1={24} y1={12} x2={24} y2={H - 22} stroke={color.ink.faint} strokeWidth={1} />
          {/* Hilfslinien */}
          {[0.25, 0.5, 0.75].map((f) => (
            <Line
              key={f}
              x1={24}
              y1={H - 22 - f * (H - 46)}
              x2={W - 12}
              y2={H - 22 - f * (H - 46)}
              stroke={color.gridLine}
              strokeWidth={1}
            />
          ))}
          {path ? (
            <>
              <Path
                d={path}
                stroke={color.signal.primary}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Circle
                cx={W - 16}
                cy={H - 22 - (endValue / yMax) * (H - 46)}
                r={4}
                fill={color.signal.primary}
              />
            </>
          ) : null}
        </Svg>

        <View style={styles.axisLabels}>
          <Text style={styles.axis}>{axes?.x_label ?? 'x'}</Text>
          <Text style={styles.axis}>
            {axes?.y_label ?? 'y'} bis {fmt(yMax)}
          </Text>
        </View>
      </View>

      <View style={styles.readout}>
        <Text style={styles.paramLabel}>{param.label}</Text>
        <Text style={styles.paramValue}>
          {fmt(value)}
          {param.unit ? <Text style={styles.unit}> {param.unit}</Text> : null}
        </Text>
      </View>

      <Slider
        min={param.min}
        max={param.max}
        step={step}
        value={value}
        onChange={onChange}
        locked={!armed}
        format={fmt}
      />
      {!armed ? (
        <Text style={styles.armHint}>Gleich kannst du den Regler bewegen …</Text>
      ) : null}

      {cp ? (
        <Text style={[styles.checkpoint, hit && touched && { color: color.signal.success }]}>
          {hit && touched ? '✓  ' : ''}
          {cp.question}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  prompt: { ...type.deck, color: color.ink.max },

  chart: { gap: space.xs },
  // Hoehe kommt zur Laufzeit, damit sie sich dem Geraet anpasst.
  axisLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  axis: { ...type.meta, color: color.ink.low },

  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  paramLabel: { ...type.body, fontSize: 15, color: color.ink.mid, flex: 1 },
  paramValue: { ...type.title, fontSize: 26, color: color.signal.primary },
  unit: { ...type.label, color: color.ink.mid },

  armHint: { ...type.meta, color: color.ink.low, paddingTop: space.md },

  checkpoint: { ...type.body, fontSize: 15, color: color.ink.mid },
});
