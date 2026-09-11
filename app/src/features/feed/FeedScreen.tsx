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
import { api, configError, supabase } from '@/lib/supabase';
import type { Category, ContentItem, Source } from '@/lib/types.db';
import { color, space, type } from '@/theme/tokens';

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

  const { onViewableItemsChanged, closeAll } = useDwellTracking(onValidated);

  /**
   * Scroll-Position auf dem UI-Thread. Jede Karte leitet daraus ihre eigene
   * Bewegung ab (ContentCard). Der Handler laeuft als Worklet - er blockiert
   * also nicht, wenn JavaScript gerade Karten nachlaedt.
   */
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Bei zehn validierten Karten anhalten. Vorher die Events rausschicken:
  // claim_batch_bonus prueft serverseitig nach, ob sie wirklich gelesen wurden.
  useEffect(() => {
    if (!withCheckpoint || checkpoint || batch.length < BATCH_SIZE) return;
    const full = batch.slice(0, BATCH_SIZE);
    void eventBuffer.flush().then(() => setCheckpoint(full));
  }, [batch, checkpoint, withCheckpoint]);

  const continueReading = useCallback(() => {
    setCheckpoint(null);
    setBatch((prev) => prev.slice(BATCH_SIZE));
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

  const loadMore = useCallback(async () => {
    if (loadingMore.current) return;
    loadingMore.current = true;
    try {
      const started = Date.now();
      const batch = await (loader ? loader(BATCH_SIZE) : api.getFeed(BATCH_SIZE));
      analytics.feedLoaded(batch.length, Date.now() - started);

      // Ein kleiner Nachschlag statt einer Schema-Aenderung: welche dieser
      // IDs stehen schon in user_content_state?
      if (batch.length > 0) {
        const { data: seen } = await supabase
          .from('user_content_state')
          .select('content_id')
          .in('content_id', batch.map((b) => b.id));
        if (seen?.length) {
          setRepeats((prev) => {
            const next = new Set(prev);
            for (const row of seen) next.add((row as { content_id: string }).content_id);
            return next;
          });
        }
      }
      // Der Server rankt nach Relevanz, arrangeBatch sorgt fuer Abwechslung.
      // Zwei getrennte Ziele, zwei getrennte Stellen.
      setItems((prev) => {
        const next = prev.length === 0 ? arrangeBatch(batch) : appendArranged(prev, batch);
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
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Feed konnte nicht geladen werden');
    } finally {
      loadingMore.current = false;
      setLoading(false);
    }
  }, [loader]);

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
          <Text style={styles.errorTitle}>Kein Feed</Text>
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
      <View style={styles.listWrap} {...listProps}>
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
