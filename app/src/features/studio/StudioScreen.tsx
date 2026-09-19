import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { BlueprintVisual } from '@/components/BlueprintVisual';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { GridBackground } from '@/components/GridBackground';
import { Icon, type IconName } from '@/components/Icon';
import { TabHint, useTabHint } from '@/components/TabHint';
import { DailyBanner } from '@/features/daily/DailyBanner';
import { BALD, WERKZEUGE } from '@/features/lab/rechnen';
import { wann } from '@/features/posts/PostParts';
import { entwurfLoeschen, useEntwuerfe } from '@/lib/entwuerfe';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { beiWiederOnline } from '@/lib/online';
import { api } from '@/lib/supabase';
import type { CourseSummary, Post, PostArt } from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';
import { BordeauxMuster } from '@/components/Sechseck';
import { ZWEI, facette, flaeche, sechseckRegel } from '@/theme/design';

/**
 * Studio - mit einem Umschalter: Erstellen | Lernen (entschieden: Option B).
 *
 * Vorher stand alles untereinander: Beitrag, Frage, Karte empfehlen,
 * Wiederholen, Duelle, Tagesaufgabe, Kurse. "Kurse & tägliche Fragen,
 * Empfehlungen sind nicht dasselbe wie der Erstell-Hub" - richtig: das eine
 * macht man, das andere tut man fuer sich.
 *
 * Erstellen, in dieser Reihenfolge, weil man es in dieser Reihenfolge braucht:
 *   Neu        alle Arten auf einen Blick, je ein Wort
 *   Entwürfe   nur wenn es welche gibt - dann oft das, weswegen man kommt
 *   Von dir    was schon draussen ist, mit Likes und Kommentaren
 *   LAB        die Werkzeuge
 *
 * "Karte empfehlen" ist hier weg: das geht an jeder Karte (Repost), und
 * mehrere Karten zusammen sind jetzt der Stapel.
 */

type Ansicht = 'erstellen' | 'lernen';

const NEU: { art: PostArt | 'lab'; label: string; icon: IconName }[] = [
  { art: 'post', label: 'Beitrag', icon: 'plus' },
  { art: 'frage', label: 'Frage', icon: 'comment' },
  { art: 'umfrage', label: 'Umfrage', icon: 'leaderboard' },
  { art: 'quiz', label: 'Quiz', icon: 'check' },
  { art: 'stapel', label: 'Stapel', icon: 'lesson' },
  { art: 'lab', label: 'LAB', icon: 'interactive' },
];

const ART_LABEL: Record<PostArt, string> = {
  post: 'Beitrag',
  frage: 'Frage',
  umfrage: 'Umfrage',
  quiz: 'Quiz',
  stapel: 'Stapel',
  lab: 'LAB',
};

export function StudioScreen() {
  const hinweis = useTabHint('studio');
  const insets = useSafeAreaInsets();
  const [ansicht, setAnsicht] = useState<Ansicht>('erstellen');
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [faellig, setFaellig] = useState(0);
  const [duelle, setDuelle] = useState(0);
  const [meine, setMeine] = useState<Post[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entwuerfe = useEntwuerfe();
  const [suche, setSuche] = useState('');
  const [kategorie, setKategorie] = useState<string | null>(null);

  // Kategorien aus den Kursen selbst - nur die, zu denen es Kurse gibt.
  const kursKategorien = useMemo(() => {
    const je = new Map<string, { id: string; name: string; emoji: string | null; accent: string | null }>();
    (courses ?? []).forEach((c) => {
      if (!je.has(c.category_id)) je.set(c.category_id, { id: c.category_id, name: c.category, emoji: c.emoji, accent: c.accent });
    });
    return [...je.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [courses]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLocaleLowerCase('de');
    return (courses ?? []).filter(
      (c) =>
        (!kategorie || c.category_id === kategorie) &&
        (!q || `${c.title} ${c.description} ${c.category}`.toLocaleLowerCase('de').includes(q)),
    );
  }, [courses, suche, kategorie]);
  const scroll = useRef<ScrollView>(null);
  const labY = useRef(0);

  const ladenMeine = useCallback(async () => {
    try {
      const p = await api.getMyProfile();
      if (!p) return;
      const s = await api.userPosts(p.handle, 5);
      setMeine(s.posts);
    } catch {
      setMeine((alt) => alt ?? []);
    }
  }, []);

  const load = useCallback(async () => {
    void api
      .reviewSummary()
      .then((r) => setFaellig(r?.due_now ?? 0))
      .catch(() => setFaellig(0));
    void api
      .duelList()
      .then((d) => setDuelle(d.filter((x) => x.laeuft && x.mein_stand !== 'fertig').length))
      .catch(() => setDuelle(0));
    void ladenMeine();
    try {
      setCourses(await api.listCourses());
      setError(null);
    } catch (e) {
      setError(fehlerText(e, 'Kurse nicht ladbar'));
      setCourses([]);
    }
  }, [ladenMeine]);

  // 0097 (PRO): Beitraege, die zu einer Uhrzeit erscheinen.
  const [geplante, setGeplante] = useState<{ id: string; art: string; body: string; at: string }[]>([]);

  useEffect(() => {
    void load();
  }, [load]);

  // Zurueck aus dem Schreibfenster: "Von dir" soll das Neue schon zeigen.
  useFocusEffect(
    useCallback(() => {
      void ladenMeine();
      api.meineGeplanten().then(setGeplante).catch(() => setGeplante([]));
    }, [ladenMeine]),
  );

  useEffect(() => {
    if (!error) return;
    return beiWiederOnline(() => void load());
  }, [error, load]);

  const umschalten = (a: Ansicht) => {
    if (a === ansicht) return;
    haptics.select();
    setAnsicht(a);
  };

  const neu = (art: PostArt | 'lab') => {
    haptics.light();
    if (art === 'lab') {
      scroll.current?.scrollTo({ y: Math.max(0, labY.current - space.lg), animated: true });
      return;
    }
    router.push(art === 'post' ? '/compose' : `/compose?art=${art}`);
  };

  return (
    <GridBackground>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.body,
          {
            paddingTop: insets.top + space.xl,
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={color.ink.low}
          />
        }
      >
        <Text style={styles.pageTitle}>Studio</Text>

        <View style={styles.umschalter}>
          {(['erstellen', 'lernen'] as const).map((a) => (
            <Pressable
              key={a}
              onPress={() => umschalten(a)}
              style={[styles.umschalterTeil, ansicht === a && styles.umschalterAn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: ansicht === a }}
            >
              <Text style={[styles.umschalterText, ansicht === a && styles.umschalterTextAn]}>
                {a === 'erstellen' ? 'Erstellen' : 'Lernen'}
              </Text>
            </Pressable>
          ))}
        </View>

        {ansicht === 'erstellen' ? (
          <>
            {/* --- Neu -------------------------------------------------------- */}
            <View style={styles.neuRaster}>
              {NEU.map((n) => (
                <Pressable
                  key={n.art}
                  onPress={() => neu(n.art)}
                  style={({ pressed }) => [styles.neu, n.art === 'post' && styles.neuHaupt, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                >
                  {ZWEI && n.art === 'post' ? <BordeauxMuster /> : null}
                  <View
                    style={[
                      styles.neuIcon,
                      n.art === 'post' && { backgroundColor: ZWEI ? color.bordeauxHell : color.signal.primary },
                    ]}
                  >
                    <Icon
                      name={n.icon}
                      size={17}
                      color={n.art === 'post' ? (ZWEI ? color.signal.primary : color.bg) : color.akzent}
                    />
                  </View>
                  <Text style={styles.neuLabel}>{n.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* --- Entwürfe --------------------------------------------------- */}
            {entwuerfe.length > 0 ? (
              <View style={styles.abschnittBlock}>
                <Abschnitt titel="Entwürfe" zahl={entwuerfe.length} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reihe} style={styles.bleed}>
                  {entwuerfe.map((e) => {
                    const d = (e.daten ?? {}) as { karten?: string[] };
                    const vorschau =
                      e.text.trim() ||
                      (e.art === 'stapel' && d.karten?.length ? `${d.karten.length} Karten gewählt` : 'Ohne Text');
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => {
                          haptics.light();
                          router.push(`/compose?entwurf=${encodeURIComponent(e.id)}`);
                        }}
                        style={({ pressed }) => [styles.entwurf, pressed && { opacity: 0.85 }]}
                      >
                        <View style={styles.entwurfKopf}>
                          <Text style={styles.entwurfArt}>{ART_LABEL[e.art]}</Text>
                          <Pressable
                            onPress={() => {
                              haptics.light();
                              void entwurfLoeschen(e.id);
                            }}
                            hitSlop={10}
                            accessibilityLabel="Entwurf löschen"
                          >
                            <Icon name="close" size={13} color={color.ink.low} />
                          </Pressable>
                        </View>
                        <Text style={styles.entwurfText} numberOfLines={3}>
                          {vorschau}
                        </Text>
                        <Text style={styles.entwurfWann}>{wann(e.aktualisiert)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* --- Geplant (0097) ------------------------------------------------ */}
            {geplante.length > 0 ? (
              <View style={styles.abschnittBlock}>
                <Abschnitt titel="Geplant" zahl={geplante.length} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reihe} style={styles.bleed}>
                  {geplante.map((g) => (
                    <View key={g.id} style={styles.entwurf}>
                      <View style={styles.entwurfKopf}>
                        <Text style={styles.entwurfArt}>{ART_LABEL[g.art as keyof typeof ART_LABEL] ?? 'Beitrag'}</Text>
                        <Pressable
                          onPress={() => {
                            haptics.light();
                            setGeplante((alt) => alt.filter((x) => x.id !== g.id));
                            void api.geplantLoeschen(g.id).catch(() => undefined);
                          }}
                          hitSlop={10}
                          accessibilityLabel="Geplanten Beitrag zurückziehen"
                        >
                          <Icon name="close" size={13} color={color.ink.low} />
                        </Pressable>
                      </View>
                      <Text style={styles.entwurfText} numberOfLines={3}>
                        {g.body.trim() || 'Ohne Text'}
                      </Text>
                      <Text style={styles.entwurfWann}>
                        {new Date(g.at).toLocaleString('de-AT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* --- Von dir ------------------------------------------------------ */}
            <View style={styles.abschnittBlock}>
              <Abschnitt
                titel="Von dir"
                rechts={meine && meine.length > 0 ? { text: 'Alle', onPress: () => router.push('/profile') } : undefined}
              />
              {meine === null ? (
                <Laden color={color.ink.low} />
              ) : meine.length === 0 ? (
                <Text style={styles.leer}>Noch nichts erstellt. Oben geht's los.</Text>
              ) : (
                <View style={styles.liste}>
                  {meine.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => router.push(`/post/${encodeURIComponent(p.id)}`)}
                      style={({ pressed }) => [styles.meinZeile, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={styles.meinArt}>{ART_LABEL[p.art] ?? 'Beitrag'}</Text>
                      <Text style={styles.meinText} numberOfLines={1}>
                        {p.body || (p.original ? 'Geteilter Beitrag' : ART_LABEL[p.art])}
                      </Text>
                      <View style={styles.meinZahlenReihe}>
                        <Icon name="like" size={11} color={color.ink.low} />
                        <Text style={styles.meinZahlen}>{p.likes}</Text>
                        <Icon name="comment" size={11} color={color.ink.low} />
                        <Text style={styles.meinZahlen}>{p.kommentare}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* --- LAB -------------------------------------------------------------- */}
            <View style={styles.abschnittBlock} onLayout={(e) => (labY.current = e.nativeEvent.layout.y)}>
              <Abschnitt titel="LAB" />
              <Text style={styles.labHinweis}>Einstellen, ausprobieren, Ergebnis teilen.</Text>
              <View style={styles.labRaster}>
                {WERKZEUGE.map((w) => (
                  <Pressable
                    key={w.id}
                    onPress={() => {
                      haptics.light();
                      router.push(`/lab/${w.id}`);
                    }}
                    style={({ pressed }) => [styles.lab, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={[styles.labTag, { color: w.farbe }]}>#{w.hashtag}</Text>
                    <Text style={styles.labTitel}>{w.titel}</Text>
                    <Text style={styles.labKurz} numberOfLines={2}>
                      {w.kurz}
                    </Text>
                  </Pressable>
                ))}
                {BALD.map((b) => (
                  <View key={b.titel} style={[styles.lab, styles.labBald]}>
                    <Text style={[styles.labTag, { color: color.ink.low }]}>#{b.hashtag}</Text>
                    <Text style={[styles.labTitel, { color: color.ink.mid }]}>{b.titel}</Text>
                    <Text style={styles.labKurz}>bald</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {/* --- Lernen ---------------------------------------------------------- */}
            <View style={styles.kacheln}>
              <Kachel
                icon="refresh"
                label="Wiederholen"
                zahl={faellig}
                unter={faellig > 0 ? 'fällig' : 'nichts fällig'}
                ton={faellig > 0 ? color.signal.mastery : undefined}
                onPress={() => router.push('/review')}
              />
              <Kachel
                icon="xp"
                label="Duelle"
                zahl={duelle}
                unter={duelle > 0 ? 'offen' : 'jemanden fordern'}
                ton={duelle > 0 ? color.signal.warn : undefined}
                onPress={() => router.push('/duels')}
              />
            </View>

            {/* 0106: gemeinsam fuer die Schularbeit sammeln. */}
            <Pressable
              onPress={() => {
                haptics.light();
                router.push('/gruppenstapel');
              }}
              style={({ pressed }) => [styles.lab, { width: '100%' }, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.labTitel}>Gruppen-Stapel</Text>
              <Text style={styles.labKurz}>Mit der Klasse Karten für eine Schularbeit sammeln</Text>
            </Pressable>

            <DailyBanner />

            <Abschnitt titel="Kurse" zahl={courses?.length} />

            {/* Suche und Kategorien ueber den Kursen - "fuer die Zukunft
                geruestet": die Pipeline baut zwei Kurse am Tag, und eine
                lange Liste ohne Filter findet man nach ein paar Wochen nicht
                mehr durch. Gefiltert wird hier, ohne Anfrage. */}
            {courses && courses.length > 0 ? (
              <>
                <View style={styles.suche}>
                  <Icon name="search" size={16} color={color.ink.low} />
                  <TextInput
                    value={suche}
                    onChangeText={setSuche}
                    placeholder="Kurse durchsuchen"
                    placeholderTextColor={color.ink.low}
                    style={styles.sucheEingabe}
                    returnKeyType="search"
                  />
                  {suche ? (
                    <Pressable onPress={() => setSuche('')} hitSlop={10} accessibilityLabel="Suche leeren">
                      <Icon name="close" size={14} color={color.ink.low} />
                    </Pressable>
                  ) : null}
                </View>
                {kursKategorien.length > 1 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.reihe}
                    style={styles.bleed}
                  >
                    {[{ id: null, name: 'Alle', emoji: null, accent: null }, ...kursKategorien].map((k) => {
                      const an = kategorie === k.id;
                      const akzent = k.accent ? categoryAccent(k.accent) : color.signal.primary;
                      return (
                        <Pressable
                          key={k.id ?? 'alle'}
                          onPress={() => {
                            haptics.select();
                            setKategorie(k.id);
                          }}
                          style={[styles.kursChip, an && { borderColor: akzent, backgroundColor: color.bgElevated }]}
                        >
                          <Text style={[styles.kursChipText, an && { color: akzent }]}>
                            {k.emoji ? `${k.emoji} ` : ''}
                            {k.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </>
            ) : null}

            {courses === null ? (
              <Laden color={color.ink.low} />
            ) : courses.length === 0 ? (
              <Text style={styles.leer}>{error ?? 'Noch keine Kurse in deiner Sprache freigegeben.'}</Text>
            ) : gefiltert.length === 0 ? (
              <Text style={styles.leer}>
                {suche.trim() ? `Kein Kurs passt zu „${suche.trim()}".` : 'In dieser Kategorie gibt es noch keinen Kurs.'}
              </Text>
            ) : (
              gefiltert.map((c) => {
                const accent = categoryAccent(c.accent);
                const done = c.lessons > 0 ? c.position / c.lessons : 0;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      haptics.light();
                      router.push(`/course/${encodeURIComponent(c.slug)}`);
                    }}
                    style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
                  >
                    <BlueprintVisual seed={c.id} accentHex={c.accent} height={96} />
                    <View style={styles.cardBody}>
                      <View style={styles.cardHead}>
                        <Text style={[styles.category, { color: accent }]}>
                          {c.emoji ?? '◇'}  {c.category}
                        </Text>
                        <View style={styles.difficulty}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <View
                              key={n}
                              style={[styles.diffDot, { backgroundColor: n <= c.difficulty ? color.ink.mid : color.ink.faint }]}
                            />
                          ))}
                        </View>
                      </View>
                      <Text style={styles.title}>{c.title}</Text>
                      <Text style={styles.description} numberOfLines={2}>
                        {c.description}
                      </Text>
                      <View style={styles.progressRow}>
                        <View style={styles.track}>
                          <View style={[styles.fill, { width: `${Math.round(done * 100)}%`, backgroundColor: accent }]} />
                        </View>
                        <Text style={styles.progressText}>
                          {c.completed ? 'abgeschlossen' : c.started ? `${c.position} / ${c.lessons}` : `${c.lessons} Lektionen`}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}

            <Text style={styles.footnote}>
              Neue Kurse baut die Pipeline zweimal am Tag aus Wikipedia-Artikeln – jede Lektion wird gegen den
              Artikel geprüft wie jede Karte im Feed.
            </Text>
          </>
        )}
      </ScrollView>
      {hinweis.zeigen ? (
        <TabHint
          icon="plus"
          titel="Studio"
          text="Erstellen: Beiträge, Umfragen, Quiz, Stapel und das LAB – mit deinen Entwürfen. Lernen: Wiederholung, Duelle, Tagesfrage und Kurse."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
    </GridBackground>
  );
}

function Abschnitt({
  titel,
  zahl,
  rechts,
}: {
  titel: string;
  zahl?: number;
  rechts?: { text: string; onPress: () => void };
}) {
  return (
    <View style={styles.abschnittKopf}>
      <Text style={styles.abschnitt}>
        {titel}
        {zahl ? ` · ${zahl}` : ''}
      </Text>
      {rechts ? (
        <Pressable onPress={rechts.onPress} hitSlop={8}>
          <Text style={styles.abschnittLink}>{rechts.text}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Kachel({
  icon,
  label,
  zahl,
  unter,
  ton,
  onPress,
}: {
  icon: IconName;
  label: string;
  zahl: number;
  unter: string;
  ton?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={({ pressed }) => [styles.kachel, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={styles.kachelKopf}>
        <Icon name={icon} size={18} color={ton ?? color.ink.mid} />
        {zahl > 0 ? <Text style={[styles.kachelZahl, { color: ton ?? color.ink.max }]}>{zahl}</Text> : null}
      </View>
      <Text style={styles.kachelLabel}>{label}</Text>
      <Text style={styles.kachelUnter}>{unter}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.lg },
  pageTitle: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },

  umschalter: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
    ...flaeche(8),
  },
  umschalterTeil: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.pill },
  umschalterAn: { backgroundColor: color.bgElevated },
  umschalterText: { ...type.label, fontSize: 13, color: color.ink.low },
  umschalterTextAn: { color: color.ink.max },

  neuRaster: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  neu: {
    width: '31.8%',
    flexGrow: 1,
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  // Design 2.0: der Haupt-Knopf ist eine der wenigen Bordeaux-Flaechen.
  // Geschliffen (alle vier Ecken) und mit Muster - die einzige Karte hier,
  // die so aussehen darf.
  neuHaupt: ZWEI
    ? { backgroundColor: color.bordeaux, borderTopWidth: 0, overflow: 'hidden', ...facette(10) }
    : { borderColor: color.signal.primary },
  // Design 2.0: Sechseck statt Kreis - Kreise gibt es in 2.0 nicht mehr.
  neuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.bgSunken,
    ...(ZWEI ? { width: 40, height: 40, backgroundColor: '#2A2227', ...sechseckRegel() } : null),
  },
  neuLabel: { ...type.label, fontSize: 14, color: color.ink.high },

  abschnittBlock: { gap: space.sm },
  abschnittKopf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1.2 },
  abschnittLink: { ...type.label, fontSize: 13, color: color.akzent },

  bleed: { marginHorizontal: -space.xl },
  reihe: { paddingHorizontal: space.xl, gap: space.md },
  entwurf: {
    width: 170,
    minHeight: 112,
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  entwurfKopf: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entwurfArt: { ...type.meta, fontSize: 10, color: color.signal.warn, textTransform: 'uppercase', letterSpacing: 1 },
  entwurfText: { ...type.body, fontSize: 14, lineHeight: 19, color: color.ink.high, flex: 1 },
  entwurfWann: { ...type.meta, fontSize: 10, color: color.ink.low },

  leer: { ...type.body, fontSize: 14, color: color.ink.mid },
  liste: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    overflow: 'hidden',
    ...flaeche(10),
  },
  meinZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.ink.faint,
    marginTop: -StyleSheet.hairlineWidth,
  },
  meinArt: { ...type.meta, fontSize: 10, color: color.akzent, width: 58, textTransform: 'uppercase', letterSpacing: 0.8 },
  meinText: { ...type.body, fontSize: 14, color: color.ink.high, flex: 1 },
  meinZahlenReihe: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meinZahlen: { ...type.mono, fontSize: 11, color: color.ink.low, marginRight: 4 },

  labHinweis: { ...type.body, fontSize: 14, color: color.ink.mid, marginTop: -space.xs },
  labRaster: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  lab: {
    width: '48.5%',
    flexGrow: 1,
    minHeight: 104,
    gap: 3,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  labBald: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  labTag: { ...type.meta, fontSize: 10 },
  labTitel: { ...type.label, fontSize: 16, color: color.ink.max },
  labKurz: { ...type.meta, fontSize: 11, lineHeight: 15, color: color.ink.low },

  suche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(8),
  },
  sucheEingabe: {
    flex: 1,
    ...type.body,
    fontSize: 15,
    color: color.ink.max,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  kursChip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  kursChipText: { ...type.label, fontSize: 13, color: color.ink.mid },

  kacheln: { flexDirection: 'row', gap: space.md },
  kachel: {
    flex: 1,
    gap: 2,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  kachelKopf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  kachelZahl: { ...type.mono, fontSize: 18 },
  kachelLabel: { ...type.label, fontSize: 15, color: color.ink.high },
  kachelUnter: { ...type.meta, color: color.ink.low },

  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    overflow: 'hidden',
    ...flaeche(12),
  },
  cardBody: { padding: space.lg, gap: space.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { ...type.meta },
  difficulty: { flexDirection: 'row', gap: 3 },
  diffDot: { width: 5, height: 5, borderRadius: 3 },
  title: { ...type.deck, fontSize: 19, color: color.ink.max },
  description: { ...type.body, fontSize: 14, lineHeight: 21, color: color.ink.mid },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  track: { flex: 1, height: 3, borderRadius: 3, backgroundColor: color.ink.faint },
  fill: { height: 3, borderRadius: 3 },
  progressText: { ...type.meta, color: color.ink.low },
  footnote: { ...type.meta, color: color.ink.low, lineHeight: 17, paddingTop: space.md },
});
