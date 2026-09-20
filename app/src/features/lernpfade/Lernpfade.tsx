import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { zeigeProSperre } from '@/components/ProSperre';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { proAktiv, proMeldung } from '@/lib/pro';
import { api, type EigenerPfad, type Lernpfad, type LernpfadDetail, type LernpfadStation } from '@/lib/supabase';
import type { CourseSummary } from '@/lib/types.db';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Lernpfade (0112): Kurse in einer Reihenfolge, die aufeinander aufbaut.
 *
 * - LernpfadLeiste: waagrechte Reihe im Studio, ueber den Kursen.
 * - LernpfadeScreen: alle Pfade.
 * - LernpfadScreen: ein Pfad als senkrechte Kette von Sechsecken.
 *
 * Nichts ist gesperrt - der Pfad schlaegt die naechste Station vor, man darf
 * aber springen. Stationen ohne Kurs baut die Pipeline noch ("entsteht").
 */

function anteil(p: { stationen: number; fertig: number }) {
  return p.stationen > 0 ? p.fertig / p.stationen : 0;
}

function PfadKarte({ p, breit }: { p: Lernpfad; breit?: boolean }) {
  const akzent = categoryAccent(p.accent);
  const fertig = p.stationen > 0 && p.fertig >= p.stationen;
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        router.push(`/lernpfad/${encodeURIComponent(p.slug)}`);
      }}
      style={({ pressed }) => [styles.karte, breit ? styles.karteBreit : styles.karteSchmal, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.karteKopf}>
        <Text style={[styles.emoji]}>{p.emoji ?? '◆'}</Text>
        <Text style={[styles.stationenZahl, { color: akzent }]}>
          {p.fertig}/{p.stationen}
        </Text>
      </View>
      <Text style={styles.karteTitel} numberOfLines={2}>
        {p.titel}
      </Text>
      {breit ? (
        <Text style={styles.karteText} numberOfLines={2}>
          {p.beschreibung}
        </Text>
      ) : null}
      <View style={styles.balken}>
        <View style={[styles.balkenFuellung, { width: `${Math.round(anteil(p) * 100)}%`, backgroundColor: akzent }]} />
      </View>
      <Text style={styles.klein} numberOfLines={1}>
        {fertig
          ? T('Geschafft')
          : p.bereit === 0
            ? T('Entsteht gerade')
            : p.naechste
              ? `Weiter: ${p.naechste}`
              : `${p.bereit} von ${p.stationen} bereit`}
      </Text>
    </Pressable>
  );
}

/** Im Studio: waagrecht, ohne eigene Ueberschrift. */
export function LernpfadLeiste() {
  const [pfade, setPfade] = useState<Lernpfad[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.listLernpfade().then(setPfade).catch(() => setPfade([]));
    }, []),
  );
  // Nur betretbare Pfade - eine Leiste voller "Entsteht gerade" waere Laerm.
  const bereit = pfade?.filter((p) => p.bereit > 0) ?? [];
  if (bereit.length === 0) return null;
  // Angefangene zuerst.
  const sortiert = [...bereit].sort(
    (a, b) =>
      Number(b.fertig > 0 && b.fertig < b.stationen) - Number(a.fertig > 0 && a.fertig < a.stationen) ||
      b.bereit - a.bereit,
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leiste}>
      {sortiert.map((p) => (
        <PfadKarte key={p.id} p={p} />
      ))}
    </ScrollView>
  );
}

export function LernpfadeScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [pfade, setPfade] = useState<Lernpfad[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.listLernpfade().then(setPfade).catch(() => setPfade([]));
    }, []),
  );
  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={T('Lernpfade')} eyebrow={T('lernen')} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{T('Mehrere Kurse in einer Reihenfolge – jeder baut auf dem davor auf.')}</Text>
        {pfade === null ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}
        {pfade
          ?.slice()
          .sort((a, b) => Number(b.bereit > 0) - Number(a.bereit > 0))
          .map((p) => <PfadKarte key={p.id} p={p} breit />)}

        {/* 0123, PRO: der eigene Pfad. Steht unten - die kuratierten sind
            der Regelfall, der eigene die Kür. */}
        <EigenePfade />
      </ScrollView>
    </GridBackground>
  );
}

function Wabe({ farbe, voll, nummer }: { farbe: string; voll: boolean; nummer: number }) {
  const g = 40;
  const r = g / 2;
  const punkte = Array.from({ length: 6 }, (_, i) => {
    const w = (Math.PI / 3) * i - Math.PI / 2;
    return `${r + (r - 2) * Math.cos(w)},${r + (r - 2) * Math.sin(w)}`;
  }).join(' ');
  return (
    <View style={{ width: g, height: g }}>
      <Svg width={g} height={g}>
        <Polygon points={punkte} fill={voll ? farbe : color.bgElevated} stroke={farbe} strokeWidth={2} />
      </Svg>
      <View style={styles.wabeMitte}>
        <Text style={[styles.wabeZahl, { color: voll ? color.bg : farbe }]}>{voll ? '✓' : nummer}</Text>
      </View>
    </View>
  );
}

export function LernpfadScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [pfad, setPfad] = useState<LernpfadDetail | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (!slug) return;
      api.getLernpfad(slug).then(setPfad).catch(() => setPfad(null));
    }, [slug]),
  );

  const akzent = categoryAccent(pfad?.accent);
  const naechste = pfad?.stationen.find((s) => s.course_slug && !s.fertig)?.position;

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={pfad?.titel ?? 'Lernpfad'} eyebrow={T('lernpfad')} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {pfad === undefined ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}
        {pfad === null ? <Text style={styles.intro}>{T('Diesen Lernpfad gibt es nicht.')}</Text> : null}
        {pfad ? (
          <>
            <Text style={styles.intro}>{pfad.beschreibung}</Text>
            <View>
              {pfad.stationen.map((s, i) => (
                <Station
                  key={s.position}
                  s={s}
                  akzent={akzent}
                  naechste={s.position === naechste}
                  letzte={i === pfad.stationen.length - 1}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

function Station({
  s,
  akzent,
  naechste,
  letzte,
}: {
  s: LernpfadStation;
  akzent: string;
  naechste: boolean;
  letzte: boolean;
}) {
  const bereit = !!s.course_slug;
  const farbe = bereit ? akzent : color.ink.faint;
  return (
    <View style={styles.station}>
      <View style={styles.spur}>
        <Wabe farbe={farbe} voll={s.fertig} nummer={s.position} />
        {!letzte ? <View style={[styles.linie, { backgroundColor: s.fertig ? akzent : color.ink.faint }]} /> : null}
      </View>
      <Pressable
        disabled={!bereit}
        onPress={() => {
          haptics.light();
          router.push(`/course/${encodeURIComponent(s.course_slug!)}`);
        }}
        style={({ pressed }) => [
          styles.stationKarte,
          naechste && { borderColor: akzent },
          !bereit && { opacity: 0.55 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.stationTitel} numberOfLines={2}>
          {s.title ?? s.lemma}
        </Text>
        <Text style={[styles.klein, naechste && { color: akzent }]}>
          {!bereit
            ? T('Entsteht gerade')
            : s.fertig
              ? 'Fertig'
              : naechste
                ? s.gelesen > 0
                  ? `Weiter · ${s.gelesen}/${s.lessons} Lektionen`
                  : `Als Nächstes · ${s.lessons} Lektionen`
                : `${s.gelesen}/${s.lessons} Lektionen`}
        </Text>
      </Pressable>
    </View>
  );
}


/**
 * Eigene Lernpfade (0123, PRO).
 *
 * Kurse in eine Reihenfolge bringen, die man selbst fuer richtig haelt.
 * Der Fortschritt kommt aus denselben Zahlen wie ueberall: gelesene
 * Lektionen je Kurs.
 */
function EigenePfade() {
  const [pfade, setPfade] = useState<EigenerPfad[] | null>(null);
  const [kurse, setKurse] = useState<CourseSummary[]>([]);
  const [titel, setTitel] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const [notiz, setNotiz] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      setPfade(await api.meineEigenenPfade());
    } catch {
      setPfade([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void laden();
      api.listCourses().then(setKurse).catch(() => setKurse([]));
    }, [laden]),
  );

  const anlegen = async () => {
    if (titel.trim().length < 2) return;
    if (!proAktiv()) {
      zeigeProSperre(T('Mit PRO stellst du dir eigene Lernpfade aus Kursen zusammen.'));
      return;
    }
    try {
      await api.pfadAnlegen(titel.trim());
      haptics.success();
      setTitel('');
      await laden();
    } catch (e) {
      const angebot = proMeldung(e);
      if (angebot) zeigeProSperre(angebot);
      else setNotiz(fehlerText(e, T('Anlegen ging nicht')));
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.abschnitt}>{T('Dein eigener Pfad')}</Text>

      {pfade?.map((p) => (
        <View key={p.id} style={[styles.karte, styles.karteBreit]}>
          <View style={styles.zeileZwischen}>
            <Text style={styles.karteTitel} numberOfLines={1}>
              {p.titel}
            </Text>
            <Pressable onPress={() => void api.pfadLoeschen(p.id).then(laden)} hitSlop={8}>
              <Text style={styles.klein}>{T('Löschen')}</Text>
            </Pressable>
          </View>

          {p.kurse.length === 0 ? <Text style={styles.klein}>{T('Noch keine Kurse darin.')}</Text> : null}
          {p.kurse.map((k, i) => (
            <View key={k.course_id} style={styles.eigenZeile}>
              <Text style={[styles.stationenZahl, { color: categoryAccent(k.accent) }]}>{k.position}</Text>
              <Pressable onPress={() => router.push(`/course/${encodeURIComponent(k.slug)}`)} style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.eigenTitel} numberOfLines={1}>
                  {k.title}
                </Text>
                <Text style={styles.klein}>{k.fertig ? T('Fertig') : `${k.gelesen}/${k.lessons}`}</Text>
              </Pressable>
              <Pressable
                onPress={() => void api.pfadSchieben(p.id, k.course_id, true).then(laden)}
                disabled={i === 0}
                hitSlop={8}
                accessibilityLabel={T('Nach oben')}
              >
                <Text style={[styles.pfeil, i === 0 && { opacity: 0.3 }]}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => void api.pfadSchieben(p.id, k.course_id, false).then(laden)}
                disabled={i === p.kurse.length - 1}
                hitSlop={8}
                accessibilityLabel={T('Nach unten')}
              >
                <Text style={[styles.pfeil, i === p.kurse.length - 1 && { opacity: 0.3 }]}>↓</Text>
              </Pressable>
              <Pressable
                onPress={() => void api.pfadKurs(p.id, k.course_id, false).then(laden)}
                hitSlop={8}
                accessibilityLabel={T('Herausnehmen')}
              >
                <Text style={styles.pfeil}>×</Text>
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={() => {
              haptics.select();
              setOffen(offen === p.id ? null : p.id);
            }}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{offen === p.id ? T('Schließen') : T('Kurs dazulegen')}</Text>
          </Pressable>

          {offen === p.id ? (
            <View style={{ gap: 4, maxHeight: 260 }}>
              <ScrollView nestedScrollEnabled>
                {kurse
                  .filter((c) => !p.kurse.some((k) => k.course_id === c.id))
                  .map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() =>
                        void api
                          .pfadKurs(p.id, c.id, true)
                          .then(laden)
                          .catch((e) => setNotiz(fehlerText(e, T('Ging nicht'))))
                      }
                      style={styles.wahl}
                    >
                      <Text style={styles.eigenTitel} numberOfLines={1}>
                        {c.emoji ? `${c.emoji} ` : ''}
                        {c.title}
                      </Text>
                    </Pressable>
                  ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ))}

      <View style={styles.zeile}>
        <TextInput
          value={titel}
          onChangeText={setTitel}
          placeholder={T('Name deines Pfads')}
          placeholderTextColor={color.ink.low}
          maxLength={60}
          style={styles.eingabe}
        />
        <Button label={T('Anlegen')} variant="ghost" onPress={() => void anlegen()} disabled={titel.trim().length < 2} />
      </View>
      {notiz ? <Text style={styles.klein}>{notiz}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  intro: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid },
  leiste: { gap: space.sm, paddingRight: space.xl },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  zeileZwischen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  eigenZeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6 },
  eigenTitel: { ...type.label, fontSize: 14, color: color.ink.high },
  pfeil: { ...type.title, fontSize: 16, color: color.ink.mid, paddingHorizontal: 4 },
  wahl: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.ink.faint },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  chipText: { ...type.meta, fontSize: 11, color: color.ink.mid },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  eingabe: {
    ...type.body,
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
  },
  karte: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(8),
  },
  karteSchmal: { width: 176 },
  karteBreit: { padding: space.lg },
  karteKopf: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emoji: { fontSize: 18 },
  stationenZahl: { ...type.mono, fontSize: 12 },
  karteTitel: { ...type.title, fontSize: 16, lineHeight: 20, color: color.ink.max },
  karteText: { ...type.body, fontSize: 13, lineHeight: 18, color: color.ink.mid },
  balken: { height: 3, borderRadius: 2, backgroundColor: color.ink.faint, overflow: 'hidden', marginTop: space.xs },
  balkenFuellung: { height: 3 },
  klein: { ...type.meta, fontSize: 11, color: color.ink.low },
  station: { flexDirection: 'row', gap: space.md },
  spur: { width: 40, alignItems: 'center' },
  linie: { width: 2, flex: 1, minHeight: 16 },
  wabeMitte: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wabeZahl: { ...type.mono, fontSize: 13 },
  stationKarte: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  stationTitel: { ...type.label, fontSize: 15, color: color.ink.max },
});
