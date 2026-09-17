import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { useNeuladen, useTabNochmal } from '@/components/Neuladen';
import { TabHint, useTabHint } from '@/components/TabHint';
import { CommentSheet } from '@/features/comments/CommentSheet';
import { Aktionen, Kopf, KartenVerweis, PostKarte, zuProfil } from '@/features/posts/PostParts';
import { contentState, setContentState } from '@/lib/contentState';
import { track } from '@/lib/eventBuffer';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { beiWiederOnline } from '@/lib/online';
import { shareCard, shareInvite } from '@/lib/share';
import { api } from '@/lib/supabase';
import type { HomeData, HomeEntry, Post } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';
import { ZWEI, facette, flaeche, goldVerlauf } from '@/theme/design';

/**
 * Home - was die Leute machen, denen du folgst. Nach unten ohne Ende.
 *
 * Absichtlich NICHT der eigene Stand: der steht im Profil. Home zeigt die
 * anderen, und zwar so, dass man selbst mitmachen will - deshalb steht das
 * Schreibfeld ganz oben und jeder Beitrag hat Like, Kommentar, Repost und
 * Teilen.
 *
 * Zwei Arten von Eintraegen:
 *   - Beitraege und Karten-Empfehlungen: gross, mit Knoepfen.
 *   - Aktivitaeten (Duell gewonnen, Kurs abgeschlossen, folgt jetzt): eine
 *     Zeile. Einen Like auf "folgt jetzt" braucht niemand.
 *
 * Nachgeladen wird seitenweise ueber die Zeit des letzten Eintrags
 * (get_home, Migration 0077). Was darin sichtbar ist - und warum Duelle nur
 * den Sieger zeigen -, steht im Kopf der Migration.
 */

const SEITE = 25;

/**
 * Nach so langer Abwesenheit laedt Home beim Zurueckkommen still nach.
 *
 * Nicht bei jedem Tabwechsel: wer kurz in den Feed schaut und zurueckkommt,
 * soll dieselbe Liste an derselben Stelle vorfinden, nicht eine, die sich
 * unter dem Daumen umsortiert.
 */
const VERALTET_MS = 30_000;

const schluessel = (e: HomeEntry) => `${e.art}:${e.wer.handle}:${e.at}`;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const hinweis = useTabHint('home');
  const [daten, setDaten] = useState<HomeData | null>(null);
  const [eintraege, setEintraege] = useState<HomeEntry[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [mehr, setMehr] = useState(true);
  const [nachLaedt, setNachLaedt] = useState(false);
  const nachladen = useRef(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [gefolgt, setGefolgt] = useState<Set<string>>(new Set());
  const [kommentare, setKommentare] = useState<{ id: string; titel: string } | null>(null);
  const [ungelesen, setUngelesen] = useState(0);
  const liste = useRef<FlatList<HomeEntry>>(null);
  const geladenAm = useRef(0);
  const scrollOben = useRef(0);

  // Following oder Explore (0084). Explore wird erst beim ersten Umschalten
  // geladen - die meisten schauen zuerst, was ihre Leute machen.
  const [ansicht, setAnsicht] = useState<'following' | 'explore'>('following');
  const [explore, setExplore] = useState<Post[] | null>(null);
  const [exploreMehr, setExploreMehr] = useState(true);

  // Bei jedem Zurueckkommen neu zaehlen: wer die Glocke geleert hat, soll
  // den Punkt nicht mehr sehen, und wer lange im Feed war, den neuen schon.
  useFocusEffect(
    useCallback(() => {
      void api.unreadNotifications().then(setUngelesen).catch(() => undefined);
      if (geladenAm.current && Date.now() - geladenAm.current > VERALTET_MS) void stillLaden.current();
    }, []),
  );

  const zeige = useCallback((text: string) => {
    if (!text) return;
    setNotiz(text);
    setTimeout(() => setNotiz(null), 3500);
  }, []);

  const laden = useCallback(async () => {
    geladenAm.current = Date.now();
    try {
      const d = await api.home(SEITE);
      setDaten(d);
      setEintraege(d.eintraege);
      setMehr(d.eintraege.length >= SEITE);
      setFehler(null);
    } catch (e) {
      setFehler(fehlerText(e, 'Home nicht ladbar'));
      setDaten((alt) => alt ?? { eintraege: [], leute: [], folge_ich: 0, vorschlaege: [] });
    }
  }, []);

  /**
   * Neu laden, ohne die Stelle zu verlieren.
   *
   * Steht man oben, wird die Liste ersetzt. Ist man weiter unten, kommen nur
   * die neuen Eintraege vorn dazu - Ersetzen wuerde alles Nachgeladene
   * wegwerfen, und die Liste spraenge zurueck auf Seite eins.
   *
   * In einer Ref, weil der Fokus-Effekt oben vor dieser Stelle steht.
   */
  const stillLaden = useRef(async () => {
    geladenAm.current = Date.now();
    try {
      const d = await api.home(SEITE);
      setDaten(d);
      if (scrollOben.current < 400) {
        setEintraege(d.eintraege);
        setMehr(d.eintraege.length >= SEITE);
      } else {
        setEintraege((alt) => {
          const schon = new Set(alt.map(schluessel));
          const neueste = alt[0]?.at ?? '';
          return [...d.eintraege.filter((e) => !schon.has(schluessel(e)) && e.at > neueste), ...alt];
        });
      }
      setFehler(null);
    } catch {
      // Still heisst auch: ein Fehler hier stoert niemanden. Die alte Liste bleibt.
    }
  });

  const weiter = useCallback(async () => {
    if (nachladen.current || !mehr || eintraege.length === 0) return;
    nachladen.current = true;
    setNachLaedt(true);
    try {
      const d = await api.home(SEITE, eintraege[eintraege.length - 1].at);
      setEintraege((alt) => {
        const schon = new Set(alt.map(schluessel));
        return [...alt, ...d.eintraege.filter((e) => !schon.has(schluessel(e)))];
      });
      setMehr(d.eintraege.length >= SEITE);
    } catch {
      // Still: beim naechsten Erreichen des Endes wird es erneut versucht.
    } finally {
      nachladen.current = false;
      setNachLaedt(false);
    }
  }, [mehr, eintraege]);

  /**
   * Explore laden. `neu`: von vorn (Umschalten, Neuladen). Sonst die naechste
   * Seite - der Server bekommt die schon gezeigten IDs, weil Explore nach
   * Punkten sortiert und nicht nach Zeit.
   */
  const ladenExplore = useCallback(async (neu: boolean) => {
    if (nachladen.current) return;
    nachladen.current = true;
    if (!neu) setNachLaedt(true);
    try {
      const schon = neu ? [] : (explore ?? []).map((p) => p.id);
      const b = await api.explore(20, schon);
      setExplore((alt) => (neu ? b : [...(alt ?? []), ...b.filter((p) => !schon.includes(p.id))]));
      setExploreMehr(b.length >= 20);
      setFehler(null);
    } catch (e) {
      setExplore((alt) => alt ?? []);
      setFehler(fehlerText(e, 'Explore nicht ladbar'));
    } finally {
      nachladen.current = false;
      setNachLaedt(false);
    }
  }, [explore]);

  // Wo der Umschalter in der Liste steht, und ob er gerade fest oben haengt.
  const umschalterY = useRef(0);
  const [festOben, setFestOben] = useState(false);
  const festObenRef = useRef(false);
  const schwelle = () => Math.max(0, umschalterY.current - insets.top - space.sm);

  const umschalten = (a: 'following' | 'explore') => {
    if (a === ansicht) return;
    haptics.select();
    setAnsicht(a);
    // War man schon unter dem Umschalter, beginnt die andere Liste direkt
    // darunter - nicht wieder beim Schreibfeld ganz oben.
    if (festObenRef.current) liste.current?.scrollToOffset({ offset: schwelle(), animated: false });
    if (a === 'explore' && explore === null) void ladenExplore(true);
  };

  // Explore als Home-Eintraege, damit dieselbe Liste und dieselbe Beitragskarte
  // beides zeigen.
  const exploreEintraege = useMemo<HomeEntry[]>(
    () => (explore ?? []).map((p) => ({ art: 'post', at: p.at, wer: p.wer, was: p })),
    [explore],
  );

  useEffect(() => {
    void laden();
  }, [laden]);

  useEffect(() => {
    if (!fehler) return;
    return beiWiederOnline(() => void laden());
  }, [fehler, laden]);

  // Neu geladen wird, was gerade zu sehen ist.
  const neuladen = useNeuladen(async () => {
    if (ansicht === 'explore') {
      await ladenExplore(true);
      return;
    }
    await laden();
    setGefolgt(new Set());
  }, insets.top + space.sm);

  // Zweiter Tipp auf "Home": nach oben, neu laden.
  useTabNochmal(() => {
    liste.current?.scrollToOffset({ offset: 0, animated: true });
    void neuladen.ausloesen();
  });

  const einladen = useCallback(async () => {
    haptics.light();
    try {
      const mein = await api.myInvite();
      if (!mein?.code) throw new Error('kein Code');
      const res = await shareInvite({ code: mein.code });
      if (res === 'copied') zeige('Link kopiert. Wer darüber startet, folgt dir automatisch.');
      if (res === 'failed') zeige('Teilen ging nicht.');
    } catch (e) {
      zeige(fehlerText(e, 'Einladen geht gerade nicht.'));
    }
  }, [zeige]);

  const folgen = useCallback(async (id: string) => {
    haptics.select();
    setGefolgt((s) => new Set(s).add(id));
    try {
      await api.setFollowing(id, true, { quelle: 'home' });
    } catch {
      setGefolgt((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }, []);

  if (!daten) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  const umschalterLeiste = (
    <View style={styles.umschalter}>
      {(['following', 'explore'] as const).map((a) => (
        <Pressable
          key={a}
          onPress={() => umschalten(a)}
          style={[styles.umschalterTeil, ansicht === a && styles.umschalterAn]}
          accessibilityRole="tab"
          accessibilityState={{ selected: ansicht === a }}
        >
          <Text style={[styles.umschalterText, ansicht === a && styles.umschalterTextAn]}>
            {a === 'following' ? 'Following' : 'Explore'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const kopf = (
    <View style={styles.kopfBereich}>
      <View style={styles.titelZeile}>
        <Text style={styles.titel}>Home</Text>
        <View style={styles.kopfKnoepfe}>
          <Pressable onPress={() => void einladen()} hitSlop={8} style={styles.einladen}>
            <Icon name="plus" size={14} color={color.akzent} />
            <Text style={styles.einladenText}>Einladen</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              haptics.light();
              setUngelesen(0);
              router.push('/notifications');
            }}
            hitSlop={8}
            style={styles.glocke}
            accessibilityLabel={ungelesen > 0 ? `Benachrichtigungen, ${ungelesen} neu` : 'Benachrichtigungen'}
          >
            <Icon name="bell" size={22} color={color.ink.high} />
            {ungelesen > 0 ? (
              <View style={styles.glockePunkt}>
                <Text style={styles.glockeZahl}>{ungelesen > 9 ? '9+' : ungelesen}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* Das Schreibfeld - der wichtigste Knopf auf dem Bildschirm. */}
      <Pressable
        onPress={() => {
          haptics.light();
          router.push('/compose');
        }}
        style={({ pressed }) => [styles.schreiben, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.schreibenText}>Was hast du heute gelernt?</Text>
        <View style={styles.schreibenKnopf}>
          <Text style={styles.schreibenKnopfText}>Posten</Text>
        </View>
      </Pressable>

      {ansicht === 'following' && daten.leute.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.leute}
          style={styles.bleed}
        >
          {daten.leute.map((p) => (
            <Pressable key={p.handle} onPress={() => zuProfil(p.handle)} style={styles.leutePerson}>
              <Avatar seed={p.avatar_seed} path={p.avatar_path} size={52} ring={color.signal.primary} />
              <Text style={styles.leuteName} numberOfLines={1}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* --- Vorschlaege: waagrecht, wie bei Instagram ------------------------- */}
      {ansicht === 'following' && daten.vorschlaege.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.abschnitt}>Vorschläge für dich</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.vorschlaege}
            style={styles.bleed}
            decelerationRate="fast"
          >
            {daten.vorschlaege.map((v) => {
              const an = gefolgt.has(v.id);
              return (
                <View key={v.id} style={styles.vorschlag}>
                  <Pressable onPress={() => zuProfil(v.handle)} style={styles.vorschlagWer}>
                    <Avatar seed={v.avatar_seed} path={v.avatar_path} size={56} />
                    <Text style={styles.vorschlagName} numberOfLines={1}>
                      {v.name}
                    </Text>
                    <Text style={styles.vorschlagGrund} numberOfLines={1}>
                      {v.grund ?? `${v.follower_count} Follower`}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => (an ? undefined : void folgen(v.id))}
                    style={[styles.folgenKnopf, an && styles.folgenKnopfAn]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.folgenText, an && styles.folgenTextAn]}>
                      {an ? 'Folgst du' : 'Folgen'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Following | Explore (0084). Direkt ueber den Beitraegen, nicht unter
          dem Titel: der Schalter bestimmt, was DARUNTER steht - Schreibfeld,
          Leute und Vorschlaege gehoeren nicht dazu. Die Position wird
          gemessen: ist er beim Scrollen oben hinausgelaufen, steht eine
          Kopie fest am oberen Rand (siehe unten). */}
      <View
        onLayout={(e) => {
          umschalterY.current = insets.top + space.xl + e.nativeEvent.layout.y;
        }}
      >
        {umschalterLeiste}
      </View>

      {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}
      {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
    </View>
  );

  return (
    <GridBackground>
      <FlatList
        ref={liste}
        data={ansicht === 'following' ? eintraege : exploreEintraege}
        keyExtractor={schluessel}
        renderItem={({ item }) => (
          <Eintrag e={item} onNotiz={zeige} onKommentare={(id, titel) => setKommentare({ id, titel })} />
        )}
        ListHeaderComponent={kopf}
        ListEmptyComponent={
          ansicht === 'explore' ? (
            explore === null ? (
              <ActivityIndicator color={color.ink.low} style={{ marginVertical: space.xl }} />
            ) : (
              <Text style={styles.leer}>
                In Explore ist gerade nichts – hier landen Beiträge von Leuten, denen du noch nicht folgst.
              </Text>
            )
          ) : (
            <Text style={styles.leer}>
              {daten.folge_ich === 0
                ? 'Du folgst noch niemandem. Folge jemandem aus den Vorschlägen – oder schau in Explore.'
                : 'Hier ist noch nichts. Mach den Anfang: Was du postest oder im Feed repostest, sehen deine Follower hier.'}
            </Text>
          )
        }
        ListFooterComponent={
          (ansicht === 'following' ? eintraege.length : exploreEintraege.length) === 0 ? null : nachLaedt ? (
            <ActivityIndicator color={color.ink.low} style={{ marginVertical: space.lg }} />
          ) : ansicht === 'following' && !mehr ? (
            <Text style={styles.ende}>Das ist alles von deinen Leuten.</Text>
          ) : ansicht === 'explore' && !exploreMehr ? (
            <Text style={styles.ende}>Mehr gibt es in Explore gerade nicht.</Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        onEndReached={() => {
          if (ansicht === 'following') void weiter();
          else if (exploreMehr && (explore?.length ?? 0) > 0) void ladenExplore(false);
        }}
        onEndReachedThreshold={0.6}
        contentContainerStyle={[
          styles.body,
          {
            paddingTop: insets.top + space.xl,
            // Die Tab-Leiste schwebt ueber dem Inhalt.
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollOben.current = y;
          neuladen.beiScroll(y);
          const fest = umschalterY.current > 0 && y > schwelle();
          if (fest !== festObenRef.current) {
            festObenRef.current = fest;
            setFestOben(fest);
          }
        }}
        scrollEventThrottle={16}
        {...neuladen.listenProps}
      />
      {neuladen.anzeige}

      {/* Following | Explore bleibt oben, sobald er aus dem Bild gescrollt ist. */}
      {festOben ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(120)}
          style={[styles.festOben, { paddingTop: insets.top + space.sm }]}
        >
          {umschalterLeiste}
        </Animated.View>
      ) : null}

      {kommentare ? (
        <CommentSheet
          contentId={kommentare.id}
          cardTitle={kommentare.titel}
          visible
          onClose={() => setKommentare(null)}
        />
      ) : null}

      {hinweis.zeigen ? (
        <TabHint
          icon="comment"
          titel="Home: deine Leute"
          text="Hier stehen die Beiträge und Empfehlungen der Leute, denen du folgst - mit Like, Kommentar, Repost und Teilen. Was du postest, sehen deine Follower hier."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
    </GridBackground>
  );
}

/** Eine Karten-Empfehlung mit Knoepfen. Like und Repost wirken auf die Karte. */
function KartenEmpfehlung({
  e,
  onNotiz,
  onKommentare,
}: {
  e: Extract<HomeEntry, { art: 'repost' }>;
  onNotiz: (t: string) => void;
  onKommentare: (id: string, titel: string) => void;
}) {
  const k = e.was;
  const [ichLike, setIchLike] = useState(k.ich_like);
  const [likes, setLikes] = useState(k.likes);
  const [ichRepost, setIchRepost] = useState(k.ich_repost);

  const like = () => {
    const next = !ichLike;
    setIchLike(next);
    setLikes((l) => Math.max(0, l + (next ? 1 : -1)));
    if (next) haptics.medium();
    else haptics.light();
    // Derselbe Weg wie im Feed (ContentCard.applyLike), damit das Herz dort
    // stimmt, wenn man die Karte gleich danach oeffnet.
    if (contentState(k.content_id).liked !== next) {
      setContentState(k.content_id, {
        liked: next,
        delta: contentState(k.content_id).delta + (next ? 1 : -1),
      });
    }
    track(k.content_id, next ? 'like' : 'unlike');
  };

  const repost = async () => {
    const next = !ichRepost;
    setIchRepost(next);
    haptics.light();
    try {
      await api.setRepost(k.content_id, next);
      setContentState(k.content_id, { reposted: next });
      if (next) onNotiz('Empfohlen - deine Follower sehen es jetzt.');
    } catch (err) {
      setIchRepost(!next);
      const msg = err instanceof Error ? err.message : '';
      onNotiz(
        /not read/i.test(msg)
          ? 'Empfehlen geht erst, wenn du die Karte selbst angesehen hast - tipp sie an.'
          : fehlerText(err, 'Empfehlen ging nicht.'),
      );
    }
  };

  const teilen = async () => {
    const r = await shareCard({ contentId: k.content_id, title: k.title, categorySlug: k.category });
    if (r === 'copied') onNotiz('Link kopiert.');
  };

  return (
    <View style={styles.karte}>
      <Kopf wer={e.wer} verb="empfiehlt" at={e.at} />
      {k.comment ? <Text style={styles.zitat}>„{k.comment}"</Text> : null}
      <KartenVerweis karte={k} von={e.wer.handle} />
      <Aktionen
        likes={likes}
        ichLike={ichLike}
        kommentare={k.kommentare}
        repostAn={ichRepost}
        onLike={like}
        onKommentar={() => onKommentare(k.content_id, k.title)}
        onRepost={() => void repost()}
        onTeilen={() => void teilen()}
      />
    </View>
  );
}

function Eintrag({
  e,
  onNotiz,
  onKommentare,
}: {
  e: HomeEntry;
  onNotiz: (t: string) => void;
  onKommentare: (id: string, titel: string) => void;
}) {
  switch (e.art) {
    case 'post':
      return <PostKarte post={e.was} onNotiz={onNotiz} />;
    case 'repost':
      return <KartenEmpfehlung e={e} onNotiz={onNotiz} onKommentare={onKommentare} />;
    case 'frage':
      return (
        <View style={styles.karte}>
          <Kopf wer={e.wer} verb="kommentiert eine Karte" at={e.at} />
          <Text style={styles.zitat}>„{e.was.body}"</Text>
          <KartenVerweis karte={{ content_id: e.was.content_id, title: e.was.title, deck: null, category: '' }} />
        </View>
      );
    case 'duell':
      return (
        <Zeile wer={e.wer} at={e.at} icon="xp" text={`hat ein Duell gewonnen · ${e.was.punkte} : ${e.was.gegner_punkte}`} />
      );
    case 'kurs':
      return (
        <Zeile
          wer={e.wer}
          at={e.at}
          icon="lesson"
          text={`hat „${e.was.title}" abgeschlossen`}
          onPress={() => router.push(`/course/${encodeURIComponent(e.was.slug)}`)}
        />
      );
    case 'abzeichen':
      return (
        <Zeile wer={e.wer} at={e.at} icon="mastery" text={`hat ein Abzeichen: ${e.was.emoji ?? ''} ${e.was.title}`} />
      );
    case 'folgt':
      return (
        <Zeile
          wer={e.wer}
          at={e.at}
          icon="profile"
          text={e.was.bin_ich ? 'folgt dir jetzt' : `folgt jetzt ${e.was.name}`}
          onPress={e.was.bin_ich ? undefined : () => zuProfil(e.was.handle)}
        />
      );
    default:
      return null;
  }
}

/** Eine Aktivitaet in einer Zeile - ohne Knoepfe. */
function Zeile({
  wer,
  at,
  icon,
  text,
  onPress,
}: {
  wer: HomeEntry['wer'];
  at: string;
  icon: 'xp' | 'lesson' | 'mastery' | 'profile';
  text: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress ?? (() => zuProfil(wer.handle))}
      style={({ pressed }) => [styles.zeile, pressed && { opacity: 0.8 }]}
    >
      <Avatar seed={wer.avatar_seed} path={wer.avatar_path} size={28} />
      <Text style={styles.zeileText} numberOfLines={2}>
        <Text style={styles.zeileName}>{wer.name}</Text> {text}
      </Text>
      <Icon name={icon} size={14} color={color.ink.low} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.xl },

  kopfBereich: { gap: space.lg, paddingBottom: space.lg },

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
  festOben: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
    zIndex: 10,
    backgroundColor: ZWEI ? 'rgba(15, 13, 16, 0.9)' : 'rgba(11, 12, 14, 0.9)',
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(18px)' } as object)
      : null),
  },
  titelZeile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titel: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  einladen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    ...flaeche(6),
  },
  einladenText: { ...type.meta, color: color.akzent },
  kopfKnoepfe: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  glocke: { padding: 4 },
  glockePunkt: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.signal.error,
  },
  glockeZahl: { ...type.meta, fontSize: 10, color: '#fff' },

  schreiben: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  schreibenText: { ...type.body, fontSize: 15, color: color.ink.low, flex: 1 },
  schreibenKnopf: {
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: color.signal.primary,
    ...facette(6),
    ...goldVerlauf(),
  },
  schreibenKnopfText: { ...type.label, fontSize: 13, color: color.bg },

  // Waagrechte Leisten laufen bis an den Bildschirmrand.
  bleed: { marginHorizontal: -space.xl },
  leute: { paddingHorizontal: space.xl, gap: space.lg },
  leutePerson: { width: 60, alignItems: 'center', gap: 6 },
  leuteName: { ...type.meta, fontSize: 10, color: color.ink.mid, maxWidth: 60 },

  abschnitt: { ...type.meta, color: color.ink.low },
  vorschlaege: { paddingHorizontal: space.xl, gap: space.md },
  vorschlag: {
    width: 140,
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  vorschlagWer: { alignItems: 'center', gap: 4, width: '100%' },
  vorschlagName: { ...type.body, fontSize: 14, color: color.ink.high, maxWidth: '100%' },
  vorschlagGrund: { ...type.meta, fontSize: 10, color: color.ink.low, maxWidth: '100%' },
  folgenKnopf: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: radius.pill,
    // Design 2.0: zweitrangig, also Bordeaux statt Gold - Gold hat auf Home
    // nur "Posten".
    backgroundColor: ZWEI ? color.bordeaux : color.signal.primary,
  },
  folgenKnopfAn: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  folgenText: { ...type.label, fontSize: 13, color: ZWEI ? color.ink.max : color.bg },
  folgenTextAn: { color: color.ink.mid },

  notiz: { ...type.meta, color: color.akzent },
  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
  leer: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid },
  ende: { ...type.meta, color: color.ink.low, textAlign: 'center', marginVertical: space.xl },

  karte: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(12),
  },
  zitat: { ...type.body, fontSize: 15, lineHeight: 21, color: color.akzent, fontStyle: 'italic' },

  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  zeileText: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },
  zeileName: { color: color.ink.high, fontWeight: '600' },
});
