import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon, Rect } from 'react-native-svg';

import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { haptics } from '@/lib/haptics';
import {
  bildschirmWach,
  sessionBeenden,
  sessionPausiert,
  sessionStarten,
  sessionTitel,
  wachMoeglich,
} from '@/lib/hoerSession';
import { hintergrundSprechen, karteAlsStuecke, speakSentence, stopSpeech } from '@/lib/speech';
import { api } from '@/lib/supabase';
import type { ContentItem } from '@/lib/types.db';
import { vorratNehmen } from '@/lib/vorrat';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Audio-Modus (19.09.): Karten wie einen Podcast hoeren - fuer Bus, Laufen,
 * Abwasch. Satz fuer Satz ueber speakSentence (Tempo und Stimme aus den
 * Einstellungen wie beim Vorlesen), danach die naechste Karte.
 *
 * Quelle: der eigene Feed (ohne Netz: der Offline-Vorrat), oder mit
 * ?kurs=ID die Lektionen eines Kurses in Reihenfolge.
 *
 * Hoeren zaehlt NICHT als gelesen und bringt keine XP: die Lesepruefung
 * misst Lesen, und ein Abspielknopf im Hintergrund waere sonst ein
 * XP-Automat. Die Quizfrage wird vorgelesen, die Antwort nicht.
 */
export function HoerenScreen() {
  const { kurs } = useLocalSearchParams<{ kurs?: string }>();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [karten, setKarten] = useState<ContentItem[] | null>(null);
  const [nr, setNr] = useState(0);
  const [stueck, setStueck] = useState(0);
  const [spielt, setSpielt] = useState(false);
  const [offline, setOffline] = useState(false);
  const [wach, setWach] = useState(false);
  const abbrechen = useRef<(() => void) | null>(null);
  // Die Steuerung vom Sperrbildschirm faellt in dieselben Funktionen wie
  // die Knoepfe hier - ueber eine Ref, damit die Handler nicht bei jedem
  // Kartenwechsel neu gesetzt werden muessen.
  const steuern = useRef<{ start: () => void; halt: () => void; sprung: (d: number) => void }>({
    start: () => undefined,
    halt: () => undefined,
    sprung: () => undefined,
  });

  useEffect(() => {
    let weg = false;
    (async () => {
      try {
        const k = kurs ? await api.courseFeed(kurs) : await api.getFeed(12);
        if (!weg) setKarten(k.filter((x) => (x.body_blocks?.length ?? 0) > 0 || x.deck));
      } catch {
        const v = await vorratNehmen(12, []).catch(() => []);
        if (!weg) {
          setOffline(true);
          setKarten(v);
        }
      }
    })();
    // Nur hier darf im Hintergrund weitergesprochen werden.
    hintergrundSprechen(true);
    return () => {
      weg = true;
      hintergrundSprechen(false);
      abbrechen.current?.();
      stopSpeech();
      sessionBeenden();
    };
  }, [kurs]);

  const karte = karten?.[nr] ?? null;
  const stuecke = karte ? karteAlsStuecke(karte) : [];

  const halt = useCallback(() => {
    abbrechen.current?.();
    abbrechen.current = null;
    stopSpeech();
    setSpielt(false);
    sessionPausiert(true);
  }, []);

  // Der Abspieler: solange `spielt`, das aktuelle Stueck sprechen und
  // danach weiter - zum naechsten Stueck oder zur naechsten Karte.
  useEffect(() => {
    if (!spielt || !karte) return;
    const text = stuecke[stueck];
    if (text == null) {
      if (karten && nr + 1 < karten.length) {
        setNr(nr + 1);
        setStueck(0);
      } else {
        setSpielt(false);
      }
      return;
    }
    // Notbremse wie bei den Erklaerkarten: meldet sich die Stimme nicht
    // (kein Sprachpaket, Browser ohne Sprachausgabe), nach der geschaetzten
    // Lesezeit weiter - dann liest man eben mit statt zuzuhoeren.
    let gestartet = false;
    let fertig = false;
    const weiter = () => {
      if (fertig) return;
      fertig = true;
      setStueck((s) => s + 1);
    };
    const bremse = setTimeout(() => {
      if (!gestartet) {
        abbrechen.current?.();
        weiter();
      }
    }, 2500 + text.length * 60);
    abbrechen.current = speakSentence({
      cardId: `hoeren-${karte.id}`,
      text,
      language: karte.language,
      onStart: () => {
        gestartet = true;
      },
      onDone: weiter,
    });
    return () => {
      fertig = true;
      clearTimeout(bremse);
      abbrechen.current?.();
      abbrechen.current = null;
    };
    // stuecke haengt an karte; bewusst nicht als Abhaengigkeit (neues Array je Render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spielt, karte, stueck, nr, karten]);

  // Sperrbildschirm und Kopfhoerer-Knopf bedienen dieselben Wege.
  useEffect(() => {
    if (!karte) return;
    if (spielt) {
      sessionStarten({
        titel: karte.title,
        untertitel: kurs ? 'Kurs' : 'ElyCic',
        onPlay: () => steuern.current.start(),
        onPause: () => steuern.current.halt(),
        onNext: () => steuern.current.sprung(1),
        onPrev: () => steuern.current.sprung(-1),
      });
      sessionTitel(karte.title, kurs ? 'Kurs' : 'ElyCic');
    }
  }, [spielt, karte, kurs]);

  const springen = (d: number) => {
    if (!karten) return;
    haptics.select();
    const ziel = Math.max(0, Math.min(karten.length - 1, nr + d));
    abbrechen.current?.();
    stopSpeech();
    setNr(ziel);
    setStueck(0);
  };

  // Die Ref immer auf die aktuellen Funktionen zeigen lassen.
  steuern.current = {
    start: () => setSpielt(true),
    halt: () => halt(),
    sprung: (d: number) => springen(d),
  };

  const akzent = color.akzent;

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Anhören" eyebrow={kurs ? 'kurs' : offline ? 'offline-vorrat' : 'dein feed'} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {karten === null ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}
        {karten && karten.length === 0 ? (
          <Text style={styles.leise}>Gerade nichts zum Anhören da. Später nochmal.</Text>
        ) : null}
        {karte ? (
          <>
            <View style={[styles.buehne, { borderColor: spielt ? akzent : color.ink.faint }]}>
              <Welle an={spielt} farbe={akzent} />
              <Text style={styles.zaehler}>
                {nr + 1} / {karten!.length}
              </Text>
              <Text style={styles.titel} numberOfLines={3}>
                {karte.title}
              </Text>
              <Text style={styles.jetzt} numberOfLines={4}>
                {stuecke[Math.min(stueck, stuecke.length - 1)] ?? ''}
              </Text>
              <View style={styles.balken}>
                <View
                  style={[
                    styles.balkenFuellung,
                    { width: `${Math.round((Math.min(stueck, stuecke.length) / Math.max(1, stuecke.length)) * 100)}%`, backgroundColor: akzent },
                  ]}
                />
              </View>
            </View>

            <View style={styles.steuerung}>
              <Pressable onPress={() => springen(-1)} disabled={nr === 0} hitSlop={10} style={[styles.klein, nr === 0 && { opacity: 0.3 }]} accessibilityLabel="Vorige Karte">
                <Svg width={22} height={22}>
                  <Polygon points="18,4 8,11 18,18" fill={color.ink.max} />
                  <Rect x={4} y={4} width={3} height={14} fill={color.ink.max} />
                </Svg>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.medium();
                  if (spielt) halt();
                  else setSpielt(true);
                }}
                style={[styles.gross, { backgroundColor: akzent }]}
                accessibilityLabel={spielt ? 'Pause' : 'Abspielen'}
              >
                <Svg width={30} height={30}>
                  {spielt ? (
                    <>
                      <Rect x={7} y={5} width={6} height={20} fill={color.bg} />
                      <Rect x={17} y={5} width={6} height={20} fill={color.bg} />
                    </>
                  ) : (
                    <Polygon points="9,5 25,15 9,25" fill={color.bg} />
                  )}
                </Svg>
              </Pressable>
              <Pressable
                onPress={() => springen(1)}
                disabled={nr + 1 >= karten!.length}
                hitSlop={10}
                style={[styles.klein, nr + 1 >= karten!.length && { opacity: 0.3 }]}
                accessibilityLabel="Nächste Karte"
              >
                <Svg width={22} height={22}>
                  <Polygon points="4,4 14,11 4,18" fill={color.ink.max} />
                  <Rect x={15} y={4} width={3} height={14} fill={color.ink.max} />
                </Svg>
              </Pressable>
            </View>

            {wachMoeglich() ? (
              <Pressable
                onPress={() => {
                  haptics.select();
                  void bildschirmWach(!wach).then(setWach);
                }}
                style={[styles.schalter, wach && { borderColor: akzent }]}
              >
                <Text style={[styles.schalterText, wach && { color: akzent }]}>
                  {wach ? '✓ Bildschirm bleibt an' : 'Bildschirm an lassen'}
                </Text>
              </Pressable>
            ) : null}

            <Pressable onPress={() => router.push(`/reel/${encodeURIComponent(karte.id)}`)} style={styles.lesen}>
              <Icon name="knowledge" size={14} color={color.ink.mid} />
              <Text style={styles.lesenText}>Karte lesen – fürs Quiz und die XP</Text>
            </Pressable>

            <Text style={styles.leise}>
              Die Frage am Ende wird vorgelesen, die Antwort nicht – denk mit. Tempo und Stimme stellst du unter
              Einstellungen › Vorlesen ein.
            </Text>
            <Text style={styles.leise}>
              In der Tasche: Steuerung liegt auf dem Sperrbildschirm. Manche Handys halten die Stimme trotzdem an,
              wenn der Bildschirm ausgeht – dann hilft „Bildschirm an lassen“.
            </Text>

            <View style={{ gap: space.xs }}>
              <Text style={styles.abschnitt}>Als Nächstes</Text>
              {karten!.slice(nr + 1, nr + 5).map((k, i) => (
                <Pressable key={k.id} onPress={() => springen(i + 1)} style={styles.naechste}>
                  <Text style={styles.naechsteText} numberOfLines={1}>
                    {k.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

/** Ein paar Balken, die sich bewegen, solange gesprochen wird. */
function Welle({ an, farbe }: { an: boolean; farbe: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!an) return;
    const i = setInterval(() => setT((x) => x + 1), 140);
    return () => clearInterval(i);
  }, [an]);
  return (
    <View style={styles.welle}>
      {Array.from({ length: 16 }, (_, i) => {
        const h = an ? 6 + Math.abs(Math.sin((t + i * 1.7) * 0.9)) * 22 : 4;
        return <View key={i} style={[styles.welleBalken, { height: h, backgroundColor: farbe, opacity: an ? 0.9 : 0.3 }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  buehne: {
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: color.bgElevated,
    ...flaeche(12),
  },
  welle: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30 },
  welleBalken: { width: 4, borderRadius: 2 },
  zaehler: { ...type.mono, fontSize: 12, color: color.ink.low },
  titel: { ...type.title, fontSize: 22, lineHeight: 27, color: color.ink.max },
  jetzt: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.high, minHeight: 66 },
  balken: { height: 3, borderRadius: 2, backgroundColor: color.ink.faint, overflow: 'hidden' },
  balkenFuellung: { height: 3 },
  steuerung: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxl },
  klein: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  gross: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  schalter: {
    alignSelf: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  schalterText: { ...type.meta, fontSize: 11, color: color.ink.mid },
  lesen: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'center' },
  lesenText: { ...type.label, fontSize: 13, color: color.ink.mid },
  leise: { ...type.meta, fontSize: 11, lineHeight: 16, color: color.ink.low, textAlign: 'center' },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  naechste: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.ink.faint },
  naechsteText: { ...type.label, fontSize: 14, color: color.ink.high },
});
