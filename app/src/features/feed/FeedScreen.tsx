import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContentCard } from '@/components/ContentCard';
import { BatchCheckpoint } from '@/features/quiz/BatchCheckpoint';
import { EnoughForToday } from '@/features/feed/EnoughForToday';
import { analytics } from '@/lib/analytics';
import { GridBackground } from '@/components/GridBackground';
import { useMeasuredHeight } from '@/components/useMeasuredHeight';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { activeCardId, setActiveCard } from '@/lib/activeCard';
import { hydrateContentState } from '@/lib/contentState';
import { eventBuffer } from '@/lib/eventBuffer';
import { musicForCard, stopMusic } from '@/lib/music';
import { stopSpeech } from '@/lib/speech';
import { api, configError, supabase } from '@/lib/supabase';
import type { Category, ContentItem, Source } from '@/lib/types.db';
import { fehlerText } from '@/lib/fehler';
import { beiWiederOnline, useOnline } from '@/lib/online';
import { color, space, type } from '@/theme/tokens';

import { FeedTutorial, useFeedTutorial } from './FeedTutorial';
import { appendArranged, arrangeBatch } from './arrange';
import { VIEWABILITY_CONFIG, useDwellTracking } from './useDwellTracking';

/**
 * Der Feed.
 *
 * Bewusst FlatList mit pagingEnabled statt FlashList: jedes Item ist genau
 * einen Bildschirm hoch, es gibt also kaum Recycling-Druck. FlatList hat
 * dafuer null Versionsrisiko. Wenn die Scroll-Performance auf einem
 * guenstigen Android nicht reicht, ist der Wechsel auf @shopify/flash-list
 * ein Ein-Zeilen-Tausch.
 *
 * Nachladen passiert bei 3 verbleibenden Cards - frueh genug, dass der
 * Nutzer nie einen Ladebalken sieht. Das ist der wichtigste einzelne Hebel
 * fuer das "fuehlt sich fluessig an"-Gefuehl, wichtiger als jede Animation.
 */

const PREFETCH_AT_REMAINING = 3;
const BATCH_SIZE = 10;

/**
 * Nach wie vielen Karten die Fragerunde kommt.
 *
 * Frueher war das dasselbe wie BATCH_SIZE, also zehn. Jetzt fuenfzehn,
 * und der Unterschied ist eine Abwaegung, keine Kleinigkeit: bei zehn
 * bleibt ein Drittel der Karten unabgefragt, bei fuenfzehn die Haelfte -
 * dafuer wird seltener unterbrochen. Bei einem Feed, dessen Problem
 * gerade der Durchlauf ist und nicht die Lerntiefe, ist das die richtige
 * Richtung.
 *
 * Bewusst kein Vielfaches von BATCH_SIZE: die Fragerunde haengt am
 * Lesefortschritt, nicht daran, wann zufaellig nachgeladen wurde.
 */
const CHECKPOINT_AFTER = 15;

type FeedProps = {
  /**
   * Woher die Karten kommen. Ohne Angabe der normale Mix aus get_feed().
   * Der Kategorie-Feed reicht hier get_category_feed() durch - so gibt es
   * genau EINEN Feed-Renderer statt zweier, die auseinanderlaufen.
   */
  loader?: (batchSize: number) => Promise<ContentItem[]>;
  /** Im gefilterten Kategorie-Feed stoert der Checkpoint mehr als er hilft. */
  withCheckpoint?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  /**
   * Platz fuer die Tab-Leiste. Im Kategorie-Feed gibt es keine, dort waeren
   * die Karten sonst 60 px zu kurz und wuerden nicht sauber einrasten.
   */
  reserveBottom?: number;
};

export function FeedScreen({
  loader,
  withCheckpoint = true,
  emptyTitle,
  emptyBody,
  reserveBottom = TAB_BAR_HEIGHT,
}: FeedProps = {}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Record<string, Category>>({});
  const [sources, setSources] = useState<Record<string, Source>>({});
  const loadingMore = useRef(false);

  // Gelesene Karten sammeln sich bis zum Checkpoint. Der Feed haelt danach an -
  // das ist die strukturelle Bremse gegen endloses Scrollen, kein Zwischenbild.
  const [batch, setBatch] = useState<ContentItem[]>([]);
  const [checkpoint, setCheckpoint] = useState<ContentItem[] | null>(null);

  // Tagesziel. Kommt vom Server (read_today) plus dem, was in dieser Sitzung
  // dazukam - sonst zaehlt ein App-Neustart wieder bei null.
  const [readToday, setReadToday] = useState(0);
  const [goal, setGoal] = useState<number | null>(null);
  const [reviewsDue, setReviewsDue] = useState(0);
  const [goalDismissed, setGoalDismissed] = useState(false);

  // Welche Karten hat der Nutzer schon gesehen? get_feed fuellt am Ende mit
  // Gelesenem auf (0015), damit der Feed nie leer laeuft - dann soll die
  // Karte das aber auch sagen, statt so zu tun, als sei sie neu.
  const [repeats, setRepeats] = useState<Set<string>>(new Set());

  const onValidated = useCallback((item: ContentItem) => {
    setBatch((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
    setReadToday((n) => n + 1);
    analytics.cardRead(item.primary_category_id, item.dwell_target_ms, item.difficulty);
  }, []);

  const { onViewableItemsChanged, closeAll, pause, resume } = useDwellTracking(onValidated);

  // Nur im Hauptfeed. Wer ueber eine Kategorie oder ein fremdes Profil
  // hereinkommt, bekommt keine Bedienungsanleitung vorgesetzt - er ist einem
  // Link gefolgt und will die Karte sehen.
  const tutorial = useFeedTutorial();
  const online = useOnline();

  /**
   * Tab gewechselt: Stimme aus, Flaeche aus, Uhr an.
   *
   * Die Tabs bleiben eingehaengt - wer vom Feed auf "Kurse" wechselt,
   * unmountet den Feed nicht. Eine Erklaerkarte hat deshalb weitergeredet,
   * waehrend man in einem anderen Bildschirm stand, und der Knopf zum
   * Anhalten war nicht mehr zu sehen.
   *
   * Bewusst KEINE Einstellung dafuer. Eine App, die aus einem Bildschirm
   * heraus spricht, den man verlassen hat, ist nicht wahlweise so, sondern
   * kaputt. (Vorlesen im Hintergrund - Bildschirm aus, App hoert weiter - ist
   * eine eigene Sache und braucht mehr als das hier.)
   */
  const aktivVorher = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      resume();
      // Zurueck im Feed: die Karte, die vorher dran war, ist wieder dran -
      // eine Erklaerkarte faengt von vorn an, die Flaeche kommt wieder.
      if (aktivVorher.current && activeCardId() === null) {
        setActiveCard(aktivVorher.current);
        musicForCard(aktivVorher.current);
      }
      aktivVorher.current = null;
      return () => {
        // Zuerst die Karte abmelden, DANN die Stimme anhalten.
        //
        // Gemeldet: "Sound geht immer noch weiter, wenn aus Feed raus" -
        // obwohl hier schon stopSpeech() stand. Die Erklaerkarte blieb aber
        // aktiv. Das Anhalten meldet ihr "Satz zu Ende" (onStopped), und ihr
        // Taktgeber nahm das als Stichwort fuer den naechsten Satz; ohne
        // Stimme sprang spaetestens die Zeit-Notbremse ein. Die Stimme wurde
        // also angehalten und von der Karte sofort wieder angeworfen.
        // Eine inaktive Karte hat keinen Taktgeber (KineticCard).
        aktivVorher.current = activeCardId();
        setActiveCard(null);
        stopSpeech();
        stopMusic();
        pause();
        // Gemessene Zeit rausschicken, solange die App noch laeuft. Wer den
        // Feed verlaesst, schliesst als naechstes oft die App.
        void eventBuffer.flush();
      };
    }, [pause, resume]),
  );

  /**
   * Scroll-Position auf dem UI-Thread. Jede Karte leitet daraus ihre eigene
   * Bewegung ab (ContentCard). Der Handler laeuft als Worklet - er blockiert
   * also nicht, wenn JavaScript gerade Karten nachlaedt.
   */
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Bei CHECKPOINT_AFTER validierten Karten anhalten. Vorher die Events
  // rausschicken: claim_batch_bonus prueft serverseitig nach, ob sie
  // wirklich gelesen wurden.
  useEffect(() => {
    if (!withCheckpoint || checkpoint || batch.length < CHECKPOINT_AFTER) return;
    const full = batch.slice(0, CHECKPOINT_AFTER);
    void eventBuffer.flush().then(() => setCheckpoint(full));
  }, [batch, checkpoint, withCheckpoint]);

  const continueReading = useCallback(() => {
    setCheckpoint(null);
    setBatch((prev) => prev.slice(CHECKPOINT_AFTER));
  }, []);

  /**
   * Kartenhoehe = GEMESSENE Listenhoehe, nicht gerechnete.
   *
   * Die Rechnung "Fenster minus Statusleiste minus Tab-Leiste" lag auf jedem
   * Geraet ein paar Pixel daneben - Gestenleiste, Display-Aussparung,
   * Rundungen. Und weicht die Karte auch nur zwei Pixel von der sichtbaren
   * Flaeche ab, rastet der Feed schief ein und laeuft mit jeder Karte
   * weiter aus dem Tritt.
   *
   * Gemessen stimmt es per Konstruktion.
   */
  const [listHeight, listProps] = useMeasuredHeight();
  const cardHeight =
    listHeight || Dimensions.get('window').height - insets.top - insets.bottom - reserveBottom;

  // Referenzdaten einmalig laden. 34 Kategorien und 30 Quellen sind so wenig,
  // dass ein einziger Abruf beim Start guenstiger ist als Joins im Feed.
  useEffect(() => {
    void (async () => {
      const [cats, srcs] = await Promise.all([
        supabase.from('categories').select('*'),
        supabase.from('sources').select('*'),
      ]);
      if (cats.data) {
        setCategories(Object.fromEntries((cats.data as Category[]).map((c) => [c.id, c])));
      }
      if (srcs.data) {
        setSources(Object.fromEntries((srcs.data as Source[]).map((s) => [s.id, s])));
      }
    })();
  }, []);

  // Tagesstand und persoenliches Ziel einmalig holen.
  useEffect(() => {
    if (!withCheckpoint) return;   // im Kategorie-Feed kein Tagesziel
    void (async () => {
      try {
        const [stats, profile] = await Promise.all([api.getMyStats(), api.getMyProfile()]);
        setReadToday(stats.read_today);
        setReviewsDue(stats.reviews_due);
        setGoal(profile?.daily_goal_cards ?? 60);
      } catch {
        setGoal(null);
      }
    })();
  }, [withCheckpoint]);

  /**
   * Alle Kennungen, die schon geladen wurden.
   *
   * In einer Ref, nicht im State: der Wert wird nur beim Nachladen
   * gebraucht, und eine Zustandsaenderung wuerde den ganzen Feed neu
   * rendern.
   */
  const loadedIds = useRef<string[]>([]);

  const loadMore = useCallback(async () => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const started = Date.now();
      // Was schon in der Liste steht, mitschicken. Sonst liefert der
      // Server irgendwann genau das, was die App gleich wegwirft - und
      // der Feed sitzt fest.
      const batch = await (loader
        ? loader(BATCH_SIZE)
        : api.getFeed(BATCH_SIZE, loadedIds.current));
      analytics.feedLoaded(batch.length, Date.now() - started);

      // Ein kleiner Nachschlag statt einer Schema-Aenderung: welche dieser
      // IDs stehen schon in user_content_state?
      //
      // Das Ergebnis wird HIER gebraucht, nicht erst beim Zeichnen: die
      // Anordnung muss wissen, was eine Wiederholung ist, um sie nach
      // hinten zu schieben. Deshalb erst abwarten, dann anordnen.
      const seenNow = new Set<string>();
      if (batch.length > 0) {
        const { data: seen } = await supabase
          .from('user_content_state')
          .select('content_id')
          .in('content_id', batch.map((b) => b.id));
        for (const row of seen ?? []) {
          seenNow.add((row as { content_id: string }).content_id);
        }
        if (seenNow.size > 0) {
          setRepeats((prev) => new Set([...prev, ...seenNow]));
        }
      }
      // Der Server rankt nach Relevanz, arrangeBatch sorgt fuer Abwechslung.
      // Zwei getrennte Ziele, zwei getrennte Stellen.
      setItems((prev) => {
        // Zurueckhalten nur im Hauptfeed und nur bei vollem Batch: dann gibt
        // es mehr, und was draussen bleibt, kommt beim naechsten Nachladen
        // wieder (es fehlt in loadedIds). Ein eigener `loader` - etwa eine
        // Kategorie zum Durchsurfen - schickt keine IDs mit und ist ohnehin
        // eine einzige Kategorie; dort wuerde es Karten verlieren.
        const zurueckhalten = !loader && batch.length >= BATCH_SIZE;
        const next =
          prev.length === 0
            ? arrangeBatch(batch, seenNow, zurueckhalten)
            : appendArranged(prev, batch, seenNow, zurueckhalten);
        /**
         * Die erste Karte ist ab jetzt die aktive - ohne auf eine
         * Sichtbarkeitsmeldung zu warten.
         *
         * Sonst haengt der Start am Zufall: `onViewableItemsChanged` feuert
         * beim ersten Aufbau nicht ueberall zuverlaessig, und wo es
         * ausbleibt, faengt eine Erklaerkarte nie an zu sprechen. Sie steht
         * dann bei Satz eins und sieht kaputt aus.
         *
         * Geraten wird hier nichts: was zuerst in der Liste steht, ist beim
         * ersten Aufbau das, was man sieht.
         */
        if (prev.length === 0 && next.length > 0 && activeCardId() === null) {
          setActiveCard(next[0].id);
        }
        // Nachholen, was ich mit diesen Karten schon gemacht habe. Ohne das
        // sind Likes und Reposts nach jedem Neuladen unsichtbar - siehe
        // lib/contentState.ts.
        void hydrateContentState(next.map((i) => i.id));
        loadedIds.current = next.map((i) => i.id);
        return next;
      });
      setError(null);
    } catch (e) {
      setError(fehlerText(e, 'Feed konnte nicht geladen werden'));
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, [loader]);

  // Offline gescheitert? Dann nicht auf einen Tipp warten: sobald der Server
  // wieder antwortet, laedt der Feed von selbst. Wer im Tunnel war, soll
  // danach nicht erst herausfinden muessen, dass er neu laden darf.
  useEffect(() => {
    if (!error) return;
    return beiWiederOnline(() => void loadMore());
  }, [error, loadMore]);

  useEffect(() => {
    void loadMore();
    return () => {
      // Die zuletzt sichtbare Card wuerde sonst nie geschlossen - ihre
      // Lesezeit ginge verloren.
      closeAll();
      void eventBuffer.flush();
    };
  }, [loadMore, closeAll]);

  const renderItem = useCallback(
    ({ item, index }: { item: ContentItem; index: number }) => {
      const cat = categories[item.primary_category_id];
      return (
        <ContentCard
          item={item}
          index={index}
          scrollY={scrollY}
          isRepeat={repeats.has(item.id)}
          height={cardHeight}
          accentHex={cat?.accent_hex}
          categoryLabel={cat?.slug}
          sourcesById={sources}
        />
      );
    },
    [cardHeight, categories, sources, scrollY, repeats],
  );

  // Das Tagesziel kommt VOR dem Checkpoint: wer heute genug gelesen hat,
  // soll nicht erst noch ein Quiz angeboten bekommen.
  if (goal !== null && !goalDismissed && readToday >= goal) {
    return (
      <EnoughForToday
        cardsRead={readToday}
        reviewsDue={reviewsDue}
        onContinue={() => setGoalDismissed(true)}
      />
    );
  }

  if (checkpoint) {
    return <BatchCheckpoint batch={checkpoint} onContinue={continueReading} />;
  }

  if (configError) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Konfiguration fehlt</Text>
          <Text style={styles.errorBody}>{configError}</Text>
        </View>
      </GridBackground>
    );
  }

  if (loading) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <ActivityIndicator color={color.signal.primary} />
        </View>
      </GridBackground>
    );
  }

  if (error && items.length === 0) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{online ? 'Kein Feed' : 'Offline'}</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      </GridBackground>
    );
  }

  if (items.length === 0) {
    return (
      <GridBackground>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{emptyTitle ?? 'Noch nichts da'}</Text>
          <Text style={styles.errorBody}>
            {emptyBody ?? 'Die Pipeline hat noch keine freigegebenen Inhalte geliefert.'}
          </Text>
        </View>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      {/* Die Tab-Leiste schwebt ueber dem Inhalt (BlueprintTabBar). Die
          Karten muessen trotzdem darueber enden: sonst misst die Liste den
          Platz unter dem Glas mit, jede Karte wird so hoch wie der ganze
          Bildschirm, und ihr unterer Teil liegt unter der Leiste. Also wird
          der Streifen hier freigehalten - darin sieht man das Raster. */}
      <View
        style={[styles.listWrap, reserveBottom > 0 && { marginBottom: reserveBottom + insets.bottom }]}
        {...listProps}
      >
      <Animated.FlatList
        data={items}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        /**
         * pagingEnabled - jetzt, wo die Karte exakt so hoch ist wie die
         * sichtbare Flaeche.
         *
         * Im Browser kommt `scroll-snap-stop: always` dazu, eingespritzt in
         * scripts/finish_web.py. Ohne das raestet ein kraeftiger Wischer
         * zwar ein, aber erst zwei oder drei Karten weiter - man
         * ueberspringt Inhalt, den man nie gesehen hat. Auf dem Handy
         * begrenzt pagingEnabled das von sich aus auf eine Seite.
         *
         * Beim letzten Versuch war das die Fehlerquelle: pagingEnabled rastet
         * auf die Hoehe der LISTE ein, snapToInterval auf die berechnete
         * KARTEN-hoehe - und die Rechnung lag auf jedem Geraet ein paar Pixel
         * daneben. Jetzt wird die Hoehe gemessen statt gerechnet, damit sind
         * beide identisch und das System uebernimmt das Einrasten allein.
         *
         * Kein snapToInterval, kein disableIntervalMomentum, kein Tauziehen:
         * eine Wischgeste irgendwo auf dem Schirm, eine Karte, sauber
         * eingerastet.
         */
        pagingEnabled
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onEndReached={loadMore}
        onEndReachedThreshold={PREFETCH_AT_REMAINING / 10}
        /**
         * Weniger gleichzeitig lebendige Karten = leichteres Scrollen.
         * Jede gerenderte Karte hat drei Animationen am Scroll-Wert haengen;
         * bei fuenf Karten sind das fuenfzehn, die bei jedem Bildaufbau
         * neu gerechnet werden. Drei reichen: die sichtbare und je eine
         * Nachbarin.
         */
        removeClippedSubviews
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        updateCellsBatchingPeriod={60}
        getItemLayout={(_, index) => ({
          length: cardHeight,
          offset: cardHeight * index,
          index,
        })}
      />

      {tutorial.an && !loader && !checkpoint ? (
        <FeedTutorial onDone={tutorial.fertig} />
      ) : null}
      </View>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.xl },
  errorTitle: { ...type.title, color: color.ink.max },
  errorBody: { ...type.body, color: color.ink.mid, textAlign: 'center' },
});
