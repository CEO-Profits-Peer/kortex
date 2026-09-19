import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { api } from '@/lib/supabase';
import type { Category, Profile } from '@/lib/types.db';
import { flaeche } from '@/theme/design';
import { categoryAccent, color, gewaehlt, gewaehltText, radius, space, type } from '@/theme/tokens';

import { COUNTRIES, type Country } from './regions';

import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { fehlerText } from '@/lib/fehler';

/**
 * Onboarding (seit 19.09.): Name, Land/Region, Geburtsjahr, Interessen - und
 * zum Schluss das eigene Profil, "Das bist du", dann "Weiter" zur Tour im
 * Feed. Der Name zuerst, weil ein Konto mit Namen sich nach einem Anfang
 * anfuehlt, nicht nach einem Formular.
 *
 * Warum Geburtsjahr statt Altersklasse: aus dem Jahr laesst sich die Klasse
 * ableiten, umgekehrt nicht. Und es steuert das DSGVO-Gate - in Oesterreich
 * liegt die Einwilligungsfaehigkeit bei 14, in Deutschland bei 16.
 *
 * Gespeichert wird per RPC (complete_onboarding), weil birth_year fuer den
 * Client per Spalten-Grant gesperrt ist.
 */

/** Name, Region, Jahr, Interessen - das Profil danach zaehlt nicht mehr als Schritt. */
const STEPS = 4;

export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  // Nach dem Speichern: das fertige Profil zeigen, bevor es in den Feed geht.
  const [profil, setProfil] = useState<Profile | null>(null);
  const [country, setCountry] = useState<Country | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Nur Wurzelkategorien zur Auswahl. Sieben Kacheln sind ueberschaubar;
  // die Unterkategorien erben das Interesse ohnehin (get_feed, 0006).
  const roots = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 60 }, (_, i) => now - 8 - i);
  }, []);

  const nameOk = name.trim().length >= 2;
  const canNext = [nameOk, Boolean(country && region), Boolean(birthYear), picked.length >= 3][step];

  const toggle = (id: string) => {
    haptics.select();
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const finish = async () => {
    if (!country || !birthYear) return;
    setBusy(true);
    setError(null);
    try {
      await api.completeOnboarding({
        country: country.code,
        region,
        birthYear,
        language: country.language,
        timezone: country.timezone,
        categories: picked,
      });
      // Den Namen danach setzen: complete_onboarding kennt ihn nicht, und
      // update_my_settings ist derselbe Weg wie spaeter in den Einstellungen.
      const p = await api.updateSettings({ display_name: name.trim() });
      haptics.success();
      analytics.onboardingDone(picked.length);
      setProfil(p);
    } catch (e) {
      setError(fehlerText(e, 'Speichern fehlgeschlagen'));
      setBusy(false);
    }
  };

  // --- Zum Schluss: "Das bist du" ---------------------------------------------------
  if (profil) {
    return (
      <GridBackground>
        <View style={[styles.root, styles.mitte, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
          <View style={styles.profil}>
            <Avatar seed={profil.avatar_seed} path={profil.avatar_path} size={112} />
            <Text style={styles.profilName}>{profil.display_name || name.trim()}</Text>
            <Text style={styles.profilHandle}>@{profil.handle}</Text>
            <Text style={[styles.hint, { textAlign: 'center' }]}>
              Das bist du. Profilbild und Name kannst du jederzeit im Profil ändern – jetzt zeigen wir dir kurz,
              wie der Feed funktioniert.
            </Text>
          </View>
          <View style={[styles.footer, { alignSelf: 'stretch' }]}>
            <Button label="Weiter" onPress={onDone} />
          </View>
        </View>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.progress}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <View key={i} style={[styles.bar, i <= step && styles.barOn]} />
          ))}
        </View>

        {/* --- 0 · Name ------------------------------------------------------ */}
        {step === 0 && (
          <>
            <Text style={styles.question}>Wie heißt du?</Text>
            <Text style={styles.hint}>
              So sehen dich andere in Beiträgen, Duellen und Ligen. Ein Spitzname reicht völlig.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Dein Name"
              placeholderTextColor={color.ink.low}
              maxLength={30}
              autoFocus
              autoCapitalize="words"
              style={styles.nameEingabe}
              onSubmitEditing={() => {
                if (nameOk) setStep(1);
              }}
            />
            <View style={{ flex: 1 }} />
          </>
        )}

        {/* --- 1 · Region ---------------------------------------------------- */}
        {step === 1 && (
          <>
            <Text style={styles.question}>Wo bist du zuhause?</Text>
            <Text style={styles.hint}>
              Bestimmt, welche lokalen Themen du siehst und gegen wen du auf der
              Rangliste antrittst.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
              <View style={styles.chips}>
                {COUNTRIES.map((c) => (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      haptics.select();
                      setCountry(c);
                      setRegion(null);
                    }}
                    style={[styles.chip, country?.code === c.code && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, country?.code === c.code && styles.chipTextOn]}>
                      {c.flag}  {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {country ? (
                <View style={styles.list}>
                  {country.regions.map((r) => (
                    <Pressable
                      key={r.code}
                      onPress={() => {
                        haptics.select();
                        setRegion(r.code);
                      }}
                      style={[styles.row, region === r.code && styles.rowOn]}
                    >
                      <Text style={[styles.rowText, region === r.code && styles.rowTextOn]}>
                        {r.label}
                      </Text>
                      <Text style={styles.rowCode}>{r.code}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </>
        )}

        {/* --- 2 · Geburtsjahr ----------------------------------------------- */}
        {step === 2 && (
          <>
            <Text style={styles.question}>In welchem Jahr bist du geboren?</Text>
            <Text style={styles.hint}>
              Nicht für Werbung. Es steuert das Schwierigkeitsniveau und die
              gesetzlichen Regeln für Minderjährige.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
              <View style={styles.chips}>
                {years.map((y) => (
                  <Pressable
                    key={y}
                    onPress={() => {
                      haptics.select();
                      setBirthYear(y);
                    }}
                    style={[styles.yearChip, birthYear === y && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, birthYear === y && styles.chipTextOn]}>{y}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        {/* --- 3 · Interessen ------------------------------------------------ */}
        {step === 3 && (
          <>
            <Text style={styles.question}>Was interessiert dich?</Text>
            <Text style={styles.hint}>
              Mindestens 3. Zwanzig Prozent deines Feeds bleiben trotzdem
              bewusst außerhalb davon.
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
              <View style={styles.tiles}>
                {roots.map((c) => {
                  const on = picked.includes(c.id);
                  const accent = categoryAccent(c.accent_hex);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => toggle(c.id)}
                      style={[styles.tile, on && { borderColor: accent, borderWidth: 1.5 }]}
                    >
                      <Text style={styles.tileEmoji}>{c.emoji ?? '◇'}</Text>
                      <Text style={[styles.tileLabel, on && { color: accent }]}>
                        {c.display_name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {roots.length === 0 ? (
                <Text style={styles.hint}>
                  Keine Kategorien geladen — sind die Seed-Dateien eingespielt?
                </Text>
              ) : null}
            </ScrollView>
          </>
        )}

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={
              canNext
                ? step === STEPS - 1
                  ? "Los geht's"
                  : 'Weiter'
                : ['Name eingeben', 'Land und Region wählen', 'Geburtsjahr wählen', `Noch ${Math.max(0, 3 - picked.length)} Themen`][step]
            }
            busy={busy}
            onPress={() => {
              // Statt eines ausgegrauten Knopfs: er reagiert immer, sagt aber
              // was fehlt. Ein toter Knopf laesst Leute glauben, die App haenge.
              if (!canNext) return haptics.warning();
              if (step === STEPS - 1) return void finish();
              analytics.onboardingStep(step + 1);
              setStep(step + 1);
            }}
          />
          {step > 0 ? (
            <Button label="Zurück" variant="quiet" onPress={() => setStep(step - 1)} />
          ) : null}
        </View>
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.xl },

  progress: { flexDirection: 'row', gap: 4, paddingBottom: space.xl },
  bar: { flex: 1, height: 2, borderRadius: 2, backgroundColor: color.ink.faint },
  barOn: { backgroundColor: color.signal.primary },

  question: { ...type.title, color: color.ink.max },
  hint: { ...type.body, fontSize: 15, color: color.ink.mid, marginTop: space.sm },
  scroll: { flex: 1, marginTop: space.lg },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  yearChip: {
    minWidth: 76,
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  chipOn: gewaehlt({ borderColor: color.signal.primary, borderWidth: 1.5 }),
  chipText: { ...type.label, color: color.ink.high },
  chipTextOn: gewaehltText({ color: color.signal.primary }),

  list: { marginTop: space.lg, gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  rowOn: gewaehlt({ backgroundColor: color.bgElevated, borderWidth: 1.5, borderColor: color.signal.primary }),
  rowText: { ...type.body, color: color.ink.high },
  rowTextOn: gewaehltText({ color: color.signal.primary }),
  rowCode: { ...type.mono, color: color.ink.low },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48%',
    aspectRatio: 1.5,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: space.lg,
    gap: space.xs,
    ...flaeche(10),
  },
  tileEmoji: { fontSize: 26 },
  tileLabel: { ...type.label, color: color.ink.high },

  footer: { gap: space.sm, paddingTop: space.lg },

  nameEingabe: {
    ...type.title,
    fontSize: 24,
    color: color.ink.max,
    marginTop: space.xl,
    paddingVertical: space.md,
    borderBottomWidth: 1.5,
    borderBottomColor: color.signal.primary,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  mitte: { alignItems: 'center', justifyContent: 'space-between' },
  profil: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  profilName: { ...type.title, fontSize: 28, color: color.ink.max, marginTop: space.md },
  profilHandle: { ...type.mono, fontSize: 14, color: color.ink.mid },
  error: { ...type.meta, color: color.signal.error },
});
