import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import { CardBlock } from '@/components/CardBlock';
import { CardTypeBadge } from '@/components/CardTypeBadge';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import type { BodyBlock, ContentItem } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Die Werkstatt - NUR zum Ansehen.
 *
 * Warum es das gibt: eine Gestaltung, die man nicht nebeneinander sehen
 * kann, wird nicht gestaltet, sondern vermutet. Die eigentlichen
 * Bildschirme liegen hinter der Anmeldung und brauchen echte Daten - also
 * gibt es hier dieselben Bausteine mit erfundenen Inhalten, ohne Konto und
 * ohne Netz.
 *
 * Nirgends verlinkt, genau wie /kinetic-demo. Wer sie sucht, tippt die
 * Adresse ein.
 *
 * Die Texte hier sind ERFUNDEN und duerfen das: sie kommen in keinen Feed.
 * Fuer echte Karten gilt Regel 1 aus docs/CONTENT-SOURCING.md.
 */

const BLOCKS: Record<string, BodyBlock[]> = {
  kennzahl: [
    { type: 'stat', value: '38 %', label: 'des Haushaltsgelds gehen fuer die Wohnung weg' },
    {
      type: 'para',
      text: 'Damit ist Wohnen der groesste einzelne Posten - mehr als Essen und Verkehr zusammen. Wer eine Wohnung sucht, entscheidet damit ueber mehr als ein Drittel seines Geldes.',
    },
  ],
  zitat: [
    {
      type: 'quote',
      text: 'Wir haben nicht zu wenig Zeit, wir haben zu viele Dinge, die wir gleichzeitig fuer wichtig halten.',
      attribution: 'Seneca, ueber die Kuerze des Lebens',
    },
    {
      type: 'para',
      text: 'Der Satz ist zweitausend Jahre alt und beschreibt genau das, was heute Multitasking heisst: nicht die Menge der Aufgaben kostet, sondern das Umschalten zwischen ihnen.',
    },
  ],
  aufzaehlung: [
    {
      type: 'para',
      text: 'Ein Passwort ist dann gut, wenn es drei Dinge gleichzeitig erfuellt - und die haben nichts mit Sonderzeichen zu tun.',
    },
    {
      type: 'bullet',
      items: [
        'Lang. Jedes Zeichen mehr verdoppelt den Aufwand beim Erraten.',
        'Einmalig. Ein Passwort fuer zwei Dienste ist ein Passwort fuer beide.',
        'Nicht auswendig. Vier Woerter, die man sich merkt, schlagen ein Kuerzel, das man vergisst.',
      ],
    },
  ],
  absatz: [
    {
      type: 'para',
      text: 'Zinseszins heisst: die Zinsen selbst tragen wieder Zinsen. Im ersten Jahr ist der Unterschied kaum zu sehen, im zwanzigsten ist er der halbe Betrag.',
    },
    {
      type: 'para',
      text: 'Deshalb ist der wichtigste Faktor nicht die Hoehe des Zinssatzes, sondern die Zeit - und die ist das Einzige, was man nicht nachkaufen kann.',
    },
  ],
};

function fixture(key: string, blocks: BodyBlock[], titel: string, deck: string): ContentItem {
  return {
    id: `atelier-${key}`,
    content_type: 'knowledge',
    presentation_mode: 'text',
    status: 'approved',
    title: titel,
    deck,
    body_blocks: blocks,
    source_ids: ['atelier'],
    source_urls: ['https://example.org'],
    primary_source_id: 'atelier',
    published_at: null,
    language: 'de',
    region_code: 'AT',
    primary_category_id: 'finance.basics',
    category_ids: ['finance.basics'],
    difficulty: 2,
    word_count: 120,
    dwell_target_ms: 18000,
    like_count: 12,
    comment_count: 2,
    interaction_template: null,
    interaction_data: null,
    kinetic_script: null,
    quiz_items: [],
    media: {},
    expires_at: null,
    created_at: new Date().toISOString(),
  } as unknown as ContentItem;
}

const KARTEN = [
  { key: 'kennzahl', titel: 'Wohin das Haushaltsgeld geht', deck: 'Der groesste Posten ist keine Ueberraschung - seine Groesse schon.' },
  { key: 'zitat', titel: 'Warum Multitasking teuer ist', deck: 'Ein zweitausend Jahre alter Satz beschreibt es genauer als jeder Ratgeber.' },
  { key: 'aufzaehlung', titel: 'Was ein gutes Passwort ausmacht', deck: 'Drei Bedingungen, und Sonderzeichen sind keine davon.' },
  { key: 'absatz', titel: 'Zinseszins', deck: 'Der Unterschied zeigt sich nicht im ersten Jahr, sondern im zwanzigsten.' },
];

/** Eine Karte im Feed-Rahmen, ohne die Netz-Abhaengigkeiten von ContentCard. */
function Karte({
  item,
  accent,
  height,
}: {
  item: ContentItem;
  accent: string;
  height: number;
}) {
  const blocks = item.body_blocks;
  const heroKind = blocks[0]?.type;
  const hasHero = heroKind === 'stat' || heroKind === 'quote';

  return (
    <View style={[styles.karte, { height }]}>
      <View style={styles.kopf}>
        <View style={styles.kopfLinks}>
          <CardTypeBadge contentType={item.content_type} tint={accent} />
          <Text style={[styles.kategorie, { color: accent }]}>#geld</Text>
        </View>
        <View style={styles.schwierigkeit}>
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

      <View style={styles.inhalt}>
        <Text style={styles.titel}>{item.title}</Text>
        {item.deck ? <Text style={styles.deckZeile}>{item.deck}</Text> : null}
        {blocks.map((b, i) => (
          <CardBlock key={i} block={b} accent={accent} hero={hasHero && i === 0} />
        ))}
      </View>

      <Text style={styles.quelle}>atelier.example.org</Text>
    </View>
  );
}

export default function Atelier() {
  const [reiter, setReiter] = useState<'karten' | 'kopfzeile' | 'bausteine'>('karten');
  const { height } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const kartenHoehe = Math.min(560, height - 160);

  return (
    <GridBackground>
      <View style={styles.reiter}>
        {(['karten', 'kopfzeile', 'bausteine'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setReiter(k)}
            style={[styles.chip, reiter === k && styles.chipAn]}
          >
            <Text style={[styles.chipText, reiter === k && styles.chipTextAn]}>{k}</Text>
          </Pressable>
        ))}
      </View>

      {reiter === 'karten' ? (
        <ScrollView contentContainerStyle={styles.bahn}>
          {KARTEN.map((k) => (
            <View key={k.key} style={styles.mitTitel}>
              <Text style={styles.werkTitel}>{k.key}</Text>
              <Karte
                item={fixture(k.key, BLOCKS[k.key], k.titel, k.deck)}
                accent={color.signal.primary}
                height={kartenHoehe}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}

      {reiter === 'kopfzeile' ? (
        <View style={styles.voll}>
          <ScreenHeader
            title="Einstellungen"
            eyebrow="konto & feed"
            subtitle="Alles, was die App ueber dich weiss."
            scrollY={scrollY}
            onBack={() => setReiter('karten')}
          />
          <ScrollView
            onScroll={(e) => {
              scrollY.value = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            contentContainerStyle={styles.langeBahn}
          >
            {Array.from({ length: 14 }).map((_, i) => (
              <View key={i} style={styles.zeile}>
                <Text style={styles.zeileLabel}>Einstellung {i + 1}</Text>
                <Text style={styles.zeileWert}>Wert</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {reiter === 'bausteine' ? (
        <ScrollView contentContainerStyle={styles.bahn}>
          <Text style={styles.werkTitel}>Tasten</Text>
          <View style={styles.gruppe}>
            <Button label="Weiter" onPress={() => {}} />
            <Button label="Ruhig" variant="quiet" onPress={() => {}} />
            <Button label="Ghost" variant="ghost" onPress={() => {}} />
          </View>
          <Text style={styles.werkTitel}>Kartenarten</Text>
          <View style={styles.gruppe}>
            <CardTypeBadge contentType="news" tint={color.signal.primary} />
            <CardTypeBadge contentType="knowledge" tint={color.signal.primary} />
            <CardTypeBadge contentType="interactive" tint={color.signal.primary} />
          </View>
          <Text style={styles.werkTitel}>Abschnittsmarke</Text>
          <View style={styles.gruppe2}>
            <SectionTitle>Konto</SectionTitle>
            <SectionTitle>Feed &amp; Sprache</SectionTitle>
          </View>
          <Text style={styles.werkTitel}>Schriftgrade</Text>
          <View style={styles.gruppe2}>
            <Text style={{ ...type.display, color: color.ink.max }}>Display 32</Text>
            <Text style={{ ...type.title, color: color.ink.max }}>Title 24</Text>
            <Text style={{ ...type.deck, color: color.ink.high }}>Deck 18</Text>
            <Text style={{ ...type.body, color: color.ink.high }}>Body 17</Text>
            <Text style={{ ...type.label, color: color.ink.mid }}>Label 14</Text>
            <Text style={{ ...type.meta, color: color.ink.low }}>META 11</Text>
          </View>
        </ScrollView>
      ) : null}
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  reiter: { flexDirection: 'row', gap: space.sm, padding: space.lg, paddingBottom: 0 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  chipAn: { borderColor: color.signal.primary },
  chipText: { ...type.meta, color: color.ink.mid },
  chipTextAn: { color: color.signal.primary },

  voll: { flex: 1 },
  bahn: { padding: space.lg, gap: space.xl },
  langeBahn: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  mitTitel: { gap: space.sm },
  werkTitel: { ...type.meta, color: color.ink.low },
  gruppe: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' },
  gruppe2: { gap: space.sm },

  zeile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  zeileLabel: { ...type.body, color: color.ink.high },
  zeileWert: { ...type.label, color: color.ink.mid },

  karte: {
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    gap: space.lg,
  },
  kopf: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kopfLinks: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  kategorie: { ...type.meta },
  schwierigkeit: { flexDirection: 'row', gap: 3 },
  diffDot: { width: 5, height: 5, borderRadius: 1 },
  inhalt: { flex: 1, gap: space.lg },
  titel: { ...type.title, color: color.ink.max },
  deckZeile: { ...type.deck, color: color.ink.mid },
  quelle: { ...type.meta, color: color.ink.low },
});
