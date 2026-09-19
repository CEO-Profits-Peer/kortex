import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ErwaehnungsText, useErwaehnung } from '@/components/Erwaehnungen';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PostKarte, name, wann, zuProfil } from '@/features/posts/PostParts';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { sharePost } from '@/lib/share';
import { api } from '@/lib/supabase';
import type { HomePerson, PostComment, PostDetail } from '@/lib/types.db';
import { proMeldung } from '@/lib/pro';
import { zeigeProSperre } from '@/components/ProSperre';
import { flaeche, goldVerlauf, sechseckRegel } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Ein Beitrag mit seinen Kommentaren.
 *
 * Kein Blatt von unten wie bei Karten (CommentSheet), sondern eine eigene
 * Seite: ein Beitrag hat eine Adresse, die man teilen kann, und wer ueber
 * einen geteilten Link kommt, muss auf etwas Ganzem landen - nicht auf einem
 * Home mit einem aufgeklappten Blatt darueber.
 *
 * Sichtbar fuer: Autor, Follower, und wer jemandem folgt, der ihn repostet
 * hat (post_sichtbar, 0077). Alle anderen sehen, wessen Beitrag es ist, und
 * einen Weg zu dessen Profil.
 *
 * Kommentare (0080): Like, Antworten, Teilen - wie Beitraege. Antworten
 * bleiben eine Ebene tief: wer auf eine Antwort antwortet, schreibt in
 * denselben Faden, mit @Name davor. Eine zweite Ebene waere auf einem
 * Handybildschirm eine Treppe, die nach drei Stufen aus dem Bild laeuft.
 */

type AntwortZiel = { faden: string; an: HomePerson; aufAntwort: boolean };

export function PostScreen({ id, kommentarId }: { id: string; kommentarId?: string }) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [d, setD] = useState<PostDetail | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [antwortAn, setAntwortAn] = useState<AntwortZiel | null>(null);
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [menue, setMenue] = useState(false);
  const [hervor, setHervor] = useState<string | null>(kommentarId ?? null);
  const erwaehnung = useErwaehnung(text, setText);

  const scroll = useRef<ScrollView>(null);
  const eingabe = useRef<TextInput>(null);
  // Wo die Faeden und Antworten stehen - fuer den Sprung zu einem geteilten
  // Kommentar. Antworten messen relativ zu ihrem Faden, deshalb beides.
  const fadenY = useRef<Record<string, number>>({});
  const antwortY = useRef<Record<string, { faden: string; y: number }>>({});
  const gesprungen = useRef(false);

  const laden = useCallback(async () => {
    try {
      setD(await api.postDetail(id));
      setFehler(null);
    } catch (e) {
      setFehler(fehlerText(e, 'Beitrag nicht ladbar'));
    }
  }, [id]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Die Hervorhebung verblasst - sie soll zeigen, wo, nicht dauerhaft markieren.
  useEffect(() => {
    if (!hervor) return;
    const t = setTimeout(() => setHervor(null), 2600);
    return () => clearTimeout(t);
  }, [hervor]);

  const zeige = (t: string) => {
    setNotiz(t || null);
    if (t) setTimeout(() => setNotiz((n) => (n === t ? null : n)), 3500);
  };

  const springen = useCallback(() => {
    if (!kommentarId || gesprungen.current) return;
    const a = antwortY.current[kommentarId];
    const y = a ? (fadenY.current[a.faden] ?? NaN) + a.y : fadenY.current[kommentarId];
    if (y === undefined || Number.isNaN(y)) return;
    gesprungen.current = true;
    scroll.current?.scrollTo({ y: Math.max(0, y - 90), animated: true });
  }, [kommentarId]);

  const senden = async () => {
    const body = text.trim();
    if (body.length < 2 || busy) return;
    setBusy(true);
    setNotiz(null);
    try {
      const r = await api.addPostComment(id, body, antwortAn?.faden);
      if (r.status === 'blocked') {
        feedback.wrong();
        setNotiz(r.reason ?? 'Der Kommentar wurde nicht freigegeben.');
      } else {
        feedback.correct();
        setText('');
        setAntwortAn(null);
        await laden();
      }
    } catch (e) {
      setNotiz(fehlerText(e, 'Hat nicht geklappt.'));
    } finally {
      setBusy(false);
    }
  };

  const antworten = (faden: PostComment, auf: PostComment) => {
    haptics.light();
    const aufAntwort = faden.id !== auf.id;
    setAntwortAn({ faden: faden.id, an: auf.wer, aufAntwort });
    // Auf eine Antwort: @Name davor, damit klar ist, wem - der Faden allein
    // sagt es nicht mehr.
    if (aufAntwort && !auf.wer.ich) {
      const marke = `@${auf.wer.handle} `;
      setText((t) => (t.startsWith(marke) ? t : marke + t));
    }
    eingabe.current?.focus();
  };

  const kommentarMelden = async (cid: string) => {
    haptics.warning();
    try {
      await api.reportPostComment(cid);
      zeige('Gemeldet. Danke.');
      await laden();
    } catch {
      zeige('Melden hat nicht geklappt.');
    }
  };

  const kommentarLoeschen = async (cid: string) => {
    haptics.light();
    try {
      await api.deletePostComment(cid);
      await laden();
    } catch {
      zeige('Löschen hat nicht geklappt.');
    }
  };

  const kommentarTeilen = async (k: PostComment) => {
    const r = await sharePost({ postId: id, text: `${k.wer.name}: ${k.body}`, kommentarId: k.id });
    if (r === 'copied') zeige('Link zum Kommentar kopiert.');
    if (r === 'failed') zeige('Teilen ging nicht.');
  };

  const beitragMelden = async () => {
    haptics.warning();
    try {
      await api.reportPost(id);
      zeige('Gemeldet. Danke - drei Meldungen, und der Beitrag ist weg.');
      setMenue(false);
    } catch {
      zeige('Melden hat nicht geklappt.');
    }
  };

  const anpinnen = async (an: boolean) => {
    haptics.select();
    try {
      await api.postAnpinnen(id, an);
      setD((alt) => (alt && !alt.gesperrt ? { ...alt, post: { ...alt.post, angepinnt: an } } : alt));
      zeige(an ? 'Oben in deinem Profil angepinnt.' : 'Gelöst.');
    } catch (e) {
      const angebot = proMeldung(e);
      if (angebot) zeigeProSperre(angebot);
      else zeige(fehlerText(e, 'Anpinnen ging nicht.'));
    }
  };

  const beitragLoeschen = async () => {
    haptics.light();
    try {
      await api.deletePost(id);
      router.back();
    } catch {
      zeige('Löschen hat nicht geklappt.');
    }
  };

  if (!d) {
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Beitrag" titleInBarOnly />
        </View>
        <View style={styles.center}>
          {fehler ? <Text style={styles.fehler}>{fehler}</Text> : <Laden color={color.signal.primary} />}
        </View>
      </GridBackground>
    );
  }

  if (d.gesperrt) {
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Beitrag" titleInBarOnly />
        </View>
        <View style={styles.gesperrt}>
          <Avatar seed={d.wer.avatar_seed} path={d.wer.avatar_path} size={64} />
          <Text style={styles.gesperrtText}>
            Diesen Beitrag von {d.wer.name} sehen nur Leute, die {d.wer.name} folgen.
          </Text>
          <Button label="Zum Profil" onPress={() => zuProfil(d.wer.handle)} />
        </View>
      </GridBackground>
    );
  }

  const post = d.post;

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Beitrag" titleInBarOnly scrollY={scrollY} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={[styles.body, { paddingBottom: space.xl }]}
          onScroll={(e) => {
            scrollY.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PostKarte post={post} imDetail onNotiz={zeige} />

          <View style={styles.menueZeile}>
            {post.ist_meins ? (
              <View style={styles.menueEigen}>
                <Pressable onPress={() => void anpinnen(!post.angepinnt)} hitSlop={8}>
                  <Text style={styles.menueText}>{post.angepinnt ? 'Lösen' : 'Anpinnen'}</Text>
                </Pressable>
                <Pressable onPress={() => void beitragLoeschen()} hitSlop={8}>
                  <Text style={styles.menueText}>Löschen</Text>
                </Pressable>
              </View>
            ) : menue ? (
              <Pressable onPress={() => void beitragMelden()} hitSlop={8}>
                <Text style={[styles.menueText, { color: color.signal.error }]}>Wirklich melden</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setMenue(true)} hitSlop={8}>
                <Text style={styles.menueText}>Melden</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.abschnitt}>
            {d.kommentare.length === 0 ? 'Noch keine Kommentare' : 'Kommentare'}
          </Text>

          {d.kommentare.map((k) => (
            <View
              key={k.id}
              style={styles.thread}
              onLayout={(e) => {
                fadenY.current[k.id] = e.nativeEvent.layout.y;
                springen();
              }}
            >
              <Kommentar
                k={k}
                hervorgehoben={hervor === k.id}
                onAntworten={() => antworten(k, k)}
                onTeilen={() => void kommentarTeilen(k)}
                onMelden={kommentarMelden}
                onLoeschen={kommentarLoeschen}
                onFehler={zeige}
              />
              {k.antworten.map((a) => (
                <View
                  key={a.id}
                  onLayout={(e) => {
                    antwortY.current[a.id] = { faden: k.id, y: e.nativeEvent.layout.y };
                    springen();
                  }}
                >
                  <Kommentar
                    k={a}
                    eingerueckt
                    hervorgehoben={hervor === a.id}
                    onAntworten={() => antworten(k, a)}
                    onTeilen={() => void kommentarTeilen(a)}
                    onMelden={kommentarMelden}
                    onLoeschen={kommentarLoeschen}
                    onFehler={zeige}
                  />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>

        {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}

        <View style={[styles.eingabeBereich, { paddingBottom: insets.bottom + space.md }]}>
          {antwortAn ? (
            <View style={styles.antwortAn}>
              <Text style={styles.antwortAnText} numberOfLines={1}>
                Antwort an {name(antwortAn.an)}
              </Text>
              <Pressable
                onPress={() => {
                  if (antwortAn.aufAntwort) {
                    const marke = `@${antwortAn.an.handle} `;
                    setText((t) => (t.startsWith(marke) ? t.slice(marke.length) : t));
                  }
                  setAntwortAn(null);
                }}
                hitSlop={8}
              >
                <Icon name="close" size={13} color={color.ink.low} />
              </Pressable>
            </View>
          ) : null}
          {erwaehnung.leiste}
          <View style={styles.eingabe}>
            <TextInput
              ref={eingabe}
              value={text}
              onChangeText={setText}
              onSelectionChange={erwaehnung.onSelectionChange}
              placeholder={antwortAn ? 'Deine Antwort' : 'Kommentieren'}
              placeholderTextColor={color.ink.low}
              style={styles.input}
              multiline
              maxLength={500}
            />
            <Pressable
              onPress={() => void senden()}
              disabled={text.trim().length < 2 || busy}
              style={[styles.senden, (text.trim().length < 2 || busy) && styles.sendenAus]}
              accessibilityLabel="Senden"
            >
              {busy ? (
                <Laden size="small" color={color.bg} />
              ) : (
                <Icon name="chevron" size={16} color={color.bg} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </GridBackground>
  );
}

function Kommentar({
  k,
  eingerueckt,
  hervorgehoben,
  onAntworten,
  onTeilen,
  onMelden,
  onLoeschen,
  onFehler,
}: {
  k: PostComment;
  eingerueckt?: boolean;
  hervorgehoben?: boolean;
  onAntworten: () => void;
  onTeilen: () => void;
  onMelden: (id: string) => void;
  onLoeschen: (id: string) => void;
  onFehler: (t: string) => void;
}) {
  const [menue, setMenue] = useState(false);
  const [likes, setLikes] = useState(k.likes ?? 0);
  const [ichLike, setIchLike] = useState(Boolean(k.ich_like));

  useEffect(() => {
    setLikes(k.likes ?? 0);
    setIchLike(Boolean(k.ich_like));
  }, [k.id, k.likes, k.ich_like]);

  const like = async () => {
    const next = !ichLike;
    setIchLike(next);
    setLikes((l) => Math.max(0, l + (next ? 1 : -1)));
    if (next) haptics.medium();
    else haptics.light();
    try {
      await api.setPostCommentLike(k.id, next);
    } catch (e) {
      setIchLike(!next);
      setLikes((l) => Math.max(0, l + (next ? -1 : 1)));
      onFehler(fehlerText(e, 'Like ging nicht.'));
    }
  };

  return (
    <View style={[styles.kommentar, eingerueckt && styles.eingerueckt, hervorgehoben && styles.hervor]}>
      <Pressable onPress={() => zuProfil(k.wer.handle)}>
        <Avatar seed={k.wer.avatar_seed} path={k.wer.avatar_path} size={eingerueckt ? 26 : 32} />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.kommentarKopf}>
          <Text style={styles.kommentarName} numberOfLines={1}>
            {name(k.wer)}
          </Text>
          <Text style={styles.kommentarWann}>{wann(k.at)}</Text>
        </View>
        <ErwaehnungsText text={k.body} style={styles.kommentarText} />
        <View style={styles.kommentarAktionen}>
          <Pressable onPress={onAntworten} hitSlop={8}>
            <Text style={styles.menueText}>Antworten</Text>
          </Pressable>
          <Pressable onPress={onTeilen} hitSlop={8} accessibilityLabel="Kommentar teilen">
            <Icon name="share" size={13} color={color.ink.mid} />
          </Pressable>
          {k.darf_loeschen ? (
            <Pressable onPress={() => onLoeschen(k.id)} hitSlop={8}>
              <Text style={styles.menueText}>Löschen</Text>
            </Pressable>
          ) : null}
          {!k.ist_meins ? (
            menue ? (
              <Pressable onPress={() => onMelden(k.id)} hitSlop={8}>
                <Text style={[styles.menueText, { color: color.signal.error }]}>Wirklich melden</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setMenue(true)} hitSlop={8}>
                <Text style={styles.menueText}>Melden</Text>
              </Pressable>
            )
          ) : null}
        </View>
      </View>
      {/* Like rechts, auf Hoehe des Namens - wie man es von ueberall kennt. */}
      <Pressable
        onPress={() => void like()}
        hitSlop={10}
        style={styles.like}
        accessibilityRole="button"
        accessibilityLabel={ichLike ? 'Gefällt mir nicht mehr' : 'Gefällt mir'}
      >
        <Icon name={ichLike ? 'like-filled' : 'like'} size={14} color={ichLike ? color.signal.primary : color.ink.low} />
        {likes > 0 ? (
          <Text style={[styles.likeZahl, ichLike && { color: color.signal.primary }]}>{likes}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  fehler: { ...type.body, color: color.signal.error, textAlign: 'center' },

  gesperrt: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  gesperrtText: { ...type.body, fontSize: 16, color: color.ink.mid, textAlign: 'center' },

  menueZeile: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -space.sm },
  menueEigen: { flexDirection: 'row', gap: space.lg },
  menueText: { ...type.meta, color: color.ink.mid },

  abschnitt: { ...type.meta, color: color.ink.low },
  thread: { gap: space.md },
  kommentar: { flexDirection: 'row', gap: space.md, borderRadius: radius.md },
  eingerueckt: { paddingLeft: space.xl },
  // Ein geteilter Kommentar leuchtet kurz auf, damit man ihn findet.
  hervor: { backgroundColor: 'rgba(0, 240, 255, 0.07)', marginHorizontal: -space.sm, padding: space.sm },
  kommentarKopf: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  kommentarName: { ...type.label, fontSize: 14, color: color.ink.max, flexShrink: 1 },
  kommentarWann: { ...type.meta, color: color.ink.low },
  kommentarText: { ...type.body, fontSize: 15, color: color.ink.high },
  kommentarAktionen: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingTop: 2 },
  like: { alignItems: 'center', gap: 2, paddingTop: 2, minWidth: 22 },
  likeZahl: { ...type.meta, fontSize: 10, color: color.ink.low },

  notiz: { ...type.meta, color: color.signal.warn, paddingHorizontal: space.xl, paddingBottom: space.xs },

  eingabeBereich: {
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.ink.faint,
    backgroundColor: color.bg,
  },
  antwortAn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: color.bgElevated,
  },
  antwortAnText: { ...type.meta, color: color.ink.mid, flex: 1 },
  eingabe: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  input: {
    flex: 1, minWidth: 0,
    maxHeight: 110,
    minHeight: 42,
    ...type.body,
    fontSize: 15,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  // Design 2.0: Sechseck statt Kreis. Durch die Drehung liegt es flach -
  // wie ein Pfeil, der nach vorn zeigt.
  senden: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.signal.primary,
    transform: [{ rotate: '-90deg' }],
    ...sechseckRegel(),
    ...goldVerlauf(),
  },
  sendenAus: { backgroundColor: color.ink.faint },
});
