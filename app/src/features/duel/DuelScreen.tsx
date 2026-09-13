import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { CardBlock } from '@/components/CardBlock';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { haptics } from '@/lib/haptics';
import { usePrefs } from '@/lib/prefs';
import { sound } from '@/lib/sound';
import { api } from '@/lib/supabase';
import type { DuelQuestion, DuelResult } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { beiWiederOnline, istNetzfehler } from '@/lib/online';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Ein Duell.
 *
 * Drei Abschnitte, ein Bildschirm: fuenf Karten eine Minute lang ansehen,
 * danach fuenf Fragen mit zwanzig Sekunden je Frage, dann das Ergebnis.
 *
 * Die Uhr hier ist eine ANZEIGE. Entschieden wird auf dem Server (Migration
 * 0069): er stempelt, wann die Karten geholt wurden und wann die Fragen, und
 * rechnet beim Abgeben nach. Eine Stoppuhr in JavaScript laeuft auf einem
 * fremden Geraet - wer gewinnen will, haelt sie an.
 *
 * Deshalb ist der Startwert der Uhr auch nicht 60, sondern das, was der
 * Server als `seconds_left` schickt. Wer die Seite neu laedt, bekommt die
 * Minute nicht noch einmal, sondern den Rest.
 */

const SEKUNDEN_JE_FRAGE = 20;

type Phase = 'laden' | 'lernen' | 'fragen' | 'fertig';

export function DuelScreen({ duelId }: { duelId: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { reduceMotion } = usePrefs();

  const [phase, setPhase] = useState<Phase>('laden');
  const [fehler, setFehler] = useState<string | null>(null);
  const [karten, setKarten] = useState<
    { id: string; title: string; deck: string | null; body_blocks: unknown[] }[]
  >([]);
  const [rest, setRest] = useState(0);

  const [fragen, setFragen] = useState<DuelQuestion[]>([]);
  const [frage, setFrage] = useState(0);
  const [frageRest, setFrageRest] = useState(SEKUNDEN_JE_FRAGE);
  // In einer Ref, nicht im State: der Zeitgeber liest sie, und ein State
  // haette bei jedem Tick eine alte Kopie gesehen.
  const antworten = useRef<number[]>([]);
  const [ergebnis, setErgebnis] = useState<DuelResult | null>(null);

  // --- Lernphase -----------------------------------------------------------
  useEffect(() => {
    let lebt = true;
    void api
      .duelCards(duelId)
      .then((d) => {
        if (!lebt) return;
        if (d.phase === 'quiz') {
          setPhase('fragen');
          return;
        }
        setKarten(d.cards as never);
        setRest(d.seconds_left);
        setPhase('lernen');
      })
      .catch((e) => {
        if (!lebt) return;
        setFehler(fehlerText(e, 'Duell nicht ladbar'));
        setPhase('fertig');
      });
    return () => {
      lebt = false;
    };
  }, [duelId]);

  // Der Countdown der Lernphase. Laeuft er ab, geht es von selbst weiter -
  // ein Knopf "jetzt Fragen" waere ein Knopf, den niemand rechtzeitig
  // druecken will.
  useEffect(() => {
    if (phase !== 'lernen') return;
    if (rest <= 0) {
      setPhase('fragen');
      return;
    }
    const t = setTimeout(() => setRest((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, rest]);

  // --- Fragen holen --------------------------------------------------------
  useEffect(() => {
    if (phase !== 'fragen' || fragen.length > 0) return;
    let lebt = true;
    void api
      .duelQuestions(duelId)
      .then((q) => {
        if (!lebt) return;
        setFragen(q.questions);
        antworten.current = q.questions.map(() => -1);
        setFrageRest(SEKUNDEN_JE_FRAGE);
      })
      .catch((e) => {
        if (!lebt) return;
        setFehler(fehlerText(e, 'Fragen nicht ladbar'));
        setPhase('fertig');
      });
    return () => {
      lebt = false;
    };
  }, [phase, fragen.length, duelId]);

  /**
   * Abgeben - und im Funkloch nicht verlieren.
   *
   * Die Antworten liegen in einer Ref und bleiben dort, solange der
   * Bildschirm offen ist. Scheitert die Abgabe am Netz, wird sie wiederholt,
   * sobald der Server antwortet. Die Uhr auf dem Server laeuft dabei weiter,
   * und das steht auch so da: 15 Sekunden Nachsicht decken ein kurzes Loch,
   * keine zehn Minuten U-Bahn. Alles andere waere eine Luecke, durch die man
   * zum Nachschlagen einfach das WLAN ausschaltet.
   */
  const nachholen = useRef(false);
  const abgeben = useCallback(async () => {
    setPhase('fertig');
    try {
      setErgebnis(await api.duelSubmit(duelId, antworten.current));
      setFehler(null);
    } catch (e) {
      if (istNetzfehler(e)) {
        nachholen.current = true;
        setFehler(
          'Keine Verbindung. Deine Antworten werden abgegeben, sobald du wieder Netz hast — lass diese Seite dabei offen. Die Uhr läuft auf dem Server weiter.',
        );
      } else {
        setFehler(fehlerText(e, 'Abgabe ging nicht'));
      }
    }
  }, [duelId]);

  useEffect(
    () =>
      beiWiederOnline(() => {
        if (!nachholen.current) return;
        nachholen.current = false;
        void abgeben();
      }),
    [abgeben],
  );

  const weiter = useCallback(
    (gewaehlt: number) => {
      if (gewaehlt >= 0) {
        antworten.current[frage] = gewaehlt;
        haptics.select();
        sound.tick();
      }
      if (frage + 1 >= fragen.length) {
        void abgeben();
        return;
      }
      setFrage((n) => n + 1);
      setFrageRest(SEKUNDEN_JE_FRAGE);
    },
    [frage, fragen.length, abgeben],
  );

  // Zwanzig Sekunden je Frage. Laeuft die Zeit ab, zaehlt die Frage als
  // nicht beantwortet und es geht weiter - stehenbleiben waere die Luecke,
  // durch die man nachschlaegt.
  useEffect(() => {
    if (phase !== 'fragen' || fragen.length === 0) return;
    if (frageRest <= 0) {
      weiter(-1);
      return;
    }
    const t = setTimeout(() => setFrageRest((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, fragen.length, frageRest, weiter]);

  // --- Anzeige -------------------------------------------------------------
  if (phase === 'laden') {
    return (
      <GridBackground>
        <View style={styles.mitte}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  if (phase === 'lernen') {
    const anteil = Math.max(0, Math.min(1, rest / 60));
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Einprägen" eyebrow="duell · 1 von 3" titleInBarOnly />
        </View>

        <View style={styles.uhrZeile}>
          <Text style={[styles.uhr, rest <= 10 && { color: color.signal.warn }]}>{rest}</Text>
          <View style={styles.uhrBalken}>
            <View
              style={[
                styles.uhrFuell,
                { width: `${anteil * 100}%`, backgroundColor: rest <= 10 ? color.signal.warn : color.signal.primary },
              ]}
            />
          </View>
        </View>
        <Text style={styles.hinweis}>
          Fünf Karten, eine Minute, ein einziges Mal. Danach kommen fünf Fragen dazu.
        </Text>

        <FlatList
          data={karten}
          keyExtractor={(k) => k.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <ScrollView
              style={{ width }}
              contentContainerStyle={[styles.lernKarte, { paddingBottom: insets.bottom + space.xl }]}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.zaehler}>
                {String(index + 1).padStart(2, '0')} / {String(karten.length).padStart(2, '0')}
              </Text>
              <Text style={styles.karteTitel}>{item.title}</Text>
              {item.deck ? <Text style={styles.karteDeck}>{item.deck}</Text> : null}
              {(item.body_blocks as never[]).map((b, i) => (
                <CardBlock key={i} block={b} accent={color.signal.primary} />
              ))}
            </ScrollView>
          )}
        />
      </GridBackground>
    );
  }

  if (phase === 'fragen') {
    const f = fragen[frage];
    if (!f) {
      return (
        <GridBackground>
          <View style={styles.mitte}>
            <ActivityIndicator color={color.signal.primary} />
          </View>
        </GridBackground>
      );
    }
    const anteil = Math.max(0, Math.min(1, frageRest / SEKUNDEN_JE_FRAGE));
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Frage" eyebrow={`duell · ${frage + 1} von ${fragen.length}`} titleInBarOnly />
        </View>

        <View style={styles.uhrZeile}>
          <Text style={[styles.uhr, frageRest <= 5 && { color: color.signal.warn }]}>
            {frageRest}
          </Text>
          <View style={styles.uhrBalken}>
            <View
              style={[
                styles.uhrFuell,
                {
                  width: `${anteil * 100}%`,
                  backgroundColor: frageRest <= 5 ? color.signal.warn : color.signal.primary,
                },
              ]}
            />
          </View>
        </View>

        <Animated.View
          key={frage}
          entering={reduceMotion ? undefined : FadeInDown.duration(220)}
          style={styles.frageBlatt}
        >
          <Text style={styles.frageKarte} numberOfLines={1}>
            {f.title}
          </Text>
          <Text style={styles.frageText}>{f.question}</Text>

          <View style={styles.optionen}>
            {f.options.map((o, i) => (
              <Pressable
                key={i}
                onPress={() => weiter(i)}
                style={({ pressed }) => [styles.option, pressed && styles.optionGedrueckt]}
              >
                <Text style={styles.optionZiffer}>{String.fromCharCode(65 + i)}</Text>
                <Text style={styles.optionText}>{o}</Text>
              </Pressable>
            ))}
          </View>

          {/* Kein Zurueck. Wer eine Frage ueberspringen und spaeter
              wiederkommen kann, hat fuenfmal zwanzig Sekunden statt zwanzig. */}
          <Pressable onPress={() => weiter(-1)} hitSlop={8} style={styles.weiss}>
            <Text style={styles.weissText}>Weiß ich nicht</Text>
          </Pressable>
        </Animated.View>
      </GridBackground>
    );
  }

  // --- Ergebnis ------------------------------------------------------------
  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Ergebnis" titleInBarOnly onBack={() => router.back()} />
      </View>
      <View style={styles.ergebnis}>
        {fehler ? (
          <Text style={styles.fehler}>{fehler}</Text>
        ) : ergebnis ? (
          <Animated.View entering={reduceMotion ? undefined : FadeIn} style={{ gap: space.lg }}>
            <Text style={styles.punkte}>
              {ergebnis.correct}
              <Text style={styles.punkteVon}> / {ergebnis.total}</Text>
            </Text>
            {ergebnis.late ? (
              <Text style={styles.spaet}>
                Nach Ablauf abgegeben — diese Runde zählt null. Die Uhr läuft auf dem
                Server, nicht im Browser.
              </Text>
            ) : null}
            <Text style={styles.warten}>
              {ergebnis.waiting
                ? 'Jetzt ist der andere dran. Das Ergebnis steht, sobald beide gespielt haben.'
                : 'Beide sind durch — das Ergebnis steht in deiner Duell-Liste.'}
            </Text>
            <Button label="Zu den Duellen" onPress={() => router.replace('/duels')} />
          </Animated.View>
        ) : (
          <ActivityIndicator color={color.signal.primary} />
        )}
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  mitte: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  uhrZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  uhr: { ...type.mono, fontSize: 26, color: color.ink.max, minWidth: 44 },
  uhrBalken: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: color.ink.faint,
    overflow: 'hidden',
  },
  uhrFuell: { height: '100%', borderRadius: 2 },

  hinweis: {
    ...type.meta,
    fontSize: 9.5,
    color: color.ink.low,
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },

  lernKarte: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.md },
  zaehler: { ...type.meta, fontSize: 9.5, color: color.ink.low, letterSpacing: 1.4 },
  karteTitel: { ...type.title, fontSize: 23, lineHeight: 29, color: color.ink.max },
  karteDeck: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid },

  frageBlatt: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.md },
  frageKarte: { ...type.meta, fontSize: 9.5, color: color.ink.low },
  frageText: { ...type.title, fontSize: 21, lineHeight: 28, color: color.ink.max },

  optionen: { gap: space.sm, paddingTop: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  optionGedrueckt: { borderColor: color.signal.primary, opacity: 0.85 },
  optionZiffer: { ...type.mono, fontSize: 12, color: color.ink.low, width: 14 },
  optionText: { ...type.body, fontSize: 15.5, lineHeight: 21, color: color.ink.high, flex: 1 },

  weiss: { alignSelf: 'center', paddingVertical: space.md },
  weissText: { ...type.meta, fontSize: 9.5, color: color.ink.low },

  ergebnis: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  punkte: { ...type.mono, fontSize: 64, lineHeight: 70, color: color.signal.primary, textAlign: 'center' },
  punkteVon: { fontSize: 28, color: color.ink.low },
  spaet: { ...type.body, fontSize: 14, lineHeight: 20, color: color.signal.warn, textAlign: 'center' },
  warten: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid, textAlign: 'center' },
  fehler: { ...type.body, fontSize: 15, color: color.signal.error, textAlign: 'center' },
});
