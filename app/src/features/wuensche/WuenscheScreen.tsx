import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { api, type MeineWuensche, type WunschStatus } from '@/lib/supabase';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Themenwuensche (0111): wer ein Thema vermisst, wuenscht es sich. Gleiche
 * Wuensche werden gezaehlt; der Betreiber gibt im Kontrollzentrum frei, die
 * Pipeline baut dann bis zu vier Karten dazu und meldet sich.
 *
 * Fremde Wuensche erscheinen hier nie im Wortlaut - nur freigegebene Themen
 * unter "Kommt bald".
 */
const STATUS: Record<WunschStatus, { text: string; farbe: string }> = {
  offen: { text: 'Gewünscht', farbe: color.ink.low },
  frei: { text: 'Kommt bald', farbe: color.signal.primary },
  in_arbeit: { text: 'Kommt bald', farbe: color.signal.primary },
  fertig: { text: 'Da', farbe: color.signal.success },
  nein: { text: 'Nicht dabei', farbe: color.ink.low },
};

export function WuenscheScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [daten, setDaten] = useState<MeineWuensche | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<{ text: string; fehler?: boolean } | null>(null);

  const laden = useCallback(async () => {
    try {
      setDaten(await api.meineWuensche());
    } catch (e) {
      setNotiz({ text: fehlerText(e, 'Laden ging nicht'), fehler: true });
      setDaten({ meine: [], bald: [] });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  const wuenschen = async () => {
    const t = text.trim();
    if (t.length < 2 || busy) return;
    setBusy(true);
    setNotiz(null);
    try {
      const r = await api.themaWuenschen(t);
      haptics.success();
      setText('');
      setNotiz({
        text:
          r.status === 'fertig'
            ? 'Das gibt es schon – such danach!'
            : r.anzahl > 1
              ? `Gemerkt. ${r.anzahl - 1} ${r.anzahl === 2 ? 'andere Person will' : 'andere wollen'} das auch.`
              : 'Gemerkt. Du bist die erste Person mit diesem Wunsch.',
      });
      await laden();
    } catch (e) {
      setNotiz({ text: fehlerText(e, 'Wünschen ging nicht'), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={T('Themenwünsche')} eyebrow={T('lernen')} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{T('Fehlt dir ein Thema? Wünsch es dir. Was oft gewünscht wird, bekommt eine kleine Kartenserie – und du eine Nachricht, sobald sie da ist.')}</Text>

        <View style={styles.karte}>
          <View style={styles.zeile}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={T('z. B. Vulkane')}
              placeholderTextColor={color.ink.low}
              maxLength={80}
              onSubmitEditing={() => void wuenschen()}
              returnKeyType="send"
              style={styles.eingabe}
            />
            <Button label={T('Wünschen')} onPress={() => void wuenschen()} disabled={text.trim().length < 2} busy={busy} />
          </View>
          {notiz ? (
            <Text style={[styles.klein, notiz.fehler && { color: color.signal.error }]}>{notiz.text}</Text>
          ) : null}
        </View>

        {daten === null ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}

        {daten && daten.meine.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Text style={styles.abschnitt}>{T('Deine Wünsche')}</Text>
            {daten.meine.map((w) => {
              const s = STATUS[w.status] ?? STATUS.offen;
              const name = w.anzeige ?? w.text;
              return (
                <Pressable
                  key={w.id}
                  disabled={w.status !== 'fertig'}
                  onPress={() => router.push(`/search?q=${encodeURIComponent(name)}`)}
                  style={styles.eintrag}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.eintragText} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.klein}>
                      {w.anzahl > 1 ? `${w.anzahl} wollen das` : 'nur du bisher'}
                    </Text>
                    {/* 0120: der Satz aus dem Kontrollzentrum. */}
                    {w.grund ? (
                      <Text style={styles.grund} numberOfLines={3}>
                        {w.grund}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.marke, { color: s.farbe, borderColor: s.farbe }]}>{s.text}</Text>
                  {w.status === 'offen' ? (
                    <Pressable
                      hitSlop={8}
                      onPress={() => void api.wunschZuruecknehmen(w.id).then(laden)}
                      accessibilityLabel={T('Wunsch zurücknehmen')}
                    >
                      <Text style={styles.weg}>×</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {daten && daten.bald.length > 0 ? (
          <View style={{ gap: space.sm }}>
            <Text style={styles.abschnitt}>{T('Aus Wünschen')}</Text>
            <View style={styles.chips}>
              {daten.bald.map((b) => (
                <Pressable
                  key={b.anzeige}
                  disabled={b.status !== 'fertig'}
                  onPress={() => router.push(`/search?q=${encodeURIComponent(b.anzeige)}`)}
                  style={[styles.chip, b.status === 'fertig' && { borderColor: color.signal.success }]}
                >
                  <Text style={[styles.chipText, b.status === 'fertig' && { color: color.signal.success }]}>
                    {b.anzeige}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  intro: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid },
  karte: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eingabe: {
    ...type.body,
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  klein: { ...type.meta, fontSize: 11, color: color.ink.low },
  grund: { ...type.body, fontSize: 12, lineHeight: 17, color: color.ink.mid, marginTop: 2 },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  eintrag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  eintragText: { ...type.label, fontSize: 15, color: color.ink.max },
  marke: {
    ...type.meta,
    fontSize: 10,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  weg: { ...type.title, fontSize: 18, color: color.ink.low, paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.ink.faint,
  },
  chipText: { ...type.label, fontSize: 13, color: color.ink.mid },
});
