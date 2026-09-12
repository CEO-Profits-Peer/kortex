import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { AdminOverview, type AdminData } from '@/features/admin/AdminOverview';
import { api } from '@/lib/supabase';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Das Kontrollzentrum.
 *
 * Nirgends verlinkt. Wer die Adresse nicht kennt, findet sie nicht - und
 * wer sie kennt, sieht trotzdem nichts: die Absicherung steckt NICHT hier,
 * sondern in der Datenbank (Migration 0064). Diese Seite kann nichts
 * anzeigen, was ihr die Funktion `admin_overview` nicht gibt, und die
 * prueft Konto UND PIN, bevor sie eine einzige Zahl herausgibt.
 *
 * Das ist der ganze Punkt der Aufteilung: eine Sperre im Bildschirm ist
 * eine Sperre in JavaScript, und JavaScript laeuft auf einem fremden
 * Geraet. Eine Sperre in einer SECURITY-DEFINER-Funktion laeuft auf dem
 * Server.
 *
 * Die PIN wird bewusst nicht gespeichert - weder im Geraetespeicher noch
 * im Zustand nach dem Verlassen der Seite. Sie einmal je Besuch zu tippen
 * ist der Preis dafuer, dass ein entsperrtes Telefon allein nicht reicht.
 * Genau dafuer gibt es sie.
 */
export default function Admin() {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');
  const [daten, setDaten] = useState<AdminData | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const oeffnen = useCallback(async () => {
    if (!pin.trim() || busy) return;
    setBusy(true);
    setFehler(null);
    try {
      setDaten(await api.adminOverview(pin));
      // Nach dem Laden aus dem Zustand nehmen. Der Rest der Sitzung
      // braucht sie nicht mehr.
      setPin('');
    } catch (e) {
      // Die Datenbank meldet fuer alle drei Faelle dasselbe ("kein
      // Zugang") - nicht angemeldet, kein Admin, falsche PIN. Diese Seite
      // gibt genau das weiter und raet nicht daran herum.
      const msg = e instanceof Error ? e.message : '';
      setFehler(
        /kein Zugang/i.test(msg) ? 'Kein Zugang.' : 'Hat nicht geklappt. Später nochmal.',
      );
    } finally {
      setBusy(false);
    }
  }, [pin, busy]);

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Kontrollzentrum" titleInBarOnly />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + space.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {daten ? (
          <AdminOverview data={daten} />
        ) : (
          <View style={styles.tor}>
            <Text style={styles.titel}>Kontrollzentrum</Text>
            <Text style={styles.hinweis}>
              Nur für ein Konto, und auch dort nur mit PIN.
            </Text>

            <TextInput
              value={pin}
              onChangeText={setPin}
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
        )}
      </ScrollView>
    </GridBackground>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },

  tor: { gap: space.md, paddingTop: space.xxl },
  titel: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max },
  hinweis: { ...type.body, fontSize: 15, color: color.ink.mid },
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
  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
});
