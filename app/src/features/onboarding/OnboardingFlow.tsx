import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { api } from '@/lib/supabase';
import type { Category } from '@/lib/types.db';
import { flaeche } from '@/theme/design';
import { categoryAccent, color, gewaehlt, gewaehltText, radius, space, type } from '@/theme/tokens';

import { COUNTRIES, type Country } from './regions';

import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { fehlerText } from '@/lib/fehler';

/**
 * Onboarding in drei Schritten: Land/Region, Geburtsjahr, Interessen.
 *
 * Warum Geburtsjahr statt Altersklasse: aus dem Jahr laesst sich die Klasse
 * ableiten, umgekehrt nicht. Und es steuert das DSGVO-Gate - in Oesterreich
 * liegt die Einwilligungsfaehigkeit bei 14, in Deutschland bei 16.
 *
 * Gespeichert wird per RPC (complete_onboarding), weil birth_year fuer den
 * Client per Spalten-Grant gesperrt ist.
 */

const STEPS = 3;

export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
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

  const canNext = [Boolean(country && region), Boolean(birthYear), picked.length >= 3][step];

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
      haptics.success();
      analytics.onboardingDone(picked.length);
      onDone();
    } catch (e) {
      setError(fehlerText(e, 'Speichern fehlgeschlagen'));
      setBusy(false);
    }
  };

  return (
    <GridBackground>
      <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.progress}>
          {Array.from({ length: STEPS }).map((_, i) => (
            <View key={i} style={[styles.bar, i <= step && styles.barOn]} />
          ))}
        </View>

        {/* --- 1 · Region ---------------------------------------------------- */}
        {step === 0 && (
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
        {step === 1 && (
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
        {step === 2 && (
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
                : ['Land und Region wählen', 'Geburtsjahr wählen', `Noch ${Math.max(0, 3 - picked.length)} Themen`][step]
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
  error: { ...type.meta, color: color.signal.error },
});
