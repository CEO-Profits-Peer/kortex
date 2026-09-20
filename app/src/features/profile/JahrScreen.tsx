import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Hochzaehlen } from '@/components/Hochzaehlen';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { shareRueckblick } from '@/lib/share';
import { api, type Jahresrueckblick } from '@/lib/supabase';
import { T } from '@/lib/sprache';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Jahresrueckblick (0118): eine Folge von Folien, jede mit einer grossen
 * Zahl. Bis Dezember "Dein Jahr bisher". Die Zahlen zaehlen hoch, sobald
 * die Folie im Bild ist (Hochzaehlen, 19.09.).
 *
 * Folienfarben sind fest (wie die Titelkarten der Update-Seite): der
 * Rueckblick soll wie ein eigenes Stueck aussehen, nicht wie eine Liste.
 */
const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const ZEIT: Record<string, { titel: string; text: string }> = {
  morgen: { titel: 'Früh dran', text: 'Am meisten gelernt hast du morgens.' },
  tag: { titel: 'Tagsüber', text: 'Deine Karten liest du am liebsten untertags.' },
  abend: { titel: 'Abendlernend', text: 'Dein Lernen gehört dem Abend.' },
  nacht: { titel: 'Nachteule', text: 'Die meisten Karten hast du nachts gelesen.' },
};

function Folie({
  farbe,
  oben,
  zahl,
  unten,
  children,
}: {
  farbe: string;
  oben: string;
  zahl?: string;
  unten?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.folie, { backgroundColor: farbe }]}>
      <Text style={styles.oben}>{oben}</Text>
      {zahl != null ? <Hochzaehlen text={zahl} style={styles.zahl} dauer={1200} /> : null}
      {unten ? <Text style={styles.unten}>{unten}</Text> : null}
      {children}
    </View>
  );
}

export function JahrScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [j, setJ] = useState<Jahresrueckblick | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [notiz, setNotiz] = useState<string | null>(null);

  useEffect(() => {
    api
      .jahresrueckblick()
      .then(setJ)
      .catch((e) => setFehler(fehlerText(e, 'Rückblick laden ging nicht')));
  }, []);

  const teilen = async () => {
    if (!j) return;
    haptics.medium();
    const teile = [
      `Mein ${j.jahr}${j.laufend ? ' bisher' : ''}: ${j.gelesen} Karten an ${j.lerntage} Tagen`,
      j.serie >= 3 ? `${j.serie} Tage am Stück` : null,
      j.themen[0] ? `Lieblingsthema ${j.themen[0].name}` : null,
      j.abzeichen.gold > 0 ? `${j.abzeichen.gold}× Gold` : null,
    ].filter(Boolean);
    const erg = await shareRueckblick(`${teile.join(' · ')}.`);
    if (erg === 'copied') setNotiz(T('In die Zwischenablage kopiert'));
    else if (erg === 'failed') setNotiz(T('Teilen ging nicht'));
  };

  const abz = j ? j.abzeichen.gold + j.abzeichen.silber + j.abzeichen.bronze : 0;

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={j ? `Dein ${j.jahr}` : 'Dein Jahr'} eyebrow={T('rückblick')} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {!j && !fehler ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}
        {fehler ? <Text style={styles.leer}>{fehler}</Text> : null}
        {j && j.gelesen === 0 ? (
          <Text style={styles.leer}>In {j.jahr} hast du noch keine Karte gelesen. Das ändert sich mit der ersten.</Text>
        ) : null}
        {j && j.gelesen > 0 ? (
          <>
            <Folie farbe="#4E1626" oben={j.laufend ? 'Dein Jahr bisher' : 'Dein Jahr'}>
              <Text style={styles.zahl}>{j.jahr}</Text>
              {j.erster_tag ? (
                <Text style={styles.unten}>
                  Losgegangen am{' '}
                  {new Date(`${j.erster_tag}T12:00:00`).toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}
                </Text>
              ) : null}
            </Folie>

            <Folie farbe="#1F3A5F" oben="Karten gelesen" zahl={String(j.gelesen)} unten={`${j.richtig} Fragen richtig beantwortet`} />

            <Folie farbe="#2D4A2B" oben="Lerntage" zahl={String(j.lerntage)} unten={`Längste Serie: ${j.serie} ${j.serie === 1 ? 'Tag' : 'Tage'} am Stück`} />

            {j.bester_monat ? (
              <Folie
                farbe="#5C3A1E"
                oben="Dein stärkster Monat"
                unten={`${j.bester_monat.tage} Lerntage im ${MONATE[j.bester_monat.monat - 1]}`}
              >
                <Text style={styles.wort}>{MONATE[j.bester_monat.monat - 1]}</Text>
              </Folie>
            ) : null}

            {j.themen.length > 0 ? (
              <Folie farbe="#2A2440" oben="Deine Themen">
                {j.themen.map((t, i) => (
                  <View key={t.name} style={styles.thema}>
                    <Text style={styles.themaPlatz}>{i + 1}</Text>
                    <Text style={styles.themaName} numberOfLines={1}>
                      {t.emoji ? `${t.emoji} ` : ''}
                      {t.name}
                    </Text>
                    <Text style={[styles.themaZahl, { color: categoryAccent(t.accent) }]}>{t.karten}</Text>
                  </View>
                ))}
              </Folie>
            ) : null}

            {j.tageszeit && ZEIT[j.tageszeit] ? (
              <Folie farbe="#14202B" oben="Dein Lerntyp" unten={ZEIT[j.tageszeit].text}>
                <Text style={styles.wort}>{ZEIT[j.tageszeit].titel}</Text>
              </Folie>
            ) : null}

            {abz > 0 ? (
              <Folie farbe="#3A2F14" oben="Monats-Abzeichen" zahl={String(abz)}>
                <Text style={styles.unten}>
                  {[
                    j.abzeichen.gold ? `${j.abzeichen.gold}× Gold` : null,
                    j.abzeichen.silber ? `${j.abzeichen.silber}× Silber` : null,
                    j.abzeichen.bronze ? `${j.abzeichen.bronze}× Bronze` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Folie>
            ) : null}

            {j.beste_antworten > 0 ? (
              <Folie
                farbe="#1E3B3A"
                oben="Anderen geholfen"
                zahl={String(j.beste_antworten)}
                unten={j.beste_antworten === 1 ? 'Antwort wurde als beste markiert' : 'Antworten wurden als beste markiert'}
              />
            ) : null}

            <Button label={T('Teilen')} onPress={() => void teilen()} />
            {notiz ? <Text style={styles.leer}>{notiz}</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  leer: { ...type.body, fontSize: 14, color: color.ink.mid, textAlign: 'center' },
  folie: {
    minHeight: 190,
    padding: space.xl,
    borderRadius: radius.lg,
    justifyContent: 'center',
    gap: space.xs,
    overflow: 'hidden',
  },
  oben: { ...type.mono, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' },
  zahl: { ...type.title, fontSize: 64, lineHeight: 70, color: '#FFFFFF', letterSpacing: -2 },
  wort: { ...type.title, fontSize: 40, lineHeight: 46, color: '#FFFFFF', letterSpacing: -1 },
  unten: { ...type.body, fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.85)' },
  thema: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  themaPlatz: { ...type.mono, fontSize: 18, color: 'rgba(255,255,255,0.5)', width: 20 },
  themaName: { ...type.title, fontSize: 20, color: '#FFFFFF', flex: 1, minWidth: 0 },
  themaZahl: { ...type.mono, fontSize: 16 },
});
