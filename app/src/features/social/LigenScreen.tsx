import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Laden } from '@/components/Laden';
import { zeigeProSperre } from '@/components/ProSperre';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import type { Liga } from '@/lib/ligen';
import { proMeldung, useIchPro } from '@/lib/pro';
import { api } from '@/lib/supabase';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Private Ligen (0100): eine Wochentabelle unter Leuten, die sich kennen.
 *
 * Oben die eigenen Ligen mit Tabelle der laufenden Woche, darunter
 * "Beitreten" (fuer alle) und "Neue Liga" (PRO). Der Code steht bei jeder
 * Liga und wird mit einem Tipp kopiert - geteilt wird er ausserhalb der App,
 * im Klassenchat, nicht ueber eine Suche nach Fremden.
 */
export function LigenScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const pro = useIchPro();
  const [ligen, setLigen] = useState<Liga[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [notiz, setNotiz] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    try {
      setLigen(await api.meineLigen());
      setFehler(null);
    } catch (e) {
      setFehler(fehlerText(e, 'Ligen laden ging nicht'));
      setLigen([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  const zeige = (t: string) => {
    setNotiz(t);
    setTimeout(() => setNotiz(null), 2600);
  };

  const beitreten = async () => {
    if (code.trim().length < 6 || busy) return;
    setBusy(true);
    try {
      const r = await api.ligaBeitreten(code);
      if (r.ok) {
        haptics.success();
        setCode('');
        zeige(`Du bist in „${r.name}“.`);
        await laden();
      } else {
        haptics.warning();
        zeige(r.fehler);
      }
    } catch (e) {
      zeige(fehlerText(e, 'Beitreten ging nicht'));
    } finally {
      setBusy(false);
    }
  };

  const erstellen = async () => {
    if (!pro.pro) {
      zeigeProSperre('Eigene Ligen anlegen geht mit PRO – beitreten kann jede und jeder.');
      return;
    }
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      const r = await api.ligaErstellen(name.trim());
      haptics.success();
      setName('');
      await Clipboard.setStringAsync(r.code).catch(() => undefined);
      zeige(`Liga angelegt. Code ${r.code} ist kopiert – schick ihn deinen Leuten.`);
      await laden();
    } catch (e) {
      const angebot = proMeldung(e);
      if (angebot) zeigeProSperre(angebot);
      else zeige(fehlerText(e, 'Anlegen ging nicht'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Ligen" eyebrow="rangliste" scrollY={scrollY} />
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
        <Text style={styles.intro}>
          Eine Rangliste nur mit deinen Leuten. Gezählt werden die XP dieser Woche – jeden Montag geht es von vorne los.
        </Text>

        {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
        {ligen === null ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}

        {ligen?.map((l) => (
          <View key={l.id} style={styles.karte}>
            <View style={styles.kopf}>
              <Text style={styles.titel} numberOfLines={1}>
                {l.name}
              </Text>
              <Pressable
                onPress={() => {
                  void Clipboard.setStringAsync(l.code).catch(() => undefined);
                  haptics.light();
                  zeige(`Code ${l.code} kopiert`);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Code ${l.code} kopieren`}
              >
                <Text style={styles.code}>{l.code}</Text>
              </Pressable>
            </View>
            {l.tabelle.map((z, i) => (
              <Pressable key={z.handle} onPress={() => router.push(`/u/${encodeURIComponent(z.handle)}`)} style={styles.zeile}>
                <Text style={[styles.platz, i === 0 && z.xp > 0 && { color: color.signal.primary }]}>{i + 1}</Text>
                <Avatar seed={z.avatar_seed} path={z.avatar_path} size={28} rahmen={z.rahmen} />
                <Text style={[styles.name, z.ich && { color: color.ink.max }]} numberOfLines={1}>
                  {z.ich ? 'Du' : z.name}
                </Text>
                <Text style={styles.xp}>{z.xp} XP</Text>
              </Pressable>
            ))}
            {l.tabelle.length < 2 ? <Text style={styles.klein}>Noch allein – schick den Code an deine Leute.</Text> : null}
            <Pressable
              onPress={() => {
                haptics.light();
                void api.ligaVerlassen(l.id).then(laden).catch((e) => zeige(fehlerText(e, 'Ging nicht')));
              }}
              style={styles.verlassen}
              hitSlop={6}
            >
              <Text style={styles.verlassenText}>{l.meine ? 'Auflösen' : 'Verlassen'}</Text>
            </Pressable>
          </View>
        ))}

        {/* --- Beitreten ----------------------------------------------------- */}
        <View style={styles.karte}>
          <Text style={styles.abschnitt}>Beitreten</Text>
          <View style={styles.eingabeZeile}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="CODE"
              placeholderTextColor={color.ink.low}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              style={styles.eingabe}
              onSubmitEditing={() => void beitreten()}
            />
            <Button label="Beitreten" onPress={() => void beitreten()} disabled={code.trim().length < 6} busy={busy} />
          </View>
          <Text style={styles.klein}>Wer in einer Liga ist, sieht Name, Profilbild und Wochen-XP der anderen.</Text>
        </View>

        {/* --- Neue Liga (PRO) --------------------------------------------------- */}
        <View style={styles.karte}>
          <Text style={styles.abschnitt}>Neue Liga{pro.pro ? '' : ' · PRO'}</Text>
          <View style={styles.eingabeZeile}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="z. B. 4B oder Lerngruppe"
              placeholderTextColor={color.ink.low}
              maxLength={40}
              style={styles.eingabe}
              onSubmitEditing={() => void erstellen()}
            />
            <Button label="Anlegen" variant="ghost" onPress={() => void erstellen()} disabled={pro.pro && name.trim().length < 2} />
          </View>
        </View>

        {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  intro: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid },
  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
  karte: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  kopf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginBottom: space.xs },
  titel: { ...type.title, fontSize: 18, color: color.ink.max, flexShrink: 1 },
  code: { ...type.mono, fontSize: 13, letterSpacing: 1.5, color: color.akzent },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 4 },
  platz: { ...type.mono, fontSize: 13, width: 18, color: color.ink.low, textAlign: 'right' },
  name: { ...type.label, fontSize: 14, color: color.ink.high, flex: 1 },
  xp: { ...type.mono, fontSize: 13, color: color.ink.max },
  klein: { ...type.meta, fontSize: 11, lineHeight: 16, color: color.ink.low },
  verlassen: { alignSelf: 'flex-end', marginTop: space.xs },
  verlassenText: { ...type.label, fontSize: 12, color: color.ink.low },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  eingabeZeile: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  eingabe: {
    flex: 1, minWidth: 0,
    ...type.mono,
    fontSize: 14,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  notiz: { ...type.body, fontSize: 13, color: color.ink.mid, textAlign: 'center' },
});
