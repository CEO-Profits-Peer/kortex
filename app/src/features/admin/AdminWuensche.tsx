import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Laden } from '@/components/Laden';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import { api, type AdminWuensche as Daten } from '@/lib/supabase';
import type { Category } from '@/lib/types.db';
import { T } from '@/lib/sprache';
import { color, radius, space, type } from '@/theme/tokens';

import { Gruppe, Marke, seit, type Ton } from './parts';

/**
 * Themenwuensche freigeben (0111).
 *
 * Nichts wird gebaut, was hier nicht "Ja" bekommt. Beim Ja legt man fest,
 * unter welchem Namen das Thema erscheint, mit welchem Begriff die Pipeline
 * bei Wikipedia sucht (Tippfehler hier korrigieren) und in welche
 * Unterkategorie die Karten kommen. Der naechste Evergreen-Lauf holt bis zu
 * vier Artikel und baut sie zuerst.
 */
const STATUS: Record<string, { text: string; ton?: Ton }> = {
  frei: { text: 'freigegeben', ton: 'signal' },
  in_arbeit: { text: 'in Arbeit', ton: 'signal' },
  fertig: { text: 'fertig', ton: 'gut' },
  nein: { text: 'nein' },
};

export function AdminWuensche({ pin }: { pin: () => string }) {
  const [daten, setDaten] = useState<Daten | null>(null);
  const [themen, setThemen] = useState<Category[]>([]);
  const [offen, setOffen] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    try {
      setDaten(await api.adminWuensche(pin()));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setFehler(/admin_wuensche|PGRST202/i.test(msg) ? 'Ist 0111_themenwuensche.sql eingespielt?' : fehlerText(e, 'Laden ging nicht'));
    }
  }, [pin]);

  useEffect(() => {
    void laden();
    api.listCategories().then(setThemen).catch(() => setThemen([]));
  }, [laden]);

  if (!daten) {
    return fehler ? <Text style={styles.fehler}>{fehler}</Text> : <Laden color={color.signal.primary} style={{ marginTop: space.xxl }} />;
  }

  return (
    <View style={{ gap: space.xl }}>
      <Gruppe titel={`Offen · ${daten.offen.length}`}>
        {daten.offen.length === 0 ? <Text style={styles.leer}>{T('Keine offenen Wünsche.')}</Text> : null}
        {daten.offen.map((w) => {
          const key = `${w.language}:${w.norm}`;
          return (
            <View key={key} style={styles.zeile}>
              <Pressable
                onPress={() => {
                  haptics.select();
                  setOffen(offen === key ? null : key);
                }}
                style={styles.kopf}
              >
                <Text style={styles.anzahl}>{w.anzahl}×</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {w.text}
                </Text>
                <Text style={styles.meta}>
                  {w.language} · {seit(w.zuletzt)}
                </Text>
              </Pressable>
              {offen === key ? (
                <Entscheiden
                  w={w}
                  themen={themen}
                  fertig={async (ja, felder) => {
                    await api.adminWunschEntscheiden(pin(), { norm: w.norm, language: w.language, ja, ...felder });
                    setOffen(null);
                    await laden();
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </Gruppe>

      <Gruppe titel={T('Entschieden')}>
        {daten.entschieden.length === 0 ? <Text style={styles.leer}>{T('Noch nichts.')}</Text> : null}
        {daten.entschieden.map((f) => {
          const s = STATUS[f.status] ?? { text: f.status };
          return (
            <View key={f.id} style={styles.zeile}>
              <View style={styles.kopf}>
                <Text style={styles.anzahl}>{f.anzahl}×</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {f.anzeige}
                </Text>
                <Marke text={s.text} ton={s.ton} />
              </View>
              {f.titel?.length ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {f.category_id} · {f.titel.join(', ')}
                </Text>
              ) : f.category_id ? (
                <Text style={styles.meta}>{f.category_id} · wartet auf den nächsten Lauf</Text>
              ) : null}
            </View>
          );
        })}
      </Gruppe>
      {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
    </View>
  );
}

function Entscheiden({
  w,
  themen,
  fertig,
}: {
  w: Daten['offen'][number];
  themen: Category[];
  fertig: (ja: boolean, felder: { anzeige?: string; suchbegriff?: string; kategorie?: string; grund?: string }) => Promise<void>;
}) {
  const [anzeige, setAnzeige] = useState(w.text);
  const [such, setSuch] = useState(w.text);
  const [grund, setGrund] = useState('');
  const [wurzel, setWurzel] = useState<string | null>(null);
  const [kat, setKat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const wurzeln = themen.filter((t) => !t.parent_id);
  const blaetter = themen.filter((t) => t.parent_id === wurzel);

  const los = async (ja: boolean) => {
    setBusy(true);
    setFehler(null);
    try {
      await fertig(ja, ja ? { anzeige, suchbegriff: such, kategorie: kat ?? undefined, grund } : { grund });
      haptics.success();
    } catch (e) {
      setFehler(fehlerText(e, 'Ging nicht'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.label}>{T('Name in der App')}</Text>
      <TextInput value={anzeige} onChangeText={setAnzeige} maxLength={80} style={styles.feld} />
      <Text style={styles.label}>Wikipedia-Suche</Text>
      <TextInput value={such} onChangeText={setSuch} maxLength={120} style={styles.feld} />
      <Text style={styles.label}>Kategorie</Text>
      <View style={styles.chips}>
        {wurzeln.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => {
              setWurzel(t.id);
              setKat(null);
            }}
            style={[styles.chip, wurzel === t.id && styles.chipAn]}
          >
            <Text style={[styles.chipText, wurzel === t.id && styles.chipTextAn]}>{t.display_name}</Text>
          </Pressable>
        ))}
      </View>
      {wurzel ? (
        <View style={styles.chips}>
          {blaetter.map((t) => (
            <Pressable key={t.id} onPress={() => setKat(t.id)} style={[styles.chip, kat === t.id && styles.chipAn]}>
              <Text style={[styles.chipText, kat === t.id && styles.chipTextAn]}>{t.display_name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.label}>Antwort an die Person (optional)</Text>
      <TextInput
        value={grund}
        onChangeText={setGrund}
        placeholder={T('z. B. Kommt, sobald die Quellen passen')}
        placeholderTextColor={color.ink.low}
        maxLength={200}
        style={styles.feld}
      />
      {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
      <View style={styles.knoepfe}>
        <View style={{ flex: 1 }}>
          <Button label={T('Nein')} variant="ghost" onPress={() => void los(false)} disabled={busy} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={T('Ja')} onPress={() => void los(true)} disabled={!kat || such.trim().length < 2} busy={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zeile: { gap: space.sm, paddingVertical: space.sm },
  kopf: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  anzahl: { ...type.mono, fontSize: 13, color: color.signal.primary, minWidth: 28 },
  name: { ...type.body, fontSize: 14, lineHeight: 18, color: color.ink.high, flex: 1, minWidth: 0 },
  meta: { ...type.meta, fontSize: 9, color: color.ink.low },
  leer: { ...type.meta, fontSize: 11, color: color.ink.low },
  fehler: { ...type.meta, fontSize: 11, color: color.signal.error },
  form: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
  },
  label: { ...type.meta, fontSize: 9, color: color.ink.low, textTransform: 'uppercase', marginTop: space.xs },
  feld: {
    ...type.body,
    fontSize: 14,
    color: color.ink.max,
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: color.bgSunken,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  chipAn: { borderColor: color.signal.primary },
  chipText: { ...type.meta, fontSize: 10, color: color.ink.mid },
  chipTextAn: { color: color.signal.primary },
  knoepfe: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
});
