import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { useErwaehnung } from '@/components/Erwaehnungen';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { LabErgebnis } from '@/features/lab/LabErgebnis';
import { ergebnis, werkzeug } from '@/features/lab/rechnen';
import { KartenVerweis, Kopf } from '@/features/posts/PostParts';
import { entwurfHolen, entwurfLoeschen, entwurfSpeichern, neueEntwurfId } from '@/lib/entwuerfe';
import { fehlerText } from '@/lib/fehler';
import { GRENZEN, grenzen, proMeldung, useIchPro } from '@/lib/pro';
import { ProMarke, zeigeProSperre } from '@/components/ProSperre';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { CollectionEntry, Post, PostArt } from '@/lib/types.db';
import { T } from '@/lib/sprache';
import { color, gewaehlt, gewaehltText, radius, space, type } from '@/theme/tokens';
import { flaeche } from '@/theme/design';

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

/** Eine Karte zur Auswahl im Stapel. */
type Wahl = { content_id: string; title: string; category: string };

function WahlZeile({ k, nr, onPress }: { k: Wahl; nr: number; onPress: () => void }) {
  const an = nr >= 0;
  return (
    <Pressable onPress={onPress} style={[styles.wahlKarte, an && styles.wahlKarteAn]}>
      <View style={[styles.nummer, an && styles.nummerAn]}>
        <Text style={[styles.nummerText, an && { color: color.bg }]}>{an ? nr + 1 : ''}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.wahlTitel} numberOfLines={2}>
          {k.title}
        </Text>
        {k.category ? <Text style={styles.wahlTag}>#{k.category.split('.').pop()}</Text> : null}
      </View>
      {an ? <Icon name="close" size={13} color={color.ink.low} /> : <Icon name="plus" size={14} color={color.akzent} />}
    </Pressable>
  );
}

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
  // PRO nur fuer die Anzeige: der Server setzt die Grenzen selbst durch (0091).
  const { pro } = useIchPro();
  const g = grenzen(pro);
  const [richtig, setRichtig] = useState<number | null>(null);
  const [karten, setKarten] = useState<string[]>([]);
  const [auswahl, setAuswahl] = useState<CollectionEntry[] | null>(null);
  // Stapel: Suche ueber ALLE Karten, nicht nur die eigenen Likes.
  const [kartenSuche, setKartenSuche] = useState('');
  const [treffer, setTreffer] = useState<Wahl[] | null>(null);
  const [bekannt, setBekannt] = useState<Record<string, Wahl>>({});
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  // 0097 (PRO): null = sofort, sonst der Zeitpunkt.
  const [geplant, setGeplant] = useState<Date | null>(null);
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
      .catch(() => setNotiz(T('Den Beitrag gibt es nicht mehr.')));
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

  // Suche ueber alle Karten (search_all, dieselbe wie im Such-Tab), entprellt.
  useEffect(() => {
    if (art !== 'stapel') return;
    const q = kartenSuche.trim();
    if (q.length < 2) {
      setTreffer(null);
      return;
    }
    const t = setTimeout(() => {
      void api
        .search(q, 30)
        .then((hits) =>
          setTreffer(
            hits
              .filter((h) => h.kind === 'content')
              .map((h) => ({
                content_id: h.id,
                title: h.title,
                category: typeof h.meta?.category === 'string' ? h.meta.category : '',
              })),
          ),
        )
        .catch(() => setTreffer([]));
    }, 250);
    return () => clearTimeout(t);
  }, [art, kartenSuche]);

  // Titel merken, damit "Ausgewählt" auch Karten zeigt, die gerade nicht in
  // der Liste darunter stehen - etwa aus einer frueheren Suche.
  useEffect(() => {
    const neu: Record<string, Wahl> = {};
    [...(auswahl ?? []), ...(treffer ?? [])].forEach((k) => {
      neu[k.content_id] = { content_id: k.content_id, title: k.title, category: k.category };
    });
    if (Object.keys(neu).length) setBekannt((alt) => ({ ...alt, ...neu }));
  }, [auswahl, treffer]);

  // Ein Entwurf kann Karten enthalten, deren Titel hier niemand kennt.
  // Jede Kennung nur EINMAL anfragen: eine zurueckgezogene Karte kommt nie
  // zurueck, und ohne diese Merkliste loeste jede Antwort die naechste
  // Anfrage aus - eine Schleife ohne Ende.
  const angefragt = useRef(new Set<string>());
  useEffect(() => {
    const fehlen = karten.filter((id) => !bekannt[id] && !angefragt.current.has(id));
    if (fehlen.length === 0) return;
    fehlen.forEach((id) => angefragt.current.add(id));
    void api
      .contentByIds(fehlen)
      .then((items) =>
        setBekannt((alt) => {
          const n = { ...alt };
          items.forEach((c) => {
            n[c.id] = { content_id: c.id, title: c.title, category: c.primary_category_id };
          });
          return n;
        }),
      )
      .catch(() => undefined);
  }, [karten, bekannt]);

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
        ? karten.length >= 2 && karten.length <= g.stapel
        : art === 'umfrage'
          ? t.length >= 2 && optionenOk && opt.length <= g.umfrage
          : art === 'quiz'
            ? t.length >= 2 && optionenOk && opt.length >= 3 && opt.length <= g.quiz && richtig !== null && richtig < opt.length
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
        geplant: geplant ? geplant.toISOString() : null,
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
      // Geplant: ins Studio, dort steht er unter "Geplant" - im Home waere er
      // noch nicht zu sehen und saehe verloren aus.
      router.replace(geplant ? '/studio' : '/home');
    } catch (e) {
      const angebot = proMeldung(e);
      if (angebot) {
        zeigeProSperre(angebot);
        return;
      }
      setNotiz(fehlerText(e, 'Posten ging nicht.'));
    } finally {
      setBusy(false);
    }
  };

  const artWechseln = (a: PostArt) => {
    haptics.select();
    setArt(a);
    if ((a === 'quiz' || a === 'umfrage') && optionen.every((o) => !o.trim())) setOptionen(leereOptionen(a));
    if (a === 'quiz' && (optionen.length < 3 || optionen.length > g.quiz)) {
      setOptionen((alt) => [...alt, '', ''].slice(0, Math.max(3, Math.min(alt.length, g.quiz))));
    }
  };

  const karteUmschalten = (id: string) => {
    haptics.select();
    if (!karten.includes(id) && karten.length >= g.stapel) {
      if (!pro) zeigeProSperre('Mehr als zehn Karten im Stapel gibt es mit PRO – bis zu 50.');
      return;
    }
    setKarten((alt) => (alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]));
  };

  /** Eine Antwort dazu - oder das PRO-Fenster, wenn die freie Grenze erreicht ist. */
  const antwortDazu = () => {
    const frei = art === 'quiz' ? GRENZEN.frei.quiz : GRENZEN.frei.umfrage;
    if (!pro && optionen.length >= frei) {
      zeigeProSperre(
        art === 'quiz'
          ? 'Mehr als drei Antworten im Quiz gibt es mit PRO – bis zu fünf.'
          : 'Mehr als vier Antworten gibt es mit PRO – bis zu sechs.',
      );
      return;
    }
    setOptionen((alt) => [...alt, '']);
  };

  const antwortWeg = (i: number) => {
    setOptionen((alt) => alt.filter((_, j) => j !== i));
    setRichtig((r) => (r === null ? r : r === i ? null : r > i ? r - 1 : r));
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
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel={T('Schließen')}>
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
            {busy ? <Laden size="small" color={color.bg} /> : <Text style={styles.postenText}>{geplant ? 'Planen' : 'Posten'}</Text>}
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
            maxLength={g.text}
          />
          {erwaehnung.leiste}
          <View style={styles.zaehlerZeile}>
            {!pro && text.length >= GRENZEN.frei.text ? (
              <Pressable
                onPress={() => zeigeProSperre('Mehr als 500 Zeichen gibt es mit PRO – bis zu 1500.')}
                hitSlop={8}
                style={styles.mehrPro}
              >
                <ProMarke klein />
                <Text style={styles.mehrProText}>{T('Länger')}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.zaehler}>
              {text.length} / {g.text}
            </Text>
          </View>

          {/* --- Umfrage / Quiz ------------------------------------------------ */}
          {art === 'umfrage' || art === 'quiz' ? (
            <View style={styles.optionen}>
              <Text style={styles.abschnitt}>
                {art === 'quiz' ? 'Antworten – tippe den Kreis bei der richtigen' : 'Antworten'}
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
                  {(art === 'umfrage' && optionen.length > 2) || (art === 'quiz' && optionen.length > 3) ? (
                    <Pressable
                      onPress={() => antwortWeg(i)}
                      hitSlop={8}
                      accessibilityLabel={T('Antwort entfernen')}
                    >
                      <Icon name="close" size={14} color={color.ink.low} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {optionen.length < (art === 'quiz' ? GRENZEN.pro.quiz : GRENZEN.pro.umfrage) ? (
                <Pressable onPress={antwortDazu} style={styles.dazu} hitSlop={6}>
                  <Icon name="plus" size={14} color={color.akzent} />
                  <Text style={styles.dazuText}>{T('Antwort')}</Text>
                  {!pro && optionen.length >= (art === 'quiz' ? GRENZEN.frei.quiz : GRENZEN.frei.umfrage) ? (
                    <ProMarke klein />
                  ) : null}
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {/* --- Stapel ------------------------------------------------------------ */}
          {art === 'stapel' ? (
            <View style={styles.optionen}>
              <View style={styles.suche}>
                <Icon name="search" size={16} color={color.ink.low} />
                <TextInput
                  value={kartenSuche}
                  onChangeText={setKartenSuche}
                  placeholder={T('Alle Karten durchsuchen')}
                  placeholderTextColor={color.ink.low}
                  style={styles.sucheEingabe}
                  returnKeyType="search"
                />
                {kartenSuche ? (
                  <Pressable onPress={() => setKartenSuche('')} hitSlop={10} accessibilityLabel={T('Suche leeren')}>
                    <Icon name="close" size={14} color={color.ink.low} />
                  </Pressable>
                ) : null}
              </View>

              {/* Ausgewählt - in der Reihenfolge, in der der Stapel abläuft. */}
              {karten.length > 0 ? (
                <>
                  <Text style={styles.abschnitt}>Ausgewählt · {karten.length} von 2–{g.stapel}</Text>
                  {karten.map((id, i) => (
                    <WahlZeile
                      key={id}
                      k={bekannt[id] ?? { content_id: id, title: 'Karte', category: '' }}
                      nr={i}
                      onPress={() => karteUmschalten(id)}
                    />
                  ))}
                </>
              ) : (
                <Text style={styles.abschnitt}>Wähle 2 bis {g.stapel} Karten</Text>
              )}

              {kartenSuche.trim().length >= 2 ? (
                <>
                  <Text style={styles.abschnitt}>Treffer</Text>
                  {treffer === null ? (
                    <Laden color={color.ink.low} />
                  ) : treffer.filter((k) => !karten.includes(k.content_id)).length === 0 ? (
                    <Text style={styles.leer}>Keine weitere Karte zu „{kartenSuche.trim()}".</Text>
                  ) : (
                    treffer
                      .filter((k) => !karten.includes(k.content_id))
                      .map((k) => <WahlZeile key={k.content_id} k={k} nr={-1} onPress={() => karteUmschalten(k.content_id)} />)
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.abschnitt}>{T('Aus deinen Likes und Empfehlungen')}</Text>
                  {auswahl === null ? (
                    <Laden color={color.ink.low} />
                  ) : auswahl.filter((k) => !karten.includes(k.content_id)).length === 0 ? (
                    <Text style={styles.leer}>
                      {auswahl.length === 0
                        ? 'Noch keine Likes – such oben nach Karten.'
                        : 'Alle gewählt. Such oben nach weiteren Karten.'}
                    </Text>
                  ) : (
                    auswahl
                      .filter((k) => !karten.includes(k.content_id))
                      .map((k) => <WahlZeile key={k.content_id} k={k} nr={-1} onPress={() => karteUmschalten(k.content_id)} />)
                  )}
                </>
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

          {!params.repost ? (
            <Zeitpunkt
              wert={geplant}
              onChange={(d) => {
                if (d && !pro) {
                  zeigeProSperre('Beiträge zu einer Uhrzeit veröffentlichen geht mit PRO.');
                  return;
                }
                haptics.select();
                setGeplant(d);
              }}
            />
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

/**
 * Wann erscheinen? Feste Vorschlaege statt Datumswahl: die vier decken fast
 * alles ab, und ein Kalender auf dem Handy ist fuer "morgen frueh" zu viel.
 * Vorschlaege, die weniger als fuenf Minuten entfernt waeren, fallen weg -
 * so frueh nimmt der Server sie nicht (0097).
 */
function vorschlaege(): { label: string; d: Date }[] {
  const jetzt = new Date();
  const um = (tage: number, h: number) => {
    const d = new Date(jetzt);
    d.setDate(d.getDate() + tage);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const inEinerStunde = new Date(jetzt.getTime() + 60 * 60 * 1000);
  inEinerStunde.setMinutes(inEinerStunde.getMinutes() < 30 ? 30 : 60, 0, 0);
  return [
    { label: 'In 1 h', d: inEinerStunde },
    { label: 'Heute 18:00', d: um(0, 18) },
    { label: 'Morgen 8:00', d: um(1, 8) },
    { label: 'Morgen 18:00', d: um(1, 18) },
  ].filter((v) => v.d.getTime() > jetzt.getTime() + 5 * 60 * 1000);
}

function Zeitpunkt({ wert, onChange }: { wert: Date | null; onChange: (d: Date | null) => void }) {
  const liste = vorschlaege();
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.zeitLabel}>Erscheint</Text>
      <View style={styles.zeitReihe}>
        {[{ label: 'Jetzt', d: null as Date | null }, ...liste].map((v) => {
          const an = v.d === null ? wert === null : wert?.getTime() === v.d.getTime();
          return (
            <Pressable
              key={v.label}
              onPress={() => onChange(v.d)}
              style={[styles.zeitChip, an && styles.zeitChipAn]}
              accessibilityRole="button"
              accessibilityState={{ selected: an }}
            >
              <Text style={[styles.zeitText, an && styles.zeitTextAn]}>{v.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zeitLabel: { ...type.meta, color: color.ink.low },
  zeitReihe: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  zeitChip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.ink.faint,
  },
  zeitChipAn: { borderColor: color.signal.primary, backgroundColor: color.bgSunken },
  zeitText: { ...type.label, fontSize: 13, color: color.ink.mid },
  zeitTextAn: { color: color.signal.primary },
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
  artAn: gewaehlt({ borderColor: color.signal.primary, backgroundColor: color.bgElevated }),
  artText: { ...type.meta, color: color.ink.mid },
  artTextAn: gewaehltText({ color: color.signal.primary }),

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
    ...flaeche(10),
  },
  eingabeKlein: { minHeight: 64, fontSize: 16, lineHeight: 23 },
  zaehler: { ...type.meta, color: color.ink.low, textAlign: 'right' },

  abschnitt: { ...type.meta, color: color.ink.low },
  optionen: { gap: space.sm },
  zaehlerZeile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.md },
  mehrPro: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mehrProText: { ...type.meta, color: color.akzent },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(6),
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
  dazuText: { ...type.label, fontSize: 14, color: color.akzent },

  leer: { ...type.body, fontSize: 14, color: color.ink.mid },
  suche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(6),
  },
  sucheEingabe: {
    flex: 1, minWidth: 0,
    ...type.body,
    fontSize: 15,
    color: color.ink.max,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  wahlKarte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(8),
  },
  wahlKarteAn: gewaehlt({ borderColor: color.signal.primary }),
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
    ...flaeche(8),
  },
  originalText: { ...type.body, fontSize: 15, lineHeight: 21, color: color.ink.high },

  notiz: { ...type.body, fontSize: 14, color: color.signal.warn },
  regeln: { ...type.meta, color: color.ink.low, lineHeight: 16, paddingTop: space.md },
});
