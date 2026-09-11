import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import type { RadarSlice } from '@/lib/types.db';
import { categoryAccent, color, space, type } from '@/theme/tokens';

/**
 * Wissens-Radar.
 *
 * Ein Spinnendiagramm ueber die sieben Wurzelkategorien. Unterkategorien
 * zaehlen auf ihren Elternknoten ein (get_my_stats, 0007) - sonst waere das
 * Netz bei 34 Achsen unlesbar.
 *
 * Skaliert relativ zum eigenen Maximum, nicht absolut. Ein Anfaenger soll
 * eine erkennbare Form sehen und nicht einen Punkt in der Mitte; die Aussage
 * ist "wo bist du staerker", nicht "wie gut bist du absolut".
 */

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 34;
const RINGS = 4;

export function KnowledgeRadar({ data }: { data: RadarSlice[] }) {
  const axes = data.filter((d) => d.label);
  if (axes.length < 3) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Der Radar füllt sich, sobald du Fragen beantwortest.
        </Text>
      </View>
    );
  }

  const max = Math.max(...axes.map((a) => a.mastery), 1);

  const point = (i: number, ratio: number) => {
    // Start oben (-90°), im Uhrzeigersinn
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [
      CENTER + Math.cos(angle) * RADIUS * ratio,
      CENTER + Math.sin(angle) * RADIUS * ratio,
    ] as const;
  };

  const shape = axes
    .map((a, i) => {
      // Grundsockel 0.12, damit auch ein leeres Profil eine Form hat
      const [x, y] = point(i, 0.12 + (a.mastery / max) * 0.88);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const strongest = axes.reduce((a, b) => (b.mastery > a.mastery ? b : a));
  const accent = categoryAccent(strongest.accent);

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {/* Ringe */}
        {Array.from({ length: RINGS }).map((_, r) => (
          <Circle
            key={r}
            cx={CENTER}
            cy={CENTER}
            r={(RADIUS * (r + 1)) / RINGS}
            stroke={color.gridLine}
            strokeWidth={1}
            fill="none"
          />
        ))}

        {/* Achsen + Beschriftung */}
        {axes.map((a, i) => {
          const [x, y] = point(i, 1);
          const [lx, ly] = point(i, 1.2);
          return (
            <React.Fragment key={a.id}>
              <Line
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke={color.gridLineMajor}
                strokeWidth={1}
              />
              <SvgText
                x={lx}
                y={ly + 4}
                fill={color.ink.low}
                fontSize={11}
                textAnchor="middle"
              >
                {a.emoji ?? a.label.slice(0, 3)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Die eigene Form */}
        <Polygon
          points={shape}
          fill={accent}
          fillOpacity={0.16}
          stroke={accent}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {axes.map((a, i) => {
          const [x, y] = point(i, 0.12 + (a.mastery / max) * 0.88);
          return <Circle key={a.id} cx={x} cy={y} r={3} fill={accent} />;
        })}
      </Svg>

      <View style={styles.legend}>
        {axes.map((a) => (
          <View key={a.id} style={styles.legendRow}>
            <Text style={styles.legendEmoji}>{a.emoji ?? '◇'}</Text>
            <Text style={styles.legendLabel} numberOfLines={1}>
              {a.label}
            </Text>
            <Text style={[styles.legendLevel, { color: categoryAccent(a.accent) }]}>
              Lv {a.level}
            </Text>
            <Text style={styles.legendMastery}>{a.mastery}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.lg },
  empty: { paddingVertical: space.xxl, alignItems: 'center' },
  emptyText: { ...type.body, fontSize: 15, color: color.ink.low, textAlign: 'center' },

  legend: { alignSelf: 'stretch', gap: space.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 5 },
  legendEmoji: { fontSize: 15, width: 20 },
  legendLabel: { ...type.body, fontSize: 15, color: color.ink.high, flex: 1 },
  legendLevel: { ...type.meta },
  legendMastery: { ...type.mono, color: color.ink.low, width: 40, textAlign: 'right' },
});
