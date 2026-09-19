import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Line, LinearGradient, Pattern, Polygon, Rect, Stop } from 'react-native-svg';

import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { UPDATES, type Gross, type Update } from '@/lib/updates';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Update-Historie (/updates). Die Daten stehen in lib/updates.ts.
 *
 * Kleine Updates als Zeitleiste, grosse (Design 2.0, LAB 2.0, PRO, der
 * Anfang) mit eigener Titelkarte. Die Farben der Titelkarten sind bewusst
 * fest und nicht aus dem Design-Schalter: sie zeigen, wie der Schritt
 * aussah - Design 2.0 ist bordeaux, auch wenn jemand klassisch eingestellt hat.
 */
const GOLD = '#D9B872';
const BORDEAUX = '#4E1626';
const BORDEAUX_TIEF = '#2A0B15';
const BLAU = '#0E1A2B';

function datum(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Sechseck({ x, y, r, farbe, breite = 1.5, fuellung = 'none' }: { x: number; y: number; r: number; farbe: string; breite?: number; fuellung?: string }) {
  const punkte = Array.from({ length: 6 }, (_, i) => {
    const w = (Math.PI / 3) * i - Math.PI / 2;
    return `${x + r * Math.cos(w)},${y + r * Math.sin(w)}`;
  }).join(' ');
  return <Polygon points={punkte} stroke={farbe} strokeWidth={breite} fill={fuellung} />;
}

/** Das Bild oben in einer grossen Karte - je Art ein eigenes Motiv. */
function Motiv({ art }: { art: Gross }) {
  const h = 132;
  if (art === 'design') {
    return (
      <Svg width="100%" height={h} viewBox="0 0 320 132" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="bd" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={BORDEAUX} />
            <Stop offset="1" stopColor={BORDEAUX_TIEF} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="320" height="132" fill="url(#bd)" />
        <Sechseck x={250} y={66} r={52} farbe={GOLD} breite={2} />
        <Sechseck x={250} y={66} r={34} farbe={GOLD} breite={1} />
        <Sechseck x={250} y={66} r={16} farbe={GOLD} breite={0} fuellung={GOLD} />
        <Sechseck x={180} y={30} r={10} farbe={GOLD} breite={1} />
        <Sechseck x={196} y={108} r={7} farbe={GOLD} breite={1} />
      </Svg>
    );
  }
  if (art === 'lab') {
    return (
      <Svg width="100%" height={h} viewBox="0 0 320 132" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <Pattern id="raster" width="16" height="16" patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2="16" y2="0" stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={1} />
            <Line x1="0" y1="0" x2="0" y2="16" stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="320" height="132" fill={BLAU} />
        <Rect x="0" y="0" width="320" height="132" fill="url(#raster)" />
        {/* eine Kurve aus Messpunkten */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const x = 150 + i * 20;
          const y = 104 - Math.pow(i, 1.6) * 7;
          return <Rect key={i} x={x} y={y} width={12} height={116 - y} fill="#7CC4FF" fillOpacity={0.15 + i * 0.08} />;
        })}
        <Line x1="150" y1="116" x2="310" y2="116" stroke="#7CC4FF" strokeWidth={1.5} />
      </Svg>
    );
  }
  if (art === 'pro') {
    return (
      <Svg width="100%" height={h} viewBox="0 0 320 132" preserveAspectRatio="xMidYMid slice">
        <Rect x="0" y="0" width="320" height="132" fill="#141114" />
        {Array.from({ length: 18 }, (_, i) => {
          const x = 140 + (i % 6) * 30 + (Math.floor(i / 6) % 2) * 15;
          const y = 22 + Math.floor(i / 6) * 40;
          const auf = i % 2 === 0;
          const pts = auf ? `${x},${y + 22} ${x + 13},${y} ${x + 26},${y + 22}` : `${x},${y} ${x + 26},${y} ${x + 13},${y + 22}`;
          return <Polygon key={i} points={pts} fill={GOLD} fillOpacity={0.08 + (i % 5) * 0.06} />;
        })}
      </Svg>
    );
  }
  return (
    <Svg width="100%" height={h} viewBox="0 0 320 132" preserveAspectRatio="xMidYMid slice">
      <Rect x="0" y="0" width="320" height="132" fill="#101216" />
      {[0, 1, 2].map((i) => (
        <Rect key={i} x={196 + i * 22} y={26 + i * 8} width={70} height={92} rx={8} fill="#FFFFFF" fillOpacity={0.05 + i * 0.05} stroke="#FFFFFF" strokeOpacity={0.15} />
      ))}
    </Svg>
  );
}

function GrosseKarte({ u, neu }: { u: Update; neu: boolean }) {
  const hell = u.gross === 'design' || u.gross === 'pro' ? GOLD : u.gross === 'lab' ? '#7CC4FF' : color.ink.max;
  return (
    <View style={styles.gross}>
      <Motiv art={u.gross!} />
      <View style={styles.grossTitelBox} pointerEvents="none">
        <Text style={[styles.grossVersion, { color: hell }]}>{u.version.startsWith('LAB') ? u.version : `Version ${u.version}`}</Text>
        <Text style={styles.grossTitel}>{u.titel}</Text>
      </View>
      <View style={styles.grossInhalt}>
        <View style={styles.metaZeile}>
          <Text style={styles.datum}>{datum(u.datum)}</Text>
          {neu ? <Text style={styles.neu}>Neu</Text> : null}
        </View>
        <Text style={styles.kurz}>{u.kurz}</Text>
        <Punkte punkte={u.punkte} farbe={hell} />
      </View>
    </View>
  );
}

function Punkte({ punkte, farbe }: { punkte: string[]; farbe: string }) {
  return (
    <View style={{ gap: 6 }}>
      {punkte.map((p) => (
        <View key={p} style={styles.punkt}>
          <View style={[styles.punktZeichen, { backgroundColor: farbe }]} />
          <Text style={styles.punktText}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

function KleineKarte({ u, neu, letzte }: { u: Update; neu: boolean; letzte: boolean }) {
  return (
    <View style={styles.zeile}>
      <View style={styles.spur}>
        <View style={[styles.knoten, neu && { backgroundColor: color.akzent, borderColor: color.akzent }]} />
        {!letzte ? <View style={styles.linie} /> : null}
      </View>
      <View style={styles.klein}>
        <View style={styles.metaZeile}>
          <Text style={styles.version}>{u.version}</Text>
          <Text style={styles.datum}>{datum(u.datum)}</Text>
          {neu ? <Text style={styles.neu}>Neu</Text> : null}
        </View>
        <Text style={styles.titel}>{u.titel}</Text>
        <Text style={styles.kurz}>{u.kurz}</Text>
        <Punkte punkte={u.punkte} farbe={color.akzent} />
      </View>
    </View>
  );
}

export function UpdatesScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Updates" eyebrow="was neu ist" scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {UPDATES.map((u, i) =>
          u.gross ? (
            <GrosseKarte key={u.version} u={u} neu={i === 0} />
          ) : (
            <KleineKarte key={u.version} u={u} neu={i === 0} letzte={!!UPDATES[i + 1]?.gross || i === UPDATES.length - 1} />
          ),
        )}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  gross: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(12),
  },
  grossTitelBox: { position: 'absolute', left: space.lg, top: space.lg, right: '45%', gap: 2 },
  grossVersion: { ...type.mono, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  grossTitel: { ...type.title, fontSize: 24, lineHeight: 28, color: '#FFFFFF' },
  grossInhalt: { padding: space.lg, gap: space.sm },
  zeile: { flexDirection: 'row', gap: space.md },
  spur: { width: 14, alignItems: 'center', paddingTop: 6 },
  knoten: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: color.ink.low, backgroundColor: color.bg },
  linie: { width: 2, flex: 1, backgroundColor: color.ink.faint, marginTop: 4 },
  klein: { flex: 1, minWidth: 0, gap: space.xs, paddingBottom: space.sm },
  metaZeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  version: { ...type.mono, fontSize: 12, color: color.akzent },
  datum: { ...type.meta, fontSize: 11, color: color.ink.low },
  neu: {
    ...type.meta,
    fontSize: 10,
    color: color.bg,
    backgroundColor: color.akzent,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  titel: { ...type.title, fontSize: 18, color: color.ink.max },
  kurz: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid },
  punkt: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  punktZeichen: { width: 5, height: 5, borderRadius: 1, marginTop: 7, transform: [{ rotate: '45deg' }] },
  punktText: { ...type.body, fontSize: 13, lineHeight: 19, color: color.ink.high, flex: 1 },
});
