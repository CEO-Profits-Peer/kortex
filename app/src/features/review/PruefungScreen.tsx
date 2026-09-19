import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Slider } from '@/components/Slider';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { api, type Pruefung } from '@/lib/supabase';
import type { Category } from '@/lib/types.db';
import { flaeche } from '@/theme/design';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Pruefungsmodus (0110): Titel, Datum, Themen - danach zeigt die App bis
 * zum Tag X, wie viel noch fehlt, und ein Tagesziel.
 *
 * "Wiederholen" oeffnet /review?pruefung=ID: dieselbe Wiederholung, nur mit
 * den Fragen dieser Themen, auch vorgezogen (ohne XP, siehe 0110).
 */
export function PruefungScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [liste, setListe] = useState<Pruefung[] | null>(null);
  const [themen, setThemen] = useState<Category[]>([]);
  const [neu, setNeu] = useState(false);
  const [notiz, setNotiz] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      const l = await api.meinePruefungen();
      setListe(l);
      if (l.length === 0) setNeu(true);
    } catch (e) {
      setNotiz(fehlerText(e, 'Laden ging nicht'));
      setListe([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  useEffect(() => {
    api.listCategories().then(setThemen).catch(() => setThemen([]));
  }, []);

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Prüfungen" eyebrow="lernen" scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Sag, wann und worüber – die App verteilt, was noch fehlt, auf die Tage bis dahin.
        </Text>

        {liste === null ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}
        {liste?.map((p) => (
          <PruefungKarte key={p.id} p={p} themen={themen} neu={laden} />
        ))}

        {neu ? (
          <NeuePruefung
            themen={themen}
            fertig={async () => {
              setNeu(false);
              await laden();
            }}
          />
        ) : (
          <Button label="Neu" variant="ghost" onPress={() => setNeu(true)} />
        )}
        {notiz ? <Text style={styles.klein}>{notiz}</Text> : null}
      </ScrollView>
    </GridBackground>
  );
}

function Ring({ anteil, farbe }: { anteil: number; farbe: string }) {
  const g = 64;
  const r = 27;
  const u = 2 * Math.PI * r;
  return (
    <Svg width={g} height={g}>
      <Circle cx={g / 2} cy={g / 2} r={r} stroke={color.ink.faint} strokeWidth={5} fill="none" />
      <Circle
        cx={g / 2}
        cy={g / 2}
        r={r}
        stroke={farbe}
        strokeWidth={5}
        fill="none"
        strokeDasharray={`${u * Math.min(1, anteil)} ${u}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${g / 2} ${g / 2})`}
      />
    </Svg>
  );
}

function PruefungKarte({ p, themen, neu }: { p: Pruefung; themen: Category[]; neu: () => Promise<void> }) {
  // "Bereit" = gelesen und sicher wiederholt, gemessen an allem, was es gibt.
  const bereit = p.gesamt > 0 ? (p.gelesen / p.gesamt) * 0.5 + (p.offen > 0 ? (p.sicher / p.offen) * 0.5 : 0) : 0;
  const namen = p.kategorien.map((k) => themen.find((t) => t.id === k)?.display_name ?? k).join(', ');
  const vorbei = p.tage === 0 && new Date(p.datum) < new Date(new Date().toDateString());
  return (
    <View style={styles.karte}>
      <View style={styles.kopf}>
        <View style={styles.ringBox}>
          <Ring anteil={bereit} farbe={color.signal.primary} />
          <View style={styles.ringMitte}>
            <Text style={styles.ringZahl}>{p.tage}</Text>
            <Text style={styles.ringLabel}>{p.tage === 1 ? 'Tag' : 'Tage'}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.titel} numberOfLines={1}>
            {p.titel}
          </Text>
          <Text style={styles.klein} numberOfLines={1}>
            {new Date(p.datum).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })} · {namen}
          </Text>
          <Text style={styles.ziel}>
            {vorbei ? 'Vorbei – viel Glück gehabt?' : p.tage === 0 ? 'Heute! Nur noch kurz wiederholen.' : `Heute: ${Math.max(1, p.heute)} Karten oder Fragen`}
          </Text>
        </View>
      </View>
      <View style={styles.zahlen}>
        <Text style={styles.klein}>
          {p.gelesen} / {p.gesamt} gelesen · {p.sicher} / {p.offen} sicher
        </Text>
      </View>
      <View style={styles.knoepfe}>
        <View style={{ flex: 1 }}>
          <Button label="Lernen" variant="ghost" onPress={() => router.push(`/category/${encodeURIComponent(p.kategorien[0])}`)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Wiederholen" onPress={() => router.push(`/review?pruefung=${encodeURIComponent(p.id)}`)} />
        </View>
      </View>
      <Pressable onPress={() => void api.pruefungLoeschen(p.id).then(neu)} hitSlop={6} style={{ alignSelf: 'flex-end' }}>
        <Text style={styles.loeschen}>Löschen</Text>
      </Pressable>
    </View>
  );
}

function NeuePruefung({ themen, fertig }: { themen: Category[]; fertig: () => Promise<void> }) {
  const [titel, setTitel] = useState('');
  const [tage, setTage] = useState(14);
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wurzeln = themen.filter((t) => !t.parent_id);
  const datum = new Date();
  datum.setDate(datum.getDate() + tage);

  const anlegen = async () => {
    if (titel.trim().length < 2 || gewaehlt.length === 0) return;
    setBusy(true);
    setFehler(null);
    try {
      const iso = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
      await api.pruefungAnlegen(titel.trim(), iso, gewaehlt);
      haptics.success();
      await fertig();
    } catch (e) {
      setFehler(fehlerText(e, 'Anlegen ging nicht'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.karte}>
      <Text style={styles.abschnitt}>Neue Prüfung</Text>
      <TextInput
        value={titel}
        onChangeText={setTitel}
        placeholder="z. B. Bio-Schularbeit"
        placeholderTextColor={color.ink.low}
        maxLength={60}
        style={styles.eingabe}
      />
      <View style={{ gap: space.xs }}>
        <View style={styles.zeileZwischen}>
          <Text style={styles.abschnitt}>Wann</Text>
          <Text style={styles.wert}>
            {datum.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long' })} · in {tage} {tage === 1 ? 'Tag' : 'Tagen'}
          </Text>
        </View>
        <Slider min={1} max={90} value={tage} onChange={setTage} tint={color.signal.primary} />
      </View>
      <Text style={styles.abschnitt}>Worüber</Text>
      <View style={styles.chips}>
        {wurzeln.map((t) => {
          const an = gewaehlt.includes(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                haptics.select();
                setGewaehlt((g) => (an ? g.filter((x) => x !== t.id) : [...g, t.id].slice(0, 10)));
              }}
              style={[styles.chip, an && { borderColor: categoryAccent(t.accent_hex) }]}
            >
              <Text style={[styles.chipText, an && { color: categoryAccent(t.accent_hex) }]}>
                {t.emoji ? `${t.emoji} ` : ''}
                {t.display_name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {fehler ? <Text style={[styles.klein, { color: color.signal.error }]}>{fehler}</Text> : null}
      <Button label="Anlegen" onPress={() => void anlegen()} disabled={titel.trim().length < 2 || gewaehlt.length === 0} busy={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  intro: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid },
  karte: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  kopf: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  ringBox: { width: 64, height: 64 },
  ringMitte: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringZahl: { ...type.title, fontSize: 20, color: color.ink.max, lineHeight: 22 },
  ringLabel: { ...type.meta, fontSize: 9, color: color.ink.low },
  titel: { ...type.title, fontSize: 17, color: color.ink.max },
  ziel: { ...type.label, fontSize: 13, color: color.signal.primary },
  zahlen: { gap: 2 },
  klein: { ...type.meta, fontSize: 11, color: color.ink.low },
  knoepfe: { flexDirection: 'row', gap: space.sm },
  loeschen: { ...type.label, fontSize: 12, color: color.ink.low },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  wert: { ...type.mono, fontSize: 12, color: color.ink.max },
  zeileZwischen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  eingabe: {
    ...type.body,
    fontSize: 15,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.ink.faint,
  },
  chipText: { ...type.label, fontSize: 13, color: color.ink.mid },
});
