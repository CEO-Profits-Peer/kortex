import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { FeedScreen } from '@/features/feed/FeedScreen';
import { zeigeProSperre } from '@/components/ProSperre';
import { stapelAlsAnki, stapelAlsPdf, stapelPdfFenster, textSpeichern } from '@/lib/export';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { useIchPro } from '@/lib/pro';
import { api } from '@/lib/supabase';
import type { ContentItem, StapelDaten } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Einen Karten-Stapel durchwischen (0088).
 *
 * Derselbe Feed wie ueberall, nur mit genau diesen Karten in genau dieser
 * Reihenfolge - ab der angetippten. Danach ist Schluss: ein Stapel ist eine
 * Auswahl, und wer "die 5 besten zu KI" teilt, will nicht, dass danach
 * irgendetwas anderes kommt.
 */
export function StapelScreen({ postId, start = 0 }: { postId: string; start?: number }) {
  const insets = useSafeAreaInsets();
  const [ids, setIds] = useState<string[] | null>(null);
  const [wer, setWer] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const geliefert = useRef(false);
  const ichPro = useIchPro();
  const [exportiert, setExportiert] = useState<string | null>(null);

  // PRO (19.09.): den Stapel fuer Anki mitnehmen. Nur eine App-Grenze - der
  // Export liest dieselben Karten, die man hier ohnehin sieht.
  const [wahl, setWahl] = useState(false);

  const exportieren = async (als: 'anki' | 'pdf') => {
    if (!ids) return;
    setWahl(false);
    if (!ichPro.pro) {
      zeigeProSperre('Stapel als PDF oder für Anki exportieren gibt es mit PRO.');
      return;
    }
    haptics.medium();
    // PDF: Fenster SOFORT oeffnen, noch im Klick - sonst blockt der Browser es.
    const fenster = als === 'pdf' ? stapelPdfFenster() : null;
    try {
      const karten = await api.contentByIds(ids);
      if (als === 'pdf') {
        if (!fenster) {
          setExportiert('PDF geht im Browser – in der App bitte Anki wählen.');
        } else {
          stapelAlsPdf(fenster, karten, wer ? `Stapel von @${wer}` : 'Stapel');
          setExportiert('Im neuen Fenster: Drucken › Als PDF speichern');
        }
      } else {
        await textSpeichern(`stapel-${wer ?? 'elycic'}.txt`, stapelAlsAnki(karten));
        setExportiert(`${karten.length} Karten exportiert – in Anki: Datei › Importieren`);
      }
    } catch (e) {
      fenster?.close();
      setExportiert(fehlerText(e, 'Export ging nicht'));
    }
    setTimeout(() => setExportiert(null), 3500);
  };

  useEffect(() => {
    void api
      .postDetail(postId)
      .then((d) => {
        if (d.gesperrt || d.post.art !== 'stapel' || !d.post.daten) {
          setFehler(d.gesperrt ? `Diesen Stapel sehen nur Leute, die @${d.wer.handle} folgen.` : 'Das ist kein Stapel.');
          return;
        }
        const karten = (d.post.daten as StapelDaten).karten ?? [];
        const alle = karten.map((k) => k.content_id);
        setIds([...alle.slice(start), ...alle.slice(0, start)]);
        setWer(d.post.wer.handle);
      })
      .catch((e) => setFehler(fehlerText(e, 'Stapel nicht ladbar')));
  }, [postId, start]);

  const loader = useCallback(async (): Promise<ContentItem[]> => {
    if (geliefert.current || !ids) return [];
    geliefert.current = true;
    return api.contentByIds(ids);
  }, [ids]);

  const zurueck = (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      style={[styles.zurueck, { top: insets.top + space.md }]}
      accessibilityLabel="Zurück"
    >
      <Icon name="back" size={18} color={color.ink.high} />
      <Text style={styles.zurueckText}>
        {wer ? `Stapel · @${wer}` : 'Stapel'}
        {ids ? ` · ${ids.length}` : ''}
      </Text>
    </Pressable>
  );

  if (!ids) {
    return (
      <GridBackground>
        <View style={styles.mitte}>
          {fehler ? <Text style={styles.fehler}>{fehler}</Text> : <Laden color={color.signal.primary} />}
        </View>
        {zurueck}
      </GridBackground>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FeedScreen
        loader={loader}
        withCheckpoint={false}
        reserveBottom={0}
        emptyTitle="Die Karten gibt es nicht mehr"
        emptyBody="Sie wurden zurückgezogen."
      />
      {zurueck}
      <Pressable
        onPress={() => setWahl((w) => !w)}
        hitSlop={12}
        style={[styles.zurueck, styles.export, { top: insets.top + space.md }]}
        accessibilityRole="button"
      >
        <Text style={styles.zurueckText}>Export</Text>
      </Pressable>
      {wahl ? (
        <View style={[styles.wahl, { top: insets.top + space.md + 40 }]}>
          <Pressable onPress={() => void exportieren('pdf')} style={styles.zurueck} accessibilityRole="button">
            <Text style={styles.zurueckText}>PDF</Text>
          </Pressable>
          <Pressable onPress={() => void exportieren('anki')} style={styles.zurueck} accessibilityRole="button">
            <Text style={styles.zurueckText}>Anki</Text>
          </Pressable>
        </View>
      ) : null}
      {exportiert ? (
        <View style={[styles.hinweis, { top: insets.top + space.md + 44 }]}>
          <Text style={styles.zurueckText}>{exportiert}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mitte: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  fehler: { ...type.body, color: color.ink.mid, textAlign: 'center' },
  zurueck: {
    position: 'absolute',
    left: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: color.overlay,
  },
  zurueckText: { ...type.mono, fontSize: 12, color: color.ink.high },
  export: { left: undefined, right: space.lg },
  wahl: { position: 'absolute', right: space.lg, gap: space.xs, alignItems: 'flex-end' },
  hinweis: {
    position: 'absolute',
    right: space.lg,
    left: space.lg,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.overlay,
  },
});
