import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AdminCategories } from '@/features/admin/AdminCategories';
import { AdminOverview } from '@/features/admin/AdminOverview';
import { AdminPeople } from '@/features/admin/AdminPeople';
import type { AdminCategory, AdminData } from '@/features/admin/types';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import { fehlerText } from '@/lib/fehler';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Kontrollzentrum.
 *
 * Nirgends verlinkt. Wer die Adresse nicht kennt, findet sie nicht - und wer
 * sie kennt, sieht trotzdem nichts: die Absicherung steckt NICHT hier,
 * sondern in der Datenbank (Migrationen 0064 und 0068). Diese Seite kann
 * nichts anzeigen, was ihr die Funktionen nicht geben, und die pruefen Konto
 * UND PIN, bevor sie eine einzige Zahl herausruecken.
 *
 * Das ist der ganze Punkt der Aufteilung: eine Sperre im Bildschirm ist eine
 * Sperre in JavaScript, und JavaScript laeuft auf einem fremden Geraet. Eine
 * Sperre in einer SECURITY-DEFINER-Funktion laeuft auf dem Server.
 *
 * Warum die PIN jetzt im Speicher bleibt
 * --------------------------------------
 * In der ersten Fassung wurde sie nach dem Laden sofort geloescht - es gab ja
 * nur einen Aufruf. Mit drei Reitern und einer Personensuche ginge das nicht
 * mehr: man muesste sie vor jedem Klick neu tippen. Sie liegt jetzt in einer
 * Ref, solange der Bildschirm offen ist, und geht bei "Sperren" oder beim
 * Verlassen mit. NICHT im Geraetespeicher - eine PIN, die einen Neustart
 * ueberlebt, ist keine zweite Sperre mehr, sondern ein zweiter Schluessel
 * unter der Fussmatte.
 */

type Reiter = 'uebersicht' | 'kategorien' | 'personen';

const REITER: { key: Reiter; label: string }[] = [
  { key: 'uebersicht', label: 'Übersicht' },
  { key: 'kategorien', label: 'Kategorien' },
  { key: 'personen', label: 'Personen' },
];

export default function Admin() {
  const insets = useSafeAreaInsets();
  const pin = useRef('');
  const [eingabe, setEingabe] = useState('');
  const [offen, setOffen] = useState(false);
  const [reiter, setReiter] = useState<Reiter>('uebersicht');

  const [daten, setDaten] = useState<AdminData | null>(null);
  const [kategorien, setKategorien] = useState<AdminCategory[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const oeffnen = useCallback(async () => {
    if (!eingabe.trim() || busy) return;
    setBusy(true);
    setFehler(null);
    try {
      const d = await api.adminOverview(eingabe);
      pin.current = eingabe;
      setDaten(d);
      setOffen(true);
      // Aus dem Zustand nehmen: das Feld soll nicht mit der PIN dastehen,
      // solange die Seite offen ist.
      setEingabe('');
    } catch (e) {
      // Die Datenbank meldet fuer alle Faelle dasselbe ("kein Zugang") -
      // nicht angemeldet, kein Admin, falsche PIN. Diese Seite gibt genau
      // das weiter und raet nicht daran herum.
      const msg = e instanceof Error ? e.message : '';
      setFehler(
        /kein Zugang/i.test(msg) ? 'Kein Zugang.' : fehlerText(e, 'Hat nicht geklappt. Später nochmal.'),
      );
    } finally {
      setBusy(false);
    }
  }, [eingabe, busy]);

  const sperren = useCallback(() => {
    pin.current = '';
    setOffen(false);
    setDaten(null);
    setKategorien(null);
    setReiter('uebersicht');
  }, []);

  const wechseln = useCallback(
    async (k: Reiter) => {
      haptics.select();
      setReiter(k);
      // Erst beim Ansehen laden. Drei Abfragen beim Oeffnen waeren drei
      // Gelegenheiten, dass eine haengt und die Seite halb dasteht.
      if (k === 'kategorien' && !kategorien) {
        setBusy(true);
        try {
          setKategorien(await api.adminCategories(pin.current));
        } catch {
          setFehler('Kategorien nicht ladbar');
        } finally {
          setBusy(false);
        }
      }
    },
    [kategorien],
  );

  const suchen = useCallback((q: string) => api.adminPeople(pin.current, q), []);
  const person = useCallback((h: string) => api.adminPerson(pin.current, h), []);

  if (!offen) {
    return (
      <GridBackground>
        <View style={{ paddingTop: insets.top }}>
          <ScreenHeader title="Kontrollzentrum" titleInBarOnly />
        </View>
        <View style={styles.tor}>
          <Text style={styles.torTitel}>Kontrollzentrum</Text>
          <Text style={styles.torText}>Nur für ein Konto, und auch dort nur mit PIN.</Text>

          <TextInput
            value={eingabe}
            onChangeText={setEingabe}
            placeholder="PIN"
            placeholderTextColor={color.ink.low}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => void oeffnen()}
            style={styles.feld}
            accessibilityLabel="PIN"
          />

          {busy ? (
            <ActivityIndicator color={color.signal.primary} />
          ) : (
            <Button label="Öffnen" onPress={() => void oeffnen()} />
          )}

          {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
        </View>
      </GridBackground>
    );
  }

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader
          title="Kontrollzentrum"
          titleInBarOnly
          right={
            <Pressable onPress={sperren} hitSlop={8}>
              <Text style={styles.sperren}>sperren</Text>
            </Pressable>
          }
        />
      </View>

      <View style={styles.reiter}>
        {REITER.map((r) => (
          <Pressable key={r.key} onPress={() => void wechseln(r.key)} style={styles.reiterKnopf}>
            <Text style={[styles.reiterText, reiter === r.key && styles.reiterTextAn]}>
              {r.label}
            </Text>
            <View style={[styles.reiterLinie, reiter === r.key && styles.reiterLinieAn]} />
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {reiter === 'uebersicht' && daten ? <AdminOverview data={daten} /> : null}

        {reiter === 'kategorien' ? (
          kategorien ? (
            <AdminCategories data={kategorien} />
          ) : (
            <ActivityIndicator color={color.signal.primary} style={{ marginTop: space.xxl }} />
          )
        ) : null}

        {reiter === 'personen' ? <AdminPeople suche={suchen} laden={person} /> : null}

        {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },

  tor: { paddingHorizontal: space.xl, paddingTop: space.xxl, gap: space.md },
  torTitel: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  torText: { ...type.body, fontSize: 15, color: color.ink.mid },
  feld: {
    minHeight: 50,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...type.body,
    fontSize: 16,
    color: color.ink.max,
  },

  sperren: { ...type.meta, fontSize: 9.5, color: color.ink.low },

  reiter: { flexDirection: 'row', gap: space.xl, paddingHorizontal: space.xl },
  reiterKnopf: { paddingBottom: space.sm },
  reiterText: { ...type.meta, fontSize: 10, color: color.ink.low },
  reiterTextAn: { color: color.ink.max },
  reiterLinie: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'transparent',
  },
  reiterLinieAn: { backgroundColor: color.signal.primary },

  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
});
