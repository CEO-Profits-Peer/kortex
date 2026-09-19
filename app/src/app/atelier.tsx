import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { ActionRail } from '@/components/ActionRail';
import { Avatar } from '@/components/Avatar';
import { BlueprintTabBar } from '@/components/BlueprintTabBar';
import { BlueprintVisual } from '@/components/BlueprintVisual';
import { Button } from '@/components/Button';
import { CardBlock } from '@/components/CardBlock';
import { isHero } from '@/components/paginate';
import { CardTypeBadge } from '@/components/CardTypeBadge';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionTitle } from '@/components/SectionTitle';
import { AdminCategories } from '@/features/admin/AdminCategories';
import { AdminOverview } from '@/features/admin/AdminOverview';
import { AdminPeople } from '@/features/admin/AdminPeople';
import { AvatarEditor } from '@/features/auth/AvatarEditor';
import { ProBanner } from '@/features/pro/ProBanner';
import { Laden } from '@/components/Laden';
import { WabenKacheln } from '@/features/profile/WabenKacheln';
import { PROFIL_THEMES, ProfilKopf } from '@/features/pro/ProfilKopf';
import { zeigeProSperre } from '@/components/ProSperre';
import { zeigeProWillkommen } from '@/features/pro/ProWillkommen';
import { ProScreen } from '@/features/pro/ProScreen';
import { type WabenDesign, wabenKodieren, wabenWuerfeln } from '@/lib/avatarWaben';
import type {
  AdminCategory,
  AdminData,
  AdminPerson,
  AdminPersonHit,
} from '@/features/admin/types';
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
  geruest: [
    {
      type: 'bullet',
      items: [
        'Lang statt kompliziert',
        'Fuer jeden Dienst ein eigenes',
        'Aufgeschrieben schlaegt vergessen',
      ],
    },
    {
      type: 'para',
      text: 'Sonderzeichen stehen in keiner der drei Bedingungen - sie machen ein Passwort schwer zu merken und kaum schwerer zu raten.',
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
  { key: 'geruest', titel: 'Drei Bedingungen', deck: 'Woran ein Passwort wirklich haengt.' },
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
  // Dieselbe Regel wie im Feed, aus derselben Datei. Hier stand eine dritte
  // Kopie der Bedingung - und prompt zeigte die Werkstatt beim Hinzufuegen
  // der Listen-Karte noch die alte Darstellung, waehrend der Feed schon die
  // neue zeichnete. Eine Werkstatt, die etwas anderes zeigt als der Laden,
  // ist schlimmer als keine.
  const hasHero = isHero(blocks, 0);

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

      {/* Fusszeile wie im Feed: Herkunft, keine Linien - siehe die
          Begruendung in ContentCard.tsx. */}
      <View style={styles.schriftfeld}>
        <Text style={styles.quelle}>atelier.example.org</Text>
      </View>
    </View>
  );
}

/**
 * Erfundene Zahlen fuer die drei Ansichten des Kontrollzentrums.
 *
 * Damit laesst sich die Gestaltung ohne Anmeldung und ohne PIN pruefen. Eine
 * Ansicht, die man nur im Echtbetrieb sehen kann, wird nicht gestaltet,
 * sondern vermutet - und im Echtbetrieb stehen zufaellig gerade nie die
 * Faelle drin, die weh tun (leere Kategorie, Quelle mit Fehler, Konto, das
 * einmal da war und nie wieder).
 */
const KATEGORIEN: AdminCategory[] = [
  { id: 'wissen.physik', name: 'Physik', eltern: 'wissen', art: 'knowledge',
    farbe: '#00F0FF', karten: 46, de: 27, en: 19, erklaerkarten: 21, likes: 38,
    gesehen: 312, gelesen: 129, interessiert: 14, neuste: new Date(Date.now() - 3 * 3600e3).toISOString() },
  { id: 'weltgeschehen.politik', name: 'Politik', eltern: 'weltgeschehen', art: 'news',
    farbe: '#FFD84D', karten: 38, de: 31, en: 7, erklaerkarten: 9, likes: 12,
    gesehen: 401, gelesen: 96, interessiert: 6, neuste: new Date(Date.now() - 40 * 60e3).toISOString() },
  { id: 'finanzen.steuern', name: 'Steuern', eltern: 'finanzen', art: 'knowledge',
    farbe: '#7CFF6B', karten: 11, de: 8, en: 3, erklaerkarten: 6, likes: 9,
    gesehen: 88, gelesen: 51, interessiert: 9, neuste: new Date(Date.now() - 4 * 86400e3).toISOString() },
  { id: 'koerper.ernaehrung', name: 'Ernährung', eltern: 'koerper', art: 'knowledge',
    farbe: '#B78BFF', karten: 4, de: 4, en: 0, erklaerkarten: 1, likes: 2,
    gesehen: 31, gelesen: 6, interessiert: 11, neuste: new Date(Date.now() - 19 * 86400e3).toISOString() },
  { id: 'alltag.mietrecht', name: 'Mietrecht', eltern: 'alltag', art: 'knowledge',
    farbe: '#FF9F45', karten: 0, de: 0, en: 0, erklaerkarten: 0, likes: 0,
    gesehen: 0, gelesen: 0, interessiert: 7, neuste: null },
];

const LEUTE: AdminPersonHit[] = [
  { handle: 'gridb6eca3', name: null, avatar_seed: 'b6eca3', avatar_path: null,
    seit: new Date(Date.now() - 41 * 86400e3).toISOString(),
    zuletzt: new Date().toISOString(), land: 'AT', region: 'AT-9', sprache: 'de',
    plan: 'free', xp: 1284, mastery: 96, streak: 6, gelesen: 312, ist_admin: true },
  { handle: 'grid2a8089', name: 'Lena', avatar_seed: '2a8089', avatar_path: null,
    seit: new Date(Date.now() - 12 * 86400e3).toISOString(),
    zuletzt: new Date(Date.now() - 2 * 86400e3).toISOString(), land: 'CA', region: 'CA-ON',
    sprache: 'en', plan: 'pro', xp: 540, mastery: 31, streak: 0, gelesen: 130, ist_admin: false },
  { handle: 'grid7f1102', name: null, avatar_seed: '7f1102', avatar_path: null,
    seit: new Date(Date.now() - 3 * 86400e3).toISOString(),
    zuletzt: new Date(Date.now() - 3 * 86400e3).toISOString(), land: 'DE', region: 'DE-BY',
    sprache: 'de', plan: 'free', xp: 18, mastery: 0, streak: 0, gelesen: 9, ist_admin: false },
];

const PERSON: AdminPerson = {
  person: {
    handle: 'grid2a8089', name: 'Lena', bio: 'Hier für Physik und Steuern.',
    avatar_seed: '2a8089', avatar_path: null,
    seit: new Date(Date.now() - 12 * 86400e3).toISOString(),
    zuletzt: new Date(Date.now() - 2 * 86400e3).toISOString(),
    land: 'CA', region: 'CA-ON', sprache: 'en', englisch_pct: 100, jahrgang: 2004,
    plan: 'pro', tagesziel: 60, rangliste: true,
    onboarding: new Date(Date.now() - 12 * 86400e3).toISOString(), ist_admin: false,
  },
  lernen: { xp: 540, mastery: 31, streak: 0, streak_best: 5, gelesen: 130,
    fokus_sekunden: 4820, wiederholungen_faellig: 7 },
  aufmerksamkeit: { paare: 214, gelesen: 130, geskippt: 71, geliked: 22,
    verweildauer_median_ms: 9400 },
  aktivitaet: {
    tage_30: 9,
    letztes_ereignis: new Date(Date.now() - 2 * 86400e3).toISOString(),
    ereignisse_30: [
      { art: 'impression', anzahl: 412 }, { art: 'dwell', anzahl: 214 },
      { art: 'skip', anzahl: 71 }, { art: 'like', anzahl: 22 },
    ],
    tage: Array.from({ length: 30 }, (_, n) => ({
      tag: new Date(Date.now() - (29 - n) * 86400e3).toISOString().slice(0, 10),
      anzahl: [0, 0, 12, 34, 0, 0, 0, 8, 51, 22, 0, 0, 0, 0, 19, 44, 61, 0, 0, 7,
        0, 0, 0, 0, 33, 28, 0, 14, 0, 0][n],
    })),
  },
  sicht: {
    interessen: [
      { id: 'wissen.physik', name: 'Physik', gewicht: 2.4, gewaehlt: true, level: 3, mastery: 18 },
      { id: 'finanzen.steuern', name: 'Steuern', gewicht: 1.8, gewaehlt: true, level: 2, mastery: 9 },
      { id: 'weltgeschehen.politik', name: 'Politik', gewicht: 0.6, gewaehlt: false, level: 1, mastery: 4 },
    ],
    letzte_100: [
      { id: 'wissen.physik', anzahl: 41, sprache_de: 2 },
      { id: 'finanzen.steuern', anzahl: 29, sprache_de: 0 },
      { id: 'weltgeschehen.politik', anzahl: 18, sprache_de: 11 },
      { id: 'koerper.ernaehrung', anzahl: 12, sprache_de: 4 },
    ],
  },
  sozial: { folgt: 4, follower: 2, reposts: 6, kommentare: 1 },
  stand: new Date().toISOString(),
};

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
  const [reiter, setReiter] = useState<'karten' | 'kopfzeile' | 'bausteine' | 'kontrolle' | 'design' | 'pro'>('karten');
  // Design 2.0: Bausteine, die sonst nur hinter der Anmeldung zu sehen sind.
  const [waben, setWaben] = useState<WabenDesign>(() => wabenWuerfeln('sechs', 'atelier'));
  const [tab, setTab] = useState(1);
  const [aktiv, setAktiv] = useState(true);
  const { height } = useWindowDimensions();
  const scrollY = useSharedValue(0);
  const kartenHoehe = Math.min(560, height - 160);

  return (
    <GridBackground>
      <View style={styles.reiter}>
        {(['karten', 'kopfzeile', 'bausteine', 'kontrolle', 'design', 'pro'] as const).map((k) => (
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
          <View style={{ height: 32 }} />
          <AdminCategories data={KATEGORIEN} />
          <View style={{ height: 32 }} />
          <AdminPeople
            suche={async () => LEUTE}
            laden={async () => PERSON}
          />
        </ScrollView>
      ) : null}

      {reiter === 'pro' ? <View style={styles.voll}><ProScreen /></View> : null}

      {reiter === 'design' ? (
        <ScrollView contentContainerStyle={[styles.bahn, { paddingBottom: 140 }]}>
          <Text style={styles.werkTitel}>Profilbilder</Text>
          <View style={[styles.gruppe, { alignItems: 'center' }]}>
            <Avatar seed={wabenKodieren(waben)} size={64} ring={color.signal.primary} />
            <Avatar seed={wabenKodieren(waben)} size={40} />
            <Avatar seed="v1-210-a7" size={64} />
            <Avatar seed="alte-zufalls-id" size={40} ring={color.signal.primary} />
          </View>

          <Text style={styles.werkTitel}>Profil-Waben</Text>
          <WabenKacheln
            waben={[
              { icon: 'refresh', label: 'Wiederholen', badge: 3, tint: color.signal.mastery, onPress: () => undefined },
              { icon: 'mastery', label: 'Meisterwege', onPress: () => undefined },
              { icon: 'profile', label: 'Leute', onPress: () => undefined },
              { icon: 'leaderboard', label: 'Ranglisten', onPress: () => undefined },
              { icon: 'chart', label: 'Statistik', onPress: () => undefined },
            ]}
          />

          <Text style={styles.werkTitel}>Profil-Themes</Text>
          {PROFIL_THEMES.map((t) => (
            <ProfilKopf key={t.id} theme={t.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar seed="v2-ce00-0a5a5a5a5a5a5a5a5a5" size={56} rahmen="science" />
                <View>
                  <Text style={{ color: color.ink.max, fontSize: 18 }}>{t.label}</Text>
                  <Text style={{ color: color.ink.mid }}>@beispiel</Text>
                </View>
              </View>
            </ProfilKopf>
          ))}

          <Text style={styles.werkTitel}>Meister-Rahmen</Text>
          <View style={[styles.gruppe, { alignItems: 'center' }]}>
            {['science', 'tech', 'finance', 'body', 'mind', 'world', 'local', 'life', 'history', 'culture', 'language'].map((r) => (
              <View key={r} style={{ gap: 4, alignItems: 'center' }}>
                <Avatar seed="v2-ce00-0a5a5a5a5a5a5a5a5a5" size={48} rahmen={r} />
                <Avatar seed="v2-1000-0000000000000000000" size={32} rahmen={`${r}-gold`} />
              </View>
            ))}
          </View>

          <Text style={styles.werkTitel}>Laden</Text>
          <View style={[styles.gruppe, { alignItems: 'center', gap: 24 }]}>
            <Laden />
            <Laden size="large" />
            <Laden size={96} />
          </View>

          <Text style={styles.werkTitel}>PRO</Text>
          <ProBanner />
          <Button label="Fenster" variant="ghost" onPress={() => zeigeProSperre('Mehr als zehn Karten im Stapel gibt es mit PRO – bis zu 50.')} />
          <Button label="Willkommen" variant="ghost" onPress={zeigeProWillkommen} />

          <Text style={styles.werkTitel}>Feed-Leiste</Text>
          <View style={{ height: 330, alignSelf: 'flex-end', width: 80 }}>
            <ActionRail
              liked={aktiv}
              likeCount={128}
              reposted={false}
              speaking={false}
              tint={color.signal.primary}
              commentCount={4}
              onLike={() => setAktiv((a) => !a)}
              onRepost={() => {}}
              onShare={() => {}}
              onComment={() => {}}
              onListen={() => {}}
            />
          </View>

          <Text style={styles.werkTitel}>Profilbild-Editor</Text>
          <AvatarEditor design={waben} onChange={setWaben} />

          <Text style={styles.werkTitel}>Tab-Leiste</Text>
          <View style={{ height: 110 }}>
            <BlueprintTabBar
              state={{
                index: tab,
                routes: ['home', 'studio', 'index', 'search', 'profile'].map((n) => ({ key: n, name: n })),
              }}
              descriptors={{
                home: { options: { title: 'Home' } },
                studio: { options: { title: 'Studio' } },
                index: { options: { title: 'Feed' } },
                search: { options: { title: 'Suche' } },
                profile: { options: { title: 'Profil' } },
              }}
              navigation={{
                emit: () => ({ defaultPrevented: false }),
                navigate: (n: string) => setTab(['home', 'studio', 'index', 'search', 'profile'].indexOf(n)),
              }}
            />
          </View>
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
