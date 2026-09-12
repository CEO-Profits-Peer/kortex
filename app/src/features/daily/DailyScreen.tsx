import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Appear } from '@/components/Appear';
import { Avatar } from '@/components/Avatar';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Icon } from '@/components/Icon';
import { analytics } from '@/lib/analytics';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { rewards } from '@/lib/rewards';
import { api } from '@/lib/supabase';
import type {
  DailyChallenge,
  DailyLeaderboard,
  DailyQuestion,
  DailySubmission,
} from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

/**
 * Die Tagesaufgabe.
 *
 * Fuenf Fragen, fuer alle dieselben, einmal am Tag. Warum es das gibt und
 * warum die Wertung serverseitig laeuft, steht in
 * supabase/migrations/0022_daily_challenge.sql.
 *
 * Hier die Entscheidungen, die den Bildschirm betreffen:
 *
 * · **Keine Rueckmeldung waehrend des Spiels.** Man tippt fuenfmal, dann
 *   kommt alles auf einmal. Sofortige Rueckmeldung nach jeder Frage waere
 *   freundlicher - aber dann weiss man nach der zweiten falschen Antwort,
 *   dass der Tag gelaufen ist, und hoert auf. So bleibt es bis zum Schluss
 *   offen.
 *
 * · **Keine Uhr auf dem Bildschirm.** Die Zeit zaehlt nur bei Gleichstand,
 *   und eine laufende Uhr macht aus einer Denkaufgabe eine Hetzjagd. Sie
 *   laeuft mit, sie wird nur nicht gezeigt.
 *
 * · **Ein Weg zurueck, immer.** Auch mitten in der Aufgabe. Wer abbricht,
 *   hat nicht gespielt und kann spaeter wiederkommen - das Ergebnis wird
 *   erst beim Abgeben festgeschrieben.
 */

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

/** Heute, ausgeschrieben. Ein Datum wie "2026-09-10" liest niemand gern. */
function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function DailyScreen() {
  const insets = useSafeAreaInsets();
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submission, setSubmission] = useState<DailySubmission | null>(null);
  const [board, setBoard] = useState<DailyLeaderboard | null>(null);
  const [busy, setBusy] = useState(false);

  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    let alive = true;
    void api
      .dailyChallenge()
      .then((c) => {
        if (!alive) return;
        setChallenge(c);
        startedAt.current = Date.now();
        // Schon gespielt? Dann direkt zur Rangliste - die Fragen nochmal
        // durchzuklicken waere sinnlos.
        if (c.result) void loadBoard();
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'nicht ladbar'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBoard = useCallback(async () => {
    try {
      setBoard(await api.dailyLeaderboard(20));
    } catch {
      /* Die Rangliste ist Beiwerk. Ohne sie funktioniert die Aufgabe. */
    }
  }, []);

  const questions: DailyQuestion[] = challenge?.questions ?? [];
  const done = Boolean(submission) || Boolean(challenge?.result);

  const choose = async (index: number) => {
    if (busy || done) return;
    haptics.select();
    const next = [...answers, index];
    setAnswers(next);

    if (next.length < questions.length) {
      setStep(next.length);
      return;
    }

    // Letzte Antwort: abgeben.
    setBusy(true);
    try {
      const r = await api.submitDaily(next, Date.now() - startedAt.current);
      setSubmission(r);
      analytics.dailyFinished(r.correct, r.total);
      if (r.correct === r.total) {
        feedback.perfect();
      } else if (r.correct > r.total / 2) {
        feedback.correct();
      } else {
        feedback.wrong();
      }
      if (r.xp) rewards.xp(r.xp);
      void loadBoard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Abgeben fehlgeschlagen');
      // Antworten zuruecknehmen, damit man es nochmal versuchen kann.
      setAnswers(answers);
    } finally {
      setBusy(false);
    }
  };

  // --- Zustaende ohne Aufgabe ----------------------------------------------
  if (error && !challenge) {
    return <Shell insets={insets}><Text style={styles.error}>{error}</Text></Shell>;
  }
  if (!challenge) {
    return (
      <Shell insets={insets}>
        <ActivityIndicator color={color.ink.low} />
      </Shell>
    );
  }
  if (!challenge.available) {
    return (
      <Shell insets={insets}>
        <Text style={styles.headline}>Heute noch nichts</Text>
        <Text style={styles.body}>
          Für die Tagesaufgabe braucht es fünf Karten mit Frage in deiner Sprache.
          Sobald genug da sind, steht sie hier jeden Morgen.
        </Text>
      </Shell>
    );
  }

  // --- Ergebnis -------------------------------------------------------------
  if (done) {
    const correct = submission?.correct ?? challenge.result?.correct ?? 0;
    const total = submission?.total ?? challenge.result?.total ?? questions.length;
    const duration = submission?.duration_ms ?? challenge.result?.duration_ms ?? 0;

    return (
      <Shell insets={insets} scroll>
        <Appear style={styles.resultHead}>
          <Text style={styles.resultScore}>
            {correct}
            <Text style={styles.resultOf}> / {total}</Text>
          </Text>
          <Text style={styles.resultLabel}>
            {correct === total
              ? 'Alles richtig. Das schafft heute nicht jeder.'
              : correct === 0
                ? 'Heute nichts getroffen. Morgen neue Fragen.'
                : 'Ergebnis steht. Morgen gibt es fünf neue.'}
          </Text>
          <Text style={styles.resultMeta}>
            {formatDuration(duration)}
            {submission?.xp ? `  ·  +${submission.xp} XP` : ''}
          </Text>
        </Appear>

        {/* Aufloesung. Nur wenn gerade gespielt - beim spaeteren Aufruf
            waere sie ein Spoiler fuer niemanden mehr, aber auch nutzlos,
            weil die Fragen dann nicht mehr im Kopf sind. */}
        {submission?.detail ? (
          <View style={styles.detailList}>
            {submission.detail.map((d, i) => {
              const q = questions[i];
              return (
                <Appear key={d.content_id} delay={i * 60} style={styles.detailRow}>
                  <Icon
                    name={d.ok ? 'check' : 'cross'}
                    size={16}
                    color={d.ok ? color.signal.success : color.signal.error}
                  />
                  <View style={styles.detailBody}>
                    <Text style={styles.detailQ} numberOfLines={2}>
                      {q?.question ?? ''}
                    </Text>
                    {!d.ok && q ? (
                      <Text style={styles.detailA}>
                        Richtig: {q.options[d.correct_index]}
                      </Text>
                    ) : null}
                    {d.explanation ? (
                      <Text style={styles.detailWhy}>{d.explanation}</Text>
                    ) : null}
                  </View>
                </Appear>
              );
            })}
          </View>
        ) : null}

        {/* --- Rangliste des Tages ------------------------------------- */}
        <View style={styles.boardBlock}>
          <Text style={styles.sectionTitle}>
            Heute {board?.players ? `· ${board.players} dabei` : ''}
          </Text>
          {board ? (
            board.rows.length === 0 ? (
              <Text style={styles.body}>
                Noch niemand auf der Liste. Wer die Rangliste in den Einstellungen
                ausgeschaltet hat, erscheint hier nicht.
              </Text>
            ) : (
              <Animated.View layout={LinearTransition} style={styles.boardList}>
                {board.rows.map((row) => (
                  <Pressable
                    key={`${row.pos}-${row.handle}`}
                    onPress={() => router.push(`/u/${encodeURIComponent(row.handle)}`)}
                    style={({ pressed }) => [
                      styles.boardRow,
                      row.is_me && styles.boardRowMe,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.boardPos, row.pos <= 3 && styles.boardPosTop]}>
                      {row.pos}
                    </Text>
                    <Avatar seed={row.avatar_seed} path={row.avatar_path} size={28} />
                    <Text
                      style={[styles.boardName, row.is_me && { color: color.signal.primary }]}
                      numberOfLines={1}
                    >
                      {row.display_name}
                      {row.is_me ? '  ·  du' : ''}
                    </Text>
                    <Text style={styles.boardScore}>
                      {row.correct}/{row.total}
                    </Text>
                    <Text style={styles.boardTime}>{formatDuration(row.duration_ms)}</Text>
                  </Pressable>
                ))}
              </Animated.View>
            )
          ) : (
            <ActivityIndicator color={color.ink.low} />
          )}

          {/* Der eigene Platz, wenn er nicht in der Liste steht. */}
          {board?.me && !board.rows.some((r) => r.is_me) ? (
            <Text style={styles.myPos}>
              Dein Platz: {board.me.pos} mit {board.me.correct}/{board.me.total}
            </Text>
          ) : null}
        </View>
      </Shell>
    );
  }

  // --- Die Fragen -----------------------------------------------------------
  const q = questions[step];
  if (!q) {
    return <Shell insets={insets}><ActivityIndicator color={color.ink.low} /></Shell>;
  }
  const accent = categoryAccent(null);

  return (
    <Shell insets={insets}>
      {/* Fortschritt als Punkte, nicht als Balken. Fuenf Punkte sagen
          "gleich fertig", ein Balken bei 40 Prozent sagt "noch weit". */}
      <View style={styles.dots}>
        {questions.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < answers.length && { backgroundColor: color.ink.mid },
              i === step && { backgroundColor: color.signal.primary, width: 18 },
            ]}
          />
        ))}
      </View>

      <Appear key={q.content_id} style={styles.qBlock} distance={12}>
        <Text style={styles.qCount}>
          Frage {step + 1} von {questions.length}
        </Text>

        {/**
          * Worum es geht, VOR der Frage.
          *
          * Im Feed steht die Karte ueber der Frage - man hat sie gerade
          * gelesen, "Was ist ein wirksames Gegenmittel?" ist dort
          * eindeutig. Hier fehlte dieser Zusammenhang komplett, und die
          * Frage wurde unbeantwortbar: Gegenmittel wogegen?
          *
          * Titel und Unterzeile reichen aus. Die ganze Karte zu zeigen
          * waere zu viel - fuenf Karten lesen ist eine Lernsitzung, keine
          * Tagesaufgabe.
          */}
        <View style={styles.context}>
          <Text style={styles.contextTitle}>{q.title}</Text>
          {q.deck ? <Text style={styles.contextDeck}>{q.deck}</Text> : null}
        </View>

        <Text style={styles.qText}>{q.question}</Text>

        <View style={styles.options}>
          {q.options.map((option, i) => (
            <Pressable
              key={i}
              onPress={() => choose(i)}
              disabled={busy}
              style={({ pressed }) => [
                styles.option,
                pressed && { borderColor: accent, opacity: 0.9 },
              ]}
            >
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>

        {busy ? <ActivityIndicator color={color.ink.low} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Appear>
    </Shell>
  );
}

function Shell({
  insets,
  children,
  scroll,
}: {
  insets: { top: number; bottom: number };
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <GridBackground>
      {/* Die Zurueck-Taste stand hier absolut positioniert ueber dem
          Inhalt - als einzige im Projekt. Dadurch lag sie auf einer
          anderen Hoehe als auf jedem anderen Bildschirm, und der Inhalt
          musste einen Platz freihalten, den er nicht kannte. */}
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Tagesaufgabe" titleInBarOnly />
      </View>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.root,
            { paddingBottom: insets.bottom + space.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.root,
            styles.rootCenter,
            { paddingBottom: insets.bottom + space.xl },
          ]}
        >
          {children}
        </View>
      )}
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: space.xl, gap: space.lg, flexGrow: 1 },
  rootCenter: { justifyContent: 'center' },



  headline: { ...type.title, fontSize: 24, color: color.ink.max },
  body: { ...type.body, color: color.ink.mid },
  error: { ...type.meta, color: color.signal.error },

  // --- Fragen ---
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.ink.faint },

  qBlock: { gap: space.lg },
  qCount: { ...type.mono, fontSize: 12, color: color.ink.low },

  // Der Zusammenhang steht ruhig links an einer Kante - er ist Beiwerk zur
  // Frage, nicht die Frage. Ein Kaertchen drumherum wuerde ihn zu wichtig
  // machen.
  context: {
    borderLeftWidth: 2,
    borderLeftColor: color.ink.faint,
    paddingLeft: space.md,
    gap: 2,
  },
  contextTitle: { ...type.label, fontSize: 14, color: color.ink.high },
  contextDeck: { ...type.meta, color: color.ink.low },
  qText: { ...type.title, fontSize: 23, lineHeight: 30, color: color.ink.max },

  options: { gap: space.md },
  option: {
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  optionText: { ...type.body, fontSize: 16, color: color.ink.high },

  // --- Ergebnis ---
  resultHead: { gap: space.sm, paddingTop: space.lg },
  resultScore: { ...type.display, fontSize: 56, lineHeight: 60, color: color.ink.max },
  resultOf: { ...type.display, fontSize: 28, color: color.ink.low },
  resultLabel: { ...type.deck, color: color.ink.mid },
  resultMeta: { ...type.mono, fontSize: 12, color: color.ink.low },

  detailList: { gap: space.md, paddingTop: space.md },
  detailRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  detailBody: { flex: 1, gap: 3 },
  detailQ: { ...type.body, fontSize: 15, color: color.ink.high },
  detailA: { ...type.meta, color: color.signal.success },
  detailWhy: { ...type.meta, color: color.ink.low },

  // --- Rangliste ---
  boardBlock: { gap: space.md, paddingTop: space.xl },
  sectionTitle: {
    ...type.label,
    color: color.ink.mid,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  boardList: { gap: 2 },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  boardRowMe: { backgroundColor: color.bgElevated },
  boardPos: { ...type.mono, fontSize: 13, color: color.ink.low, width: 22 },
  boardPosTop: { color: color.ink.max },
  boardName: { ...type.body, fontSize: 15, color: color.ink.high, flex: 1 },
  boardScore: { ...type.mono, fontSize: 13, color: color.ink.high },
  boardTime: { ...type.mono, fontSize: 11, color: color.ink.low, width: 58, textAlign: 'right' },
  myPos: { ...type.meta, color: color.ink.mid, paddingTop: space.sm },
});
