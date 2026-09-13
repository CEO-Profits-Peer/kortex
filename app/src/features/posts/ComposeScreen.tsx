import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { KartenVerweis, Kopf } from '@/features/posts/PostParts';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { Post } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Einen Beitrag schreiben.
 *
 * Drei Einstiege, ein Bildschirm:
 *   /compose                     Post oder Frage
 *   /compose?card=ID&titel=...   eine Karte empfehlen, mit eigenem Satz
 *   /compose?repost=ID           einen Beitrag weiterteilen, Text freiwillig
 *
 * Geprueft wird in der Datenbank (create_post, 0077) - dieselbe Pruefung wie
 * bei Kommentaren. Was abgelehnt wird, sagt der Bildschirm ehrlich: ein
 * "gepostet", nach dem nichts erscheint, waere schlimmer als eine Absage.
 */
export function ComposeScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ art?: string; repost?: string; card?: string; titel?: string }>();
  const [art, setArt] = useState<'post' | 'frage'>(params.art === 'frage' ? 'frage' : 'post');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [original, setOriginal] = useState<Post | null>(null);

  useEffect(() => {
    if (!params.repost) return;
    void api
      .postDetail(params.repost)
      .then((d) => {
        if (!d.gesperrt) setOriginal(d.post);
      })
      .catch(() => setNotiz('Den Beitrag gibt es nicht mehr.'));
  }, [params.repost]);

  const karte = params.card
    ? { content_id: params.card, title: params.titel ?? 'Karte', deck: null, category: '' }
    : null;

  const ohneTextErlaubt = Boolean(params.repost || params.card);
  const darf = !busy && (text.trim().length >= 2 || (ohneTextErlaubt && text.trim().length === 0));

  const posten = async () => {
    if (!darf) return;
    setBusy(true);
    setNotiz(null);
    try {
      const r = await api.createPost({
        body: text.trim(),
        art: params.repost || params.card ? 'post' : art,
        contentId: params.card,
        repostOf: params.repost,
      });
      if (r.status === 'blocked') {
        feedback.wrong();
        setNotiz(r.reason ?? 'Der Beitrag wurde nicht freigegeben.');
        return;
      }
      feedback.correct();
      haptics.success();
      router.replace('/home');
    } catch (e) {
      setNotiz(fehlerText(e, 'Posten ging nicht.'));
    } finally {
      setBusy(false);
    }
  };

  const titel = params.repost ? 'Teilen' : params.card ? 'Karte empfehlen' : art === 'frage' ? 'Frage stellen' : 'Neuer Beitrag';
  const platzhalter = params.repost
    ? 'Etwas dazu sagen (freiwillig)'
    : params.card
      ? 'Warum sollten deine Leute das lesen? (freiwillig)'
      : art === 'frage'
        ? 'Was willst du von deinen Leuten wissen?'
        : 'Was hast du heute gelernt?';

  return (
    <GridBackground>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={[styles.leiste, { paddingTop: insets.top + space.sm }]}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Schließen">
            <Icon name="close" size={20} color={color.ink.mid} />
          </Pressable>
          <Text style={styles.leisteTitel}>{titel}</Text>
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
          {!params.repost && !params.card ? (
            <View style={styles.arten}>
              {(['post', 'frage'] as const).map((a) => (
                <Pressable
                  key={a}
                  onPress={() => {
                    haptics.select();
                    setArt(a);
                  }}
                  style={[styles.art, art === a && styles.artAn]}
                >
                  <Text style={[styles.artText, art === a && styles.artTextAn]}>
                    {a === 'post' ? 'Beitrag' : 'Frage'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={platzhalter}
            placeholderTextColor={color.ink.low}
            style={styles.eingabe}
            multiline
            autoFocus
            maxLength={500}
          />
          <Text style={styles.zaehler}>{text.length} / 500</Text>

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
            Deine Follower sehen das in ihrem Home, nicht im Feed. Sei fair - keine Links, keine
            Kontaktdaten.
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

  arten: { flexDirection: 'row', gap: space.sm },
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

  eingabe: {
    minHeight: 140,
    ...type.body,
    fontSize: 18,
    lineHeight: 26,
    color: color.ink.max,
    textAlignVertical: 'top',
  },
  zaehler: { ...type.meta, color: color.ink.low, textAlign: 'right' },

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
