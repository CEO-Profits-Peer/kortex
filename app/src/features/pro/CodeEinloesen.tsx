import { router } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { bisText, proNeuLaden, schutzText, useIchPro } from '@/lib/pro';
import { api } from '@/lib/supabase';
import { KANTE, ZWEI } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * PRO-Stand und "Code einloesen" - unten in den Einstellungen.
 *
 * Codes schenken PRO-Tage (Gewinnspiel, Freunde, Tester). Rabatt-Codes fuer
 * einen Kauf gehoeren NICHT hierher, sondern spaeter in den Kaufablauf -
 * dort, wo ein Preis steht, den der Rabatt veraendert.
 *
 * Der Server zaehlt Fehlversuche und sperrt nach zehn pro Stunde. Die App
 * zeigt nur, was er antwortet.
 */
export function CodeEinloesen() {
  const stand = useIchPro();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notiz, setNotiz] = useState<{ text: string; gut: boolean } | null>(null);

  const einloesen = async () => {
    const c = code.trim();
    if (c.length < 6 || busy) return;
    setBusy(true);
    setNotiz(null);
    try {
      const r = await api.proCodeEinloesen(c);
      if (r.ok) {
        haptics.success();
        setCode('');
        await proNeuLaden();
        setNotiz({ text: `${r.tage} Tage PRO – aktiv ${bisText(r.bis)}.`, gut: true });
      } else {
        haptics.warning();
        setNotiz({ text: r.fehler, gut: false });
      }
    } catch (e) {
      setNotiz({ text: fehlerText(e, 'Einlösen ging nicht.'), gut: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wurzel}>
      <Pressable onPress={() => router.push('/pro')} style={styles.stand} accessibilityRole="button">
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.standTitel}>{stand.pro ? 'PRO aktiv' : 'Kein PRO'}</Text>
          <Text style={styles.standUnter}>
            {stand.pro ? `${stand.plan === 'gifted' ? 'Geschenkt' : 'Abo'}, ${bisText(stand.bis)}` : 'Was PRO kann'}
          </Text>
          {stand.pro ? <Text style={styles.standUnter}>{schutzText(stand.schutzAm)}</Text> : null}
        </View>
        <Icon name="chevron" size={13} color={color.ink.low} />
      </Pressable>

      <View style={styles.trenner} />

      <Text style={styles.label}>Code einlösen</Text>
      <View style={styles.zeile}>
        <TextInput
          value={code}
          onChangeText={(v) => {
            setCode(v.toUpperCase());
            setNotiz(null);
          }}
          placeholder="ELY-XXXX-XXXX"
          placeholderTextColor={color.ink.low}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={40}
          style={styles.eingabe}
          onSubmitEditing={() => void einloesen()}
          returnKeyType="done"
        />
        <Pressable
          onPress={() => void einloesen()}
          style={({ pressed }) => [styles.knopf, (busy || code.trim().length < 6) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          <Text style={styles.knopfText}>{busy ? '…' : 'Einlösen'}</Text>
        </Pressable>
      </View>
      {notiz ? (
        <Text style={[styles.notiz, { color: notiz.gut ? color.signal.success : color.signal.error }]}>{notiz.text}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wurzel: { padding: space.lg, gap: space.sm },
  stand: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  standTitel: { ...type.label, fontSize: 15, color: color.ink.max },
  standUnter: { ...type.meta, color: color.ink.low },
  trenner: { height: StyleSheet.hairlineWidth, backgroundColor: color.ink.faint, marginVertical: space.xs },
  label: { ...type.meta, color: color.ink.low },
  zeile: { flexDirection: 'row', gap: space.sm },
  eingabe: {
    flex: 1,
    ...type.mono,
    fontSize: 14,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    letterSpacing: 1,
    ...(ZWEI ? { borderTopWidth: 1, borderTopColor: KANTE } : null),
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  knopf: {
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: ZWEI ? color.bordeaux : color.bgSunken,
    borderWidth: ZWEI ? 0 : StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  knopfText: { ...type.label, fontSize: 14, color: color.ink.max },
  notiz: { ...type.meta, lineHeight: 16 },
});
