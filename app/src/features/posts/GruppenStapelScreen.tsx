import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { Laden } from '@/components/Laden';
import { zeigeProSperre } from '@/components/ProSperre';
import { ScreenHeader } from '@/components/ScreenHeader';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { proMeldung } from '@/lib/pro';
import { api, type GruppenStapel, type Klassenstand } from '@/lib/supabase';
import type { SearchHit } from '@/lib/types.db';
import { T } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Lerngruppen-Stapel (0106): gemeinsam Karten sammeln, etwa fuer die
 * Schularbeit. Anlegen und beitreten per Code, jede und jeder legt Karten
 * hinein; wer angelegt hat, kann den Stapel am Ende posten.
 *
 * Karten findet man hier ueber die normale Suche - nur Karten, keine
 * Kategorien oder Leute.
 */
export function GruppenStapelScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [liste, setListe] = useState<GruppenStapel[] | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [titel, setTitel] = useState('');
  const [notiz, setNotiz] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      const l = await api.meineGruppenStapel();
      setListe(l);
      setOffen((o) => o ?? l[0]?.id ?? null);
    } catch (e) {
      setNotiz(fehlerText(e, 'Laden ging nicht'));
      setListe([]);
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

  const anlegen = async () => {
    if (titel.trim().length < 2) return;
    try {
      const r = await api.gsErstellen(titel.trim());
      setTitel('');
      await Clipboard.setStringAsync(r.code).catch(() => undefined);
      zeige(`Angelegt. Code ${r.code} ist kopiert – schick ihn deiner Gruppe.`);
      setOffen(r.id);
      await laden();
    } catch (e) {
      zeige(fehlerText(e, 'Anlegen ging nicht'));
    }
  };

  const beitreten = async () => {
    if (code.trim().length < 6) return;
    try {
      const r = await api.gsBeitreten(code);
      if (!r.ok) return zeige(r.fehler);
      setCode('');
      setOffen(r.id);
      zeige(`Du bist in „${r.titel}“.`);
      await laden();
    } catch (e) {
      zeige(fehlerText(e, 'Beitreten ging nicht'));
    }
  };

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={T('Gruppen-Stapel')} eyebrow={T('studio')} scrollY={scrollY} />
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
        <Text style={styles.intro}>{T('Sammelt gemeinsam die Karten für eine Schularbeit oder ein Thema. Jede und jeder in der Gruppe kann Karten dazulegen.')}</Text>

        {liste === null ? <Laden size="large" style={{ marginTop: space.xl }} /> : null}

        {liste?.map((s) => (
          <StapelKarte
            key={s.id}
            s={s}
            offen={offen === s.id}
            umschalten={() => setOffen(offen === s.id ? null : s.id)}
            neu={laden}
            zeige={zeige}
          />
        ))}

        <View style={styles.karte}>
          <Text style={styles.abschnitt}>{T('Beitreten')}</Text>
          <View style={styles.eingabeZeile}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="CODE"
              placeholderTextColor={color.ink.low}
              autoCapitalize="characters"
              maxLength={12}
              style={styles.eingabe}
              onSubmitEditing={() => void beitreten()}
            />
            <Button label={T('Beitreten')} onPress={() => void beitreten()} disabled={code.trim().length < 6} />
          </View>
        </View>

        <View style={styles.karte}>
          <Text style={styles.abschnitt}>{T('Neuer Gruppen-Stapel')}</Text>
          <View style={styles.eingabeZeile}>
            <TextInput
              value={titel}
              onChangeText={setTitel}
              placeholder={T('z. B. Bio-Schularbeit Zelle')}
              placeholderTextColor={color.ink.low}
              maxLength={60}
              style={styles.eingabe}
              onSubmitEditing={() => void anlegen()}
            />
            <Button label={T('Anlegen')} variant="ghost" onPress={() => void anlegen()} disabled={titel.trim().length < 2} />
          </View>
        </View>

        {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}
      </ScrollView>
    </GridBackground>
  );
}

function StapelKarte({
  s,
  offen,
  umschalten,
  neu,
  zeige,
}: {
  s: GruppenStapel;
  offen: boolean;
  umschalten: () => void;
  neu: () => Promise<void>;
  zeige: (t: string) => void;
}) {
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<SearchHit[]>([]);
  const [stand, setStand] = useState<Klassenstand | null>(null);
  const [standZeigen, setStandZeigen] = useState(false);
  const drin = new Set(s.karten.map((k) => k.content_id));

  useEffect(() => {
    if (suche.trim().length < 2) {
      setTreffer([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .search(suche.trim(), 20)
        .then((h) => setTreffer(h.filter((x) => x.kind === 'content').slice(0, 8)))
        .catch(() => setTreffer([]));
    }, 300);
    return () => clearTimeout(t);
  }, [suche]);

  const karte = async (id: string, rein: boolean) => {
    haptics.light();
    try {
      await api.gsKarte(s.id, id, rein);
      await neu();
    } catch (e) {
      zeige(fehlerText(e, 'Ging nicht'));
    }
  };

  const posten = async () => {
    try {
      await api.createPost({ body: s.titel, art: 'stapel', daten: { karten: s.karten.map((k) => k.content_id) } });
      haptics.success();
      zeige(T('Gepostet – er steht jetzt in deinem Profil.'));
    } catch (e) {
      const angebot = proMeldung(e);
      if (angebot) zeigeProSperre(angebot);
      else zeige(fehlerText(e, 'Posten ging nicht'));
    }
  };

  return (
    <View style={styles.karte}>
      <Pressable onPress={umschalten} style={styles.kopf} accessibilityRole="button" accessibilityState={{ expanded: offen }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.titel} numberOfLines={1}>
            {s.titel}
          </Text>
          <Text style={styles.klein}>
            {s.karten.length} Karten · {s.leute} {s.leute === 1 ? 'Person' : 'Leute'}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void Clipboard.setStringAsync(s.code).catch(() => undefined);
            zeige(`Code ${s.code} kopiert`);
          }}
          hitSlop={8}
        >
          <Text style={styles.code}>{s.code}</Text>
        </Pressable>
      </Pressable>

      {offen ? (
        <>
          {s.karten.map((k) => (
            <View key={k.content_id} style={styles.zeile}>
              <Pressable onPress={() => router.push(`/reel/${encodeURIComponent(k.content_id)}`)} style={{ flex: 1 }}>
                <Text style={styles.zeileText} numberOfLines={2}>
                  {k.title}
                </Text>
                {k.von ? <Text style={styles.klein}>von {k.von}</Text> : null}
              </Pressable>
              <Pressable onPress={() => void karte(k.content_id, false)} hitSlop={8} accessibilityLabel={T('Herausnehmen')}>
                <Icon name="cross" size={14} color={color.ink.low} />
              </Pressable>
            </View>
          ))}

          <View style={styles.sucheZeile}>
            <Icon name="search" size={15} color={color.ink.low} />
            <TextInput
              value={suche}
              onChangeText={setSuche}
              placeholder={T('Karte suchen und dazulegen')}
              placeholderTextColor={color.ink.low}
              style={[styles.eingabe, { backgroundColor: 'transparent', paddingHorizontal: 0 }]}
            />
          </View>
          {treffer.map((t) => (
            <Pressable key={t.id} onPress={() => void karte(t.id, !drin.has(t.id))} style={styles.zeile}>
              <Text style={styles.zeileText} numberOfLines={2}>
                {t.title}
              </Text>
              <Icon name={drin.has(t.id) ? 'check' : 'plus'} size={15} color={drin.has(t.id) ? color.signal.success : color.akzent} />
            </Pressable>
          ))}

          {s.meiner && s.karten.length > 0 ? (
            <Pressable
              onPress={() => {
                haptics.select();
                const an = !standZeigen;
                setStandZeigen(an);
                if (an) api.gsKlassenstand(s.id).then(setStand).catch((e) => zeige(fehlerText(e, 'Ging nicht')));
              }}
              style={styles.standKnopf}
            >
              <Icon name="chart" size={14} color={color.akzent} />
              <Text style={styles.standKnopfText}>{T('Überblick')}</Text>
            </Pressable>
          ) : null}
          {s.meiner && standZeigen ? (
            stand ? <KlassenUeberblick stand={stand} /> : <Laden />
          ) : null}
          {!s.meiner ? (
            <Text style={styles.klein}>{T('Wer den Stapel angelegt hat, sieht anonym, wie gut die Gruppe die Karten kann – nie, wer was beantwortet hat.')}</Text>
          ) : null}

          <View style={styles.knoepfe}>
            {s.meiner && s.karten.length >= 2 ? (
              <View style={{ flex: 1 }}>
                <Button label={T('Posten')} onPress={() => void posten()} />
              </View>
            ) : null}
            <Pressable
              onPress={() => void api.gsVerlassen(s.id).then(neu).catch((e) => zeige(fehlerText(e, 'Ging nicht')))}
              hitSlop={6}
              style={styles.verlassen}
            >
              <Text style={styles.verlassenText}>{s.meiner ? 'Löschen' : 'Verlassen'}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** 0113: je Karte gelesen und Quote; unter `min` Antworten keine Quote. */
function KlassenUeberblick({ stand }: { stand: Klassenstand }) {
  const leute = Math.max(1, stand.leute);
  // Schwaechste zuerst: das ist die Frage, mit der man hier hinschaut.
  const karten = [...stand.karten].sort((a, b) => (a.quote ?? 101) - (b.quote ?? 101));
  return (
    <View style={styles.stand}>
      <Text style={styles.klein}>
        {stand.leute} {stand.leute === 1 ? 'Person' : 'Leute'} außer dir · anonym, Quote ab {stand.min} Antworten
      </Text>
      {karten.map((k) => {
        const farbe =
          k.quote == null ? color.ink.faint : k.quote >= 75 ? color.signal.success : k.quote >= 50 ? color.signal.warn : color.signal.error;
        return (
          <View key={k.content_id} style={styles.standZeile}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={styles.zeileText} numberOfLines={1}>
                {k.title}
              </Text>
              <View style={styles.standBalken}>
                <View style={[styles.standFuellung, { width: `${Math.round((k.gelesen / leute) * 100)}%` }]} />
              </View>
              <Text style={styles.klein}>
                {k.gelesen}/{stand.leute} gelesen · {k.geantwortet} geantwortet
              </Text>
            </View>
            <Text style={[styles.quote, { color: farbe }]}>{k.quote == null ? '–' : `${k.quote}%`}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stand: { gap: space.sm, paddingTop: space.xs },
  standKnopf: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  standKnopfText: { ...type.label, fontSize: 13, color: color.akzent },
  standZeile: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  standBalken: { height: 3, borderRadius: 2, backgroundColor: color.ink.faint, overflow: 'hidden' },
  standFuellung: { height: 3, backgroundColor: color.akzent },
  quote: { ...type.mono, fontSize: 15, minWidth: 44, textAlign: 'right' },
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
  kopf: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titel: { ...type.title, fontSize: 17, color: color.ink.max },
  code: { ...type.mono, fontSize: 13, letterSpacing: 1.5, color: color.akzent },
  klein: { ...type.meta, fontSize: 11, color: color.ink.low },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 6 },
  zeileText: { ...type.label, fontSize: 14, color: color.ink.high, flex: 1 },
  sucheZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
  },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  eingabeZeile: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  eingabe: {
    flex: 1, minWidth: 0,
    ...type.body,
    fontSize: 14,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  knoepfe: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  verlassen: { paddingVertical: space.sm, paddingHorizontal: space.sm },
  verlassenText: { ...type.label, fontSize: 12, color: color.ink.low },
  notiz: { ...type.body, fontSize: 13, color: color.ink.mid, textAlign: 'center' },
});
