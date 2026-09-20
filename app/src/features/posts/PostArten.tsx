import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Slider } from '@/components/Slider';
import { LabErgebnis } from '@/features/lab/LabErgebnis';
import { tippInfo, type TippInfo } from '@/features/lab/rechnen';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api, type LabTipps } from '@/lib/supabase';
import type { AbstimmDaten, LabDaten, PostArt, PostDaten, StapelDaten } from '@/lib/types.db';
import { T } from '@/lib/sprache';
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
    // 0101: mit Tipp geteilt = Schaetz-Duell, die Zahl bleibt erst verdeckt.
    const t = d.eingaben && typeof (d.eingaben as { tipp?: unknown }).tipp === 'number' ? tippInfo(d.werkzeug, d.eingaben) : null;
    if (t) return <SchaetzDuell postId={postId} d={d} t={t} istMeins={istMeins} />;
    return <LabErgebnis werkzeugId={d.werkzeug} eingaben={d.eingaben} mitLink />;
  }
  return null;
}

/**
 * Schaetz-Duell (0101): Frage oben, Regler, "Tippen". Danach die aufgeloeste
 * Karte und alle Tipps - wer am naechsten lag, steht oben. Der Autor hat
 * schon beim Teilen getippt; sein Tipp steckt in den Eingaben.
 */
function SchaetzDuell({ postId, d, t, istMeins }: { postId: string; d: LabDaten; t: TippInfo; istMeins: boolean }) {
  const autorTipp = (d.eingaben as { tipp: number }).tipp;
  const [stand, setStand] = useState<LabTipps | null>(null);
  const [tipp, setTipp] = useState(() => Math.round((t.min + t.max) / 2));
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    api.labTipps(postId).then(setStand).catch(() => setStand({ getippt: false, anzahl: 0, tipps: [] }));
  }, [postId]);

  const offen = istMeins || stand?.getippt;

  const abgeben = async () => {
    setBusy(true);
    setFehler(null);
    try {
      const r = await api.labTippen(postId, tipp);
      setStand(r);
      const abw = Math.abs(tipp - t.echt);
      if (abw <= Math.abs(autorTipp - t.echt)) feedback.correct();
      else feedback.wrong();
    } catch (e) {
      setFehler(fehlerText(e, 'Tippen ging nicht'));
    } finally {
      setBusy(false);
    }
  };

  if (!stand) return <View style={styles.duell} />;

  if (!offen) {
    return (
      <View style={styles.duell}>
        <Text style={styles.duellKopf}>SCHÄTZ-DUELL{stand.anzahl ? ` · ${stand.anzahl} getippt` : ''}</Text>
        <Text style={styles.duellFrage}>{t.frage}</Text>
        <Text style={styles.duellTipp}>{t.fmt(tipp)}</Text>
        <Slider min={t.min} max={t.max} step={t.step} value={tipp} onChange={setTipp} tint={color.signal.primary} />
        <Pressable onPress={() => void abgeben()} disabled={busy} style={({ pressed }) => [styles.duellKnopf, (pressed || busy) && { opacity: 0.8 }]}>
          <Text style={styles.duellKnopfText}>{busy ? '…' : 'Tippen'}</Text>
        </Pressable>
        {fehler ? <Text style={styles.fuss}>{fehler}</Text> : null}
      </View>
    );
  }

  const alle = [...stand.tipps.map((x) => ({ name: x.ich ? 'Du' : x.name, tipp: x.tipp, ich: x.ich })), { name: istMeins ? 'Du (Frage)' : 'Frage', tipp: autorTipp, ich: istMeins }]
    .sort((a, b) => Math.abs(a.tipp - t.echt) - Math.abs(b.tipp - t.echt));
  return (
    <View style={{ gap: space.sm }}>
      <LabErgebnis werkzeugId={d.werkzeug} eingaben={d.eingaben} mitLink />
      <View style={styles.duell}>
        <Text style={styles.duellKopf}>{T('WER LAG AM NÄCHSTEN')}</Text>
        {alle.slice(0, 8).map((x, i) => (
          <View key={`${x.name}-${i}`} style={styles.duellZeile}>
            <Text style={[styles.duellPlatz, i === 0 && { color: color.signal.primary }]}>{i + 1}</Text>
            <Text style={[styles.duellName, x.ich && { color: color.ink.max }]} numberOfLines={1}>{x.name}</Text>
            <Text style={styles.duellWert}>{t.fmt(x.tipp)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
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
  duell: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
    minHeight: 40,
  },
  duellKopf: { ...type.meta, fontSize: 10, letterSpacing: 1, color: color.signal.primary },
  duellFrage: { ...type.label, fontSize: 15, lineHeight: 21, color: color.ink.max },
  duellTipp: { ...type.mono, fontSize: 22, color: color.ink.max, textAlign: 'center' },
  duellKnopf: { alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: color.signal.primary },
  duellKnopfText: { ...type.label, fontSize: 15, color: color.bg },
  duellZeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  duellPlatz: { ...type.mono, fontSize: 12, width: 16, color: color.ink.low },
  duellName: { ...type.label, fontSize: 13, color: color.ink.high, flex: 1 },
  duellWert: { ...type.mono, fontSize: 13, color: color.ink.max },
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
