import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Laden } from '@/components/Laden';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Slider } from '@/components/Slider';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { api, type Lernpartner } from '@/lib/supabase';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Lernpartner (0114): zu zweit ein Wochenziel. Man sieht nur die eine Zahl
 * des anderen - gelesene Karten diese Woche -, sonst nichts.
 */
export function LernpartnerScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [liste, setListe] = useState<Lernpartner[] | null>(null);
  const [name, setName] = useState('');
  const [ziel, setZiel] = useState(30);
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<{ text: string; fehler?: boolean } | null>(null);

  const laden = useCallback(async () => {
    try {
      setListe(await api.meineLernpartner());
    } catch (e) {
      setNotiz({ text: fehlerText(e, 'Laden ging nicht'), fehler: true });
      setListe([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  const zeige = (text: string, fehler?: boolean) => setNotiz({ text, fehler });

  const anfragen = async () => {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    setNotiz(null);
    try {
      await api.lpAnfragen(name.trim(), ziel);
      haptics.success();
      setName('');
      zeige('Angefragt – sobald die Person annimmt, geht es los.');
      await laden();
    } catch (e) {
      zeige(fehlerText(e, 'Anfragen ging nicht'), true);
    } finally {
      setBusy(false);
    }
  };

  const aktiv = liste?.filter((l) => l.status === 'aktiv') ?? [];
  const eingehend = liste?.filter((l) => l.eingehend) ?? [];
  const wartend = liste?.filter((l) => l.status === 'offen' && !l.eingehend) ?? [];

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Lernpartner" eyebrow="zu zweit" scrollY={scrollY} />
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
          Verabredet ein Wochenziel und seht, wie weit der andere ist. Ihr seht nur die Zahl der gelesenen Karten – nicht
          welche.
        </Text>

        {liste === null ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}

        {eingehend.map((l) => (
          <View key={l.id} style={[styles.karte, { borderColor: color.akzent }]}>
            <Text style={styles.titel}>{l.partner.name}</Text>
            <Text style={styles.klein}>möchte mit dir {l.ziel} Karten pro Woche schaffen.</Text>
            <View style={styles.knoepfe}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Nein"
                  variant="ghost"
                  onPress={() => void api.lpAntworten(l.id, false).then(laden).catch((e) => zeige(fehlerText(e, 'Ging nicht'), true))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Ja"
                  onPress={() =>
                    void api
                      .lpAntworten(l.id, true)
                      .then(() => {
                        haptics.success();
                        return laden();
                      })
                      .catch((e) => zeige(fehlerText(e, 'Ging nicht'), true))
                  }
                />
              </View>
            </View>
          </View>
        ))}

        {aktiv.map((l) => (
          <PartnerKarte key={l.id} l={l} neu={laden} zeige={zeige} />
        ))}

        {wartend.map((l) => (
          <View key={l.id} style={styles.wartet}>
            <Text style={styles.klein} numberOfLines={1}>
              {l.partner.name} · {l.ziel} pro Woche · wartet
            </Text>
            <Pressable onPress={() => void api.lpBeenden(l.id).then(laden)} hitSlop={8}>
              <Text style={styles.leise}>Zurückziehen</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.karte}>
          <Text style={styles.abschnitt}>Jemanden fragen</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="@name"
            placeholderTextColor={color.ink.low}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
            style={styles.eingabe}
          />
          <View style={styles.zeileZwischen}>
            <Text style={styles.abschnitt}>Ziel</Text>
            <Text style={styles.wert}>{ziel} Karten pro Woche</Text>
          </View>
          <Slider min={5} max={150} step={5} value={ziel} onChange={setZiel} tint={color.signal.primary} />
          <Button label="Anfragen" onPress={() => void anfragen()} disabled={name.trim().length < 2} busy={busy} />
        </View>

        {notiz ? (
          <Text style={[styles.klein, { textAlign: 'center' }, notiz.fehler && { color: color.signal.error }]}>{notiz.text}</Text>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

function Balken({ label, wert, ziel, farbe }: { label: string; wert: number; ziel: number; farbe: string }) {
  const geschafft = wert >= ziel;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.zeileZwischen}>
        <Text style={styles.balkenLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.wert, geschafft && { color: color.signal.success }]}>
          {wert} / {ziel}
          {geschafft ? ' ✓' : ''}
        </Text>
      </View>
      <View style={styles.balken}>
        <View
          style={[
            styles.balkenFuellung,
            { width: `${Math.min(100, Math.round((wert / Math.max(1, ziel)) * 100))}%`, backgroundColor: geschafft ? color.signal.success : farbe },
          ]}
        />
      </View>
    </View>
  );
}

function PartnerKarte({
  l,
  neu,
  zeige,
}: {
  l: Lernpartner;
  neu: () => Promise<void>;
  zeige: (t: string, f?: boolean) => void;
}) {
  const [ziel, setZiel] = useState(l.ziel);
  const [zielOffen, setZielOffen] = useState(false);

  const stupsen = async () => {
    try {
      const ok = await api.lpAnstupsen(l.id);
      haptics.light();
      zeige(ok ? `${l.partner.name} wurde angestupst.` : 'Heute schon gestupst – morgen wieder.');
    } catch (e) {
      zeige(fehlerText(e, 'Ging nicht'), true);
    }
  };

  return (
    <View style={styles.karte}>
      <View style={styles.zeileZwischen}>
        <Pressable onPress={() => router.push(`/u/${encodeURIComponent(l.partner.handle)}`)} style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.titel} numberOfLines={1}>
            Du & {l.partner.name}
          </Text>
        </Pressable>
        {l.serie ? (
          <Text style={styles.serie}>
            {l.serie} {l.serie === 1 ? 'Woche' : 'Wochen'} geschafft
          </Text>
        ) : null}
      </View>
      <Balken label="Du" wert={l.ich ?? 0} ziel={l.ziel} farbe={color.signal.primary} />
      <Balken label={l.partner.name} wert={l.er ?? 0} ziel={l.ziel} farbe={color.akzent} />
      {zielOffen ? (
        <View style={{ gap: space.xs }}>
          <Text style={styles.wert}>{ziel} Karten pro Woche</Text>
          <Slider min={5} max={150} step={5} value={ziel} onChange={setZiel} tint={color.signal.primary} />
        </View>
      ) : null}
      <View style={styles.knoepfe}>
        <View style={{ flex: 1 }}>
          <Button
            label="Ziel"
            variant="ghost"
            onPress={() => {
              if (zielOffen && ziel !== l.ziel) {
                void api
                  .lpZiel(l.id, ziel)
                  .then(neu)
                  .catch((e) => zeige(fehlerText(e, 'Ging nicht'), true));
              }
              setZielOffen(!zielOffen);
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Stupsen" onPress={() => void stupsen()} />
        </View>
      </View>
      <Pressable onPress={() => void api.lpBeenden(l.id).then(neu)} hitSlop={6} style={{ alignSelf: 'flex-end' }}>
        <Text style={styles.leise}>Beenden</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  intro: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid },
  karte: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  titel: { ...type.title, fontSize: 17, color: color.ink.max },
  serie: { ...type.meta, fontSize: 11, color: color.akzent },
  klein: { ...type.meta, fontSize: 12, color: color.ink.mid },
  leise: { ...type.label, fontSize: 12, color: color.ink.low },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  wert: { ...type.mono, fontSize: 12, color: color.ink.max },
  zeileZwischen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  knoepfe: { flexDirection: 'row', gap: space.sm },
  balkenLabel: { ...type.label, fontSize: 13, color: color.ink.high, flex: 1, minWidth: 0 },
  balken: { height: 6, borderRadius: 3, backgroundColor: color.ink.faint, overflow: 'hidden' },
  balkenFuellung: { height: 6, borderRadius: 3 },
  wartet: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  eingabe: {
    ...type.body,
    fontSize: 15,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
});
