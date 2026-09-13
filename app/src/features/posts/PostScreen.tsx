import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PostKarte, name, wann, zuProfil } from '@/features/posts/PostParts';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { PostComment, PostDetail } from '@/lib/types.db';
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
 */
export function PostScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [d, setD] = useState<PostDetail | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [antwortAn, setAntwortAn] = useState<PostComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [menue, setMenue] = useState(false);

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

  const senden = async () => {
    const body = text.trim();
    if (body.length < 2 || busy) return;
    setBusy(true);
    setNotiz(null);
    try {
      const r = await api.addPostComment(id, body, antwortAn?.id);
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

  const kommentarMelden = async (cid: string) => {
    haptics.warning();
    try {
      await api.reportPostComment(cid);
      setNotiz('Gemeldet. Danke.');
      await laden();
    } catch {
      setNotiz('Melden hat nicht geklappt.');
    }
  };

  const kommentarLoeschen = async (cid: string) => {
    haptics.light();
    try {
      await api.deletePostComment(cid);
      await laden();
    } catch {
      setNotiz('Löschen hat nicht geklappt.');
    }
  };

  const beitragMelden = async () => {
    haptics.warning();
    try {
      await api.reportPost(id);
      setNotiz('Gemeldet. Danke - drei Meldungen, und der Beitrag ist weg.');
      setMenue(false);
    } catch {
      setNotiz('Melden hat nicht geklappt.');
    }
  };

  const beitragLoeschen = async () => {
    haptics.light();
    try {
      await api.deletePost(id);
      router.back();
    } catch {
      setNotiz('Löschen hat nicht geklappt.');
    }
  };

  if (!d) {
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Beitrag" titleInBarOnly />
        </View>
        <View style={styles.center}>
          {fehler ? <Text style={styles.fehler}>{fehler}</Text> : <ActivityIndicator color={color.signal.primary} />}
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
          contentContainerStyle={[styles.body, { paddingBottom: space.xl }]}
          onScroll={(e) => {
            scrollY.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PostKarte post={post} imDetail onNotiz={(t) => setNotiz(t || null)} />

          <View style={styles.menueZeile}>
            {post.ist_meins ? (
              <Pressable onPress={() => void beitragLoeschen()} hitSlop={8}>
                <Text style={styles.menueText}>Beitrag löschen</Text>
              </Pressable>
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
            <View key={k.id} style={styles.thread}>
              <Kommentar
                k={k}
                onAntworten={() => setAntwortAn(k)}
                onMelden={kommentarMelden}
                onLoeschen={kommentarLoeschen}
              />
              {k.antworten.map((a) => (
                <Kommentar key={a.id} k={a} eingerueckt onMelden={kommentarMelden} onLoeschen={kommentarLoeschen} />
              ))}
            </View>
          ))}
        </ScrollView>

        {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}

        <View style={[styles.eingabeBereich, { paddingBottom: insets.bottom + space.md }]}>
          {antwortAn ? (
            <View style={styles.antwortAn}>
              <Text style={styles.antwortAnText} numberOfLines={1}>
                Antwort an {name(antwortAn.wer)}
              </Text>
              <Pressable onPress={() => setAntwortAn(null)} hitSlop={8}>
                <Icon name="close" size={13} color={color.ink.low} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.eingabe}>
            <TextInput
              value={text}
              onChangeText={setText}
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
                <ActivityIndicator size="small" color={color.bg} />
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
  onAntworten,
  onMelden,
  onLoeschen,
}: {
  k: PostComment;
  eingerueckt?: boolean;
  onAntworten?: () => void;
  onMelden: (id: string) => void;
  onLoeschen: (id: string) => void;
}) {
  const [menue, setMenue] = useState(false);
  return (
    <View style={[styles.kommentar, eingerueckt && styles.eingerueckt]}>
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
        <Text style={styles.kommentarText}>{k.body}</Text>
        <View style={styles.kommentarAktionen}>
          {onAntworten ? (
            <Pressable onPress={onAntworten} hitSlop={8}>
              <Text style={styles.menueText}>Antworten</Text>
            </Pressable>
          ) : null}
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
  menueText: { ...type.meta, color: color.ink.mid },

  abschnitt: { ...type.meta, color: color.ink.low },
  thread: { gap: space.md },
  kommentar: { flexDirection: 'row', gap: space.md },
  eingerueckt: { paddingLeft: space.xl },
  kommentarKopf: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  kommentarName: { ...type.label, fontSize: 14, color: color.ink.max, flexShrink: 1 },
  kommentarWann: { ...type.meta, color: color.ink.low },
  kommentarText: { ...type.body, fontSize: 15, color: color.ink.high },
  kommentarAktionen: { flexDirection: 'row', gap: space.lg, paddingTop: 2 },

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
    flex: 1,
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
  },
  senden: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.signal.primary,
    transform: [{ rotate: '-90deg' }],
  },
  sendenAus: { backgroundColor: color.ink.faint },
});
