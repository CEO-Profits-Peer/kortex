import React, { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analytics } from '@/lib/analytics';
import { rewards } from '@/lib/rewards';
import { feedback } from '@/lib/feedback';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { BRAND } from '@/lib/brand';
import { api } from '@/lib/supabase';
import type { ContentItem, SubmitQuizResult } from '@/lib/types.db';
import { color, gewaehlt, radius, space, type } from '@/theme/tokens';

/**
 * Der Batch-Checkpoint.
 *
 * Das Herzstueck des Produkts und gleichzeitig die wichtigste Bremse:
 * nach zehn gelesenen Grids haelt der Feed an. Das Quiz ist FREIWILLIG -
 * "Weiterlesen" ist gleichberechtigt und bricht den Lesefluss nicht ab.
 *
 * Zwang wuerde hier mehr kaputt machen als er bringt: er verwandelt eine
 * Belohnung in eine Huerde. Wer weiterliest, bekommt einfach keine Mastery.
 *
 * Die richtige Antwort kennt der Client nie im Voraus - sie kommt erst als
 * Antwort auf submit_quiz vom Server zurueck (0003_functions.sql).
 */

type Phase = 'offer' | 'quiz' | 'summary';

type Answered = {
  item: ContentItem;
  chosen: number;
  result: SubmitQuizResult;
};

export function BatchCheckpoint({
  batch,
  onContinue,
}: {
  /** Die zehn Karten, die der Server als gelesen validiert hat */
  batch: ContentItem[];
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('offer');
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<SubmitQuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [bonusXp, setBonusXp] = useState(0);
  // 1: "Nochmal" nach einer falschen Antwort zeigt den Kern der Karte.
  const [nochmal, setNochmal] = useState(false);
  // 4: "Dazu passt" in der Zusammenfassung.
  const [verwandt, setVerwandt] = useState<{ content_id: string; title: string }[]>([]);

  // Gefragt wird nur, was auch gelesen wurde - und hoechstens drei Fragen.
  // Uebersprungene Karten fliegen im Feed schon vorher aus dem Pool.
  const questions = useMemo(
    () => batch.filter((c) => Array.isArray(c.quiz_items) && c.quiz_items.length > 0).slice(0, 3),
    [batch],
  );

  const current = questions[step];

  const submit = async (index: number) => {
    if (!current || busy || result) return;
    setBusy(true);
    setChosen(index);
    try {
      const r = await api.submitQuiz(current.id, 0, index);
      analytics.quizAnswered(r.correct, answers.length === 0);
      setResult(r);
      r.correct ? feedback.correct() : feedback.wrong();
      // Die Zahlen kommen vom Server, nicht aus der App - deshalb erst
      // hier und nicht schon in feedback.correct().
      rewards.xp(r.xp);
      rewards.mastery(r.mastery);
      setAnswers((prev) => [...prev, { item: current, chosen: index, result: r }]);
    } catch {
      setChosen(null);
    } finally {
      setBusy(false);
    }
  };

  const next = async () => {
    setResult(null);
    setChosen(null);
    setNochmal(false);
    if (step + 1 < questions.length) {
      setStep(step + 1);
      return;
    }
    // Batch abgeschlossen: Bonus anfragen. Der Server prueft selbst nach,
    // ob wirklich alle Karten validiert gelesen wurden.
    const allCorrect = answers.every((a) => a.result.correct) && answers.length > 0;
    try {
      const bonus = await api.claimBatchBonus(
        batch.map((b) => b.id),
        allCorrect,
      );
      if (bonus.granted && bonus.xp) {
        setBonusXp(bonus.xp);
        rewards.xp(bonus.xp);
        if (allCorrect) feedback.perfect();
      }
    } catch {
      /* Bonus ist ein Extra - ein Fehler darf den Flow nicht stoppen. */
    }
    setPhase('summary');
    // Im Hintergrund - fehlt es, steht einfach nichts da.
    api.verwandteKarten(batch.map((b) => b.id), 3).then(setVerwandt).catch(() => setVerwandt([]));
  };

  // --- Angebot ---------------------------------------------------------------

  if (phase === 'offer') {
    return (
      <GridBackground>
        <View style={[styles.root, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>{BRAND.batchLabel} abgeschlossen</Text>
            <Text style={styles.bigNumber}>{batch.length}</Text>
            <Text style={styles.bigLabel}>{BRAND.unit.many} gelesen</Text>

            <View style={styles.pips}>
              {batch.map((c) => (
                <View key={c.id} style={styles.pip} />
              ))}
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              label={
                questions.length > 0
                  ? `${questions.length} Fragen · +100 XP möglich`
                  : 'Weiterlesen'
              }
              onPress={() => {
                if (questions.length > 0) {
                  analytics.checkpointQuiz();
                  setPhase('quiz');
                } else onContinue();
              }}
            />
            {questions.length > 0 ? (
              <Button
                label="Weiterlesen"
                variant="quiet"
                onPress={() => {
                  analytics.checkpointSkipped();
                  onContinue();
                }}
              />
            ) : null}
            <Text style={styles.note}>
              Freiwillig. Überspringen kostet nur die XP, nicht den Lesefluss.
            </Text>
          </View>
        </View>
      </GridBackground>
    );
  }

  // --- Zusammenfassung -------------------------------------------------------

  if (phase === 'summary') {
    const correct = answers.filter((a) => a.result.correct).length;
    const xp = answers.reduce((sum, a) => sum + a.result.xp, 0) + bonusXp;
    const mastery = answers.reduce((sum, a) => sum + a.result.mastery, 0);

    return (
      <GridBackground>
        <View style={[styles.root, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Ergebnis</Text>
            <Text style={styles.bigNumber}>
              {correct}
              <Text style={styles.ofTotal}>/{answers.length}</Text>
            </Text>

            <View style={styles.gains}>
              <View style={styles.gain}>
                <Text style={[styles.gainValue, { color: color.signal.primary }]}>+{xp}</Text>
                <Text style={styles.gainLabel}>XP</Text>
              </View>
              <View style={styles.gain}>
                <Text style={[styles.gainValue, { color: color.signal.mastery }]}>+{mastery}</Text>
                <Text style={styles.gainLabel}>Mastery</Text>
              </View>
            </View>

            {mastery > 0 ? (
              <Text style={styles.note}>
                Diese Fragen kommen in ein bis drei Tagen noch einmal. Erst dann
                zählt, was wirklich hängen geblieben ist.
              </Text>
            ) : null}
          </View>

          {verwandt.length > 0 ? (
            <View style={styles.verwandt}>
              <Text style={styles.eyebrow}>Dazu passt</Text>
              {verwandt.map((k) => (
                <Pressable
                  key={k.content_id}
                  onPress={() => router.push(`/reel/${encodeURIComponent(k.content_id)}`)}
                  style={({ pressed }) => [styles.verwandtZeile, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.verwandtText} numberOfLines={2}>
                    {k.title}
                  </Text>
                  <Icon name="chevron" size={13} color={color.ink.low} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <Button label="Weiterlesen" onPress={onContinue} />
        </View>
      </GridBackground>
    );
  }

  // --- Quiz ------------------------------------------------------------------

  if (!current) return null;
  const quiz = current.quiz_items[0];

  return (
    <GridBackground>
      <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.progress}>
          {questions.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressBar,
                i <= step && { backgroundColor: color.signal.primary },
              ]}
            />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.quizBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.source} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.question}>{quiz.question}</Text>

          <View style={styles.options}>
            {quiz.options.map((opt, i) => {
              const isChosen = chosen === i;
              const isCorrect = result != null && result.correct_index === i;
              const isWrong = result != null && isChosen && !result.correct;

              return (
                <Pressable
                  key={i}
                  onPress={() => submit(i)}
                  disabled={result != null || busy}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && !result && styles.optionPressed,
                    isChosen && !result && styles.optionChosen,
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
            <View style={styles.feedback}>
              <Text
                style={[
                  styles.verdict,
                  { color: result.correct ? color.signal.success : color.signal.error },
                ]}
              >
                {result.correct ? 'Richtig' : 'Daneben'}
                {result.xp > 0 ? `  ·  +${result.xp} XP` : ''}
              </Text>
              {result.explanation ? (
                <Text style={styles.explanation}>{result.explanation}</Text>
              ) : null}
              {/* 1: Bei "Daneben" den Kern der Karte noch einmal - aus der
                  Karte selbst, also aus derselben Quelle, ohne Modellaufruf. */}
              {!result.correct && !nochmal ? (
                <Pressable onPress={() => setNochmal(true)} hitSlop={8} style={styles.nochmalKnopf}>
                  <Text style={styles.nochmalText}>Nochmal</Text>
                </Pressable>
              ) : null}
              {!result.correct && nochmal ? (
                <View style={styles.nochmalBox}>
                  {current.deck ? <Text style={styles.nochmalDeck}>{current.deck}</Text> : null}
                  {(current.body_blocks ?? []).slice(0, 2).map((b, i) => (
                    <Text key={i} style={styles.explanation}>
                      {b.type === 'bullet'
                        ? b.items.map((x) => `• ${x}`).join('\n')
                        : b.type === 'stat'
                          ? `${b.value} ${b.label}`
                          : b.text}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {result ? (
          <Button
            label={step + 1 < questions.length ? 'Weiter' : 'Fertig'}
            onPress={next}
          />
        ) : null}
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  nochmalKnopf: { alignSelf: 'flex-start', paddingVertical: 6 },
  nochmalText: { ...type.label, fontSize: 14, color: color.akzent },
  nochmalBox: {
    gap: space.sm,
    padding: space.md,
    borderLeftWidth: 2,
    borderLeftColor: color.signal.primary,
    backgroundColor: color.bgSunken,
    borderRadius: radius.sm,
  },
  nochmalDeck: { ...type.label, fontSize: 15, color: color.ink.max },
  verwandt: { alignSelf: 'stretch', gap: space.xs, marginBottom: space.md },
  verwandtZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  verwandtText: { ...type.label, fontSize: 14, color: color.ink.high, flex: 1 },
  root: { flex: 1, paddingHorizontal: space.xl, justifyContent: 'space-between' },

  hero: { flex: 1, justifyContent: 'center', gap: space.sm },
  eyebrow: { ...type.meta, color: color.akzent, letterSpacing: 1.2, textTransform: 'uppercase' },
  bigNumber: { ...type.display, fontSize: 88, lineHeight: 92, color: color.ink.max, letterSpacing: -3 },
  ofTotal: { fontSize: 44, color: color.ink.low },
  bigLabel: { ...type.deck, color: color.ink.mid },

  pips: { flexDirection: 'row', gap: 5, marginTop: space.lg },
  pip: { width: 18, height: 3, borderRadius: 2, backgroundColor: color.signal.primary },

  actions: { gap: space.sm },
  note: { ...type.meta, color: color.ink.low, textAlign: 'center', lineHeight: 17, marginTop: space.xs },

  gains: { flexDirection: 'row', gap: space.xxl, marginTop: space.lg },
  gain: { gap: 2 },
  gainValue: { ...type.title, fontSize: 30 },
  gainLabel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },

  progress: { flexDirection: 'row', gap: 4, paddingVertical: space.md },
  progressBar: { flex: 1, height: 2, borderRadius: 2, backgroundColor: color.ink.faint },

  quizBody: { flexGrow: 1, justifyContent: 'center', gap: space.lg, paddingVertical: space.xl },
  source: { ...type.meta, color: color.ink.low },
  question: { ...type.title, color: color.ink.max },

  options: { gap: space.sm, marginTop: space.sm },
  option: {
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  optionPressed: { borderColor: color.ink.mid },
  optionChosen: gewaehlt({ borderColor: color.signal.primary }),
  optionCorrect: { borderColor: color.signal.success, borderWidth: 1.5 },
  optionWrong: { borderColor: color.signal.error, borderWidth: 1.5 },
  optionText: { ...type.body, color: color.ink.high },

  feedback: { gap: space.xs, marginTop: space.sm },
  verdict: { ...type.label, fontSize: 16 },
  explanation: { ...type.body, fontSize: 15, lineHeight: 23, color: color.ink.mid },
});
