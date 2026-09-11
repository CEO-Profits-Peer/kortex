import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { COUNTRIES } from '@/features/onboarding/regions';
import { BRAND } from '@/lib/brand';
import { haptics } from '@/lib/haptics';
import { stopMusic } from '@/lib/music';
import { sound } from '@/lib/sound';
import { SUPPORTED, type Language } from '@/lib/i18n';
import { setPref, usePrefs } from '@/lib/prefs';
import { type PushState, disablePush, enablePush, pushState } from '@/lib/push';
import { api } from '@/lib/supabase';
import type { Profile } from '@/lib/types.db';
import { signOut } from '@/lib/useSession';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Einstellungen.
 *
 * Zwei Ebenen, bewusst getrennt:
 *   Konto  -> profiles, gilt auf allen Geraeten (Sprache, Region, Rangliste,
 *             Tagesziel)
 *   Geraet -> AsyncStorage, gilt nur hier (Haptik, Bewegung, Ton)
 *
 * Der Datenbereich unten ist keine Kür: Auskunft und Löschung sind bei einer
 * Zielgruppe ab 13 Jahren gesetzlich verlangt (DSGVO Art. 15 und 17) - und
 * zwar in der App erreichbar, nicht per Mail an den Betreiber.
 */

/**
 * Die Stufen des Sprachreglers.
 *
 * DE und EN als Beschriftung, dazwischen das Mischungsverhältnis. Wer
 * "DE" wählt, bekommt ausschließlich deutsche Karten - auch wenn dadurch
 * weniger nachkommt. Das ist der Sinn der Einstellung: vorher entschied
 * das die App selbst, sobald der Vorrat dünn wurde.
 */
const LANGUAGE_STEPS = [
  { pct: 0,   label: 'DE',    hint: 'Nur deutsche Inhalte' },
  { pct: 25,  label: '¾ DE',  hint: 'Überwiegend Deutsch, etwas Englisch' },
  { pct: 50,  label: '½',     hint: 'Deutsch und Englisch gemischt' },
  { pct: 75,  label: '¾ EN',  hint: 'Überwiegend Englisch, etwas Deutsch' },
  { pct: 100, label: 'EN',    hint: 'Nur englische Inhalte' },
] as const;

/** Alte oder von Hand gesetzte Werte auf die nächste Stufe abbilden. */
function nearestStep(pct: number): number {
  return LANGUAGE_STEPS.reduce((best, s) =>
    Math.abs(s.pct - pct) < Math.abs(best - pct) ? s.pct : best,
  LANGUAGE_STEPS[0].pct as number);
}

function Row({
  label,
  hint,
  right,
  onPress,
  danger,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && { color: color.signal.error }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const GOALS = [30, 60, 100, 200];

/** Was unter dem Schalter steht - je nachdem, warum er so aussieht, wie er aussieht. */
const PUSH_HINT: Record<PushState, string | null> = {
  on: 'Du bekommst Bescheid, wenn dir jemand folgt oder eine Karte teilt.',
  off: 'Beim Einschalten fragt der Browser einmal um Erlaubnis.',
  denied: null, // steht als Fehlermeldung darunter, sonst zweimal dasselbe
  unsupported: 'Dieser Browser kann keine Benachrichtigungen.',
  'needs-install': 'Auf dem iPhone nur, wenn ElyCic vom Startbildschirm läuft.',
};

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const prefs = usePrefs();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>('off');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    void api.getMyProfile().then(setProfile).catch(() => setProfile(null));
    void pushState().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  /**
   * Nicht async deklariert und ohne `await` davor aufgerufen.
   *
   * Die Berechtigungsfrage des Browsers braucht eine Nutzergeste, und die
   * gilt nur so lange, wie der Klick noch "frisch" ist. Ein await vor
   * `Notification.requestPermission()` kostet sie - dann erscheint die
   * Frage kommentarlos nicht, und der Schalter springt einfach zurueck.
   */
  const togglePush = (want: boolean) => {
    setPushBusy(true);
    setPushError(null);
    (want ? enablePush() : disablePush())
      .then((next) => {
        setPush(next);
        if (next === 'denied') {
          setPushError(
            'Dein Browser hat Benachrichtigungen für diese Seite blockiert. ' +
              'Das lässt sich nur in den Browsereinstellungen zurücknehmen.',
          );
        } else {
          haptics.select();
        }
      })
      .catch((e: unknown) =>
        setPushError(e instanceof Error ? e.message : 'Hat nicht geklappt'),
      )
      .finally(() => setPushBusy(false));
  };

  const patch = useCallback(async (p: Record<string, unknown>) => {
    setBusy(true);
    try {
      setProfile(await api.updateSettings(p));
      haptics.select();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }, []);

  const exportData = async () => {
    setBusy(true);
    try {
      const data = await api.exportMyData();
      await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
      setNote('Alle deine Daten liegen jetzt als JSON in der Zwischenablage.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Export fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Konto endgültig löschen?',
      'Profil, XP, Streak, Wiederholungen und Lesehistorie werden sofort gelöscht. ' +
        'Das lässt sich nicht rückgängig machen.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteMyAccount();
              await signOut();
            } catch (e) {
              setNote(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
            }
          },
        },
      ],
    );
  };

  if (!profile) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  const country = COUNTRIES.find((c) => c.code === profile.country_code);
  const region = country?.regions.find((r) => r.code === profile.region_code);

  return (
    <GridBackground>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <>
            <Icon name="back" size={15} color={color.ink.mid} />
            <Text style={styles.backText}>zurück</Text>
          </>
        </Pressable>

        <Text style={styles.pageTitle}>Einstellungen</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}

        {/* --- Konto ---------------------------------------------------- */}
        <Section title="Konto">
          <Row label="Benutzername" hint="Öffentlich auf der Rangliste" right={
            <Text style={styles.value}>@{profile.handle}</Text>
          } />
          <Row
            label="Profil und E-Mail"
            hint="Bild, Name, Bio — und dein Konto sichern"
            onPress={() => router.push('/account')}
            right={<Icon name="chevron" size={15} color={color.ink.low} />}
          />
          <Row
            label="Mein öffentliches Profil"
            hint="So sehen andere dich"
            onPress={() => router.push(`/u/${encodeURIComponent(profile.handle)}`)}
            right={<Icon name="chevron" size={15} color={color.ink.low} />}
          />
        </Section>

        {/* --- Inhalte -------------------------------------------------- */}
        <Section title="Inhalte">
          <Row label="Sprache" hint="Bestimmt, welche Karten du bekommst" right={
            <View style={styles.choices}>
              {SUPPORTED.map((lang: Language) => (
                <Pressable
                  key={lang}
                  onPress={() => void patch({ language: lang })}
                  style={[styles.choice, profile.language === lang && styles.choiceOn]}
                >
                  <Text style={[
                    styles.choiceText,
                    profile.language === lang && { color: color.signal.primary },
                  ]}>
                    {lang.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          } />

          <Row
            label="Region"
            hint="Lokale Themen und deine Rangliste"
            right={<Text style={styles.value}>{region?.label ?? country?.label ?? '—'}</Text>}
          />

          {/**
            * Sprachmischung.
            *
            * Fünf Stufen statt eines stufenlosen Reglers: "ein bisschen
            * mehr Englisch" ist keine Absicht, die jemand hat. Die Enden
            * sind die beiden klaren Fälle, die Mitte ist die Mischung -
            * und alles davon ist mit einem Tipp erreichbar statt mit
            * einer Zielübung.
            */}
          <Row
            label="Sprache der Inhalte"
            hint={LANGUAGE_STEPS.find((s2) => s2.pct === nearestStep(profile.feed_english_pct))?.hint}
            right={
              <View style={styles.choices}>
                {LANGUAGE_STEPS.map((step) => {
                  const on = nearestStep(profile.feed_english_pct) === step.pct;
                  return (
                    <Pressable
                      key={step.pct}
                      onPress={() => void patch({ feed_english_pct: step.pct })}
                      style={[styles.choice, on && styles.choiceOn]}
                      accessibilityLabel={step.hint}
                    >
                      <Text style={[styles.choiceText, on && { color: color.signal.primary }]}>
                        {step.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            }
          />

          <Row label="Genug für heute" hint="Ab dieser Zahl bietet die App das Aufhören an" right={
            <View style={styles.choices}>
              {GOALS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => void patch({ daily_goal_cards: g })}
                  style={[styles.choice, profile.daily_goal_cards === g && styles.choiceOn]}
                >
                  <Text style={[
                    styles.choiceText,
                    profile.daily_goal_cards === g && { color: color.signal.primary },
                  ]}>
                    {g}
                  </Text>
                </Pressable>
              ))}
            </View>
          } />
        </Section>

        {/* --- Sichtbarkeit --------------------------------------------- */}
        <Section title="Sichtbarkeit">
          <Row
            label="Likes öffentlich zeigen"
            hint="Aus bedeutet: niemand sieht namentlich, was du likest. Der allgemeine Zähler auf der Karte läuft trotzdem mit."
            right={
              <Switch
                value={profile.likes_public}
                onValueChange={(v) => void patch({ likes_public: v })}
                trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
          <Row
            label="Auf der Rangliste erscheinen"
            hint="Aus bedeutet: niemand sieht dich, du siehst weiterhin alle."
            right={
              <Switch
                value={profile.leaderboard_opt_in}
                onValueChange={(v) => void patch({ leaderboard_opt_in: v })}
                trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
        </Section>

        {/* --- Erinnerungen --------------------------------------------- */}
        <Section title="Erinnerungen">
          <Row
            label="Fällige Wiederholungen"
            hint="Die Erinnerung, die tatsächlich beim Lernen hilft"
            right={
              <Switch
                value={profile.notify_reviews}
                onValueChange={(v) => void patch({ notify_reviews: v })}
                trackColor={{ true: color.signal.mastery, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
          <Row
            label="Streak in Gefahr"
            right={
              <Switch
                value={profile.notify_streak}
                onValueChange={(v) => void patch({ notify_streak: v })}
                trackColor={{ true: color.signal.warn, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
        </Section>

        {/* --- Push ------------------------------------------------------ */}
        <Section title="Benachrichtigungen">
          <Row
            label="Neue Follower & geteilte Karten"
            hint={PUSH_HINT[push] ?? undefined}
            right={
              push === 'unsupported' || push === 'needs-install' ? (
                <Text style={styles.pushNote}>
                  {push === 'needs-install' ? 'nur als App' : 'nicht möglich'}
                </Text>
              ) : (
                <Switch
                  value={push === 'on'}
                  disabled={push === 'denied' || pushBusy}
                  // Kein `void`: der Browser verlangt fuer die
                  // Berechtigungsfrage eine echte Nutzergeste, und die
                  // ueberlebt keinen zusaetzlichen Umweg.
                  onValueChange={(v) => togglePush(v)}
                  trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                  thumbColor={color.bg}
                />
              )
            }
          />
          {push === 'on' ? (
            <Row
              label=""
              hint="Ob du sie überhaupt bekommen willst, steht hier; wer dir was schickt, steuerst du übers Folgen."
              right={
                <Switch
                  value={profile.notify_social}
                  onValueChange={(v) => void patch({ notify_social: v })}
                  trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                  thumbColor={color.bg}
                />
              }
            />
          ) : null}
          {pushError ? <Row label="" hint={pushError} /> : null}
        </Section>

        {/* --- Dieses Gerät --------------------------------------------- */}
        <Section title="Dieses Gerät">
          <Row
            label="Haptisches Feedback"
            hint="Vibration bei Interaktionen"
            right={
              <Switch
                value={prefs.haptics}
                onValueChange={(v) => void setPref('haptics', v)}
                trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
          <Row
            label="Bewegung reduzieren"
            hint="Weniger Animationen, ruhigerer Bildaufbau"
            right={
              <Switch
                value={prefs.reduceMotion}
                onValueChange={(v) => void setPref('reduceMotion', v)}
                trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
          <Row
            label="Hintergrundmusik"
            hint="Eine ruhige Fläche pro Karte. Jede Karte klingt anders."
            right={
              <Switch
                value={prefs.musicEnabled}
                onValueChange={(v) => {
                  void setPref('musicEnabled', v);
                  if (!v) stopMusic();
                }}
                trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
          <Row
            label="Töne"
            hint="Kurze Klänge beim Einrasten, Lösen und Aufsteigen"
            right={
              <Switch
                value={prefs.audioEnabled}
                onValueChange={(v) => {
                  void setPref('audioEnabled', v);
                  // Beim Einschalten sofort ein Beispiel: sonst schaltet man
                  // etwas ein, hört nichts und weiß nicht, ob es geht.
                  if (v) sound.correct();
                }}
                trackColor={{ true: color.signal.primary, false: color.ink.faint }}
                thumbColor={color.bg}
              />
            }
          />
        </Section>

        {/* --- Daten ----------------------------------------------------- */}
        <Section title="Deine Daten">
          <Row
            label="Daten exportieren"
            hint="Alles über dich als JSON in die Zwischenablage (DSGVO Art. 15)"
            onPress={exportData}
            right={<Icon name="chevron" size={15} color={color.ink.low} />}
          />
          <Row
            label="Konto löschen"
            hint="Sofort und endgültig, inklusive aller Fortschritte (DSGVO Art. 17)"
            onPress={confirmDelete}
            danger
            right={<Icon name="chevron" size={15} color={color.signal.error} />}
          />
        </Section>

        <Section title={`Über ${BRAND.name}`}>
          <Row label="Version" right={<Text style={styles.value}>0.1.0 · Prototyp</Text>} />
          <Row label="Konto-ID" hint="Bei Fehlermeldungen hilfreich" right={
            <Text style={styles.mono} numberOfLines={1}>{profile.id.slice(0, 8)}…</Text>
          } />
        </Section>

        <Button label="Abmelden" variant="ghost" busy={busy} onPress={() => void signOut()} />
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  pushNote: { ...type.meta, color: color.ink.low },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.xl, gap: space.lg },

  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
  },
  backText: { ...type.meta, color: color.ink.mid },
  pageTitle: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  note: { ...type.body, fontSize: 14, color: color.signal.primary },

  section: { gap: space.sm },
  sectionTitle: {
    ...type.label,
    color: color.ink.mid,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: color.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.bg,
    minHeight: 54,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { ...type.body, fontSize: 16, color: color.ink.high },
  rowHint: { ...type.meta, color: color.ink.low, lineHeight: 16 },

  value: { ...type.body, fontSize: 15, color: color.ink.mid },
  mono: { ...type.mono, color: color.ink.low, maxWidth: 110 },
  soon: { ...type.meta, color: color.ink.low },
  chevron: { fontSize: 16, color: color.ink.low },

  choices: { flexDirection: 'row', gap: 6 },
  choice: {
    minWidth: 38,
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  choiceOn: { borderColor: color.signal.primary },
  choiceText: { ...type.meta, color: color.ink.mid },
});
