import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon, type IconName } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { BordeauxMuster, SechseckLinse } from '@/components/Sechseck';
import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { bisText, useIchPro } from '@/lib/pro';
import { ZWEI, facette, flaeche, sechseckRegel } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * PRO - was es gibt, was kommt, und der eigene Stand.
 *
 * Seit 0091 ist ein Teil ECHT: Grenzen, Anpinnen, Profilbild-Stile,
 * Abzeichen. Diese Punkte tragen "Da", der Rest "Bald". Einen Kauf gibt es
 * noch nicht - PRO kommt vorerst nur ueber Codes (Einstellungen).
 *
 * (Urspruenglich:)
 * Gewuenscht (17.09.2026): "erst mal ohne Effekt, nur im Profil ein Banner
 * 'PRO werden'". Nichts hier schaltet etwas frei, und es gibt keinen Preis.
 * Die Seite zeigt, was geplant ist, und misst mit "Vormerken", ob es
 * ueberhaupt jemanden interessiert - bevor Wochen in ein Abo fliessen.
 *
 * Absichtlich NICHT auf der Liste, obwohl gesammelt:
 *   - Beitraege bearbeiten: noch offen, ob es das fuer alle gibt
 *   - @Erwaehnen, Bilder: nicht hinter eine Bezahlschranke (siehe Memory)
 *
 * Und eine Zeile, die stehen bleiben muss, solange es PRO gibt: Lernen,
 * Wiederholen und XP sind nicht kaeuflich. Eine Rangliste, in der man sich
 * Punkte kaufen kann, ist fuer alle wertlos - auch fuer die, die zahlen.
 */

const VORGEMERKT = 'pro_vorgemerkt_v1';

/** `da`: schon eingebaut und vom Server durchgesetzt (0091). */
type Punkt = { icon: IconName; titel: string; text: string; da?: boolean };

const GRUPPEN: { titel: string; punkte: Punkt[] }[] = [
  {
    titel: 'Sammeln',
    punkte: [
      { icon: 'mastery', titel: 'Profilbild-Stile', text: 'Metall, Glas und besondere Gründe', da: true },
      { icon: 'sliders', titel: 'Gold-Optik', text: 'Gold-Stein für Tab und Feed, Gold-Dreiecke im Hintergrund – wählbar', da: true },
      { icon: 'sliders', titel: 'Profil-Themes', text: 'Kopfkarte in Bordeaux, Nacht, Smaragd oder Gold', da: true },
      { icon: 'streak', titel: 'Saison-Rahmen', text: 'Nur eine Saison lang – ohne Zufallsboxen' },
      { icon: 'check', titel: 'Abzeichen', text: 'PRO neben deinem Namen', da: true },
    ],
  },
  {
    titel: 'Erstellen',
    punkte: [
      { icon: 'courses', titel: 'Größere Stapel', text: 'Bis zu 50 Karten statt 10', da: true },
      { icon: 'knowledge', titel: 'Längere Beiträge', text: 'Bis zu 1500 Zeichen statt 500', da: true },
      { icon: 'comment', titel: 'Mehr Antworten', text: 'Umfragen mit 6, Quiz mit 5 Antworten', da: true },
      { icon: 'clock', titel: 'Planen', text: 'Beiträge zu einer Uhrzeit veröffentlichen', da: true },
      { icon: 'plus', titel: 'Anpinnen', text: 'Drei Beiträge oben im Profil statt einem', da: true },
    ],
  },
  {
    titel: 'Mehr',
    punkte: [
      { icon: 'chart', titel: 'Statistik', text: 'Reichweite je Beitrag, woher Follower kommen, Lern-Heatmap' },
      { icon: 'leaderboard', titel: 'Ligen', text: 'Private Ligen und Turniere mit Freunden' },
      { icon: 'interactive', titel: 'LAB-Szenarien', text: 'Bis zu sechs Varianten je Werkzeug merken und vergleichen', da: true },
      { icon: 'lesson', titel: 'Export', text: 'Stapel als Datei für Anki – PDF folgt', da: true },
      { icon: 'listen', titel: 'Stimmen', text: 'Vorlese-Stimme und Tempo wählen', da: true },
      { icon: 'streak', titel: 'Streak-Schutz', text: 'Ein verpasster Tag pro Woche kostet dich den Streak nicht', da: true },
    ],
  },
];

function Zeile({ p, erste }: { p: Punkt; erste: boolean }) {
  return (
    <View style={[styles.zeile, !erste && styles.zeileTrenner]}>
      <View style={styles.zeileIcon}>
        <Icon name={p.icon} size={17} color={color.akzent} />
      </View>
      <View style={styles.zeileText}>
        <Text style={styles.zeileTitel}>{p.titel}</Text>
        <Text style={styles.zeileUnter}>{p.text}</Text>
      </View>
      <Text style={[styles.status, p.da && styles.statusDa]}>{p.da ? 'Da' : 'Bald'}</Text>
    </View>
  );
}

export function ProScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [vorgemerkt, setVorgemerkt] = useState(false);
  const stand = useIchPro();

  useEffect(() => {
    AsyncStorage.getItem(VORGEMERKT)
      .then((v) => setVorgemerkt(v === '1'))
      .catch(() => {});
  }, []);

  const vormerken = () => {
    if (vorgemerkt) return;
    haptics.success();
    setVorgemerkt(true);
    void AsyncStorage.setItem(VORGEMERKT, '1').catch(() => {});
    analytics.proVorgemerkt();
  };

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="PRO" titleInBarOnly scrollY={scrollY} onBack={() => router.back()} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* --- Kopf ------------------------------------------------------ */}
        <View style={styles.held}>
          {ZWEI ? <BordeauxMuster /> : null}
          <View style={styles.heldZeichen}>
            <SechseckLinse b={52} h={60} />
            <View style={styles.heldZeichenMitte}>
              <Icon name="mastery" size={22} color={color.signal.primary} />
            </View>
          </View>
          <Text style={styles.heldTitel}>ElyCic PRO</Text>
          <Text style={styles.heldText}>
            {stand.pro
              ? `Du hast PRO – ${bisText(stand.bis)}. Danke, dass du ElyCic unterstützt.`
              : 'Mehr sammeln, mehr erstellen, mehr sehen. Ein Teil ist schon da, der Rest kommt.'}
          </Text>
          <View style={styles.bald}>
            <Text style={styles.baldText}>{stand.pro ? 'Aktiv' : 'Noch nicht käuflich'}</Text>
          </View>
        </View>

        {GRUPPEN.map((g) => (
          <View key={g.titel} style={styles.gruppe}>
            <Text style={styles.gruppeTitel}>{g.titel}</Text>
            <View style={styles.karte}>
              {g.punkte.map((p, i) => (
                <Zeile key={p.titel} p={p} erste={i === 0} />
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.versprechen}>
          Lernen, Wiederholen und XP bleiben immer kostenlos. Punkte in der Rangliste kann man nicht kaufen.
        </Text>

        {stand.pro ? null : (
          <>
            <Button label={vorgemerkt ? 'Vorgemerkt' : 'Vormerken'} onPress={vormerken} variant={vorgemerkt ? 'ghost' : 'primary'} />
            <Pressable onPress={() => router.push('/settings')} hitSlop={8} style={styles.zurueck}>
              <Text style={styles.zurueckText}>Code einlösen</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.lg },

  held: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.signal.primary,
    backgroundColor: color.bgElevated,
    overflow: 'hidden',
    ...(ZWEI ? { borderWidth: 0, backgroundColor: color.bordeaux, ...facette(12) } : null),
  },
  heldZeichen: { width: 52, height: 60, alignItems: 'center', justifyContent: 'center' },
  heldZeichenMitte: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  heldTitel: { ...type.title, color: color.ink.max },
  heldText: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.high, textAlign: 'center' },
  bald: {
    marginTop: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  baldText: { ...type.meta, color: color.signal.primary, letterSpacing: 1.2, textTransform: 'uppercase' },

  gruppe: { gap: space.sm },
  gruppeTitel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1.2 },
  karte: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    overflow: 'hidden',
    ...flaeche(10),
  },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  zeileTrenner: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.ink.faint },
  zeileIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgSunken,
    ...(ZWEI ? { width: 38, height: 38, backgroundColor: '#2A2227', ...sechseckRegel() } : null),
  },
  zeileText: { flex: 1, gap: 1 },
  zeileTitel: { ...type.label, fontSize: 15, color: color.ink.max },
  zeileUnter: { ...type.meta, color: color.ink.low, lineHeight: 16 },
  status: { ...type.meta, fontSize: 10, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  statusDa: { color: color.signal.primary },

  versprechen: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid, textAlign: 'center' },
  zurueck: { alignSelf: 'center', paddingVertical: space.sm },
  zurueckText: { ...type.label, color: color.akzent },
});
