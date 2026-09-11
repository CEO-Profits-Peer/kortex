import { router } from 'expo-router';
import React, { memo, useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ActionRail } from '@/components/ActionRail';
import { BlueprintVisual } from '@/components/BlueprintVisual';
import { CardBlock } from '@/components/CardBlock';
import { CardTypeBadge, StaleBadge, isStale } from '@/components/CardTypeBadge';
import { FitBox } from '@/components/FitBox';
import { CommentSheet } from '@/features/comments/CommentSheet';
import { KineticCard } from '@/features/kinetic/KineticCard';
import { isKineticScript } from '@/features/kinetic/types';
import { Icon } from '@/components/Icon';
import { paginate } from '@/components/paginate';
import { SourceBadge } from '@/components/SourceBadge';
import { Interaction, isInteractionBuilt } from '@/features/interactions';
import { track } from '@/lib/eventBuffer';
import { haptics } from '@/lib/haptics';
import { sound } from '@/lib/sound';
import { onSpeechChange, speakingCardId, toggleSpeech } from '@/lib/speech';
import { contentState, setContentState, useContentState } from '@/lib/contentState';
import { usePrefs } from '@/lib/prefs';
import { shareCard } from '@/lib/share';
import { api } from '@/lib/supabase';
import type { ContentItem, Source } from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

type Props = {
  item: ContentItem;
  height: number;
  accentHex?: string | null;
  categoryLabel?: string;
  sourcesById: Record<string, Source>;
  index: number;
  scrollY: SharedValue<number>;
  /** Karte war schon einmal zu sehen — der Feed füllt mit Gelesenem auf */
  isRepeat?: boolean;
};

/**
 * Der Aufbau-Takt.
 *
 * Rückmeldung: "es muss zb der Text erst langsam einfließen, dann ein
 * passendes Bild darunter und dann wieder neuer Text".
 *
 * Genau diese Reihenfolge: Titel, Unterzeile, dann die Grafik, dann die
 * Textblöcke. Der Blick wird geführt statt vor eine fertige Seite gestellt.
 */
/** Kantenlaenge der Like-Raute beim Doppeltipp */
const BURST = 96;

const BEAT = {
  title: 0,
  deck: 70,
  visual: 150,
  firstBlock: 230,
  perBlock: 60,
} as const;

/**
 * Gesamtdauer des Aufbaus: unter 450 ms statt ueber 1,2 s.
 *
 * Die Reihenfolge Text - Bild - Text bleibt spuerbar, aber sie blockiert
 * nicht mehr das Scrollen. Beim Wischen haengen bis zu drei Karten
 * gleichzeitig in Animationen; jede Zehntelsekunde zaehlt dort dreifach.
 */
const BEAT_DURATION = 240;


function ContentCardBase({
  item,
  height,
  accentHex,
  categoryLabel,
  sourcesById,
  index,
  scrollY,
  isRepeat,
}: Props) {
  const { reduceMotion } = usePrefs();
  const m = reduceMotion ? 0 : 1;

  /**
   * Like und Repost kommen aus dem gemeinsamen Speicher, nicht aus dem
   * Zustand der Karte.
   *
   * Vorher stand hier `useState(false)`. Das hiess: wegscrollen,
   * zurueckscrollen - und das Herz war wieder leer, weil die Karte beim
   * Wiedereinblenden neu aufgebaut wird. Geschrieben wurde der Like
   * durchaus, gelesen hat ihn nur nie jemand. Siehe lib/contentState.ts.
   */
  const { liked, reposted, delta } = useContentState(item.id);

  /**
   * Die angezeigte Like-Zahl.
   *
   * Grundlage ist der Wert vom Server; dazu kommt, was in dieser Sitzung
   * getippt wurde. `Math.max(0, ...)` faengt den einen Fall ab, in dem die
   * Zahl sonst negativ wuerde: eine Karte mit Zaehlerstand 0, die schon
   * als geliked gilt (aelterer Like, bevor der Zaehler existierte).
   */
  const likeCount = Math.max(0, (item.like_count ?? 0) + delta);
  const [rated, setRated] = useState<'too_easy' | 'too_hard' | null>(null);

  /**
   * Der Kommentarbereich und seine Zahl.
   *
   * Die Zahl kommt mit der Karte vom Server und wird lokal nachgefuehrt,
   * solange der Bereich offen ist - sonst zeigt die Leiste beim
   * Schliessen noch den alten Stand.
   */
  const [sheet, setSheet] = useState(false);
  const [comments, setComments] = useState(item.comment_count ?? 0);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const accent = categoryAccent(accentHex);
  const interactive = isInteractionBuilt(item.interaction_template) && item.interaction_data;

  /**
   * Passend machen durch Struktur, nicht durch Nachmessen.
   *
   * Die erste Fassung hat gerendert, gemessen und dann verkleinert. Das ging
   * schief: die Messung kam zu spaet, der Inhalt lief ueber den Kartenrand
   * hinaus, und mehrere Karten zeichneten uebereinander.
   *
   * Jetzt umgekehrt - der Platz steht fest, der Inhalt richtet sich danach:
   *   · overflow: hidden   nichts verlaesst die Karte, nie
   *   · Aufgaben-Karten zeigen KEINE Textbloecke; die Aufgabe ist der Inhalt
   *   · Zeilenbegrenzung statt Skalierung - abgeschnittener Text ist lesbar,
   *     verkleinerter auf einem kleinen Geraet nicht
   */
  /**
   * Erklaerkarte? Dann uebernimmt ein anderer Aufbau.
   *
   * Die Huelle bleibt dieselbe - Kopfzeile, Aktionsleiste, Doppeltipp,
   * Quelle. Nur die Buehne in der Mitte gehoert dem Abspieler. So ist eine
   * Erklaerkarte im Feed eine Karte wie jede andere: man kann sie liken,
   * teilen, weiterwischen. Ein Sonderbildschirm waere ein Bruch.
   */
  const kinetic = item.presentation_mode === 'kinetic' && isKineticScript(item.kinetic_script);

  const { height: screenH } = useWindowDimensions();
  /**
   * Gesetzt, wenn FitBox meldet, dass der Inhalt selbst verkleinert noch
   * uebersteht. Einmal gesetzt bleibt es gesetzt: die geteilte Karte passt,
   * meldet keinen Ueberlauf mehr, und ohne diese Einbahnstrasse wuerde sie
   * zwischen einer und zwei Seiten hin- und herspringen.
   */
  const [forceSplit, setForceSplit] = useState(false);
  const pages = React.useMemo(
    () =>
      // Eine Erklaerkarte: der Vortrag auf Seite eins, der Text zum
      // Nachlesen dahinter.
      //
      // Das Nachlesen ist nicht dasselbe wie der Vortrag. Wer zuhoert,
      // bekommt die Sache erklaert; wer nachliest, will nachschlagen -
      // eine Zahl, einen Namen, die Quelle. Beides auf eine Seite zu
      // legen hiesse, eines von beiden schlecht zu machen.
      //
      // Die Textseiten entstehen aus derselben Aufteilung wie bei jeder
      // anderen Karte, damit auch ein langer Text nicht ueber den Rand
      // laeuft.
      kinetic
        ? [
            { showVisual: false, blocks: [], showInteraction: false, label: '' },
            ...((item.body_blocks?.length ?? 0) > 0
              ? paginate(item, screenH, false, forceSplit).map((p, i) => ({
                  ...p,
                  showVisual: false,
                  label: i === 0 ? 'Nachlesen' : 'weiter',
                }))
              : []),
          ]
        : paginate(item, screenH, Boolean(interactive), forceSplit),
    [item, screenH, interactive, forceSplit, kinetic],
  );
  const [page, setPage] = useState(0);

  /**
   * Liest die Sprachausgabe gerade DIESE Karte vor?
   *
   * Der Zustand liegt bewusst nicht in der Karte, sondern in lib/speech.ts:
   * es kann immer nur eine Karte gleichzeitig vorgelesen werden, und das
   * ist eine Eigenschaft der App, nicht der einzelnen Karte. Jede Karte
   * hoert nur zu und vergleicht die Kennung.
   */
  const [speaking, setSpeaking] = useState(() => speakingCardId() === item.id);
  useEffect(() => onSpeechChange((id) => setSpeaking(id === item.id)), [item.id]);
  const current = pages[Math.min(page, pages.length - 1)];
  const multi = pages.length > 1;

  const turn = useCallback(
    (dir: 1 | -1) => {
      haptics.light();
      sound.swipe();
      setPage((p) => Math.min(pages.length - 1, Math.max(0, p + dir)));
    },
    [pages.length],
  );

  // --- Doppeltipp zum Liken -------------------------------------------------
  // Die Raute erscheint dort, wo der Finger war - nicht in der Bildmitte.
  // Das ist der Unterschied zwischen "die App hat reagiert" und "ICH habe
  // das ausgeloest": die Rueckmeldung kommt aus der eigenen Bewegung.
  const burst = useSharedValue(0);
  const burstX = useSharedValue(0);
  const burstY = useSharedValue(0);

  const applyLike = useCallback(
    (next: boolean) => {
      // Nichts tun, wenn sich nichts aendert.
      //
      // Ohne das zaehlt jeder Doppeltipp weiter hoch: die Geste ruft
      // immer applyLike(true), auch auf einer Karte, die schon geliked
      // ist. Der Server bleibt bei eins - der Trigger zaehlt nur echte
      // Wechsel -, aber die Anzeige lief davon. Zehnmal tippen, zehn
      // Likes, und beim naechsten Laden wieder einer.
      if (contentState(item.id).liked === next) return;

      setContentState(item.id, {
        liked: next,
        delta: contentState(item.id).delta + (next ? 1 : -1),
      });
      next ? haptics.medium() : haptics.light();
      // Nur beim Setzen, nicht beim Zuruecknehmen: ein Ton fuer "doch nicht"
      // klingt nach Fehler, und ein Like zurueckzunehmen ist keiner.
      if (next) sound.like();
      track(item.id, next ? 'like' : 'unlike');
    },
    [item.id],
  );

  const showBurst = useCallback(() => {
    burst.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 340 }));
  }, [burst]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((e) => {
      // x/y sind relativ zur Buehne. BURST/2 abziehen, damit die Raute
      // zentriert unter dem Finger sitzt und nicht mit der Ecke.
      burstX.value = e.x - BURST / 2;
      burstY.value = e.y - BURST / 2;
      runOnJS(applyLike)(true);
      runOnJS(showBurst)();
    });

  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value,
    left: burstX.value,
    top: burstY.value,
    transform: [
      { scale: interpolate(burst.value, [0, 1], [0.3, 1.15]) },
      // Leichte Drehung: eine Raute, die exakt gerade aufpoppt, wirkt
      // aufgeklebt. Sechs Grad reichen.
      { rotate: `${interpolate(burst.value, [0, 1], [-14, 0])}deg` },
    ],
  }));

  const onShare = useCallback(async () => {
    const res = await shareCard({
      contentId: item.id,
      title: item.title,
      categorySlug: categoryLabel,
    });
    if (res === 'copied') {
      setShareNote('Link kopiert');
      setTimeout(() => setShareNote(null), 2200);
    }
  }, [item.id, item.title, categoryLabel]);

  const onRepost = useCallback(async () => {
    const next = !reposted;
    setContentState(item.id, { reposted: next });
    haptics.medium();
    try {
      await api.setRepost(item.id, next);
      setShareNote(next ? 'Empfohlen — steht jetzt auf deinem Profil' : 'Empfehlung zurückgenommen');
    } catch (e) {
      setContentState(item.id, { reposted: !next });
      // Der Server laesst nur reposten, was gelesen wurde (0016).
      const msg = e instanceof Error ? e.message : '';
      setShareNote(
        msg.includes('not read') ? 'Lies die Karte erst zu Ende' : 'Hat nicht geklappt',
      );
    }
    setTimeout(() => setShareNote(null), 2600);
  }, [reposted, item.id]);

  const onSurf = useCallback(() => {
    router.push(`/category/${encodeURIComponent(item.primary_category_id)}`);
  }, [item.primary_category_id]);

  const rate = useCallback(
    (kind: 'too_easy' | 'too_hard') => {
      if (rated) return;
      setRated(kind);
      haptics.select();
      track(item.id, kind);
    },
    [rated, item.id],
  );

  // --- Scrollgekoppelte Parallaxe -------------------------------------------
  const offset = () => scrollY.value - index * height;

  const shell = useAnimatedStyle(() => {
    const d = offset();
    return {
      opacity: interpolate(d, [-height, 0, height], [1 - 0.75 * m, 1, 1 - 0.75 * m], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(Math.abs(d), [0, height], [1, 1 - 0.1 * m], Extrapolation.CLAMP) },
      ],
    };
  });

  const contentDrift = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(offset(), [-height, 0, height], [48 * m, 0, -48 * m], Extrapolation.CLAMP) },
    ],
  }));

  const sources = item.source_ids
    .map((id, i) => ({
      id,
      name: sourcesById[id]?.display_name ?? id,
      url: item.source_urls[i] ?? item.source_urls[0],
    }))
    .filter((s) => Boolean(s.url));

  const beat = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.duration(BEAT_DURATION).delay(delay);

  return (
    <Animated.View style={[styles.card, { height }, shell]}>
      {/* Aufgaben-Karten bekommen einen eigenen Rahmen um die GANZE Karte.
          Damit ist auf den ersten Blick klar: hier wird etwas erwartet, und
          es ist eine Einheit, die man ganz überspringt oder ganz macht. */}
      {interactive ? (
        <View style={[styles.testFrame, { borderColor: accent }]} pointerEvents="none" />
      ) : null}

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {/* Typ und Hashtag fuehren beide in die Kategorie. Wer "news"
              antippt, will mehr davon - das ist der kuerzeste Weg dorthin. */}
          <Pressable onPress={onSurf} hitSlop={6}>
            <CardTypeBadge contentType={item.content_type} tint={accent} />
          </Pressable>
          {categoryLabel ? (
            <Pressable onPress={onSurf} hitSlop={6}>
              <Text style={[styles.category, { color: accent }]}>#{categoryLabel}</Text>
            </Pressable>
          ) : null}
          {/* Alte Nachricht: anschreiben statt verstecken. Frueher fiel
              sie nach vierzehn Tagen aus dem Feed; jetzt bleibt sie und
              sagt selbst, dass sie nicht mehr aktuell ist. */}
          {isStale(item.content_type, item.published_at ?? item.created_at) ? (
            <StaleBadge when={(item.published_at ?? item.created_at) as string} />
          ) : null}
          {isRepeat ? (
            <Animated.View entering={FadeIn} style={styles.repeat}>
              <Icon name="refresh" size={12} color={color.signal.mastery} />
              <Text style={styles.repeatText}>nochmal</Text>
            </Animated.View>
          ) : null}
        </View>
        <View style={styles.difficulty}>
          {[1, 2, 3, 4, 5].map((n) => (
            <View
              key={n}
              style={[
                styles.diffDot,
                { backgroundColor: n <= item.difficulty ? color.ink.mid : color.ink.faint },
              ]}
            />
          ))}
        </View>
      </View>

      {/**
        * touchAction="pan-y" ist hier kein Feinschliff, sondern der
        * Unterschied zwischen "scrollt" und "scrollt nicht".
        *
        * Der GestureDetector setzt im Web von sich aus `touch-action: none`
        * auf sein Kind - vorsorglich, weil eine Geste ja alles Moegliche
        * sein koennte. Das Kind ist hier aber die halbe Karte. Der Browser
        * verweigert dort dann jedes Wischen, und uebrig bleiben die
        * schmalen Streifen oben und unten, die ausserhalb liegen. Genau so
        * hat es sich angefuehlt.
        *
        * `pan-y` sagt dem Browser: senkrecht wischen bleibt deine Sache.
        * Der Doppeltipp braucht das nicht - ein Tipp ist per Definition
        * eine Beruehrung ohne Bewegung, die beiden koennen sich gar nicht
        * in die Quere kommen. Genau so machen es Instagram und TikTok
        * auch: das Scrollen gehoert der Liste, der Doppeltipp gilt
        * ueberall, und wer wischt, hat eben nicht getippt.
        */}
      <GestureDetector gesture={doubleTap} touchAction="pan-y">
        <View style={styles.stage}>
          {kinetic && page === 0 ? (
            <Animated.View style={[styles.kinetic, contentDrift]}>
              <KineticCard item={item} accent={accent} />
            </Animated.View>
          ) : (
          <FitBox onOverflow={() => setForceSplit(true)}>
          <Animated.View style={[styles.content, contentDrift]}>
            <Animated.Text entering={beat(BEAT.title)} style={styles.title} numberOfLines={4}>
              {item.title}
            </Animated.Text>

            {item.deck ? (
              <Animated.Text entering={beat(BEAT.deck)} style={styles.deck} numberOfLines={4}>
                {item.deck}
              </Animated.Text>
            ) : null}

            {current.showVisual ? (
              <Animated.View entering={beat(BEAT.visual)}>
                <BlueprintVisual seed={item.id} accentHex={accentHex} height={126} />
              </Animated.View>
            ) : null}

            {current.blocks.map((b, i) => (
              <Animated.View
                key={`${page}-${i}`}
                entering={beat(BEAT.firstBlock + i * BEAT.perBlock)}
              >
                <CardBlock block={b} accent={accent} />
              </Animated.View>
            ))}

            {current.showInteraction ? (
              <Animated.View
                entering={beat(BEAT.firstBlock)}
                style={styles.interaction}
              >
                <Interaction
                  contentId={item.id}
                  template={item.interaction_template}
                  data={item.interaction_data}
                  immediate={multi}
                />
              </Animated.View>
            ) : null}
          </Animated.View>
          </FitBox>
          )}

          <ActionRail
            liked={liked}
            likeCount={likeCount}
            reposted={reposted}
            speaking={speaking}
            onListen={kinetic ? undefined : () => toggleSpeech(item)}
            onRepost={onRepost}
            tint={accent}
            onLike={() => applyLike(!liked)}
            onShare={onShare}
            commentCount={comments}
            onComment={() => {
              haptics.light();
              setSheet(true);
            }}
          />

          <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
            <Icon name="like-filled" size={BURST} color={accent} />
          </Animated.View>
        </View>
      </GestureDetector>

      <CommentSheet
        contentId={item.id}
        cardTitle={item.title}
        visible={sheet}
        onClose={() => setSheet(false)}
        onCountChange={setComments}
      />

      {multi ? (
        <View style={styles.pager}>
          <Pressable
            onPress={() => turn(-1)}
            disabled={page === 0}
            hitSlop={10}
            style={styles.pagerSide}
          >
            {page > 0 ? <Icon name="back" size={16} color={color.ink.mid} /> : null}
          </Pressable>

          <View style={styles.pagerDots}>
            {pages.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pagerDot,
                  i === page && { backgroundColor: accent, width: 16 },
                ]}
              />
            ))}
          </View>

          <Pressable
            onPress={() => turn(1)}
            disabled={page >= pages.length - 1}
            hitSlop={10}
            style={styles.pagerNext}
          >
            {page < pages.length - 1 ? (
              <>
                <Text style={[styles.pagerLabel, { color: accent }]}>
                  {pages[page + 1]?.label || 'weiter'}
                </Text>
                <Icon name="chevron" size={14} color={accent} />
              </>
            ) : null}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <SourceBadge contentId={item.id} sources={sources} />
          {shareNote ? (
            <Animated.Text entering={FadeIn} style={styles.shareNote}>
              {shareNote}
            </Animated.Text>
          ) : null}
        </View>
        <View style={styles.rating}>
          {(['too_easy', 'too_hard'] as const).map((kind) => (
            <Pressable
              key={kind}
              onPress={() => rate(kind)}
              hitSlop={6}
              style={[styles.rateChip, rated === kind && { borderColor: accent }]}
            >
              <Text style={[styles.rateText, rated === kind && { color: accent }]}>
                {kind === 'too_easy' ? 'zu leicht' : 'zu schwer'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // overflow: hidden ist keine Feinheit, sondern die Absicherung: ohne sie
  // zeichnet ueberlaufender Inhalt ueber die Nachbarkarten.
  card: { paddingHorizontal: space.xl, overflow: 'hidden' },

  testFrame: {
    position: 'absolute',
    top: space.md,
    bottom: space.md,
    left: space.md,
    right: space.md,
    borderWidth: 1,
    borderRadius: radius.xl,
    opacity: 0.35,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
    flexWrap: 'wrap',
  },
  category: { ...type.meta, textTransform: 'lowercase', letterSpacing: 0.6 },
  repeat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.signal.mastery,
  },
  repeatText: { ...type.meta, fontSize: 9.5, color: color.signal.mastery },
  difficulty: { flexDirection: 'row', gap: 3 },
  diffDot: { width: 5, height: 5, borderRadius: 3 },

  // Rechts Platz für die Aktionsleiste freihalten.
  stage: { flex: 1, justifyContent: 'center', paddingRight: 62, overflow: 'hidden' },
  content: { gap: space.md, flexShrink: 0 },
  // Die Erklaerkarte bekommt die volle Hoehe statt sich an ihren Inhalt
  // anzupassen: ihre Buehne soll ueber alle Takte gleich gross bleiben,
  // sonst huepft das Bild bei jedem Satz.
  kinetic: { flex: 1 },

  title: { ...type.title, color: color.ink.max },
  deck: { ...type.deck, color: color.ink.mid, marginTop: -space.sm },
  interaction: { marginTop: space.xs },

  burst: { position: 'absolute', width: BURST, height: BURST },

  // Die Stile der Textbloecke stehen bei ihnen: components/CardBlock.tsx

  // Die Blaetter-Leiste sitzt zwischen Buehne und Fusszeile: immer sichtbar,
  // nie vom Inhalt verdeckt - das war der Grund, warum der Pruefen-Knopf
  // vorher abgeschnitten wurde.
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 34,
    marginRight: 62,
  },
  pagerSide: { width: 44, height: 34, justifyContent: 'center' },
  pagerDots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  pagerDot: { width: 6, height: 3, borderRadius: 2, backgroundColor: color.ink.faint },
  pagerNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 44,
    height: 34,
    justifyContent: 'flex-end',
  },
  pagerLabel: { ...type.meta, fontSize: 11 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingBottom: space.xxl,
    paddingTop: space.md,
  },
  footerLeft: { flex: 1, gap: 4 },
  shareNote: { ...type.meta, color: color.signal.primary },

  rating: { flexDirection: 'row', gap: 6 },
  rateChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  rateText: { ...type.meta, fontSize: 9.5, color: color.ink.low },
});

export const ContentCard = memo(ContentCardBase);
