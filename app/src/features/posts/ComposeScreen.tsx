import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useErwaehnung } from '@/components/Erwaehnungen';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { LabErgebnis } from '@/features/lab/LabErgebnis';
import { ergebnis, werkzeug } from '@/features/lab/rechnen';
import { KartenVerweis, Kopf } from '@/features/posts/PostParts';
import { entwurfHolen, entwurfLoeschen, entwurfSpeichern, neueEntwurfId } from '@/lib/entwuerfe';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { CollectionEntry, Post, PostArt } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Etwas erstellen.
 *
 * Ein Bildschirm fuer alle Arten:
 *   /compose?art=post|frage|umfrage|quiz|stapel
 *   /compose?card=ID&titel=...        eine Karte empfehlen, mit eigenem Satz
 *   /compose?repost=ID                einen Beitrag weiterteilen
 *   /compose?lab=WERKZEUG&eingaben=   ein LAB-Ergebnis teilen
 *   /compose?entwurf=ID               einen Entwurf weiterschreiben
 *
 * Geprueft wird in der Datenbank (create_post, 0088): Laengen, Antworten,
 * Karten, und alles Geschriebene durch dieselbe Pruefung wie Kommentare.
 *
 * Entwuerfe: wer das Fenster verlaesst, ohne zu posten, findet das
 * Angefangene im Studio wieder. Kein "Speichern?"-Dialog - eine Frage beim
 * Schliessen ist genau die Huerde, die man beim Wegwischen nicht will.
 */

const ARTEN: { art: PostArt; label: string }[] = [
  { art: 'post', label: 'Beitrag' },
  { art: 'frage', label: 'Frage' },
  { art: 'umfrage', label: 'Umfrage' },
  { art: 'quiz', label: 'Quiz' },
  { art: 'stapel', label: 'Stapel' },
];

const PLATZHALTER: Record<PostArt, string> = {
  post: 'Was hast du heute gelernt?',
  frage: 'Was willst du von deinen Leuten wissen?',
  umfrage: 'Worüber sollen alle abstimmen?',
  quiz: 'Deine Quizfrage',
  stapel: 'Titel für deinen Stapel (freiwillig)',
  lab: 'Etwas dazu sagen (freiwillig)',
};

function leereOptionen(art: PostArt): string[] {
  return art === 'quiz' ? ['', '', ''] : ['', ''];
}

export function ComposeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    art?: string;
    repost?: string;
    card?: string;
    titel?: string;
    lab?: string;
    eingaben?: string;
    entwurf?: string;
  }>();

  const labId = params.lab && werkzeug(params.lab) ? params.lab : null;
  const labEingaben = (() => {
    if (!labId || !params.eingaben) return null;
    try {
      return JSON.parse(params.eingaben) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  const startArt: PostArt = labId
    ? 'lab'
    : ARTEN.some((a) => a.art === params.art)
      ? (params.art as PostArt)
      : 'post';

  const [art, setArt] = useState<PostArt>(startArt);
  const [text, setText] = useState('');
  const [optionen, setOptionen] = useState<string[]>(leereOptionen(startArt));
  const [richtig, setRichtig] = useState<number | null>(null);
  const [karten, setKarten] = useState<string[]>([]);
  const [auswahl, setAuswahl] = useState<CollectionEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [original, setOriginal] = useState<Post | null>(null);
  const erwaehnung = useErwaehnung(text, setText);

  const entwurfId = useRef(params.entwurf ?? neueEntwurfId());
  const gepostet = useRef(false);

  // Entwurf laden.
  useEffect(() => {
    if (!params.entwurf) return;
    void entwurfHolen(params.entwurf).then((e) => {
      if (!e) return;
      setArt(e.art);
      setText(e.text);
      const d = (e.daten ?? {}) as { optionen?: string[]; richtig?: number | null; karten?: string[] };
      if (Array.isArray(d.optionen)) setOptionen(d.optionen);
      if (typeof d.richtig === 'number') setRichtig(d.richtig);
      if (Array.isArray(d.karten)) setKarten(d.karten);
    });
  }, [params.entwurf]);

  useEffect(() => {
    if (!params.repost) return;
    void api
      .postDetail(params.repost)
      .then((d) => {
        if (!d.gesperrt) setOriginal(d.post);
      })
      .catch(() => setNotiz('Den Beitrag gibt es nicht mehr.'));
  }, [params.repost]);

  // Karten fuer den Stapel: aus Likes und Empfohlenem, erst wenn gebraucht.
  useEffect(() => {
    if (art !== 'stapel' || auswahl !== null) return;
    void Promise.all([api.myCollection('likes', 40).catch(() => []), api.myCollection('reposts', 40).catch(() => [])])
      .then(([likes, reposts]) => {
        const je = new Map<string, CollectionEntry>();
        [...reposts, ...likes].forEach((k) => je.set(k.content_id, k));
        setAuswahl([...je.values()]);
      });
  }, [art, auswahl]);

  // Beim Verlassen ohne Posten: als Entwurf behalten. Ueber eine Ref, damit
  // der Abbau den LETZTEN Stand sieht, nicht den vom ersten Rendern.
  const stand = useRef({ art, text, optionen, richtig, karten });
  stand.current = { art, text, optionen, richtig, karten };
  const entwurfErlaubt = !params.repost && !params.card && !labId;
  useEffect(
    () => () => {
      if (gepostet.current || !entwurfErlaubt) return;
      const s = stand.current;
      const hatInhalt =
        s.text.trim().length > 0 || s.optionen.some((o) => o.trim().length > 0) || s.karten.length > 0;
      if (!hatInhalt) {
        if (params.entwurf) void entwurfLoeschen(params.entwurf);
        return;
      }
      void entwurfSpeichern({
        id: entwurfId.current,
        art: s.art,
        text: s.text,
        daten: { optionen: s.optionen, richtig: s.richtig, karten: s.karten },
      });
    },
    [entwurfErlaubt, params.entwurf],
  );

  const karte = params.card
    ? { content_id: params.card, title: params.titel ?? 'Karte', deck: null, category: '' }
    : null;

  const t = text.trim();
  const opt = optionen.map((o) => o.trim());
  const optionenOk = opt.length >= 2 && opt.every((o) => o.length >= 1 && o.length <= 80);
  const labGueltig = labId ? ergebnis(labId, labEingaben) !== null : false;

  const darf =
    !busy &&
    (art === 'lab'
      ? labGueltig
      : art === 'stapel'
        ? karten.length >= 2 && karten.length <= 10
        : art === 'umfrage'
          ? t.length >= 2 && optionenOk && opt.length <= 4
          : art === 'quiz'
            ? t.length >= 2 && optionenOk && opt.length === 3 && richtig !== null
            : t.length >= 2 || (Boolean(params.repost || params.card) && t.length === 0));

  const posten = async () => {
    if (!darf) return;
    setBusy(true);
    setNotiz(null);
    try {
      const daten =
        art === 'umfrage'
          ? { optionen: opt }
          : art === 'quiz'
            ? { optionen: opt, richtig }
            : art === 'stapel'
              ? { karten }
              : art === 'lab'
                ? { werkzeug: labId, eingaben: labEingaben }
                : null;
      const r = await api.createPost({
        body: t,
        art: params.repost || params.card ? 'post' : art,
        contentId: params.card,
        repostOf: params.repost,
        daten,
      });
      if (r.status === 'blocked') {
        feedback.wrong();
        setNotiz(r.reason ?? 'Das wurde nicht freigegeben.');
        return;
      }
      gepostet.current = true;
      void entwurfLoeschen(entwurfId.current);
      feedback.correct();
      haptics.success();
      router.replace('/home');
    } catch (e) {
      setNotiz(fehlerText(e, 'Posten ging nicht.'));
    } finally {
      setBusy(false);
    }
  };

  const artWechseln = (a: PostArt) => {
    haptics.select();
    setArt(a);
    if ((a === 'quiz' || a === 'umfrage') && optionen.every((o) => !o.trim())) setOptionen(leereOptionen(a));
    if (a === 'quiz' && optionen.length !== 3) setOptionen((alt) => [...alt, '', ''].slice(0, 3));
  };

  const karteUmschalten = (id: string) => {
    haptics.select();
    setKarten((alt) =>
      alt.includes(id) ? alt.filter((x) => x !== id) : alt.length >= 10 ? alt : [...alt, id],
    );
  };

  const titel = params.repost
    ? 'Teilen'
    : params.card
      ? 'Empfehlen'
      : labId
        ? `LAB · ${werkzeug(labId)?.titel}`
        : (ARTEN.find((a) => a.art === art)?.label ?? 'Neu');

  return (
    <GridBackground>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[styles.leiste, { paddingTop: insets.top + space.sm }]}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Schließen">
            <Icon name="close" size={20} color={color.ink.mid} />
          </Pressable>
          <Text style={styles.leisteTitel} numberOfLines={1}>
            {titel}
          </Text>
          <Pressable
            onPress={() => void posten()}
            disabled={!darf}
            style={[styles.posten, !darf && styles.postenAus]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator size="small" color={color.bg} /> : <Text style={styles.postenText}>Posten</Text>}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {entwurfErlaubt ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.arten}>
              {ARTEN.map((a) => (
                <Pressable key={a.art} onPress={() => artWechseln(a.art)} style={[styles.art, art === a.art && styles.artAn]}>
                  <Text style={[styles.artText, art === a.art && styles.artTextAn]}>{a.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <TextInput
            value={text}
            onChangeText={setText}
            onSelectionChange={erwaehnung.onSelectionChange}
            placeholder={PLATZHALTER[art]}
            placeholderTextColor={color.ink.low}
            style={[styles.eingabe, (art === 'stapel' || art === 'lab') && styles.eingabeKlein]}
            multiline
            autoFocus={art !== 'stapel'}
            maxLength={500}
          />
          {erwaehnung.leiste}
          <Text style={styles.zaehler}>{text.length} / 500</Text>

          {/* --- Umfrage / Quiz ------------------------------------------------ */}
          {art === 'umfrage' || art === 'quiz' ? (
            <View style={styles.optionen}>
              <Text style={styles.abschnitt}>
                {art === 'quiz' ? 'Drei Antworten – tippe den Kreis bei der richtigen' : 'Antworten'}
              </Text>
              {optionen.map((o, i) => (
                <View key={i} style={styles.option}>
                  {art === 'quiz' ? (
                    <Pressable
                      onPress={() => {
                        haptics.select();
                        setRichtig(i);
                      }}
                      hitSlop={8}
                      style={[styles.kreis, richtig === i && styles.kreisAn]}
                      accessibilityLabel={`Antwort ${i + 1} ist richtig`}
                    >
                      {richtig === i ? <Icon name="check" size={13} color={color.bg} /> : null}
                    </Pressable>
                  ) : null}
                  <TextInput
                    value={o}
                    onChangeText={(v) => setOptionen((alt) => alt.map((x, j) => (j === i ? v : x)))}
                    placeholder={`Antwort ${i + 1}`}
                    placeholderTextColor={color.ink.low}
                    style={styles.optionEingabe}
                    maxLength={80}
                  />
                  {art === 'umfrage' && optionen.length > 2 ? (
                    <Pressable
                      onPress={() => setOptionen((alt) => alt.filter((_, j) => j !== i))}
                      hitSlop={8}
                      accessibilityLabel="Antwort entfernen"
                    >
                      <Icon name="close" size={14} color={color.ink.low} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {art === 'umfrage' && optionen.length < 4 ? (
                <Pressable onPress={() => setOptionen((alt) => [...alt, ''])} style={styles.dazu} hitSlop={6}>
                  <Icon name="plus" size={14} color={color.signal.primary} />
                  <Text style={styles.dazuText}>Antwort</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* --- Stapel ------------------------------------------------------------ */}
          {art === 'stapel' ? (
            <View style={styles.optionen}>
              <Text style={styles.abschnitt}>
                Karten wählen · {karten.length} von 2–10 · aus deinen Likes und Empfehlungen
              </Text>
              {auswahl === null ? (
                <ActivityIndicator color={color.ink.low} />
              ) : auswahl.length === 0 ? (
                <Text style={styles.leer}>
                  Noch keine Likes. Like im Feed ein paar Karten – dann kannst du sie hier bündeln.
                </Text>
              ) : (
                auswahl.map((k) => {
                  const nr = karten.indexOf(k.content_id);
                  return (
                    <Pressable
                      key={k.content_id}
                      onPress={() => karteUmschalten(k.content_id)}
                      style={[styles.wahlKarte, nr >= 0 && styles.wahlKarteAn]}
                    >
                      <View style={[styles.nummer, nr >= 0 && styles.nummerAn]}>
                        <Text style={[styles.nummerText, nr >= 0 && { color: color.bg }]}>{nr >= 0 ? nr + 1 : ''}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.wahlTitel} numberOfLines={2}>
                          {k.title}
                        </Text>
                        <Text style={styles.wahlTag}>#{k.category.split('.').pop()}</Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}

          {/* --- LAB ----------------------------------------------------------------- */}
          {labId ? <LabErgebnis werkzeugId={labId} eingaben={labEingaben} /> : null}

          {karte ? <KartenVerweis karte={karte} /> : null}

          {original ? (
            <View style={styles.original}>
              <Kopf wer={original.wer} at={original.at} klein />
              {original.body ? (
                <Text style={styles.originalText} numberOfLines={6}>
                  {original.body}
                </Text>
              ) : null}
              {original.karte ? <KartenVerweis karte={original.karte} /> : null}
            </View>
          ) : null}

          {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}

          <Text style={styles.regeln}>
            {art === 'quiz'
              ? 'Die richtige Antwort sieht erst, wer geantwortet hat.'
              : art === 'umfrage'
                ? 'Das Ergebnis sieht, wer abgestimmt hat.'
                : 'Deine Follower sehen das in ihrem Home.'}{' '}
            Mit @name erwähnst du jemanden. Keine Links, keine Kontaktdaten.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  leiste: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  leisteTitel: { ...type.label, fontSize: 16, color: color.ink.max, flex: 1, textAlign: 'center' },
  posten: {
    minWidth: 76,
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: color.signal.primary,
  },
  postenAus: { backgroundColor: color.ink.faint },
  postenText: { ...type.label, fontSize: 14, color: color.bg },

  body: { padding: space.xl, gap: space.md },

  arten: { gap: space.sm },
  art: {
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  artAn: { borderColor: color.signal.primary, backgroundColor: color.bgElevated },
  artText: { ...type.meta, color: color.ink.mid },
  artTextAn: { color: color.signal.primary },

  // Eigene, weich gerundete Flaeche statt des eckigen Browser-Fokusrahmens.
  eingabe: {
    minHeight: 140,
    ...type.body,
    fontSize: 18,
    lineHeight: 26,
    color: color.ink.max,
    textAlignVertical: 'top',
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  eingabeKlein: { minHeight: 64, fontSize: 16, lineHeight: 23 },
  zaehler: { ...type.meta, color: color.ink.low, textAlign: 'right' },

  abschnitt: { ...type.meta, color: color.ink.low },
  optionen: { gap: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  optionEingabe: {
    flex: 1,
    ...type.body,
    fontSize: 15,
    color: color.ink.max,
    paddingVertical: 12,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  kreis: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: color.ink.low,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kreisAn: { borderColor: color.signal.success, backgroundColor: color.signal.success },
  dazu: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  dazuText: { ...type.label, fontSize: 14, color: color.signal.primary },

  leer: { ...type.body, fontSize: 14, color: color.ink.mid },
  wahlKarte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  wahlKarteAn: { borderColor: color.signal.primary },
  nummer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.ink.low,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nummerAn: { borderColor: color.signal.primary, backgroundColor: color.signal.primary },
  nummerText: { ...type.mono, fontSize: 11, color: color.ink.low },
  wahlTitel: { ...type.body, fontSize: 14, color: color.ink.high },
  wahlTag: { ...type.meta, fontSize: 10, color: color.ink.low },

  original: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  originalText: { ...type.body, fontSize: 15, lineHeight: 21, color: color.ink.high },

  notiz: { ...type.body, fontSize: 14, color: color.signal.warn },
  regeln: { ...type.meta, color: color.ink.low, lineHeight: 16, paddingTop: space.md },
});
