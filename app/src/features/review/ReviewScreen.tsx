import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { analytics } from '@/lib/analytics';
import { rewards } from '@/lib/rewards';
import { feedback } from '@/lib/feedback';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { notizenLaden, useNotiz } from '@/lib/notizen';
import { api } from '@/lib/supabase';
import type { DueReview, ReviewUeberblick } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';
import { flaeche } from '@/theme/design';

/**
 * Wiederholungs-Modus.
 *
 * Der eigentliche Unterschied zwischen dieser App und einem Feed. Fragen von
 * vor einem, drei oder sieben Tagen kommen zurueck - und genau dort entsteht
 * Langzeitwissen. Deshalb ist es auch die teuerste Mastery-Quelle im System:
 * 15 XP UND 15 Mastery pro richtiger Wiederholung, gegenueber 10 Mastery beim
 * ersten Beantworten und 0 beim blossen Lesen.
 *
 * Das Intervall verwaltet der Server (SM-2 lite in submit_review): richtig
 * beantwortet heisst 1 Tag, 3 Tage, dann wachsend; falsch setzt zurueck.
 * Nach fuenf fehlerfreien Durchgaengen geht eine Frage in Ruhestand.
 */

type Answered = { correct: boolean; correctIndex: number; xp: number };

/** "in 3 Stunden", "morgen", "am 18.09." */
function wannNaechste(iso: string | null): string {
  if (!iso) return 'bald';
  const d = new Date(iso);
  const std = Math.round((d.getTime() - Date.now()) / 3_600_000);
  if (std <= 1) return 'in unter einer Stunde';
  if (std < 20) return `in ${std} Stunden`;
  const tage = Math.round(std / 24);
  if (tage <= 1) return 'morgen';
  if (tage < 7) return `in ${tage} Tagen`;
  return `am ${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
}

export function ReviewScreen() {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<DueReview[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<Answered | null>(null);
  const [busy, setBusy] = useState(false);
  const [gained, setGained] = useState({ xp: 0, correct: 0 });
  const [error, setError] = useState<string | null>(null);
  const [ueberblick, setUeberblick] = useState<ReviewUeberblick | null>(null);

  useEffect(() => {
    void api.reviewOverview().then(setUeberblick).catch(() => undefined);
  }, []);

  useEffect(() => {
    void api
      .dueReviews(12)
      .then((q) => {
        setQueue(q);
        analytics.reviewOpened(q.length);
      })
      .catch((e) => {
        setError(fehlerText(e, 'Wiederholungen nicht ladbar'));
        setQueue([]);
      });
  }, []);

  const current = queue?.[index];

  const answer = useCallback(
    async (option: number) => {
      if (!current || busy || result) return;
      setBusy(true);
      setChosen(option);
      try {
        const r = await api.submitReview(current.review_id, option);
        r.correct ? feedback.correct() : feedback.wrong();
        rewards.xp(r.xp);

        analytics.reviewAnswered(r.correct, current.repetitions);
        setResult({ correct: r.correct, correctIndex: r.correct_index, xp: r.xp });
        setGained((g) => ({ xp: g.xp + r.xp, correct: g.correct + (r.correct ? 1 : 0) }));
      } catch {
        setChosen(null);
      } finally {
        setBusy(false);
      }
    },
    [current, busy, result],
  );

  const next = () => {
    setResult(null);
    setChosen(null);
    setIndex((i) => i + 1);
  };

  // --- Ladezustand ----------------------------------------------------------

  if (queue === null) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <Laden color={color.signal.mastery} />
        </View>
      </GridBackground>
    );
  }

  // --- Nichts faellig -------------------------------------------------------

  /**
   * Gemeldet als "Knopf Wiederholungen macht nichts". Er oeffnete genau
   * diesen Zustand - "Nichts faellig" und ein Knopf "Zum Feed", der nur
   * zurueck ins Profil ging. Jetzt steht hier, wozu das gut ist, wann die
   * naechste Frage kommt, und die Knoepfe tun, was draufsteht.
   */
  if (queue.length === 0) {
    const u = ueberblick;
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Wiederholen" titleInBarOnly />
        </View>
        <ScrollView contentContainerStyle={styles.leer}>
          <Text style={styles.emptyTitle}>Gerade nichts fällig</Text>
          {error ? <Text style={styles.emptyBody}>{error}</Text> : null}

          <View style={styles.stand}>
            <Text style={[styles.standZahl, { color: color.signal.mastery }]}>{u?.geplant ?? '–'}</Text>
            <Text style={styles.standText}>
              {!u
                ? 'Stand wird geladen …'
                : u.geplant === 0
                  ? 'Noch keine Fragen eingeplant.'
                  : `Fragen eingeplant – die nächste ${wannNaechste(u.naechste)}.`}
            </Text>
            {u && u.sitzt > 0 ? (
              <Text style={styles.standKlein}>{u.sitzt} sitzen schon dauerhaft.</Text>
            ) : null}
          </View>

          <Text style={styles.wozuTitel}>Wozu das gut ist</Text>
          <Text style={styles.wozu}>
            Was du nur einmal liest, ist nach einer Woche zum größten Teil weg. Deshalb kommen
            Quizfragen, die du richtig beantwortet hast, nach 1, 3, 7 und mehr Tagen zurück – genau
            dann, wenn du sie fast vergessen hättest. So bleibt es hängen.
          </Text>
          <Text style={styles.wozu}>
            Jede richtige Wiederholung bringt 15 XP und 15 Mastery – mehr als jede andere Aufgabe.
          </Text>
          <Text style={styles.wozuTitel}>Wie neue Fragen dazukommen</Text>
          <Text style={styles.wozu}>
            Im Feed kommt nach 15 gelesenen Karten eine kurze Fragerunde. Was du dort richtig hast,
            landet hier.
          </Text>

          <View style={styles.knoepfe}>
            <Button label="Zum Feed" onPress={() => router.navigate('/')} />
            <Button label="Zurück" variant="ghost" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </GridBackground>
    );
  }

  // --- Durch -----------------------------------------------------------------

  if (!current) {
    const perfect = gained.correct === queue.length;
    return (
      <GridBackground>
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={styles.eyebrow}>Wiederholung abgeschlossen</Text>
          <Text style={[styles.bigNumber, { color: perfect ? color.signal.success : color.ink.max }]}>
            {gained.correct}
            <Text style={styles.ofTotal}>/{queue.length}</Text>
          </Text>
          <Text style={[styles.gain, { color: color.signal.mastery }]}>
            +{gained.xp} XP · +{gained.xp} Mastery
          </Text>
          <Text style={styles.emptyBody}>
            Was du hier richtig hattest, kommt erst in einigen Tagen wieder. Was
            nicht, schon morgen.
          </Text>
          <Button label="Zum Feed" onPress={() => router.back()} />
        </View>
      </GridBackground>
    );
  }

  const accent = categoryAccent(current.accent_hex);

  return (
    <GridBackground>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={[styles.eyebrow, { color: color.signal.mastery }]}>Wiederholung</Text>
          <Text style={styles.counter}>
            {index + 1} / {queue.length}
          </Text>
        </View>

        <View style={styles.progress}>
          {queue.map((_, i) => (
            <View
              key={i}
              style={[styles.bar, i <= index && { backgroundColor: color.signal.mastery }]}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.meta}>
            <Text style={[styles.category, { color: accent }]}>#{current.category_name}</Text>
            <Text style={styles.age}>
              {current.repetitions === 0
                ? 'nochmal von vorn'
                : `${current.repetitions}. Durchgang · Intervall ${current.interval_days} Tage`}
            </Text>
          </View>

          <ReviewNotiz id={current.content_id} />
          <Text style={styles.question}>{current.question}</Text>
          <Text style={styles.origin}>aus: {current.source_title}</Text>

          <View style={styles.options}>
            {current.options.map((opt, i) => {
              const isChosen = chosen === i;
              const isCorrect = result != null && result.correctIndex === i;
              const isWrong = result != null && isChosen && !result.correct;
              return (
                <Pressable
                  key={i}
                  onPress={() => answer(i)}
                  disabled={result != null || busy}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && !result && styles.optionPressed,
                    isChosen && !result && { borderColor: color.signal.mastery },
                    isCorrect && styles.optionCorrect,
                    isWrong && styles.optionWrong,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isCorrect && { color: color.signal.success },
                      isWrong && { color: color.signal.error },
                    ]}
                  >
                    {opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {result ? (
            <Text
              style={[
                styles.verdict,
                { color: result.correct ? color.signal.success : color.signal.error },
              ]}
            >
              {result.correct
                ? `Sitzt. +${result.xp} XP und +${result.xp} Mastery`
                : 'Daneben — diese Frage kommt morgen wieder'}
            </Text>
          ) : null}
        </ScrollView>

        {result ? (
          <Button
            label={index + 1 < queue.length ? 'Weiter' : 'Fertig'}
            accent={color.signal.mastery}
            onPress={next}
          />
        ) : null}
      </View>
    </GridBackground>
  );
}

/** 0107: das eigene Stichwort zur Karte, ueber der Frage. */
function ReviewNotiz({ id }: { id: string }) {
  useEffect(() => {
    void notizenLaden([id]);
  }, [id]);
  const text = useNotiz(id);
  if (!text) return null;
  return (
    <View style={styles.notiz}>
      <Text style={styles.notizText}>Deine Notiz: {text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notiz: {
    padding: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: color.signal.primary,
    backgroundColor: color.bgSunken,
    borderRadius: radius.sm,
  },
  notizText: { ...type.body, fontSize: 13, lineHeight: 19, color: color.ink.high },
  root: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'space-between' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...type.meta, letterSpacing: 1.2, textTransform: 'uppercase' },
  counter: { ...type.mono, color: color.ink.low },

  progress: { flexDirection: 'row', gap: 3, paddingVertical: space.md },
  bar: { flex: 1, height: 2, borderRadius: 2, backgroundColor: color.ink.faint },

  body: { flexGrow: 1, justifyContent: 'center', gap: space.lg, paddingVertical: space.lg },
  meta: { gap: 2 },
  category: { ...type.meta, textTransform: 'lowercase', letterSpacing: 0.6 },
  age: { ...type.meta, color: color.ink.low },

  question: { ...type.title, color: color.ink.max },
  origin: { ...type.meta, color: color.ink.low, marginTop: -space.md },

  options: { gap: space.sm, marginTop: space.sm },
  option: {
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(8),
  },
  optionPressed: { borderColor: color.ink.mid },
  optionCorrect: { borderColor: color.signal.success, borderWidth: 1.5 },
  optionWrong: { borderColor: color.signal.error, borderWidth: 1.5 },
  optionText: { ...type.body, color: color.ink.high },

  verdict: { ...type.label, fontSize: 16 },

  leer: { padding: space.xl, gap: space.md },
  stand: {
    gap: 4,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(12),
  },
  standZahl: { ...type.display, fontSize: 40, lineHeight: 46 },
  standText: { ...type.body, fontSize: 15, color: color.ink.high },
  standKlein: { ...type.meta, color: color.ink.low },
  wozuTitel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1.2, paddingTop: space.sm },
  wozu: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid },
  knoepfe: { gap: space.sm, paddingTop: space.md },

  emptyTitle: { ...type.title, color: color.ink.max },
  emptyBody: { ...type.body, fontSize: 15, color: color.ink.mid, textAlign: 'center', maxWidth: 380 },
  bigNumber: { ...type.display, fontSize: 76, lineHeight: 80, letterSpacing: -3 },
  ofTotal: { fontSize: 36, color: color.ink.low },
  gain: { ...type.label, fontSize: 16 },
});
