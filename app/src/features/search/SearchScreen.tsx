import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analytics } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';

import { Appear } from '@/components/Appear';
import { TAB_BAR_HEIGHT } from '@/components/BlueprintTabBar';
import { GridBackground } from '@/components/GridBackground';
import { TabHint, useTabHint } from '@/components/TabHint';
import { Icon } from '@/components/Icon';
import { api } from '@/lib/supabase';
import type { Category, SearchHit } from '@/lib/types.db';
import { categoryAccent, color, radius, space, type } from '@/theme/tokens';

import { PeopleBar } from './PeopleBar';

/**
 * Such-Tab.
 *
 * Ein Feld, vier Ergebnistypen. Die Praefixe filtern mit:
 *   "zins"      -> #zinseszins, passende Karten
 *   "@standard" -> nur Quellen und Personen
 *   "#physik"   -> nur Kategorien
 *
 * Ohne Eingabe zeigt der Tab alle Kategorien als Gitter - das ist gleichzeitig
 * die Uebersicht ueber das, was man leveln kann.
 */

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  category: 'Kategorie',
  source: 'Quelle',
  profile: 'Person',
  course: 'Kurs',
  content: 'Grid',
};

const KIND_ORDER: SearchHit['kind'][] = ['category', 'source', 'profile', 'course', 'content'];

export function SearchScreen() {
  const hinweis = useTabHint('suche');
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  /**
   * Welche Oberkategorie gerade aufgeklappt ist.
   *
   * Vorher standen alle Unterkategorien aller Oberkategorien gleichzeitig da -
   * ueber achtzig Pillen untereinander. Das ist keine Uebersicht, das ist eine
   * Wand. Jetzt ist genau eine offen, und der Wechsel ist eine Bewegung
   * statt eines Sprungs.
   */
  const [openRoot, setOpenRoot] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `?q=`: ein Schlagwort-Hashtag auf einer Karte fuehrt hierher (HashtagLauf).
  // Kategorien haben eine eigene Seite; Schlagworte gibt es nur als Suche.
  const { q } = useLocalSearchParams<{ q?: string }>();
  useEffect(() => {
    if (typeof q === 'string' && q.trim()) setQuery(q);
  }, [q]);

  useEffect(() => {
    void api
      .listCategories()
      .then((cs) => {
        setCategories(cs);
        // Eine offene Kategorie von Anfang an: ein Bildschirm, auf dem alles
        // zugeklappt ist, sieht aus, als waere nichts geladen.
        setOpenRoot((cur) => cur ?? cs.find((c) => !c.parent_id)?.id ?? null);
      })
      .catch(() => setCategories([]));
  }, []);

  // Entprellt: Tippen soll keine Anfrage pro Tastendruck ausloesen.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    setBusy(true);
    debounce.current = setTimeout(() => {
      void api
        .search(q, 24)
        .then((r) => {
          setHits(r);
          analytics.searched(q.length, r.length);
        })
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 260);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const open = useCallback((hit: SearchHit) => {
    haptics.select();
    if (hit.kind === 'category') {
      analytics.categoryOpened(hit.id, 0);
      router.push(`/category/${encodeURIComponent(hit.id)}`);
    } else if (hit.kind === 'profile') {
      // subtitle ist '@handle' - das fuehrt direkt aufs Profil.
      router.push(`/u/${encodeURIComponent(hit.subtitle.replace(/^@/, ''))}?von=suche`);
    } else if (hit.kind === 'course') {
      router.push(`/course/${encodeURIComponent(hit.id)}`);
    } else if (hit.kind === 'content') {
      // Direkt auf die Karte. Wer eine Karte sucht, will sie lesen - und
      // danach weiterwischen, statt zurueck in die Liste zu muessen.
      router.push(`/reel/${encodeURIComponent(hit.id)}`);
    }
    // Quellen bekommen eine eigene Ansicht in v0.4.
  }, []);

  const roots = categories.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  return (
    <GridBackground>
      <View style={[styles.root, { paddingTop: insets.top + space.lg }]}>
        <View style={styles.searchBar}>
          <Icon name="search" size={17} color={color.ink.low} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="#kategorie, @quelle oder Thema"
            placeholderTextColor={color.ink.low}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {busy ? <ActivityIndicator size="small" color={color.ink.low} /> : null}
        </View>

        <ScrollView
          // Die Tab-Leiste schwebt ueber dem Inhalt - darueber hinaus scrollen.
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {hits === null ? (
            // --- Übersicht ohne Eingabe -------------------------------------
            <>
              <PeopleBar />

              <View style={styles.browse}>
                <Text style={styles.sectionTitle}>Kategorien leveln</Text>

                {/* Oberkategorien waagrecht: eine Zeile statt einer Wand.
                    Das Auswaehlen bewegt nur den Inhalt darunter - die Leiste
                    selbst bleibt, wo sie ist. */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.bleed}
                  contentContainerStyle={styles.rootRow}
                  decelerationRate="fast"
                >
                  {roots.map((root) => {
                    const on = root.id === openRoot;
                    const accent = categoryAccent(root.accent_hex);
                    return (
                      <Pressable
                        key={root.id}
                        onPress={() => {
                          haptics.select();
                          setOpenRoot(on ? null : root.id);
                        }}
                        style={({ pressed }) => [
                          styles.rootChip,
                          on && { borderColor: accent, backgroundColor: accent + '18' },
                          pressed && { opacity: 0.75 },
                        ]}
                      >
                        <Text style={styles.rootEmoji}>{root.emoji ?? '◇'}</Text>
                        <Text
                          style={[styles.rootName, on && { color: color.ink.max }]}
                          numberOfLines={1}
                        >
                          {root.display_name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <View style={styles.tail} />
                </ScrollView>

                {/* LinearTransition: beim Wechsel zwischen Kategorien
                    unterschiedlicher Groesse waechst der Block, statt zu
                    springen. */}
                <Animated.View layout={LinearTransition.springify().damping(20)}>
                  {roots
                    .filter((r) => r.id === openRoot)
                    .map((root) => {
                      const accent = categoryAccent(root.accent_hex);
                      const kids = childrenOf(root.id);
                      return (
                        <Appear key={root.id} style={styles.kids} distance={6}>
                          <Pressable
                            onPress={() => router.push(`/category/${encodeURIComponent(root.id)}`)}
                            style={({ pressed }) => [
                              styles.allRow,
                              pressed && { opacity: 0.8 },
                            ]}
                          >
                            <Text style={[styles.allText, { color: accent }]}>
                              Alles aus {root.display_name}
                            </Text>
                            <Text style={styles.allKind}>
                              {root.is_levelable ? 'levelbar' : 'News'}
                            </Text>
                            <Icon name="chevron" size={16} color={color.ink.low} />
                          </Pressable>

                          <View style={styles.tagRow}>
                            {kids.map((child, i) => (
                              <Appear
                                key={child.id}
                                // Gestaffelt, aber gedeckelt: bei zwanzig
                                // Unterkategorien darf die letzte nicht erst
                                // nach einer Sekunde erscheinen.
                                delay={Math.min(i, 8) * 26}
                              >
                                <Pressable
                                  onPress={() =>
                                    router.push(`/category/${encodeURIComponent(child.id)}`)
                                  }
                                  style={({ pressed }) => [
                                    styles.tag,
                                    pressed && { borderColor: accent, opacity: 0.85 },
                                  ]}
                                >
                                  <Text style={[styles.tagText, { color: accent }]}>
                                    #{child.slug}
                                  </Text>
                                </Pressable>
                              </Appear>
                            ))}
                            {kids.length === 0 ? (
                              <Text style={styles.noKids}>
                                Keine Unterkategorien — tipp oben auf „Alles aus".
                              </Text>
                            ) : null}
                          </View>
                        </Appear>
                      );
                    })}
                </Animated.View>
              </View>
            </>
          ) : hits.length === 0 ? (
            <Text style={styles.empty}>Nichts gefunden für „{query.trim()}"</Text>
          ) : (
            // --- Treffer ----------------------------------------------------
            KIND_ORDER.filter((kind) => hits.some((h) => h.kind === kind)).map((kind) => (
              <View key={kind} style={styles.group}>
                <Text style={styles.sectionTitle}>{KIND_LABEL[kind]}</Text>
                {hits
                  .filter((h) => h.kind === kind)
                  .map((hit) => {
                    const accent = categoryAccent(
                      typeof hit.meta?.accent === 'string' ? hit.meta.accent : null,
                    );
                    return (
                      <Pressable
                        key={`${hit.kind}-${hit.id}`}
                        onPress={() => open(hit)}
                        style={({ pressed }) => [styles.hit, pressed && styles.hitPressed]}
                      >
                        <Text style={styles.hitGlyph}>
                          {hit.kind === 'category'
                            ? (hit.meta?.emoji as string) ?? '#'
                            : hit.kind === 'source' || hit.kind === 'profile'
                              ? '@'
                              : '◇'}
                        </Text>
                        <View style={styles.hitBody}>
                          <Text style={styles.hitTitle} numberOfLines={1}>
                            {hit.title}
                          </Text>
                          {hit.subtitle ? (
                            <Text style={styles.hitSub} numberOfLines={1}>
                              {hit.subtitle}
                            </Text>
                          ) : null}
                        </View>
                        {hit.kind === 'category' && hit.meta?.levelable ? (
                          <Text style={[styles.hitBadge, { color: accent }]}>leveln</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
      {hinweis.zeigen ? (
        <TabHint
          icon="search"
          titel="Drei Arten zu suchen"
          text="Ein Stichwort findet Karten. #Kategorie findet ein Thema, @name eine Person. Alles, was hier steht, kannst du sofort lesen."
          bottom={TAB_BAR_HEIGHT}
          onDone={hinweis.weg}
        />
      ) : null}
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.xl },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  searchGlyph: { fontSize: 18, color: color.ink.low },
  input: { flex: 1, ...type.body, fontSize: 16, color: color.ink.max, padding: 0 },

  body: { paddingTop: space.xl, gap: space.xl },
  // Nur die waagrechten Leisten duerfen ueber den Rand: der Rest der Suche
  // bleibt im Satzspiegel.
  bleed: { marginHorizontal: -space.xl },
  sectionTitle: {
    ...type.label,
    color: color.ink.mid,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  group: { gap: space.sm },

  browse: { gap: space.md },
  // Die Chipleiste laeuft ueber die Seitenraender hinaus, damit die Chips am
  // Bildschirmrand wegwischen statt davor anzuhalten.
  rootRow: { paddingHorizontal: space.xl, gap: space.sm, paddingVertical: 2 },
  rootChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  rootEmoji: { fontSize: 15 },
  rootName: { ...type.meta, color: color.ink.mid, maxWidth: 130 },
  tail: { width: space.md },

  kids: { gap: space.md, paddingTop: space.sm },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  allText: { ...type.deck, flex: 1 },
  allKind: { ...type.meta, color: color.ink.low },
  noKids: { ...type.meta, color: color.ink.low },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tag: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  tagText: { ...type.meta },

  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  hitPressed: { opacity: 0.8 },
  hitGlyph: { fontSize: 16, width: 22, color: color.ink.mid, textAlign: 'center' },
  hitBody: { flex: 1 },
  hitTitle: { ...type.body, fontSize: 16, color: color.ink.max },
  hitSub: { ...type.meta, color: color.ink.low },
  hitBadge: { ...type.meta },

  empty: { ...type.body, color: color.ink.mid, paddingTop: space.xl },
});
