import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Hochzaehlen } from '@/components/Hochzaehlen';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { BordeauxMuster } from '@/components/Sechseck';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { STUFEN_NAMEN } from '@/lib/meisterwege';
import { getPrefs } from '@/lib/prefs';
import { shareRueckblick } from '@/lib/share';
import { api, type Wochenrueckblick } from '@/lib/supabase';
import { T } from '@/lib/sprache';
import { ZWEI, facette } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Wochenrueckblick (0105): die laufende Woche auf einer Karte - gelesen,
 * richtig, XP, aktive Tage, Meisterwege, Ligen. Sonntags kommt eine
 * Benachrichtigung darauf; aufrufbar ist er jederzeit (dann eben "bisher").
 *
 * Geteilt wird ein Satz mit den eigenen Zahlen, nie Karteninhalt.
 */
export function RueckblickScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [r, setR] = useState<Wochenrueckblick | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [notiz, setNotiz] = useState<string | null>(null);
  const ruhig = getPrefs().reduceMotion;
  const rein = (ms: number) => (ruhig ? undefined : FadeInDown.delay(ms).duration(380));

  useEffect(() => {
    api.wochenrueckblick().then(setR).catch((e) => setFehler(fehlerText(e, 'Rückblick laden ging nicht')));
  }, []);

  const sonntag = new Date().getDay() === 0;

  const teilen = async () => {
    if (!r) return;
    haptics.medium();
    const teile = [
      `Meine Woche: ${r.gelesen} Karten gelesen, ${r.richtig} richtig beantwortet`,
      r.streak >= 2 ? `${r.streak} Tage Streak` : null,
      r.meister[0] ? `stärkstes Thema: ${r.meister[0].name}` : null,
      r.ligen[0] ? `Platz ${r.ligen[0].platz} von ${r.ligen[0].von} in „${r.ligen[0].name}“` : null,
    ].filter(Boolean);
    const erg = await shareRueckblick(`${teile.join(' · ')}.`);
    if (erg === 'copied') setNotiz(T('In die Zwischenablage kopiert'));
    else if (erg === 'failed') setNotiz(T('Teilen ging nicht'));
  };

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={T('Deine Woche')} eyebrow={T('rückblick')} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
        {!r && !fehler ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}

        {r ? (
          <>
            <View style={styles.karte}>
              {ZWEI ? <BordeauxMuster voll /> : null}
              <Text style={styles.kopf}>
                {sonntag ? 'DIESE WOCHE' : 'DIESE WOCHE BISHER'} · AB {new Date(r.ab).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' }).toUpperCase()}
              </Text>
              <View style={styles.gross}>
                <Hochzaehlen text={String(r.gelesen)} style={styles.grossZahl} />
                <Text style={styles.grossLabel}>{T('Karten gelesen')}</Text>
              </View>
              <View style={styles.reihe}>
                <Zahl wert={r.richtig} label={T('richtig')} verz={200} />
                <Zahl wert={r.xp} label={T('XP')} verz={350} />
                <Zahl wert={r.tage} label={T('Tage aktiv')} verz={500} />
                <Zahl wert={r.streak} label={T('Streak')} verz={650} />
              </View>

              {r.meister.length > 0 ? (
                <Animated.View entering={rein(800)} style={styles.abschnitt}>
                  <Text style={styles.abschnittTitel}>{T('Meisterwege')}</Text>
                  {r.meister.slice(0, 3).map((m) => (
                    <View key={m.id} style={styles.zeile}>
                      <Text style={styles.emoji}>{m.emoji ?? '•'}</Text>
                      <Text style={styles.zeileText} numberOfLines={1}>
                        {m.name}
                      </Text>
                      <Text style={styles.zeileWert}>
                        +{m.plus} · {m.stufe > 0 ? STUFEN_NAMEN[m.stufe] : 'unterwegs'}
                      </Text>
                    </View>
                  ))}
                </Animated.View>
              ) : null}

              {r.ligen.length > 0 ? (
                <Animated.View entering={rein(1000)} style={styles.abschnitt}>
                  <Text style={styles.abschnittTitel}>{T('Ligen')}</Text>
                  {r.ligen.map((l) => (
                    <View key={l.name} style={styles.zeile}>
                      <Text style={[styles.platz, l.platz === 1 && { color: color.signal.primary }]}>{l.platz}.</Text>
                      <Text style={styles.zeileText} numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text style={styles.zeileWert}>von {l.von}</Text>
                    </View>
                  ))}
                </Animated.View>
              ) : null}
            </View>

            {r.gelesen === 0 ? (
              <Text style={styles.leer}>{T('Diese Woche ist noch leer – ein paar Karten, und hier steht mehr.')}</Text>
            ) : null}

            <Button label={T('Teilen')} onPress={() => void teilen()} />
            {r.meister.length === 0 && r.ligen.length === 0 ? (
              <Pressable onPress={() => router.push('/ligen')} hitSlop={6}>
                <Text style={styles.link}>{T('Mit Freunden vergleichen: Ligen')}</Text>
              </Pressable>
            ) : null}
            {notiz ? <Text style={styles.leer}>{notiz}</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

function Zahl({ wert, label, verz }: { wert: number; label: string; verz: number }) {
  return (
    <View style={styles.zahl}>
      <Hochzaehlen text={String(wert)} style={styles.zahlWert} verzoegerung={verz} />
      <Text style={styles.zahlLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
  karte: {
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    backgroundColor: ZWEI ? color.bordeaux : color.bgElevated,
    overflow: 'hidden',
    ...facette(14),
  },
  kopf: { ...type.meta, fontSize: 10, letterSpacing: 1.2, color: color.signal.primary },
  gross: { gap: 2 },
  grossZahl: { ...type.display, fontSize: 56, lineHeight: 62, color: color.ink.max },
  grossLabel: { ...type.label, fontSize: 15, color: color.ink.high },
  reihe: { flexDirection: 'row', justifyContent: 'space-between' },
  zahl: { alignItems: 'flex-start', gap: 1 },
  zahlWert: { ...type.title, fontSize: 22, color: color.ink.max },
  zahlLabel: { ...type.meta, fontSize: 10, color: color.ink.high },
  abschnitt: { gap: 6, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.15)' },
  abschnittTitel: { ...type.meta, fontSize: 10, letterSpacing: 1, color: color.ink.high, textTransform: 'uppercase' },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  emoji: { fontSize: 16, width: 22 },
  platz: { ...type.mono, fontSize: 14, width: 26, color: color.ink.max },
  zeileText: { ...type.label, fontSize: 14, color: color.ink.max, flex: 1 },
  zeileWert: { ...type.mono, fontSize: 12, color: color.ink.high },
  leer: { ...type.body, fontSize: 13, color: color.ink.mid, textAlign: 'center' },
  link: { ...type.label, fontSize: 13, color: color.akzent, textAlign: 'center' },
});
