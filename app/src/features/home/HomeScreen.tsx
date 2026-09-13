import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { GridBackground } from '@/components/GridBackground';
import { Icon, type IconName } from '@/components/Icon';
import { TabHint, useTabHint } from '@/components/TabHint';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { beiWiederOnline } from '@/lib/online';
import { shareInvite } from '@/lib/share';
import { api } from '@/lib/supabase';
import type { HomeData, HomeEntry, HomePerson } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Home - was die Leute machen, denen du folgst.
 *
 * Absichtlich NICHT der eigene Stand (Streak, faellige Wiederholungen): der
 * steht im Profil. Home zeigt die anderen, und zwar so, dass man selbst
 * mitmachen will - deshalb stehen die drei Wege, selbst etwas beizutragen,
 * oben und nicht unter der Liste.
 *
 * Die Daten kommen in einem Aufruf (get_home, Migration 0076). Was dort
 * hinein darf, steht im Kopf der Migration - Kurse, Abzeichen und
 * Duellergebnisse nur von Leuten, die auf der Rangliste stehen wollen.
 *
 * Ein leeres Home ist der Normalfall, solange die App jung ist: bei 29 Konten
 * folgen 13 niemandem. Deshalb stehen darunter Vorschlaege, wem man folgen
 * kann, mit dem Knopf direkt daneben - der Weg aus dem leeren Zustand darf
 * nicht erst ueber die Suche fuehren.
 */

function wann(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'gerade';
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'gestern' : `${d} T`;
}

function zuProfil(handle: string) {
  haptics.light();
  router.push(`/u/${encodeURIComponent(handle)}`);
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const hinweis = useTabHint('home');
  const [daten, setDaten] = useState<HomeData | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [gefolgt, setGefolgt] = useState<Set<string>>(new Set());

  const laden = useCallback(async () => {
    try {
      setDaten(await api.home(50));
      setFehler(null);
    } catch (e) {
      setFehler(fehlerText(e, 'Home nicht ladbar'));
      setDaten((alt) => alt ?? { eintraege: [], leute: [], folge_ich: 0, vorschlaege: [] });
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  useEffect(() => {
    if (!fehler) return;
    return beiWiederOnline(() => void laden());
  }, [fehler, laden]);

  const einladen = useCallback(async () => {
    haptics.light();
    try {
      const mein = await api.myInvite();
      if (!mein?.code) throw new Error('kein Code');
      const res = await shareInvite({ code: mein.code });
      if (res === 'copied') setNotiz('Link kopiert. Wer darüber startet, folgt dir automatisch.');
      if (res === 'failed') setNotiz('Teilen ging nicht.');
    } catch (e) {
      setNotiz(fehlerText(e, 'Einladen geht gerade nicht.'));
    }
    setTimeout(() => setNotiz(null), 4000);
  }, []);

  const folgen = useCallback(
    async (id: string) => {
      haptics.select();
      setGefolgt((s) => new Set(s).add(id));
      try {
        await api.setFollowing(id, true);
        // Nicht sofort neu laden: der Vorschlag soll als "Folgst du" stehen
        // bleiben, statt unter dem Finger zu verschwinden. Beim naechsten
        // Ziehen ist er weg und seine Aktivitaet da.
      } catch {
        setGefolgt((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [],
  );

  if (!daten) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  const { eintraege, leute, folge_ich, vorschlaege } = daten;

  return (
    <GridBackground>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          {
            paddingTop: insets.top + space.xl,
            // Die Tab-Leiste schwebt ueber dem Inhalt: das Letzte in der
            // Liste muss darueber hinaus scrollen koennen.
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={laedt}
            onRefresh={async () => {
              setLaedt(true);
              await laden();
              setGefolgt(new Set());
              setLaedt(false);
            }}
            tintColor={color.ink.low}
          />
        }
      >
        <View>
          <Text style={styles.titel}>Home</Text>
          <Text style={styles.unter}>Was deine Leute gerade lernen und empfehlen.</Text>
        </View>

        {/* --- Wer zuletzt etwas gemacht hat -------------------------------- */}
        {leute.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.leute}
            style={styles.bleed}
          >
            {leute.map((p) => (
              <Pressable key={p.handle} onPress={() => zuProfil(p.handle)} style={styles.leutePerson}>
                <Avatar seed={p.avatar_seed} path={p.avatar_path} size={52} ring={color.signal.primary} />
                <Text style={styles.leuteName} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {/* --- Selbst etwas beitragen --------------------------------------- */}
        <View style={styles.mitmachen}>
          <Aktion
            icon="refresh"
            label="Empfehlen"
            unter="im Feed reposten"
            onPress={() => {
              haptics.light();
              router.push('/');
            }}
          />
          <Aktion icon="xp" label="Duell" unter="jemanden fordern" onPress={() => router.push('/duels')} />
          <Aktion icon="plus" label="Einladen" unter="Freunde holen" onPress={() => void einladen()} />
        </View>
        {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}

        {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}

        {/* --- Aktivitaet ---------------------------------------------------- */}
        {eintraege.length === 0 ? (
          <Text style={styles.leer}>
            {folge_ich === 0
              ? 'Du folgst noch niemandem. Sobald du jemandem folgst, siehst du hier, was sie empfehlen, fragen, gewinnen und abschließen.'
              : 'Deine Leute waren die letzten 30 Tage still. Mach den Anfang: Was du im Feed repostest, sehen deine Follower hier.'}
          </Text>
        ) : (
          <View style={styles.liste}>
            {eintraege.map((e, i) => (
              <Eintrag key={`${e.art}-${e.wer.handle}-${e.at}-${i}`} e={e} />
            ))}
          </View>
        )}

        {/* --- Vorschlaege ---------------------------------------------------- */}
        {vorschlaege.length > 0 && eintraege.length < 8 ? (
          <View style={styles.vorschlaege}>
            <Text style={styles.abschnitt}>Wem du folgen könntest</Text>
            {vorschlaege.map((v) => {
              const an = gefolgt.has(v.id);
              return (
                <View key={v.id} style={styles.vorschlag}>
                  <Pressable onPress={() => zuProfil(v.handle)} style={styles.vorschlagWer}>
                    <Avatar seed={v.avatar_seed} path={v.avatar_path} size={38} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vorschlagName} numberOfLines={1}>
                        {v.name}
                      </Text>
                      <Text style={styles.vorschlagGrund} numberOfLines={1}>
                        {v.grund ?? `${v.follower_count} Follower`}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => (an ? undefined : void folgen(v.id))}
                    style={[styles.folgenKnopf, an && styles.folgenKnopfAn]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.folgenText, an && styles.folgenTextAn]}>
                      {an ? 'Folgst du' : 'Folgen'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      {hinweis.zeigen ? (
        <TabHint
          icon="comment"
          titel="Home: deine Leute"
          text="Hier erscheint, was die Leute machen, denen du folgst: Empfehlungen, Fragen, Duelle, abgeschlossene Kurse. Was du im Feed repostest, sehen deine Follower hier."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
    </GridBackground>
  );
}

function Aktion({
  icon,
  label,
  unter,
  onPress,
}: {
  icon: IconName;
  label: string;
  unter: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.aktion, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <Icon name={icon} size={18} color={color.signal.primary} />
      <Text style={styles.aktionLabel}>{label}</Text>
      <Text style={styles.aktionUnter} numberOfLines={1}>
        {unter}
      </Text>
    </Pressable>
  );
}

/** Kopfzeile eines Eintrags: wer, was, wann. */
function Kopf({ wer, verb, at }: { wer: HomePerson; verb: string; at: string }) {
  return (
    <Pressable onPress={() => zuProfil(wer.handle)} style={styles.kopf}>
      <Avatar seed={wer.avatar_seed} path={wer.avatar_path} size={32} />
      <Text style={styles.kopfText} numberOfLines={2}>
        <Text style={styles.kopfName}>{wer.name}</Text> {verb}
      </Text>
      <Text style={styles.kopfWann}>{wann(at)}</Text>
    </Pressable>
  );
}

/** Verweis auf eine Karte oder einen Kurs. */
function Verweis({
  titel,
  unter,
  meta,
  onPress,
}: {
  titel: string;
  unter?: string | null;
  meta?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.verweis, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.verweisTitel} numberOfLines={2}>
          {titel}
        </Text>
        {unter ? (
          <Text style={styles.verweisUnter} numberOfLines={1}>
            {unter}
          </Text>
        ) : null}
        {meta ? <Text style={styles.verweisMeta}>{meta}</Text> : null}
      </View>
      <Icon name="chevron" size={14} color={color.ink.low} />
    </Pressable>
  );
}

function Eintrag({ e }: { e: HomeEntry }) {
  switch (e.art) {
    case 'repost':
      return (
        <View style={styles.karte}>
          <Kopf wer={e.wer} verb="empfiehlt" at={e.at} />
          {e.was.comment ? <Text style={styles.zitat}>„{e.was.comment}"</Text> : null}
          <Verweis
            titel={e.was.title}
            unter={e.was.deck}
            meta={`#${e.was.category.split('.').pop()}`}
            // Die Karte selbst, danach die weiteren Empfehlungen dieser
            // Person - nicht die Kategorie wie bisher in "Deine Leute".
            onPress={() =>
              router.push(
                `/reel/${encodeURIComponent(e.was.content_id)}?from=${encodeURIComponent(e.wer.handle)}`,
              )
            }
          />
        </View>
      );
    case 'frage':
      return (
        <View style={styles.karte}>
          <Kopf wer={e.wer} verb="fragt zu einer Karte" at={e.at} />
          <Text style={styles.zitat}>„{e.was.body}"</Text>
          <Verweis
            titel={e.was.title}
            onPress={() => router.push(`/reel/${encodeURIComponent(e.was.content_id)}`)}
          />
        </View>
      );
    case 'duell': {
      const { a, b } = e.was;
      const sieger = a.punkte === b.punkte ? null : a.punkte > b.punkte ? a : b;
      return (
        <View style={styles.karte}>
          <Kopf
            wer={e.wer}
            verb={sieger ? (sieger.handle === e.wer.handle ? 'hat ein Duell gewonnen' : 'hat ein Duell gespielt') : 'hat unentschieden gespielt'}
            at={e.at}
          />
          <Pressable
            onPress={() => (a.ich || b.ich ? router.push('/duels') : zuProfil(a.handle === e.wer.handle ? b.handle : a.handle))}
            style={styles.duell}
          >
            <DuellSeite p={a} vorn={sieger === a} />
            <Text style={styles.duellStand}>
              {a.punkte} : {b.punkte}
            </Text>
            <DuellSeite p={b} vorn={sieger === b} rechts />
          </Pressable>
        </View>
      );
    }
    case 'kurs':
      return (
        <View style={styles.karte}>
          <Kopf wer={e.wer} verb="hat einen Kurs abgeschlossen" at={e.at} />
          <Verweis
            titel={e.was.title}
            meta={`${e.was.lessons} Lektionen`}
            onPress={() => router.push(`/course/${encodeURIComponent(e.was.slug)}`)}
          />
        </View>
      );
    case 'abzeichen':
      return (
        <View style={styles.karte}>
          <Kopf wer={e.wer} verb="hat ein Abzeichen" at={e.at} />
          <Text style={styles.abzeichen}>
            {e.was.emoji ? `${e.was.emoji}  ` : ''}
            {e.was.title}
          </Text>
        </View>
      );
    case 'folgt':
      return (
        <View style={[styles.karte, styles.karteLeise]}>
          <Kopf wer={e.wer} verb={e.was.bin_ich ? 'folgt dir jetzt' : 'folgt jetzt'} at={e.at} />
          {e.was.bin_ich ? null : (
            <Pressable onPress={() => zuProfil(e.was.handle)} style={styles.folgtWen}>
              <Avatar seed={e.was.avatar_seed} path={e.was.avatar_path} size={24} />
              <Text style={styles.folgtName} numberOfLines={1}>
                {e.was.name}
              </Text>
              <Icon name="chevron" size={12} color={color.ink.low} />
            </Pressable>
          )}
        </View>
      );
    default:
      return null;
  }
}

function DuellSeite({
  p,
  vorn,
  rechts,
}: {
  p: HomePerson & { punkte: number; ich: boolean };
  vorn: boolean;
  rechts?: boolean;
}) {
  return (
    <View style={[styles.duellSeite, rechts && { flexDirection: 'row-reverse' }]}>
      <Avatar seed={p.avatar_seed} path={p.avatar_path} size={28} ring={vorn ? color.signal.success : undefined} />
      <Text style={[styles.duellName, vorn && { color: color.ink.max }, rechts && { textAlign: 'right' }]} numberOfLines={1}>
        {p.ich ? 'Du' : p.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.xl, gap: space.lg },

  titel: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  unter: { ...type.body, fontSize: 15, color: color.ink.mid, marginTop: space.xs },

  // Die Personenleiste laeuft bis an den Bildschirmrand - der Rand gehoert
  // in den Inhalt, sonst schneidet die Kante die erste Person ab.
  bleed: { marginHorizontal: -space.xl },
  leute: { paddingHorizontal: space.xl, gap: space.lg },
  leutePerson: { width: 60, alignItems: 'center', gap: 6 },
  leuteName: { ...type.meta, fontSize: 10, color: color.ink.mid, maxWidth: 60 },

  mitmachen: { flexDirection: 'row', gap: space.sm },
  aktion: {
    flex: 1,
    gap: 3,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    alignItems: 'center',
  },
  aktionLabel: { ...type.label, fontSize: 13, color: color.ink.high },
  aktionUnter: { ...type.meta, fontSize: 9.5, color: color.ink.low },
  notiz: { ...type.meta, color: color.signal.primary },

  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
  leer: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.mid },

  liste: { gap: space.md },
  karte: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  karteLeise: { backgroundColor: 'transparent', paddingVertical: space.md },

  kopf: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  kopfText: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },
  kopfName: { color: color.ink.max, fontWeight: '600' },
  kopfWann: { ...type.meta, color: color.ink.low },

  zitat: { ...type.body, fontSize: 15, lineHeight: 21, color: color.signal.primary, fontStyle: 'italic' },

  verweis: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
  },
  verweisTitel: { ...type.body, fontSize: 15, color: color.ink.high },
  verweisUnter: { ...type.meta, color: color.ink.mid },
  verweisMeta: { ...type.meta, color: color.ink.low },

  duell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
  },
  duellSeite: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  duellName: { ...type.body, fontSize: 14, color: color.ink.mid, flex: 1 },
  duellStand: { ...type.mono, fontSize: 18, color: color.ink.max },

  abzeichen: { ...type.body, fontSize: 16, color: color.ink.high },

  folgtWen: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: 44 },
  folgtName: { ...type.body, fontSize: 14, color: color.ink.high, flex: 1 },

  vorschlaege: { gap: space.sm, paddingTop: space.md },
  abschnitt: { ...type.meta, color: color.ink.low },
  vorschlag: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  vorschlagWer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  vorschlagName: { ...type.body, fontSize: 15, color: color.ink.high },
  vorschlagGrund: { ...type.meta, color: color.ink.low },
  folgenKnopf: {
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: color.signal.primary,
  },
  folgenKnopfAn: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  folgenText: { ...type.label, fontSize: 13, color: color.bg },
  folgenTextAn: { color: color.ink.mid },
});
