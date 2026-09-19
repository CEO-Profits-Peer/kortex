import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { Appear } from '@/components/Appear';
import { Avatar } from '@/components/Avatar';
import { ErwaehnungsText, useErwaehnung } from '@/components/Erwaehnungen';
import { Icon } from '@/components/Icon';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { CommentAnswer, CommentQuestion } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { flaeche, goldVerlauf, sechseckRegel } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Der Kommentarbereich einer Karte.
 *
 * Offen: jeder sieht alles, jeder darf schreiben, so viel er will, ohne
 * die Karte vorher gelesen zu haben. Der erste Entwurf war deutlich
 * enger - das war meine Vorsicht, nicht die Anforderung.
 *
 * Geprueft wird vor dem Senden, in der Datenbank (0040, 0041): auf
 * Beschimpfungen, Drohungen und den Austausch von Kontaktdaten. Die
 * Pruefung sitzt dort und nicht hier, weil eine Pruefung, die der Client
 * ausloest, der Client auch ueberspringen kann.
 *
 * Eine Ebene Verschachtelung: Kommentar, Antworten darauf. Tiefer
 * verschachtelte Verlaeufe sind auf einem Handy nicht mehr lesbar.
 */

function timeAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} h`;
  return `vor ${Math.round(h / 24)} d`;
}

function Entry({
  item,
  onReport,
  onDelete,
  onReply,
  onBeste,
  indented,
  frage,
}: {
  item: CommentAnswer;
  onReport: (id: string) => void;
  onDelete: (id: string) => void;
  onReply?: () => void;
  /** 0115: nur bei Antworten auf die EIGENE Frage. */
  onBeste?: () => void;
  indented?: boolean;
  frage?: boolean;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <View style={[styles.entry, indented && styles.indented, item.beste && styles.besteBox]}>
      <Avatar seed={item.avatar_seed} path={item.avatar_path} size={indented ? 26 : 32} />
      <View style={styles.entryBody}>
        <View style={styles.entryHead}>
          <Text style={styles.author} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text style={styles.when}>{timeAgo(item.at)}</Text>
          {frage ? <Text style={styles.marke}>Frage</Text> : null}
          {item.beste ? <Text style={[styles.marke, styles.markeBeste]}>Beste Antwort</Text> : null}
        </View>
        <ErwaehnungsText text={item.body} style={styles.body} />

        <View style={styles.entryActions}>
          {onReply ? (
            <Pressable onPress={onReply} hitSlop={8}>
              <Text style={styles.action}>Antworten</Text>
            </Pressable>
          ) : null}
          {onBeste ? (
            <Pressable onPress={onBeste} hitSlop={8}>
              <Text style={[styles.action, item.beste && { color: color.signal.success }]}>
                {item.beste ? 'Beste ✓' : 'Beste'}
              </Text>
            </Pressable>
          ) : null}

          {item.is_mine ? (
            <Pressable onPress={() => onDelete(item.id)} hitSlop={8}>
              <Text style={styles.action}>Löschen</Text>
            </Pressable>
          ) : menu ? (
            <Pressable onPress={() => onReport(item.id)} hitSlop={8}>
              <Text style={[styles.action, { color: color.signal.error }]}>
                Wirklich melden
              </Text>
            </Pressable>
          ) : (
            // Zwei Schritte zum Melden. Nicht als Huerde gedacht, sondern
            // gegen das versehentliche Antippen beim Scrollen - eine
            // Meldung, die niemand meinte, trifft trotzdem jemanden.
            <Pressable onPress={() => setMenu(true)} hitSlop={8}>
              <Text style={styles.action}>Melden</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export function CommentSheet({
  contentId,
  cardTitle,
  visible,
  onClose,
  onCountChange,
}: {
  contentId: string;
  cardTitle: string;
  visible: boolean;
  onClose: () => void;
  /** Damit die Zahl auf der Karte sofort stimmt, ohne Neuladen. */
  onCountChange?: (n: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<CommentQuestion[] | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentQuestion | null>(null);
  // 0115: als Frage an die Community stellen (nur fuer neue Kommentare).
  const [alsFrage, setAlsFrage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const erwaehnung = useErwaehnung(text, setText);

  const load = useCallback(async () => {
    try {
      const rows = await api.comments(contentId);
      setItems(rows);
      onCountChange?.(rows.length);
    } catch (e) {
      setItems([]);
      setNote(fehlerText(e, 'Konnte nicht laden'));
    }
  }, [contentId, onCountChange]);

  useEffect(() => {
    if (!visible) return;
    setItems(null);
    setNote(null);
    void load();
  }, [visible, load]);

  const send = async () => {
    const body = text.trim();
    if (body.length < 2 || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const r =
        alsFrage && !replyTo ? await api.frageStellen(contentId, body) : await api.postComment(contentId, body, replyTo?.id);
      if (r.status === 'blocked') {
        // Der Beitrag ist gespeichert, aber unsichtbar. Das ehrlich sagen:
        // ein "gesendet", nach dem nichts erscheint, ist schlimmer als
        // eine Absage.
        feedback.wrong();
        setNote(r.reason ?? 'Der Beitrag wurde nicht freigegeben.');
      } else {
        feedback.correct();
        setText('');
        setReplyTo(null);
        setAlsFrage(false);
        await load();
      }
    } catch (e) {
      setNote(fehlerText(e, 'Hat nicht geklappt.'));
    } finally {
      setBusy(false);
    }
  };

  const report = async (id: string) => {
    haptics.warning();
    try {
      await api.reportComment(id);
      setNote('Gemeldet. Danke - wir schauen es uns an.');
      await load();
    } catch {
      setNote('Melden hat nicht geklappt.');
    }
  };

  const beste = async (id: string) => {
    haptics.select();
    try {
      await api.besteAntwort(id);
      await load();
    } catch (e) {
      setNote(fehlerText(e, 'Hat nicht geklappt.'));
    }
  };

  const remove = async (id: string) => {
    haptics.light();
    try {
      await api.deleteComment(id);
      await load();
    } catch {
      setNote('Löschen hat nicht geklappt.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.grabber} />

          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.title}>Kommentare</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {cardTitle}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Icon name="close" size={18} color={color.ink.mid} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {items === null ? (
              <Laden color={color.ink.low} />
            ) : items.length === 0 ? (
              <Text style={styles.empty}>
                Noch keine Kommentare. Wenn dir etwas auffällt oder unklar
                ist, bist du wahrscheinlich nicht allein.
              </Text>
            ) : (
              items.map((q, i) => (
                <Appear key={q.id} delay={Math.min(i, 6) * 40} style={styles.thread}>
                  <Entry
                    item={q}
                    onReport={report}
                    onDelete={remove}
                    onReply={() => setReplyTo(q)}
                    frage={q.frage}
                  />
                  {q.answers.map((a) => (
                    <Entry
                      key={a.id}
                      item={a}
                      onReport={report}
                      onDelete={remove}
                      onBeste={q.frage && q.is_mine && !a.is_mine ? () => void beste(a.id) : undefined}
                      indented
                    />
                  ))}
                </Appear>
              ))
            )}
          </ScrollView>

          {note ? <Text style={styles.note}>{note}</Text> : null}

          {replyTo ? (
            <View style={styles.replyTo}>
              <Text style={styles.replyToText} numberOfLines={1}>
                Antwort an {replyTo.display_name}
              </Text>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Icon name="close" size={13} color={color.ink.low} />
              </Pressable>
            </View>
          ) : null}

          {!replyTo ? (
            <Pressable
              onPress={() => {
                haptics.select();
                setAlsFrage((f) => !f);
              }}
              style={[styles.frageSchalter, alsFrage && styles.frageSchalterAn]}
              accessibilityRole="switch"
              accessibilityState={{ checked: alsFrage }}
            >
              <Text style={[styles.frageSchalterText, alsFrage && { color: color.akzent }]}>
                {alsFrage ? '✓ Frage an die Community' : 'Als Frage stellen'}
              </Text>
            </Pressable>
          ) : null}
          {erwaehnung.leiste}
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSelectionChange={erwaehnung.onSelectionChange}
              placeholder={replyTo ? 'Deine Antwort' : alsFrage ? 'Was ist dir unklar?' : 'Schreib etwas dazu'}
              placeholderTextColor={color.ink.low}
              style={styles.input}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
            />
            <Pressable
              onPress={() => void send()}
              disabled={text.trim().length < 2 || busy}
              style={({ pressed }) => [
                styles.send,
                (text.trim().length < 2 || busy) && styles.sendOff,
                pressed && { opacity: 0.8 },
              ]}
            >
              {busy ? (
                <Laden size="small" color={color.bg} />
              ) : (
                <Icon name="chevron" size={16} color={color.bg} />
              )}
            </Pressable>
          </View>

          <Text style={styles.rules}>
            Sei fair. Keine Links, keine Kontaktdaten. Mit @name erwähnst du jemanden.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: color.overlay },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '82%',
    backgroundColor: color.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.md,
    ...flaeche(10),
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.ink.faint,
  },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headText: { flex: 1, gap: 2 },
  title: { ...type.title, fontSize: 19, color: color.ink.max },
  subtitle: { ...type.meta, color: color.ink.low },

  list: { flexGrow: 0 },
  listInner: { gap: space.lg, paddingVertical: space.sm },
  empty: { ...type.body, color: color.ink.mid, paddingVertical: space.lg },

  thread: { gap: space.md },
  entry: { flexDirection: 'row', gap: space.md },
  indented: { paddingLeft: space.xl },
  entryBody: { flex: 1, gap: 3 },
  entryHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  author: { ...type.label, fontSize: 14, color: color.ink.max, flexShrink: 1 },
  when: { ...type.meta, color: color.ink.low },
  body: { ...type.body, fontSize: 15, color: color.ink.high },
  entryActions: { flexDirection: 'row', gap: space.lg, paddingTop: 2 },
  action: { ...type.meta, color: color.ink.mid },

  note: { ...type.meta, color: color.signal.warn },

  besteBox: {
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.signal.success,
    marginLeft: space.xl,
    paddingLeft: space.sm,
  },
  marke: {
    ...type.meta,
    fontSize: 10,
    color: color.akzent,
    borderWidth: 1,
    borderColor: color.akzent,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  markeBeste: { color: color.signal.success, borderColor: color.signal.success },
  frageSchalter: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  frageSchalterAn: { borderColor: color.akzent },
  frageSchalterText: { ...type.meta, fontSize: 11, color: color.ink.mid },

  replyTo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: color.bg,
  },
  replyToText: { ...type.meta, color: color.ink.mid, flex: 1 },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
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
    backgroundColor: color.bg,
  },
  // Design 2.0: Sechseck statt Kreis. Durch die Drehung liegt es flach -
  // wie ein Pfeil, der nach vorn zeigt.
  send: {
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
  sendOff: { backgroundColor: color.ink.faint },

  rules: { ...type.meta, fontSize: 11, color: color.ink.low, textAlign: 'center' },
});
