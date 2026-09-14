import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fehlerText } from '@/lib/fehler';
import { api } from '@/lib/supabase';
import type { Statistik } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Deine Statistik.
 *
 * Gewuenscht: Follower-Graph, gesamte Likes, gesehene Reels, und wie viele
 * Follower ein Beitrag gebracht hat.
 *
 * Ehrlich statt glatt: Follower-Verlauf und Follower je Beitrag werden erst
 * seit dem 13.09.2026 mitgeschrieben (follow_events, 0080). Davor kennt der
 * Graph nur die Follower, die heute noch da sind. Das steht unter dem Graphen,
 * und "Woher" zaehlt nur Mitgeschriebenes - eine Aufteilung, in der 73 von 75
 * Followern "unbekannt" sind, sagt nichts, also fehlt der Altbestand dort ganz.
 */

const QUELLE: Record<string, string> = {
  beitrag: 'über einen Beitrag',
  home: 'Vorschläge in Home',
  profil: 'dein Profil',
  suche: 'Suche',
  liste: 'Follower-Listen',
  unbekannt: 'Einladung & Sonstiges',
};

function datum(iso: string, mitJahr = false) {
  return new Date(iso).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    ...(mitJahr ? { year: 'numeric' } : {}),
  });
}

function Zahl({ wert, label, farbe }: { wert: number | string; label: string; farbe?: string }) {
  return (
    <View style={styles.zahl}>
      <Text style={[styles.zahlWert, farbe ? { color: farbe } : null]}>{wert}</Text>
      <Text style={styles.zahlLabel}>{label}</Text>
    </View>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <View style={styles.abschnitt}>
      <Text style={styles.abschnittTitel}>{titel}</Text>
      {children}
    </View>
  );
}

/** Linie mit Flaeche darunter. Keine Achsen - Anfang, Ende und Hoechstwert stehen als Text dabei. */
function Linie({ werte }: { werte: number[] }) {
  const [breite, setBreite] = useState(0);
  const hoehe = 120;
  const max = Math.max(1, ...werte);
  const min = Math.min(0, ...werte);
  const n = werte.length;
  const pkt = werte.map((v, i) => ({
    x: n > 1 ? (i / (n - 1)) * breite : 0,
    y: hoehe - 6 - ((v - min) / (max - min || 1)) * (hoehe - 12),
  }));
  const linie = pkt.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const flaeche = pkt.length ? `${linie} L${breite} ${hoehe} L0 ${hoehe} Z` : '';
  const letzter = pkt[pkt.length - 1];

  return (
    <View style={{ height: hoehe }} onLayout={(e) => setBreite(e.nativeEvent.layout.width)}>
      {breite > 0 && n > 0 ? (
        <Svg width={breite} height={hoehe}>
          <Path d={flaeche} fill={color.signal.primary} opacity={0.08} />
          <Path d={linie} stroke={color.signal.primary} strokeWidth={2} fill="none" strokeLinejoin="round" />
          {letzter ? <Circle cx={letzter.x} cy={letzter.y} r={3.5} fill={color.signal.primary} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}

function Saeulen({ werte }: { werte: number[] }) {
  const max = Math.max(1, ...werte);
  return (
    <View style={styles.saeulen}>
      {werte.map((v, i) => (
        <View
          key={i}
          style={[
            styles.saeule,
            {
              height: Math.max(2, Math.round((v / max) * 56)),
              backgroundColor: v > 0 ? color.signal.mastery : color.ink.faint,
              opacity: v > 0 ? 0.4 + 0.6 * (v / max) : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function StatistikScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [s, setS] = useState<Statistik | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      setS(await api.myStatistik());
      setFehler(null);
    } catch (e) {
      setFehler(fehlerText(e, 'Statistik nicht ladbar'));
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  if (!s) {
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Statistik" titleInBarOnly />
        </View>
        <View style={styles.center}>
          {fehler ? <Text style={styles.fehler}>{fehler}</Text> : <ActivityIndicator color={color.signal.primary} />}
        </View>
      </GridBackground>
    );
  }

  const verlauf = s.follower_verlauf;
  const neu30 = verlauf.slice(-30).reduce((n, t) => n + t.neu, 0);
  const weg30 = verlauf.slice(-30).reduce((n, t) => n + t.weg, 0);
  const quellen = Object.entries(s.quellen).sort((a, b) => b[1] - a[1]);
  const quellenSumme = quellen.reduce((n, [, v]) => n + v, 0);
  const gelesen30 = s.gelesen_verlauf.reduce((n, t) => n + t.anzahl, 0);
  const quizQuote = s.lernen.quiz_versuche > 0
    ? `${Math.round((100 * s.lernen.quiz_richtig) / s.lernen.quiz_versuche)} %`
    : '—';

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Statistik" titleInBarOnly scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.titel}>Deine Statistik</Text>
        <Text style={styles.unter}>Dabei seit {datum(s.dabei_seit, true)}</Text>

        <View style={styles.reihe}>
          <Zahl wert={s.sozial.follower} label="Follower" />
          <Zahl wert={s.sozial.likes + s.sozial.kommentar_likes} label="Likes bekommen" farbe={color.signal.primary} />
          <Zahl wert={s.sozial.beitraege} label="Beiträge" />
        </View>

        <Abschnitt titel="Follower · 90 Tage">
          <Linie werte={verlauf.map((t) => t.follower)} />
          <View style={styles.achse}>
            <Text style={styles.klein}>{verlauf[0] ? datum(verlauf[0].tag) : ''}</Text>
            <Text style={styles.klein}>
              30 Tage: +{neu30}
              {weg30 > 0 ? ` / −${weg30}` : ''}
            </Text>
            <Text style={styles.klein}>heute</Text>
          </View>
          <Text style={styles.hinweis}>
            Genau mitgeschrieben ab {datum(s.mitschrift_seit, true)}. Davor zeigt der Graph nur, wann deine
            heutigen Follower dazukamen – wer vorher wieder gegangen ist, fehlt.
          </Text>
        </Abschnitt>

        <Abschnitt titel="Woher neue Follower kommen">
          {quellenSumme === 0 ? (
            <Text style={styles.leer}>Seit Beginn der Mitschrift noch kein neuer Follower.</Text>
          ) : (
            quellen.map(([q, v]) => (
              <View key={q} style={styles.balkenZeile}>
                <Text style={styles.balkenLabel}>{QUELLE[q] ?? q}</Text>
                <View style={styles.balkenSpur}>
                  <View style={[styles.balken, { width: `${Math.max(4, (100 * v) / quellenSumme)}%` }]} />
                </View>
                <Text style={styles.balkenWert}>{v}</Text>
              </View>
            ))
          )}
        </Abschnitt>

        <Abschnitt titel="Deine stärksten Beiträge">
          {s.top_beitraege.length === 0 ? (
            <Text style={styles.leer}>Noch keine Beiträge.</Text>
          ) : (
            s.top_beitraege.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => router.push(`/post/${encodeURIComponent(b.id)}`)}
                style={({ pressed }) => [styles.beitrag, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.beitragText} numberOfLines={2}>
                  {b.body || 'Geteilter Beitrag'}
                </Text>
                <Text style={styles.beitragZahlen}>
                  {b.likes} Likes · {b.kommentare} Kommentare · {b.geteilt}× geteilt
                  {b.neue_follower > 0 ? `  ·  +${b.neue_follower} Follower` : ''}
                </Text>
              </Pressable>
            ))
          )}
        </Abschnitt>

        <Abschnitt titel="Reaktionen">
          <View style={styles.reihe}>
            <Zahl wert={s.sozial.kommentare} label="Kommentare" />
            <Zahl wert={s.sozial.kommentar_likes} label="Kommentar-Likes" />
            <Zahl wert={s.sozial.geteilt} label="geteilt" />
            <Zahl wert={s.sozial.empfohlen} label="Karten empfohlen" />
          </View>
        </Abschnitt>

        <Abschnitt titel="Lernen">
          <View style={styles.reihe}>
            <Zahl wert={s.lernen.gesehen} label="Reels gesehen" />
            <Zahl wert={s.lernen.gelesen} label="gelesen" farbe={color.signal.mastery} />
            <Zahl wert={s.lernen.gelikt} label="gelikt" />
          </View>
          <View style={styles.reihe}>
            <Zahl wert={quizQuote} label="Quiz richtig" />
            <Zahl wert={s.lernen.xp} label="XP" farbe={color.signal.primary} />
            <Zahl wert={`${s.lernen.streak} / ${s.lernen.streak_best}`} label="Streak / beste" farbe={color.signal.warn} />
            <Zahl wert={`${s.lernen.fokus_minuten}m`} label="Fokus" />
          </View>
          <Saeulen werte={s.gelesen_verlauf.map((t) => t.anzahl)} />
          <Text style={styles.klein}>Gelesen in den letzten 30 Tagen: {gelesen30}</Text>
        </Abschnitt>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  fehler: { ...type.body, color: color.signal.error, textAlign: 'center' },
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.xl },

  titel: { ...type.display, fontSize: 28, lineHeight: 34, color: color.ink.max },
  unter: { ...type.meta, color: color.ink.low, marginTop: -space.lg },

  reihe: { flexDirection: 'row', gap: space.md },
  zahl: { flex: 1, gap: 2 },
  zahlWert: { ...type.title, fontSize: 20, color: color.ink.max },
  zahlLabel: { ...type.meta, fontSize: 10, color: color.ink.low },

  abschnitt: {
    gap: space.md,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.ink.faint,
  },
  abschnittTitel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1.2 },

  achse: { flexDirection: 'row', justifyContent: 'space-between' },
  klein: { ...type.meta, fontSize: 10, color: color.ink.low },
  hinweis: { ...type.meta, fontSize: 10, lineHeight: 15, color: color.ink.low },
  leer: { ...type.body, fontSize: 14, color: color.ink.mid },

  balkenZeile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  balkenLabel: { ...type.body, fontSize: 13, color: color.ink.high, width: 140 },
  balkenSpur: { flex: 1, height: 8, borderRadius: 4, backgroundColor: color.bgSunken, overflow: 'hidden' },
  balken: { height: 8, borderRadius: 4, backgroundColor: color.signal.primary },
  balkenWert: { ...type.mono, fontSize: 12, color: color.ink.mid, minWidth: 24, textAlign: 'right' },

  beitrag: {
    gap: 4,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  beitragText: { ...type.body, fontSize: 14, color: color.ink.high },
  beitragZahlen: { ...type.meta, fontSize: 10, color: color.ink.low },

  saeulen: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 56 },
  saeule: { flex: 1, borderRadius: 2 },
});
