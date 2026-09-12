import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { BlueprintVisual } from '@/components/BlueprintVisual';
import { Button } from '@/components/Button';
import { CardBlock } from '@/components/CardBlock';
import { CardTypeBadge } from '@/components/CardTypeBadge';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { AdminOverview, type AdminData } from '@/features/admin/AdminOverview';
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
      {/* Dasselbe Blatt wie im Feed: die Zeichnung ueber die ganze Karte,
          hinter allem. */}
      <BlueprintVisual seed={item.id} accentHex={accent} variant="sheet" />
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

      {/* Fusszeile wie im Feed: Herkunft links, Urteil rechts, keine
          Linien - siehe die Begruendung in ContentCard.tsx. */}
      <View style={styles.schriftfeld}>
        <Text style={styles.quelle}>atelier.example.org</Text>
        <View style={styles.urteil}>
          {['zu leicht', 'zu schwer'].map((t) => (
            <View key={t} style={styles.urteilChip}>
              <Text style={styles.urteilText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Erfundene Zahlen fuer das Kontrollzentrum.
 *
 * Sie sehen den echten aehnlich (gezogen am 2026-09-12), sind aber von
 * Hand gesetzt: die Werkstatt darf nicht ans Netz und schon gar nicht an
 * Nutzungsdaten.
 */
const KONTROLLE: AdminData = {
  betrieb: {
    quellen_aktiv: 31,
    quellen_mit_fehler: [
      { id: 'arxiv-lg', fehler: 'erreichbar, aber 0 Eintraege', zuletzt: '2026-09-12T04:17:00Z' },
    ],
    quelle_am_laengsten_still: { id: 'wikinews-de', zuletzt: '2026-09-11T18:17:00Z' },
    wartet_auf_freigabe: 14,
    karten_24h: 31,
    karten_7t: 188,
    datenbank_bytes: 38_100_000,
  },
  bestand: {
    freigegeben: 289,
    wartend: 14,
    abgelehnt: 41,
    erklaerkarten: 158,
    je_sprache: [
      { sprache: 'de', karten: 149, erklaerkarten: 78 },
      { sprache: 'en', karten: 140, erklaerkarten: 80 },
    ],
    kategorien_leer: ['mind.creativity', 'world.history', 'world.media'],
    kategorien_gross: [
      { id: 'world.science', karten: 31 },
      { id: 'science.space', karten: 28 },
      { id: 'science.bio', karten: 24 },
    ],
  },
  nutzung: {
    aktiv_15min: 1,
    aktiv_24h: 5,
    aktiv_7t: 12,
    aktiv_30t: 12,
    konten: 28,
    konten_neu_7t: 28,
    ereignisse_7t: [
      { art: 'impression', anzahl: 1114 },
      { art: 'skip', anzahl: 862 },
      { art: 'like', anzahl: 393 },
      { art: 'dwell', anzahl: 231 },
      { art: 'unlike', anzahl: 85 },
      { art: 'source_open', anzahl: 9 },
    ],
  },
  aufmerksamkeit: {
    paare: 363,
    gelesen: 132,
    geskippt: 309,
    geliked: 179,
    verweildauer_median_ms: 7000,
    verweildauer_p90_ms: 86000,
  },
  inhalt: {
    beliebt: [
      { titel: 'Inflation frisst leise', likes: 5, kategorie: 'finance.macro' },
      { titel: 'Was Zinseszins wirklich macht', likes: 4, kategorie: 'finance.compound' },
      { titel: 'Wie alt das Licht ist, das du siehst', likes: 4, kategorie: 'science.space' },
    ],
    weggewischt: [
      { titel: 'Vier Behauptungen ueber Schlaf', anzahl: 6, kategorie: 'body.sleep' },
      { titel: 'Ein Ring von 27 Kilometern', anzahl: 6, kategorie: 'science.physics' },
    ],
    lesequote_je_kategorie: [
      { id: 'world.science', gesehen: 55, gelesen: 18 },
      { id: 'science.space', gesehen: 49, gelesen: 13 },
      { id: 'finance.compound', gesehen: 38, gelesen: 14 },
      { id: 'tech.code', gesehen: 24, gelesen: 12 },
    ],
    zu_leicht: 5,
    zu_schwer: 2,
  },
  stand: '2026-09-12T12:00:00Z',
};

export default function Atelier() {
  const [reiter, setReiter] = useState<'karten' | 'kopfzeile' | 'bausteine' | 'kontrolle'>('karten');
  const { height } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const kartenHoehe = Math.min(560, height - 160);

  return (
    <GridBackground>
      <View style={styles.reiter}>
        {(['karten', 'kopfzeile', 'bausteine', 'kontrolle'] as const).map((k) => (
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

      {reiter === 'kontrolle' ? (
        <ScrollView contentContainerStyle={styles.bahn}>
          <AdminOverview data={KONTROLLE} />
        </ScrollView>
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
    overflow: 'hidden',
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
  // Im Feed passt FitBox den Inhalt an die Kartenhoehe an. Hier wird
  // stattdessen beschnitten - die Werkstatt zeigt die Gestaltung, nicht
  // die Umbruchlogik.
  inhalt: { flex: 1, gap: space.lg, overflow: 'hidden' },
  titel: { ...type.title, color: color.ink.max },
  deckZeile: { ...type.deck, color: color.ink.mid },
  schriftfeld: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.md,
  },
  quelle: { ...type.meta, color: color.ink.low, flex: 1 },
  urteil: { flexDirection: 'row', gap: 6 },
  urteilChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  urteilText: { ...type.meta, fontSize: 9.5, color: color.ink.low },
});
