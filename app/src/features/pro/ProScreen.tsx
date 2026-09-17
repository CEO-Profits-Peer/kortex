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
import { ZWEI, facette, flaeche, sechseckRegel } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * PRO - eine Vorschau, noch ohne Kauf und ohne Wirkung.
 *
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

type Punkt = { icon: IconName; titel: string; text: string };

const GRUPPEN: { titel: string; punkte: Punkt[] }[] = [
  {
    titel: 'Sammeln',
    punkte: [
      { icon: 'mastery', titel: 'Profilbild-Stile', text: 'Metall, animierter Stein, besondere Gründe' },
      { icon: 'sliders', titel: 'Profil-Themes', text: 'Bordeaux-Kopfkarte, eigene Muster' },
      { icon: 'streak', titel: 'Saison-Rahmen', text: 'Nur eine Saison lang – ohne Zufallsboxen' },
      { icon: 'check', titel: 'Abzeichen', text: 'Zeigt, dass du ElyCic unterstützt' },
    ],
  },
  {
    titel: 'Erstellen',
    punkte: [
      { icon: 'courses', titel: 'Größere Stapel', text: 'Bis zu 50 Karten statt 10' },
      { icon: 'comment', titel: 'Mehr Antworten', text: 'Umfragen mit 6, Quiz mit 4 Antworten' },
      { icon: 'clock', titel: 'Planen', text: 'Beiträge zu einer Uhrzeit veröffentlichen' },
      { icon: 'plus', titel: 'Anpinnen', text: 'Mehrere Beiträge oben im Profil' },
    ],
  },
  {
    titel: 'Mehr',
    punkte: [
      { icon: 'chart', titel: 'Statistik', text: 'Reichweite je Beitrag, woher Follower kommen, Lern-Heatmap' },
      { icon: 'leaderboard', titel: 'Ligen', text: 'Private Ligen und Turniere mit Freunden' },
      { icon: 'interactive', titel: 'LAB-Szenarien', text: 'Speichern und nebeneinander vergleichen' },
      { icon: 'lesson', titel: 'Export', text: 'Stapel als PDF oder für Anki, auch offline' },
      { icon: 'listen', titel: 'Stimmen', text: 'Bessere Vorlese-Stimmen, eigenes Tempo' },
      { icon: 'streak', titel: 'Streak-Schutz', text: 'Einmal pro Woche' },
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
    </View>
  );
}

export function ProScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [vorgemerkt, setVorgemerkt] = useState(false);

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
            Mehr sammeln, mehr erstellen, mehr sehen. Noch in Arbeit – merk dich vor, dann erfährst du es zuerst.
          </Text>
          <View style={styles.bald}>
            <Text style={styles.baldText}>Bald</Text>
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

        <Button label={vorgemerkt ? 'Vorgemerkt' : 'Vormerken'} onPress={vormerken} variant={vorgemerkt ? 'ghost' : 'primary'} />
        {vorgemerkt ? (
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.zurueck}>
            <Text style={styles.zurueckText}>Zurück</Text>
          </Pressable>
        ) : null}
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

  versprechen: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid, textAlign: 'center' },
  zurueck: { alignSelf: 'center', paddingVertical: space.sm },
  zurueckText: { ...type.label, color: color.akzent },
});
