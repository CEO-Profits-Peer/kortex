import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { KineticCard } from '@/features/kinetic/KineticCard';
import { setActiveCard } from '@/lib/activeCard';
import type { ContentItem } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Schaufenster fuer die Bildarten der Erklaerkarten - NUR zum Ansehen.
 *
 * Die Drehbuecher hier sind von Hand geschrieben und stehen in keiner
 * Datenbank. Sie duerfen das, weil sie nie in einen Feed kommen: ohne
 * Quelldokument waere eine echte Karte daraus ein Regelbruch (siehe
 * docs/CONTENT-SOURCING.md, Regel 1).
 */

const SCRIPTS: Record<string, { title: string; beats: unknown[] }> = {
  timeline: {
    title: 'Zeitstrahl',
    beats: [
      {
        say: 'Die Geschichte des maschinellen Lernens beginnt 1943.',
        show: { kind: 'statement', text: '1943', sub: 'der Anfang' },
      },
      {
        say: 'Damals beschrieben McCulloch und Pitts das erste kuenstliche Neuron.',
        show: {
          kind: 'timeline',
          id: 'h',
          points: [{ at: 1943, label: 'Kuenstliches Neuron' }],
        },
      },
      {
        say: 'Vierzehn Jahre spaeter folgte das Perzeptron.',
        show: {
          kind: 'timeline',
          id: 'h',
          points: [
            { at: 1943, label: 'Kuenstliches Neuron' },
            { at: 1957, label: 'Perzeptron' },
          ],
        },
      },
      {
        say: 'Dann passierte lange wenig, bis 2006 das Deep Learning kam.',
        show: {
          kind: 'timeline',
          id: 'h',
          points: [
            { at: 1943, label: 'Kuenstliches Neuron' },
            { at: 1957, label: 'Perzeptron' },
            { at: 2006, label: 'Deep Learning' },
          ],
        },
      },
      {
        say: 'Und ab 2018 kamen die Transformer, im Jahrestakt.',
        show: {
          kind: 'timeline',
          id: 'h',
          points: [
            { at: 1943, label: 'Kuenstliches Neuron' },
            { at: 1957, label: 'Perzeptron' },
            { at: 2006, label: 'Deep Learning' },
            { at: 2018, label: 'Transformer', note: 'Sprachmodelle' },
            { at: 2020, label: 'GPT-3' },
          ],
        },
      },
    ],
  },
  quantity: {
    title: 'Anteile',
    beats: [
      {
        say: 'Stell dir hundert Euro Haushaltsgeld vor.',
        show: { kind: 'statement', text: '100 €', sub: 'im Monat' },
      },
      {
        say: 'Achtunddreissig davon gehen fuer die Wohnung weg.',
        show: {
          kind: 'quantity',
          id: 'q',
          total: 100,
          unit: '€',
          groups: [{ label: 'Wohnen', value: 38 }],
        },
      },
      {
        say: 'Zweiundzwanzig kostet das Essen.',
        show: {
          kind: 'quantity',
          id: 'q',
          total: 100,
          unit: '€',
          groups: [
            { label: 'Wohnen', value: 38 },
            { label: 'Essen', value: 22 },
          ],
        },
      },
      {
        say: 'Vierzehn gehen fuer Verkehr und Mobilfunk drauf.',
        show: {
          kind: 'quantity',
          id: 'q',
          total: 100,
          unit: '€',
          groups: [
            { label: 'Wohnen', value: 38 },
            { label: 'Essen', value: 22 },
            { label: 'Verkehr', value: 14 },
          ],
        },
      },
      {
        say: 'Neun gehen fuer Freizeit weg und sieben fuer Kleidung.',
        show: {
          kind: 'quantity',
          id: 'q',
          total: 100,
          unit: '€',
          groups: [
            { label: 'Wohnen', value: 38 },
            { label: 'Essen', value: 22 },
            { label: 'Verkehr', value: 14 },
            { label: 'Freizeit', value: 9 },
            { label: 'Kleidung', value: 7 },
          ],
        },
      },
      {
        // Sechs Gruppen sind die Obergrenze - und sie steht hier, damit
        // man sie ansehen kann, statt sie zu glauben. Die Pruefung in
        // pipeline/validate/checks.py liess vorher nur vier zu, und daran
        // ist "Wasserverbrauch" gescheitert: fuenf Verwendungen.
        say: 'Uebrig bleiben zehn Euro fuer alles andere.',
        show: {
          kind: 'quantity',
          id: 'q',
          total: 100,
          unit: '€',
          groups: [
            { label: 'Wohnen', value: 38 },
            { label: 'Essen', value: 22 },
            { label: 'Verkehr', value: 14 },
            { label: 'Freizeit', value: 9 },
            { label: 'Kleidung', value: 7 },
            { label: 'Rest', value: 10 },
          ],
        },
      },
    ],
  },
  steps: {
    title: 'Ablauf',
    beats: [
      {
        say: 'Ein Gesetz entsteht in Oesterreich in vier Schritten.',
        show: { kind: 'statement', text: 'Vier Schritte', sub: 'vom Entwurf zum Gesetz' },
      },
      {
        say: 'Zuerst bringt die Regierung einen Entwurf ein.',
        show: {
          kind: 'steps',
          id: 's',
          steps: [{ label: 'Regierungsvorlage', note: 'der Entwurf' }],
        },
      },
      {
        say: 'Dann beraet ihn der zustaendige Ausschuss.',
        show: {
          kind: 'steps',
          id: 's',
          steps: [
            { label: 'Regierungsvorlage', note: 'der Entwurf' },
            { label: 'Ausschuss beraet' },
          ],
        },
      },
      {
        say: 'Danach stimmt der Nationalrat ab.',
        show: {
          kind: 'steps',
          id: 's',
          steps: [
            { label: 'Regierungsvorlage', note: 'der Entwurf' },
            { label: 'Ausschuss beraet' },
            { label: 'Nationalrat stimmt ab' },
          ],
        },
      },
      {
        say: 'Zuletzt wird es kundgemacht und gilt.',
        show: {
          kind: 'steps',
          id: 's',
          steps: [
            { label: 'Regierungsvorlage', note: 'der Entwurf' },
            { label: 'Ausschuss beraet' },
            { label: 'Nationalrat stimmt ab' },
            { label: 'Kundmachung', note: 'im Bundesgesetzblatt' },
          ],
        },
      },
    ],
  },
  compare: {
    title: 'Gegenueberstellung',
    beats: [
      {
        say: 'Miete oder Eigentum — was kostet wirklich mehr?',
        show: { kind: 'statement', text: 'Miete oder Eigentum', sub: 'zwei Wege, ein Dach' },
      },
      {
        say: 'Beim Einstieg zahlst du bei Eigentum zwanzig Prozent Anzahlung.',
        show: {
          kind: 'compare', id: 'c', left: 'Miete', right: 'Eigentum',
          pairs: [{ label: 'Einstieg', left: '0 €', right: '20 % Anzahlung' }],
        },
      },
      {
        say: 'Monatlich sind es neunhundert gegen elfhundert Euro.',
        show: {
          kind: 'compare', id: 'c', left: 'Miete', right: 'Eigentum',
          pairs: [
            { label: 'Einstieg', left: '0 €', right: '20 % Anzahlung' },
            { label: 'Monatlich', left: '900 €', right: '1.100 €' },
          ],
        },
      },
      {
        say: 'Und wer umziehen will, braucht einmal drei Monate und einmal ein Jahr.',
        show: {
          kind: 'compare', id: 'c', left: 'Miete', right: 'Eigentum',
          pairs: [
            { label: 'Einstieg', left: '0 €', right: '20 % Anzahlung' },
            { label: 'Monatlich', left: '900 €', right: '1.100 €' },
            { label: 'Umzug', left: '3 Monate', right: 'ca. 1 Jahr' },
          ],
        },
      },
      {
        say: 'Teurer ist nicht die Rate, sondern die Unbeweglichkeit.',
        show: { kind: 'figure', caption: 'Der Unterschied liegt in der letzten Zeile.' },
      },
    ],
  },
  scale: {
    title: 'Groessenordnungen',
    beats: [
      {
        say: 'Wie viel groesser ist ein Blauwal als ein Bakterium?',
        show: { kind: 'statement', text: 'Mal wie viel?', sub: 'Bakterium bis Blauwal' },
      },
      {
        say: 'Ein Bakterium misst ein Millionstel Meter.',
        show: {
          kind: 'scale', id: 's', unit: 'm',
          items: [{ label: 'Bakterium', value: 0.000001 }, { label: 'Mensch', value: 1.7 }],
        },
      },
      {
        say: 'Ein Mensch ist knapp zwei Meter gross.',
        show: {
          kind: 'scale', id: 's', unit: 'm',
          items: [
            { label: 'Bakterium', value: 0.000001 },
            { label: 'Mensch', value: 1.7 },
            { label: 'Blauwal', value: 30 },
          ],
        },
      },
      {
        say: 'Und ein Blauwal misst dreissig Meter.',
        show: {
          kind: 'scale', id: 's', unit: 'm',
          items: [
            { label: 'Bakterium', value: 0.000001 },
            { label: 'Mensch', value: 1.7 },
            { label: 'Blauwal', value: 30 },
            { label: 'Wolkenkratzer', value: 830 },
          ],
        },
      },
      {
        say: 'Zwischen dem Kleinsten und dem Groessten liegen neun Nullen.',
        show: { kind: 'figure', caption: 'Jede Stufe ist ein Vielfaches, kein Zuwachs.' },
      },
    ],
  },
  guess: {
    title: 'Schaetzen',
    beats: [
      {
        say: 'Eine Frage, bevor ich es dir sage — was schaetzt du?',
        show: {
          kind: 'guess', id: 'g',
          question: 'Wie viel Prozent deines Trinkwassers spuelst du die Toilette hinunter?',
        },
      },
      {
        say: 'Es sind dreissig Prozent.',
        show: {
          kind: 'guess', id: 'g',
          question: 'Wie viel Prozent deines Trinkwassers spuelst du die Toilette hinunter?',
          answer: '30 %',
          sub: 'in Trinkwasserqualitaet',
        },
      },
      {
        say: 'Von hundert Litern gehen dreissig ungenutzt in den Abfluss.',
        show: {
          kind: 'quantity', id: 'q', total: 100, unit: 'l',
          groups: [{ label: 'Toilette', value: 30 }],
        },
      },
      {
        say: 'Baden und Duschen kommen mit sechsunddreissig Litern dazu.',
        show: {
          kind: 'quantity', id: 'q', total: 100, unit: 'l',
          groups: [{ label: 'Toilette', value: 30 }, { label: 'Baden, Duschen', value: 36 }],
        },
      },
      {
        say: 'Zum Trinken bleiben davon ganze drei Liter.',
        show: {
          kind: 'quantity', id: 'q', total: 100, unit: 'l',
          groups: [
            { label: 'Toilette', value: 30 },
            { label: 'Baden, Duschen', value: 36 },
            { label: 'Trinken, Kochen', value: 3 },
          ],
        },
      },
    ],
  },
};

export default function KineticDemo() {
  const [which, setWhich] = useState<keyof typeof SCRIPTS>('timeline');

  useEffect(() => {
    setActiveCard(`demo-${which}`);
    return () => setActiveCard(null);
  }, [which]);

  const script = SCRIPTS[which];
  const item = {
    id: `demo-${which}`,
    title: script.title,
    language: 'de',
    kinetic_script: { beats: script.beats },
  } as unknown as ContentItem;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.tabs}>
        {Object.keys(SCRIPTS).map((key) => (
          <Pressable
            key={key}
            onPress={() => setWhich(key as keyof typeof SCRIPTS)}
            style={[styles.tab, which === key && styles.tabOn]}
          >
            <Text style={[styles.tabText, which === key && styles.tabTextOn]}>{key}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.card}>
        <KineticCard key={which} item={item} accent="#00F0FF" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, gap: space.lg },
  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  tabOn: { borderColor: color.signal.primary },
  tabText: { ...type.meta, color: color.ink.mid },
  tabTextOn: { color: color.signal.primary },
  card: {
    height: 560,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
});
