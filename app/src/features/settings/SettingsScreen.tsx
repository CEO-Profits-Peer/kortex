import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Icon, type IconName } from '@/components/Icon';
import { COUNTRIES } from '@/features/onboarding/regions';
import { BRAND } from '@/lib/brand';
import { haptics } from '@/lib/haptics';
import { resetTabHints } from '@/components/TabHint';
import { resetFeedTutorial } from '@/features/feed/FeedTutorial';
import { stopMusic } from '@/lib/music';
import { personName } from '@/lib/name';
import { sound } from '@/lib/sound';
import i18n, { SUPPORTED, type Language } from '@/lib/i18n';
import { setPref, usePrefs } from '@/lib/prefs';
import { stimmProbe, stimmenFuer } from '@/lib/speech';
import { type PushState, disablePush, enablePush, pushState } from '@/lib/push';
import { api } from '@/lib/supabase';
import type { Profile } from '@/lib/types.db';
import { signOut } from '@/lib/useSession';
import { fehlerText } from '@/lib/fehler';
import { CodeEinloesen } from '@/features/pro/CodeEinloesen';
import { zeigeProSperre } from '@/components/ProSperre';
import { proNeuLaden, useIchPro } from '@/lib/pro';
import { PROFIL_THEMES } from '@/features/pro/ProfilKopf';
import {
  LINSE,
  MUSTER,
  UMSCHALTBAR,
  ZWEI,
  designWechseln,
  flaeche,
  linseWechseln,
  musterWechseln,
  type Linse,
  type Muster,
} from '@/theme/design';
import { color, gewaehlt, gewaehltText, radius, space, type } from '@/theme/tokens';

/**
 * Einstellungen.
 *
 * Zwei Ebenen, bewusst getrennt:
 *   Konto  -> profiles, gilt auf allen Geraeten (Sprache, Region, Rangliste,
 *             Tagesziel)
 *   Geraet -> AsyncStorage, gilt nur hier (Haptik, Bewegung, Ton)
 *
 * Zweite Fassung ("Einstellungen verbessern"). Die erste war eine lange Liste
 * ohne Halt: acht Ueberschriften, jede Zeile mit einem Satz als Hinweis, und
 * Knoepfe wie "Erklärungen nochmal zeigen". Jetzt:
 *   - oben das eigene Profil, weil man von dort am haeufigsten weiter will
 *   - jede Gruppe eine eigene Flaeche mit Symbol - man findet "Push" am Bild,
 *     nicht durch Lesen
 *   - Beschriftungen kurz, Knoepfe EIN Wort, Hinweise hoechstens eine Zeile
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
 * weniger nachkommt.
 */
const LANGUAGE_STEPS = [
  { pct: 0,   label: 'DE',    hint: 'Nur Deutsch' },
  { pct: 25,  label: '¾ DE',  hint: 'Meist Deutsch' },
  { pct: 50,  label: '½',     hint: 'Halb, halb' },
  { pct: 75,  label: '¾ EN',  hint: 'Meist Englisch' },
  { pct: 100, label: 'EN',    hint: 'Nur Englisch' },
] as const;

/** Alte oder von Hand gesetzte Werte auf die nächste Stufe abbilden. */
function nearestStep(pct: number): number {
  return LANGUAGE_STEPS.reduce((best, s) =>
    Math.abs(s.pct - pct) < Math.abs(best - pct) ? s.pct : best,
  LANGUAGE_STEPS[0].pct as number);
}

const GOALS = [30, 60, 100, 200];

/** Was unter dem Push-Schalter steht - je nachdem, warum er so aussieht. */
const PUSH_HINT: Record<PushState, string | null> = {
  on: 'Follower, Kommentare, Erwähnungen, Duelle. Likes nur in der Glocke.',
  off: 'Der Browser fragt einmal um Erlaubnis.',
  denied: null, // steht als Fehlermeldung darunter, sonst zweimal dasselbe
  unsupported: 'Dieser Browser kann das nicht.',
  'needs-install': 'Am iPhone nur als installierte App.',
};

/** Eine Gruppe: Symbol, Titel, eine Flaeche fuer ihre Zeilen. */
function Gruppe({
  icon,
  titel,
  children,
}: {
  icon: IconName;
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.gruppe}>
      <View style={styles.gruppeKopf}>
        <Icon name={icon} size={15} color={color.ink.low} />
        <Text style={styles.gruppeTitel}>{titel}</Text>
      </View>
      <View style={styles.flaeche}>{children}</View>
    </View>
  );
}

/**
 * Eine Zeile.
 *
 * `rechts` steht neben der Beschriftung, `unten` darunter ueber die ganze
 * Breite - eine Reihe aus fuenf Auswahlknoepfen neben einem Text liesse dem
 * Text sechzig Pixel, und dann bricht er auf vier Zeilen.
 */
function Zeile({
  label,
  hint,
  rechts,
  unten,
  onPress,
  gefahr,
  erste,
}: {
  label: string;
  hint?: string | null;
  rechts?: React.ReactNode;
  unten?: React.ReactNode;
  onPress?: () => void;
  gefahr?: boolean;
  /** Die erste Zeile einer Gruppe bekommt keine Trennlinie oben. */
  erste?: boolean;
}) {
  const inhalt = (
    <View style={[styles.zeile, !erste && styles.zeileLinie]}>
      <View style={styles.zeileOben}>
        <View style={styles.zeileText}>
          <Text style={[styles.label, gefahr && { color: color.signal.error }]}>{label}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
        {rechts}
      </View>
      {unten ? <View style={styles.zeileUnten}>{unten}</View> : null}
    </View>
  );
  if (!onPress) return inhalt;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {inhalt}
    </Pressable>
  );
}

/** Ein Wort rechts in der Zeile - fuer Zeilen, die etwas tun statt umschalten. */
function Aktion({ text, gefahr }: { text: string; gefahr?: boolean }) {
  return (
    <View style={styles.aktion}>
      <Text style={[styles.aktionText, gefahr && { color: color.signal.error }]}>{text}</Text>
      <Icon name="chevron" size={13} color={gefahr ? color.signal.error : color.ink.low} />
    </View>
  );
}

function Schalter({
  wert,
  onChange,
  farbe = color.signal.primary,
  aus,
}: {
  wert: boolean;
  onChange: (v: boolean) => void;
  farbe?: string;
  aus?: boolean;
}) {
  return (
    <Switch
      value={wert}
      disabled={aus}
      onValueChange={onChange}
      trackColor={{ true: farbe, false: color.ink.faint }}
      thumbColor={color.bg}
    />
  );
}

/** Auswahl als zusammenhaengende Leiste statt einzelner Kaestchen. */
/** "Microsoft Katja Online (Natural) - German (Germany)" -> "Katja". */
function kurzName(name: string): string {
  const ohne = name.replace(/^(Microsoft|Google|Apple)\s+/i, '').split(/[\s(-]/)[0];
  return ohne || name;
}

function Auswahl<T extends string | number>({
  optionen,
  wert,
  onChange,
}: {
  optionen: { wert: T; label: string }[];
  wert: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.auswahl}>
      {optionen.map((o) => {
        const an = o.wert === wert;
        return (
          <Pressable
            key={String(o.wert)}
            onPress={() => onChange(o.wert)}
            style={[styles.auswahlTeil, an && styles.auswahlAn]}
            accessibilityRole="button"
            accessibilityState={{ selected: an }}
          >
            <Text style={[styles.auswahlText, an && styles.auswahlTextAn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  // Vor jedem fruehen return: Hooks duerfen nicht bedingt laufen.
  const scrollY = useSharedValue(0);
  const prefs = usePrefs();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [push, setPush] = useState<PushState>('off');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  // Nur die Beschriftung. Ob das Tutorial wirklich laeuft, entscheidet der
  // Feed beim naechsten Oeffnen - hier steht nur, dass die Merkung weg ist.
  const [tutorialWieder, setTutorialWieder] = useState(false);
  const [designAn, setDesignAn] = useState(ZWEI);
  const ichPro = useIchPro();
  const [muster, setMuster] = useState<Muster>(MUSTER);
  const [stimmen, setStimmen] = useState<Record<string, { id: string; name: string }[]>>({});
  useEffect(() => {
    void Promise.all([stimmenFuer('de'), stimmenFuer('en')]).then(([de, en]) => setStimmen({ de, en }));
  }, []);
  const [linse, setLinse] = useState<Linse>(LINSE);
  const [designLaedt, setDesignLaedt] = useState(false);

  useEffect(() => {
    void api.getMyProfile().then(setProfile).catch(() => setProfile(null));
    void pushState().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  /**
   * Nicht async deklariert und ohne `await` davor aufgerufen.
   *
   * Die Berechtigungsfrage des Browsers braucht eine Nutzergeste, und die
   * gilt nur so lange, wie der Klick noch "frisch" ist. Ein await vor
   * `Notification.requestPermission()` kostet sie.
   */
  const togglePush = (want: boolean) => {
    setPushBusy(true);
    setPushError(null);
    (want ? enablePush() : disablePush())
      .then((next) => {
        setPush(next);
        if (next === 'denied') {
          setPushError('Im Browser blockiert. Nur in den Browsereinstellungen zu ändern.');
        } else {
          haptics.select();
        }
      })
      .catch((e: unknown) => setPushError(fehlerText(e, 'Hat nicht geklappt')))
      .finally(() => setPushBusy(false));
  };

  /**
   * Speichern - und die Auswahl SOFORT zeigen. Nur die Antwort auf den
   * LETZTEN Tipp darf sie noch ueberschreiben. Die Sprache der Oberflaeche
   * wechselt mit.
   */
  const letzteAnfrage = useRef(0);
  const patch = useCallback(async (p: Record<string, unknown>) => {
    const nr = ++letzteAnfrage.current;
    setProfile((alt) => (alt ? ({ ...alt, ...p } as Profile) : alt));
    if (typeof p.language === 'string') void i18n.changeLanguage(p.language);
    haptics.select();
    setBusy(true);
    try {
      const neu = await api.updateSettings(p);
      if (nr === letzteAnfrage.current) setProfile(neu);
    } catch (e) {
      setNote(fehlerText(e, 'Speichern fehlgeschlagen'));
      void api
        .getMyProfile()
        .then((echt) => {
          if (echt && nr === letzteAnfrage.current) {
            setProfile(echt);
            void i18n.changeLanguage(echt.language);
          }
        })
        .catch(() => undefined);
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
      setNote(fehlerText(e, 'Export fehlgeschlagen'));
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
              setNote(fehlerText(e, 'Löschen fehlgeschlagen'));
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
          <Laden color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  const country = COUNTRIES.find((c) => c.code === profile.country_code);
  const region = country?.regions.find((r) => r.code === profile.region_code);
  const sprachStufe = nearestStep(profile.feed_english_pct);

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Einstellungen" eyebrow="konto & app" scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: space.lg, paddingBottom: insets.bottom + space.xxxl },
        ]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {note ? <Text style={styles.note}>{note}</Text> : null}

        {/* --- Profil ----------------------------------------------------- */}
        <Pressable
          onPress={() => router.push('/account')}
          style={({ pressed }) => [styles.profil, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Avatar seed={profile.avatar_seed} path={profile.avatar_path} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.profilName} numberOfLines={1}>
              {personName(profile)}
            </Text>
            <Text style={styles.profilHandle} numberOfLines={1}>
              @{profile.handle}
            </Text>
          </View>
          <Aktion text="Bearbeiten" />
        </Pressable>

        {/* --- Design ----------------------------------------------------------
            Oben, direkt unter dem Profil: solange zwei Designs verglichen
            werden, ist das der Schalter, den man am oeftesten sucht. */}
        {UMSCHALTBAR ? (
          <Gruppe icon="mastery" titel="Design">
            <Zeile
              erste
              label="Design 2.0"
              hint={designLaedt ? 'Lädt neu …' : 'Bordeaux, Gold, Sechsecke. Gilt für dieses Gerät.'}
              rechts={
                <Schalter
                  wert={designAn}
                  aus={designLaedt}
                  onChange={(v) => {
                    setDesignAn(v);
                    setDesignLaedt(true);
                    designWechseln(v ? 'zwei' : 'klassisch');
                  }}
                />
              }
            />
            {ZWEI ? (
              <Zeile
                label="Sechseck"
                hint="Aktiver Tab und Feed-Leiste"
                unten={
                  <Auswahl
                    optionen={[
                      { wert: 'stein' as Linse, label: 'Stein' },
                      { wert: 'flach' as Linse, label: 'Flach' },
                      { wert: 'gold' as Linse, label: 'Gold' },
                    ]}
                    wert={linse}
                    onChange={(l) => {
                      if (l === 'gold' && !ichPro.pro) {
                        zeigeProSperre('Der Gold-Stein für Tab- und Feed-Leiste ist eine PRO-Option. Stein und Flach bleiben für alle.');
                        return;
                      }
                      setLinse(l);
                      setDesignLaedt(true);
                      linseWechseln(l);
                    }}
                  />
                }
              />
            ) : null}
            {ZWEI ? (
              <Zeile
                label="Profilkopf"
                hint="Sehen alle, die dein Profil öffnen"
                unten={
                  <Auswahl
                    optionen={[{ wert: 'ohne', label: 'Ohne' }, ...PROFIL_THEMES.map((t) => ({ wert: t.id as string, label: t.label }))]}
                    wert={ichPro.profilTheme ?? 'ohne'}
                    onChange={(t) => {
                      if (t !== 'ohne' && !ichPro.pro) {
                        zeigeProSperre('Profil-Themes für deine Kopfkarte gibt es mit PRO.');
                        return;
                      }
                      haptics.select();
                      void api
                        .profilThemeSetzen(t === 'ohne' ? null : t)
                        .then(() => proNeuLaden())
                        .catch((e) => setNote(fehlerText(e, 'Speichern ging nicht')));
                    }}
                  />
                }
              />
            ) : null}
            {ZWEI ? (
              <Zeile
                label="Hintergrund"
                unten={
                  <Auswahl
                    optionen={[
                      { wert: 'sechseck' as Muster, label: 'Waben' },
                      { wert: 'dreieck' as Muster, label: 'Dreiecke' },
                      { wert: 'gold' as Muster, label: 'Gold' },
                      { wert: 'keins' as Muster, label: 'Ohne' },
                    ]}
                    wert={muster}
                    onChange={(m) => {
                      if (m === 'gold' && !ichPro.pro) {
                        zeigeProSperre('Die Gold-Dreiecke im Hintergrund sind eine PRO-Option – sehr dezent und nur, wenn du sie willst.');
                        return;
                      }
                      setMuster(m);
                      setDesignLaedt(true);
                      musterWechseln(m);
                    }}
                  />
                }
              />
            ) : null}
          </Gruppe>
        ) : null}

        {/* --- Konto -------------------------------------------------------- */}
        <Gruppe icon="profile" titel="Konto">
          <Zeile
            erste
            label="Öffentliches Profil"
            hint="So sehen dich andere"
            onPress={() => router.push(`/u/${encodeURIComponent(profile.handle)}`)}
            rechts={<Aktion text="Ansehen" />}
          />
          <Zeile
            label="Region"
            hint="Lokale Themen und Rangliste"
            rechts={<Text style={styles.wert}>{region?.label ?? country?.label ?? '—'}</Text>}
          />
        </Gruppe>

        {/* --- Inhalte ------------------------------------------------------- */}
        <Gruppe icon="sliders" titel="Inhalte">
          {/* Die Sprache der OBERFLAECHE. Welche Karten kommen, entscheidet
              allein die Mischung darunter (get_feed liest feed_english_pct). */}
          <Zeile
            erste
            label="App-Sprache"
            hint="Noch nicht überall übersetzt"
            rechts={
              <Auswahl
                optionen={SUPPORTED.map((l: Language) => ({ wert: l as string, label: l.toUpperCase() }))}
                wert={profile.language}
                onChange={(l) => void patch({ language: l })}
              />
            }
          />
          {/* Fünf Stufen statt eines stufenlosen Reglers: "ein bisschen mehr
              Englisch" ist keine Absicht, die jemand hat. */}
          <Zeile
            label="Sprache der Karten"
            hint={LANGUAGE_STEPS.find((s) => s.pct === sprachStufe)?.hint}
            unten={
              <Auswahl
                optionen={LANGUAGE_STEPS.map((s) => ({ wert: s.pct as number, label: s.label }))}
                wert={sprachStufe}
                onChange={(pct) => void patch({ feed_english_pct: pct })}
              />
            }
          />
          <Zeile
            label="Tagesziel"
            hint="Danach bietet die App eine Pause an"
            unten={
              <Auswahl
                optionen={GOALS.map((g) => ({ wert: g, label: String(g) }))}
                wert={profile.daily_goal_cards}
                onChange={(g) => void patch({ daily_goal_cards: g })}
              />
            }
          />
        </Gruppe>

        {/* --- Sichtbarkeit -------------------------------------------------- */}
        <Gruppe icon="lock" titel="Sichtbarkeit">
          <Zeile
            erste
            label="Beiträge öffentlich"
            hint="Aus: nur Follower sehen sie, nicht in Explore"
            rechts={
              // `!== false`: ohne Feld gilt der Standard der Datenbank, "an" (0084).
              <Schalter
                wert={profile.beitraege_oeffentlich !== false}
                onChange={(v) => void patch({ beitraege_oeffentlich: v })}
              />
            }
          />
          <Zeile
            label="Reposts nur im Profil"
            hint="Nicht im Home deiner Follower"
            rechts={
              <Schalter
                wert={Boolean(profile.reposts_nur_profil)}
                onChange={(v) => void patch({ reposts_nur_profil: v })}
              />
            }
          />
          <Zeile
            label="Likes öffentlich"
            hint="Aus: niemand sieht, was du likest"
            rechts={<Schalter wert={profile.likes_public} onChange={(v) => void patch({ likes_public: v })} />}
          />
          <Zeile
            label="Rangliste"
            hint="Aus: du erscheinst nicht, siehst aber alle"
            rechts={
              <Schalter wert={profile.leaderboard_opt_in} onChange={(v) => void patch({ leaderboard_opt_in: v })} />
            }
          />
        </Gruppe>

        {/* --- Home ------------------------------------------------------------ */}
        <Gruppe icon="feed" titel="Home">
          <Zeile
            erste
            label="Keine Reposts"
            hint="Nur, was deine Leute selbst schreiben"
            rechts={
              <Schalter
                wert={Boolean(profile.home_ohne_reposts)}
                onChange={(v) => void patch({ home_ohne_reposts: v })}
              />
            }
          />
        </Gruppe>

        {/* --- Benachrichtigungen ---------------------------------------------- */}
        <Gruppe icon="bell" titel="Benachrichtigungen">
          <Zeile
            erste
            label="Push"
            hint={pushError ?? PUSH_HINT[push]}
            rechts={
              push === 'unsupported' || push === 'needs-install' ? (
                <Text style={styles.wert}>{push === 'needs-install' ? 'nur als App' : 'nicht möglich'}</Text>
              ) : (
                // Kein `void`: der Browser verlangt fuer die Berechtigungsfrage
                // eine echte Nutzergeste.
                <Schalter wert={push === 'on'} aus={push === 'denied' || pushBusy} onChange={(v) => togglePush(v)} />
              )
            }
          />
          {push === 'on' ? (
            <Zeile
              label="Soziales"
              hint="Follower, Kommentare, Duelle"
              rechts={<Schalter wert={profile.notify_social} onChange={(v) => void patch({ notify_social: v })} />}
            />
          ) : null}
          <Zeile
            label="Wochenrückblick"
            hint="Sonntagabend, wenn du gelernt hast"
            rechts={<Schalter wert={profile.notify_rueckblick !== false} onChange={(v) => void patch({ notify_rueckblick: v })} />}
          />
          <Zeile
            label="Wiederholungen"
            hint="Erinnerung, wenn Fragen fällig sind"
            rechts={
              <Schalter
                wert={profile.notify_reviews}
                farbe={color.signal.mastery}
                onChange={(v) => void patch({ notify_reviews: v })}
              />
            }
          />
          <Zeile
            label="Streak"
            hint="Erinnerung, bevor sie reißt"
            rechts={
              <Schalter
                wert={profile.notify_streak}
                farbe={color.signal.warn}
                onChange={(v) => void patch({ notify_streak: v })}
              />
            }
          />
        </Gruppe>

        {/* --- Dieses Gerät ------------------------------------------------------ */}
        <Gruppe icon="settings" titel="Dieses Gerät">
          <Zeile
            erste
            label="Vibration"
            rechts={<Schalter wert={prefs.haptics} onChange={(v) => void setPref('haptics', v)} />}
          />
          <Zeile
            label="Neue Animationen"
            hint="Test: Zahlen zählen hoch, Bildschirme gleiten herein"
            rechts={<Schalter wert={prefs.testAnimationen} onChange={(v) => void setPref('testAnimationen', v)} />}
          />
          <Zeile
            label="Weniger Bewegung"
            hint="Ruhigere Animationen"
            rechts={<Schalter wert={prefs.reduceMotion} onChange={(v) => void setPref('reduceMotion', v)} />}
          />
          <Zeile
            label="Musik"
            hint="Leise Fläche unter jeder Karte"
            rechts={
              <Schalter
                wert={prefs.musicEnabled}
                onChange={(v) => {
                  void setPref('musicEnabled', v);
                  if (!v) stopMusic();
                }}
              />
            }
          />
          <Zeile
            label="Töne"
            hint="Kurze Klänge beim Tippen"
            rechts={
              <Schalter
                wert={prefs.audioEnabled}
                onChange={(v) => {
                  void setPref('audioEnabled', v);
                  // Beim Einschalten sofort ein Beispiel - sonst weiss man nicht, ob es geht.
                  if (v) sound.correct();
                }}
              />
            }
          />
          <Zeile
            label="Erklärungen"
            hint={tutorialWieder ? 'Kommen beim nächsten Öffnen wieder' : 'Feed-Tutorial und Tab-Hinweise'}
            onPress={() => {
              void resetFeedTutorial();
              void resetTabHints(['home', 'studio', 'profil', 'suche']);
              setTutorialWieder(true);
              haptics.select();
            }}
            rechts={<Aktion text={tutorialWieder ? 'Erledigt' : 'Zeigen'} />}
          />
        </Gruppe>

        {/* --- Vorlesen (PRO, 19.09.) ------------------------------------------------ */}
        <Gruppe icon="listen" titel="Vorlesen">
          <Zeile
            erste
            label="Tempo"
            hint={ichPro.pro ? 'Für Vorlesen und Erklärkarten' : 'Mit PRO wählbar'}
            unten={
              <Auswahl
                optionen={[
                  { wert: 0.85, label: 'Ruhig' },
                  { wert: 1, label: 'Normal' },
                  { wert: 1.2, label: 'Zügig' },
                  { wert: 1.4, label: 'Schnell' },
                ]}
                wert={ichPro.pro ? prefs.sprechTempo : 1}
                onChange={(v) => {
                  if (!ichPro.pro) {
                    zeigeProSperre('Vorlese-Tempo und Stimme wählst du mit PRO – vorgelesen wird für alle.');
                    return;
                  }
                  void setPref('sprechTempo', v);
                  stimmProbe('de');
                }}
              />
            }
          />
          {(['de', 'en'] as const).map((sprache) => {
            const liste = stimmen[sprache] ?? [];
            const aktuell = liste.find((v) => v.id === prefs.stimmen?.[sprache]);
            return (
              <Zeile
                key={sprache}
                label={sprache === 'de' ? 'Stimme Deutsch' : 'Stimme Englisch'}
                hint={liste.length === 0 ? 'Dieses Gerät bietet keine Auswahl' : `${liste.length} Stimmen auf diesem Gerät`}
                onPress={() => {
                  if (!ichPro.pro) {
                    zeigeProSperre('Vorlese-Tempo und Stimme wählst du mit PRO – vorgelesen wird für alle.');
                    return;
                  }
                  if (liste.length === 0) return;
                  // Tippen blaettert weiter - bei 20 Stimmen passt keine Leiste.
                  const i = aktuell ? liste.indexOf(aktuell) : -1;
                  const naechste = i + 1 < liste.length ? liste[i + 1] : null;
                  const neu = { ...(prefs.stimmen ?? {}) };
                  if (naechste) neu[sprache] = naechste.id;
                  else delete neu[sprache];
                  void setPref('stimmen', neu).then(() => stimmProbe(sprache));
                  haptics.select();
                }}
                rechts={<Aktion text={ichPro.pro && aktuell ? kurzName(aktuell.name) : 'Standard'} />}
              />
            );
          })}
        </Gruppe>

        {/* --- Daten ---------------------------------------------------------------- */}
        <Gruppe icon="source" titel="Deine Daten">
          <Zeile
            erste
            label="Daten exportieren"
            hint="Alles über dich als JSON (DSGVO Art. 15)"
            onPress={exportData}
            rechts={<Aktion text="Export" />}
          />
          <Zeile
            label="Konto löschen"
            hint="Sofort und endgültig (DSGVO Art. 17)"
            onPress={confirmDelete}
            gefahr
            rechts={<Aktion text="Löschen" gefahr />}
          />
        </Gruppe>

        <Gruppe icon="mastery" titel="PRO">
          <CodeEinloesen />
        </Gruppe>

        <Button label="Abmelden" variant="ghost" busy={busy} onPress={() => void signOut()} />

        <Text style={styles.fuss}>
          {BRAND.name} 0.1.0 · Prototyp · Konto {profile.id.slice(0, 8)}
        </Text>
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.xl, gap: space.xl },

  note: { ...type.body, fontSize: 14, color: color.akzent },

  profil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(12),
  },
  profilName: { ...type.title, fontSize: 18, color: color.ink.max },
  profilHandle: { ...type.meta, color: color.ink.low },

  gruppe: { gap: space.sm },
  gruppeKopf: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.xs },
  gruppeTitel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1.2 },
  flaeche: {
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(12),
  },

  zeile: { paddingVertical: space.md, gap: space.sm },
  zeileLinie: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.ink.faint },
  zeileOben: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    minHeight: 32,
  },
  zeileUnten: { paddingTop: 2 },
  zeileText: { flex: 1, gap: 2 },
  label: { ...type.body, fontSize: 16, color: color.ink.high },
  hint: { ...type.meta, color: color.ink.low, lineHeight: 16 },

  wert: { ...type.body, fontSize: 15, color: color.ink.mid },

  aktion: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aktionText: { ...type.label, fontSize: 14, color: color.akzent },

  auswahl: {
    flexDirection: 'row',
    padding: 3,
    gap: 2,
    borderRadius: radius.pill,
    backgroundColor: color.bgSunken,
  },
  auswahlTeil: {
    flex: 1,
    minWidth: 40,
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  auswahlAn: gewaehlt({ backgroundColor: color.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: color.signal.primary }),
  auswahlText: { ...type.meta, color: color.ink.mid },
  auswahlTextAn: gewaehltText({ color: color.signal.primary }),

  fuss: { ...type.meta, fontSize: 10, color: color.ink.low, textAlign: 'center' },
});
