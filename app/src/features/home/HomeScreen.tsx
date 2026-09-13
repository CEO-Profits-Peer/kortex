import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
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
import type { HomeData, HomeEntry } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

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

const schluessel = (e: HomeEntry) => `${e.art}:${e.wer.handle}:${e.at}`;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const hinweis = useTabHint('home');
  const [daten, setDaten] = useState<HomeData | null>(null);
  const [eintraege, setEintraege] = useState<HomeEntry[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [mehr, setMehr] = useState(true);
  const [nachLaedt, setNachLaedt] = useState(false);
  const nachladen = useRef(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [gefolgt, setGefolgt] = useState<Set<string>>(new Set());
  const [kommentare, setKommentare] = useState<{ id: string; titel: string } | null>(null);

  const zeige = useCallback((text: string) => {
    if (!text) return;
    setNotiz(text);
    setTimeout(() => setNotiz(null), 3500);
  }, []);

  const laden = useCallback(async () => {
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

  useEffect(() => {
    void laden();
  }, [laden]);

  useEffect(() => {
    if (!fehler) return;
    return beiWiederOnline(() => void laden());
  }, [fehler, laden]);

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
      await api.setFollowing(id, true);
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

  const kopf = (
    <View style={styles.kopfBereich}>
      <View style={styles.titelZeile}>
        <Text style={styles.titel}>Home</Text>
        <Pressable onPress={() => void einladen()} hitSlop={8} style={styles.einladen}>
          <Icon name="plus" size={14} color={color.signal.primary} />
          <Text style={styles.einladenText}>Einladen</Text>
        </Pressable>
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

      {daten.leute.length > 0 ? (
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
      {daten.vorschlaege.length > 0 ? (
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

      {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}
      {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
    </View>
  );

  return (
    <GridBackground>
      <FlatList
        data={eintraege}
        keyExtractor={schluessel}
        renderItem={({ item }) => (
          <Eintrag e={item} onNotiz={zeige} onKommentare={(id, titel) => setKommentare({ id, titel })} />
        )}
        ListHeaderComponent={kopf}
        ListEmptyComponent={
          <Text style={styles.leer}>
            {daten.folge_ich === 0
              ? 'Du folgst noch niemandem. Folge jemandem aus den Vorschlägen - oder schreib den ersten Beitrag selbst.'
              : 'Hier ist noch nichts. Mach den Anfang: Was du postest oder im Feed repostest, sehen deine Follower hier.'}
          </Text>
        }
        ListFooterComponent={
          eintraege.length === 0 ? null : nachLaedt ? (
            <ActivityIndicator color={color.ink.low} style={{ marginVertical: space.lg }} />
          ) : !mehr ? (
            <Text style={styles.ende}>Das ist alles von deinen Leuten.</Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        onEndReached={() => void weiter()}
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
        refreshControl={
          <RefreshControl
            refreshing={laedt}
            onRefresh={async () => {
              setLaedt(true);
              await laden();
              setGefolgt(new Set());
              setLaedt(false);
            }}
            tintColor={color.ink.low}
          />
        }
      />

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
  },
  einladenText: { ...type.meta, color: color.signal.primary },

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
  },
  schreibenText: { ...type.body, fontSize: 15, color: color.ink.low, flex: 1 },
  schreibenKnopf: {
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: color.signal.primary,
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
  },
  vorschlagWer: { alignItems: 'center', gap: 4, width: '100%' },
  vorschlagName: { ...type.body, fontSize: 14, color: color.ink.high, maxWidth: '100%' },
  vorschlagGrund: { ...type.meta, fontSize: 10, color: color.ink.low, maxWidth: '100%' },
  folgenKnopf: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: color.signal.primary,
  },
  folgenKnopfAn: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  folgenText: { ...type.label, fontSize: 13, color: color.bg },
  folgenTextAn: { color: color.ink.mid },

  notiz: { ...type.meta, color: color.signal.primary },
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
  },
  zitat: { ...type.body, fontSize: 15, lineHeight: 21, color: color.signal.primary, fontStyle: 'italic' },

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
