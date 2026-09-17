import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { LabErgebnis } from '@/features/lab/LabErgebnis';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { AbstimmDaten, LabDaten, PostArt, PostDaten, StapelDaten } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';
import { flaeche } from '@/theme/design';

/**
 * Was ein Beitrag je nach Art unter seinem Text zeigt (0088).
 *
 *   umfrage  Antworten zum Antippen, danach Balken mit Prozent
 *   quiz     drei Antworten, nach dem Tipp richtig/falsch und wie viele es wussten
 *   stapel   die Karten nebeneinander, ein Tipp startet das Durchwischen
 *   lab      das Ergebnis, aus den Eingaben neu gerechnet
 */

export const VERB: Partial<Record<PostArt, string>> = {
  frage: 'fragt',
  umfrage: 'startet eine Umfrage',
  quiz: 'stellt ein Quiz',
  stapel: 'teilt einen Stapel',
  lab: 'hat im LAB gerechnet',
};

export function PostInhalt({
  postId,
  art,
  daten,
  istMeins,
  onNotiz,
}: {
  postId: string;
  art: PostArt;
  daten: PostDaten | undefined;
  istMeins: boolean;
  onNotiz?: (t: string) => void;
}) {
  if (!daten) return null;
  if (art === 'umfrage' || art === 'quiz') {
    return (
      <Abstimmung postId={postId} quiz={art === 'quiz'} start={daten as AbstimmDaten} istMeins={istMeins} onNotiz={onNotiz} />
    );
  }
  if (art === 'stapel') return <StapelVorschau postId={postId} daten={daten as StapelDaten} />;
  if (art === 'lab') {
    const d = daten as LabDaten;
    return <LabErgebnis werkzeugId={d.werkzeug} eingaben={d.eingaben} mitLink />;
  }
  return null;
}

function Abstimmung({
  postId,
  quiz,
  start,
  istMeins,
  onNotiz,
}: {
  postId: string;
  quiz: boolean;
  start: AbstimmDaten;
  istMeins: boolean;
  onNotiz?: (t: string) => void;
}) {
  const [d, setD] = useState(start);
  const [busy, setBusy] = useState(false);

  useEffect(() => setD(start), [start]);

  const aufgeloest = d.stimmen !== null && d.stimmen !== undefined;
  // Das eigene Quiz kann man nicht beantworten - man sieht es aufgeloest.
  const gesperrt = aufgeloest || busy || (quiz && istMeins);

  const waehlen = async (i: number) => {
    if (gesperrt) return;
    setBusy(true);
    haptics.select();
    try {
      const neu = await api.abstimmen(postId, i);
      setD(neu);
      if (quiz) {
        if (neu.richtig === i) feedback.correct();
        else feedback.wrong();
      }
    } catch (e) {
      onNotiz?.(fehlerText(e, 'Abstimmen ging nicht.'));
    } finally {
      setBusy(false);
    }
  };

  const gesamt = Math.max(0, d.gesamt);
  const richtigAnzahl =
    quiz && aufgeloest && typeof d.richtig === 'number' ? (d.stimmen?.[d.richtig] ?? 0) : null;

  return (
    <View style={styles.abstimmung}>
      {d.optionen.map((text, i) => {
        const stimmen = d.stimmen?.[i] ?? 0;
        const anteil = aufgeloest && gesamt > 0 ? stimmen / gesamt : 0;
        const meine = d.meine_wahl === i;
        const richtig = quiz && aufgeloest && d.richtig === i;
        const falsch = quiz && aufgeloest && meine && d.richtig !== i;
        const farbe = richtig ? color.signal.success : falsch ? color.signal.error : color.signal.primary;
        return (
          <Pressable
            key={i}
            onPress={() => void waehlen(i)}
            disabled={gesperrt}
            style={({ pressed }) => [
              styles.option,
              (meine || richtig) && { borderColor: farbe },
              falsch && { borderColor: color.signal.error },
              pressed && !gesperrt && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: meine, disabled: gesperrt }}
          >
            {aufgeloest ? (
              <View style={[styles.fuellung, { width: `${Math.round(anteil * 100)}%`, backgroundColor: farbe }]} />
            ) : null}
            <Text style={[styles.optionText, (meine || richtig) && { color: color.ink.max }]} numberOfLines={2}>
              {text}
            </Text>
            {richtig ? <Icon name="check" size={14} color={color.signal.success} /> : null}
            {falsch ? <Icon name="cross" size={14} color={color.signal.error} /> : null}
            {aufgeloest ? <Text style={styles.prozent}>{Math.round(anteil * 100)} %</Text> : null}
          </Pressable>
        );
      })}
      <Text style={styles.fuss}>
        {quiz
          ? aufgeloest
            ? richtigAnzahl !== null && gesamt > 0
              ? `${richtigAnzahl} von ${gesamt} wussten es`
              : istMeins
                ? 'Noch niemand hat geantwortet'
                : ''
            : 'Tippe deine Antwort'
          : aufgeloest
            ? `${gesamt} ${gesamt === 1 ? 'Stimme' : 'Stimmen'}`
            : 'Abstimmen, dann siehst du das Ergebnis'}
      </Text>
    </View>
  );
}

function StapelVorschau({ postId, daten }: { postId: string; daten: StapelDaten }) {
  const karten = daten.karten ?? [];
  const oeffnen = (start = 0) => {
    haptics.light();
    router.push(`/stapel/${encodeURIComponent(postId)}${start ? `?start=${start}` : ''}`);
  };

  return (
    <View style={styles.stapel}>
      <Pressable onPress={() => oeffnen()} style={styles.stapelKopf} hitSlop={6}>
        <Icon name="lesson" size={15} color={color.akzent} />
        <Text style={styles.stapelTitel}>{karten.length} Karten</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.stapelAktion}>Wischen</Text>
        <Icon name="chevron" size={13} color={color.akzent} />
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stapelReihe}>
        {karten.map((k, i) => (
          <Pressable
            key={k.content_id}
            onPress={() => oeffnen(i)}
            style={({ pressed }) => [styles.stapelKarte, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.stapelNr}>{i + 1}</Text>
            <Text style={styles.stapelKartenTitel} numberOfLines={3}>
              {k.title}
            </Text>
            {k.category ? <Text style={styles.stapelTag}>#{k.category.split('.').pop()}</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  abstimmung: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
    overflow: 'hidden',
    ...flaeche(6),
  },
  fuellung: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.14 },
  optionText: { ...type.body, fontSize: 15, color: color.ink.high, flex: 1 },
  prozent: { ...type.mono, fontSize: 12, color: color.ink.mid, minWidth: 40, textAlign: 'right' },
  fuss: { ...type.meta, fontSize: 11, color: color.ink.low },

  stapel: { gap: space.sm },
  stapelKopf: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stapelTitel: { ...type.label, fontSize: 14, color: color.ink.high },
  stapelAktion: { ...type.label, fontSize: 13, color: color.akzent },
  stapelReihe: { gap: space.sm },
  stapelKarte: {
    width: 132,
    minHeight: 104,
    gap: 4,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
    ...flaeche(8),
  },
  stapelNr: { ...type.mono, fontSize: 11, color: color.akzent },
  stapelKartenTitel: { ...type.body, fontSize: 13, lineHeight: 18, color: color.ink.high, flex: 1 },
  stapelTag: { ...type.meta, fontSize: 10, color: color.ink.low },
});
