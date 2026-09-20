import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';

import { GridBackground } from '@/components/GridBackground';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { haptics } from '@/lib/haptics';
import { proAktiv } from '@/lib/pro';
import { api, type MonatsAbzeichen as Daten } from '@/lib/supabase';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Monats-Abzeichen (0117): ein eigenes Sechseck je Monat, verdient mit
 * Lerntagen - 8 Bronze, 15 Silber, 22 Gold. Gerechnet wird auf dem Server.
 *
 * - Monatsmedaille: das Abzeichen selbst.
 * - AbzeichenLeiste: im eigenen Profil (laufender Monat + verdiente).
 * - FremdeAbzeichen: im oeffentlichen Profil, nur verdiente.
 * - AbzeichenScreen: /abzeichen, das ganze Jahr.
 */
export const SCHWELLEN = [8, 15, 22] as const;
const STUFE = ['', 'Bronze', 'Silber', 'Gold'];
const RAND = ['#3A3A40', '#B07A4A', '#C9D0D8', '#D9B872'];

// Eine Farbe je Monat - vom kalten Jaenner bis zum dunklen Dezember.
const MONATSFARBE = [
  '#3D5A80', '#6D597A', '#4F772D', '#90A955', '#D08C60', '#E9C46A',
  '#E76F51', '#F4A261', '#8E5A3C', '#A0522D', '#5E503F', '#2E4057',
];
const KURZ = ['JÄN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

function punkte(g: number, inset: number) {
  const r = g / 2;
  return Array.from({ length: 6 }, (_, i) => {
    const w = (Math.PI / 3) * i - Math.PI / 2;
    return `${r + (r - inset) * Math.cos(w)},${r + (r - inset) * Math.sin(w)}`;
  }).join(' ');
}

export function Monatsmedaille({ monat, stufe, groesse = 56 }: { monat: string; stufe: number; groesse?: number }) {
  const d = new Date(`${monat}T12:00:00`);
  const m = d.getMonth();
  const an = stufe > 0;
  // PRO: eine goldene Aussenkante, wie bei den Meister-Rahmen (0095).
  // Eine Zugabe fuers Aussehen - verdient wird das Abzeichen gleich.
  const gold = an && proAktiv();
  const id = `m${monat.replace(/-/g, '')}${groesse}`;
  return (
    <View style={{ width: groesse, height: groesse, opacity: an ? 1 : 0.35 }}>
      <Svg width={groesse} height={groesse}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={an ? MONATSFARBE[m] : '#2A2A30'} />
            <Stop offset="1" stopColor={an ? '#141218' : '#18181C'} />
          </LinearGradient>
        </Defs>
        {gold ? (
          <Polygon points={punkte(groesse, 0.8)} fill="none" stroke="#D9B872" strokeWidth={1} strokeOpacity={0.85} />
        ) : null}
        <Polygon points={punkte(groesse, gold ? 3.4 : 2)} fill={`url(#${id})`} stroke={RAND[stufe]} strokeWidth={stufe === 3 ? 3 : 2} />
        {stufe >= 2 ? <Polygon points={punkte(groesse, 7)} fill="none" stroke={RAND[stufe]} strokeOpacity={0.45} strokeWidth={1} /> : null}
      </Svg>
      <View style={styles.medailleMitte}>
        <Text style={[styles.medailleMonat, { fontSize: groesse * 0.2 }]}>{KURZ[m]}</Text>
        <Text style={[styles.medailleJahr, { fontSize: groesse * 0.14 }]}>{String(d.getFullYear()).slice(2)}</Text>
      </View>
    </View>
  );
}

function naechste(lerntage: number) {
  const s = SCHWELLEN.find((x) => lerntage < x);
  return s == null ? null : { bis: s, stufe: STUFE[SCHWELLEN.indexOf(s) + 1] };
}

/** Im eigenen Profil: laufender Monat mit Stand, dahinter die verdienten. */
export function AbzeichenLeiste() {
  const [d, setD] = useState<Daten | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.meineMonatsAbzeichen().then(setD).catch(() => setD(null));
    }, []),
  );
  if (!d || d.monate.length === 0) return null;
  const jetzt = d.monate[0];
  const verdient = d.monate.slice(1).filter((m) => m.stufe > 0);
  const n = naechste(jetzt.lerntage);
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        router.push('/abzeichen');
      }}
      style={({ pressed }) => [styles.leiste, pressed && { opacity: 0.85 }]}
    >
      <Monatsmedaille monat={jetzt.monat} stufe={jetzt.stufe} groesse={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.leisteTitel}>Monats-Abzeichen</Text>
        <Text style={styles.klein} numberOfLines={1}>
          {jetzt.lerntage} Lerntage{n ? ` · noch ${n.bis - jetzt.lerntage} bis ${n.stufe}` : ' · Gold!'}
        </Text>
      </View>
      <View style={styles.leisteRechts}>
        {verdient.slice(0, 3).map((m) => (
          <Monatsmedaille key={m.monat} monat={m.monat} stufe={m.stufe} groesse={30} />
        ))}
      </View>
    </Pressable>
  );
}

/** Im oeffentlichen Profil: nur verdiente, ohne Zahlen. */
export function FremdeAbzeichen({ handle }: { handle: string }) {
  const [liste, setListe] = useState<{ monat: string; stufe: number }[]>([]);
  useFocusEffect(
    useCallback(() => {
      api.monatsAbzeichenVon(handle).then(setListe).catch(() => setListe([]));
    }, [handle]),
  );
  if (liste.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fremde}>
      {liste.map((m) => (
        <Monatsmedaille key={m.monat} monat={m.monat} stufe={m.stufe} groesse={36} />
      ))}
    </ScrollView>
  );
}

export function AbzeichenScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [d, setD] = useState<Daten | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      api.meineMonatsAbzeichen().then(setD).catch(() => setD(null));
    }, []),
  );
  const jetzt = d?.monate[0];
  const n = jetzt ? naechste(jetzt.lerntage) : null;
  const monatsname = jetzt
    ? new Date(`${jetzt.monat}T12:00:00`).toLocaleDateString('de-AT', { month: 'long' })
    : '';

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Abzeichen" eyebrow="jeden Monat neu" scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {d === undefined ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}
        {d === null ? <Text style={styles.intro}>Abzeichen konnten nicht geladen werden.</Text> : null}
        {d && jetzt ? (
          <>
            <View style={styles.held}>
              <Monatsmedaille monat={jetzt.monat} stufe={jetzt.stufe} groesse={112} />
              <Text style={styles.heldTitel}>
                {jetzt.stufe > 0 ? `${monatsname}: ${STUFE[jetzt.stufe]}` : `Dein ${monatsname}`}
              </Text>
              <Text style={styles.intro}>
                {jetzt.lerntage} {jetzt.lerntage === 1 ? 'Lerntag' : 'Lerntage'}
                {n ? ` – noch ${n.bis - jetzt.lerntage} bis ${n.stufe}` : ' – mehr geht nicht.'} · {d.uebrig}{' '}
                {d.uebrig === 1 ? 'Tag' : 'Tage'} übrig
              </Text>
              <View style={styles.stufen}>
                {SCHWELLEN.map((s, i) => (
                  <View key={s} style={styles.stufe}>
                    <View style={[styles.stufePunkt, { borderColor: RAND[i + 1] }, jetzt.lerntage >= s && { backgroundColor: RAND[i + 1] }]} />
                    <Text style={styles.klein}>
                      {STUFE[i + 1]} · {s}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={styles.abschnitt}>Die letzten zwölf Monate</Text>
            <View style={styles.raster}>
              {d.monate.slice(1).map((m) => (
                <View key={m.monat} style={styles.rasterFeld}>
                  <Monatsmedaille monat={m.monat} stufe={m.stufe} groesse={64} />
                  <Text style={styles.klein}>{m.stufe > 0 ? STUFE[m.stufe] : `${m.lerntage} Tage`}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.klein}>
              Ein Lerntag zählt, sobald du an dem Tag eine Karte gelesen hast. Vergangene Monate bleiben, wie sie sind.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  intro: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid, textAlign: 'center' },
  medailleMitte: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medailleMonat: { ...type.mono, color: '#FFFFFF', letterSpacing: 1 },
  medailleJahr: { ...type.mono, color: 'rgba(255,255,255,0.6)' },
  leiste: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(8),
  },
  leisteTitel: { ...type.label, fontSize: 14, color: color.ink.max },
  leisteRechts: { flexDirection: 'row', gap: 4 },
  klein: { ...type.meta, fontSize: 11, color: color.ink.low },
  fremde: { gap: space.xs },
  held: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  heldTitel: { ...type.title, fontSize: 22, color: color.ink.max },
  stufen: { flexDirection: 'row', gap: space.lg, marginTop: space.xs },
  stufe: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stufePunkt: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  raster: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between' },
  rasterFeld: { width: '22%', alignItems: 'center', gap: 4 },
});
