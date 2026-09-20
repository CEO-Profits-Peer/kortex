import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { WabenArt } from '@/components/Avatar';
import {
  SYMMETRIE_LABEL,
  type Symmetrie,
  WABEN,
  WABEN_FARBEN,
  WABEN_GRUENDE,
  WABEN_STILE,
  WABEN_STIL_LABEL,
  type Wabe,
  type WabenDesign,
  symmetrisch,
  wabenLeer,
  wabenMitte,
  wabenWuerfeln,
  MEISTER_AB,
  grundBrauchtPro,
  PRO_AB_STIL,
} from '@/lib/avatarWaben';
import { Icon } from '@/components/Icon';
import { ProMarke } from '@/components/ProSperre';
import { haptics } from '@/lib/haptics';
import { T } from '@/lib/sprache';
import { KANTE, ZWEI, flaeche, sechseckRegel, sechseckRegelPunkte } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Der Zeichentisch fuer das Wabenbild - ohne Laden und Speichern.
 *
 * Getrennt vom Bildschirm (AvatarStudio), damit die Werkstatt (/atelier) ihn
 * ohne Konto zeigen kann: eine Gestaltung, die nur hinter der Anmeldung
 * liegt, wird nicht gestaltet, sondern vermutet.
 *
 * Aufbau von oben nach unten, in der Reihenfolge, in der man entscheidet:
 *   1. malen      - Pinsel (Farbe, Akzent, Radierer) und Symmetrie
 *   2. faerben    - Farbe, Akzent, Grund
 *   3. Stil       - jede Kachel zeigt das EIGENE Bild im jeweiligen Stil,
 *                   nicht ein Beispiel. So sieht man die Wahl, bevor man
 *                   sie trifft.
 */

type Pinsel = 1 | 2 | 0;

const MASSSTAB_FELD = 0.078;

const SWATCH = 30;

function Swatch({
  farbe,
  an,
  onPress,
  label,
  pro,
  meister,
}: {
  farbe: string;
  an: boolean;
  onPress: () => void;
  label: string;
  /** Braucht PRO - zum Anprobieren waehlbar, gespeichert wird es nur mit PRO. */
  pro?: boolean;
  /** Braucht einen Meisterweg (0095) - Anprobieren geht, speichern erst freigespielt. */
  meister?: boolean;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={3} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: an }}>
      {pro ? (
        <View style={styles.swatchMarke} pointerEvents="none">
          <ProMarke klein />
        </View>
      ) : meister ? (
        <View style={[styles.swatchMarke, styles.meisterMarke]} pointerEvents="none">
          <Icon name="lock" size={9} color={color.ink.max} />
        </View>
      ) : null}
      <Svg width={SWATCH} height={SWATCH}>
        {/* Feine helle Linie um jede Probe: die dunklen Gruende waeren sonst
            auf der Karte kaum voneinander zu unterscheiden. */}
        <Polygon points={sechseckRegelPunkte(SWATCH, 2)} fill={farbe} stroke="rgba(255, 255, 255, 0.14)" strokeWidth={1} />
        {an ? (
          <Polygon points={sechseckRegelPunkte(SWATCH, 0.75)} fill="none" stroke={color.ink.max} strokeWidth={1.5} />
        ) : null}
      </Svg>
    </Pressable>
  );
}

function Wahl<T extends string>({
  optionen,
  wert,
  onChange,
}: {
  optionen: { wert: T; label: string }[];
  wert: T;
  onChange: (w: T) => void;
}) {
  return (
    <View style={styles.wahl}>
      {optionen.map((o) => {
        const an = o.wert === wert;
        return (
          <Pressable
            key={o.wert}
            onPress={() => {
              haptics.select();
              onChange(o.wert);
            }}
            style={[styles.wahlTeil, an && styles.wahlAn]}
            accessibilityRole="button"
            accessibilityState={{ selected: an }}
          >
            <Text style={[styles.wahlText, an && styles.wahlTextAn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AvatarEditor({
  design,
  onChange,
  pro = false,
  meisterFrei,
}: {
  design: WabenDesign;
  onChange: (d: WabenDesign) => void;
  /** Ohne PRO tragen PRO-Stile und -Gruende ein Schloss. Anprobieren geht trotzdem. */
  pro?: boolean;
  /** Freigespielte Meister-Indizes (0095); ab MEISTER_AB ohne Eintrag: Schloss. */
  meisterFrei?: { grund: Set<number>; farbe: Set<number> };
}) {
  const { width } = useWindowDimensions();
  const [pinsel, setPinsel] = useState<Pinsel>(1);
  const [sym, setSym] = useState<Symmetrie>('spiegel');

  // Das Malfeld so gross wie moeglich, aber nie breiter als ein Handy.
  // Abzug: Seitenrand des Bildschirms und Innenabstand der Karte.
  const feld = Math.min(320, Math.max(220, width - 2 * space.xl - 2 * space.lg));
  // Im Editor duerfen die Waben groesser sein als im kleinen Bild: das
  // Malfeld ist quadratisch, aber ohne Rahmen, der etwas abschneidet.
  const s = feld * MASSSTAB_FELD;
  const tipp = s * 1.6;

  const malen = (index: number) => {
    const w = WABEN[index];
    const jetzt = design.waben[index] ?? 0;
    const neu: Wabe = pinsel !== 0 && jetzt === pinsel ? 0 : pinsel;
    const waben = [...design.waben];
    for (const i of symmetrisch(w.q, w.r, sym)) waben[i] = neu;
    haptics.light();
    onChange({ ...design, waben });
  };

  const f1 = WABEN_FARBEN[design.farbe1];
  const f2 = WABEN_FARBEN[design.farbe2];

  return (
    <View style={styles.wurzel}>
      {/* --- Buehne: gross, und so klein, wie es andere sehen ------------- */}
      <View style={styles.buehne}>
        <View style={[styles.gross, sechseckRegel()]}>
          <WabenArt design={design} size={132} />
        </View>
        <View style={styles.klein}>
          {[56, 36, 24].map((g) => (
            <View key={g} style={[{ width: g, height: g, overflow: 'hidden', borderRadius: ZWEI ? 0 : g * 0.28 }, sechseckRegel()]}>
              <WabenArt design={design} size={g} />
            </View>
          ))}
          <Text style={styles.kleinText}>{T('So sehen es andere')}</Text>
        </View>
      </View>

      {/* --- Malen ------------------------------------------------------- */}
      <View style={styles.karte}>
        <View style={styles.zeile}>
          <Wahl<'1' | '2' | '0'>
            optionen={[
              { wert: '1', label: 'Farbe' },
              { wert: '2', label: 'Akzent' },
              { wert: '0', label: 'Radierer' },
            ]}
            wert={String(pinsel) as '1' | '2' | '0'}
            onChange={(w) => setPinsel(Number(w) as Pinsel)}
          />
        </View>

        <View style={[styles.feld, { width: feld, height: feld }]}>
          <WabenArt design={design} size={feld} raster massstab={MASSSTAB_FELD} />
          {WABEN.map((w, i) => {
            const { x, y } = wabenMitte(w.q, w.r, s);
            return (
              <Pressable
                key={i}
                onPress={() => malen(i)}
                style={{
                  position: 'absolute',
                  left: feld / 2 + x - tipp / 2,
                  top: feld / 2 + y - tipp / 2,
                  width: tipp,
                  height: tipp,
                }}
                accessibilityRole="button"
                accessibilityLabel={`Wabe ${i + 1}`}
              />
            );
          })}
        </View>

        <View style={styles.zeile}>
          <Text style={styles.label}>Symmetrie</Text>
          <Wahl<Symmetrie>
            optionen={(['spiegel', 'sechs', 'frei'] as Symmetrie[]).map((w) => ({ wert: w, label: SYMMETRIE_LABEL[w] }))}
            wert={sym}
            onChange={setSym}
          />
        </View>

        <View style={styles.aktionen}>
          {[
            { label: 'Würfeln', tun: () => onChange(wabenWuerfeln(sym)) },
            {
              label: 'Tauschen',
              tun: () =>
                onChange({
                  ...design,
                  waben: design.waben.map((v) => (v === 1 ? 2 : v === 2 ? 1 : 0)) as Wabe[],
                }),
            },
            { label: 'Leeren', tun: () => onChange(wabenLeer(design)) },
          ].map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                haptics.medium();
                a.tun();
              }}
              style={({ pressed }) => [styles.aktion, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
            >
              <Text style={styles.aktionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* --- Farben ------------------------------------------------------ */}
      <View style={styles.karte}>
        {(
          [
            { label: 'Farbe', art: 'farbe', liste: WABEN_FARBEN, wert: design.farbe1, setzen: (i: number) => onChange({ ...design, farbe1: i }) },
            { label: 'Akzent', art: 'farbe', liste: WABEN_FARBEN, wert: design.farbe2, setzen: (i: number) => onChange({ ...design, farbe2: i }) },
            { label: 'Grund', art: 'grund', liste: WABEN_GRUENDE, wert: design.grund, setzen: (i: number) => onChange({ ...design, grund: i }) },
          ] as const
        ).map((gruppe) => (
          <View key={gruppe.label} style={styles.gruppe}>
            <Text style={styles.label}>{gruppe.label}</Text>
            <View style={styles.swatches}>
              {gruppe.liste.map((hex, i) => (
                <Swatch
                  key={hex}
                  farbe={hex}
                  an={gruppe.wert === i}
                  label={`${gruppe.label} ${i + 1}`}
                  pro={!pro && gruppe.art === 'grund' && grundBrauchtPro(i)}
                  meister={i >= MEISTER_AB && !(gruppe.art === 'grund' ? meisterFrei?.grund : meisterFrei?.farbe)?.has(i)}
                  onPress={() => {
                    haptics.light();
                    gruppe.setzen(i);
                  }}
                />
              ))}
            </View>
          </View>
        ))}
        {/* Der Grund-Swatch zeigt die Farbe allein - kaum zu unterscheiden,
            wenn er dunkel ist. Deshalb die beiden Malfarben als Probe darauf. */}
        <View style={styles.probe}>
          <View style={[styles.probeFeld, { backgroundColor: WABEN_GRUENDE[design.grund] }]}>
            <View style={[styles.probePunkt, { backgroundColor: f1 }]} />
            <View style={[styles.probePunkt, { backgroundColor: f2 }]} />
          </View>
        </View>
      </View>

      {/* --- Stil --------------------------------------------------------- */}
      <View style={styles.stile}>
        {WABEN_STILE.map((st) => {
          const an = design.stil === st;
          return (
            <Pressable
              key={st}
              onPress={() => {
                haptics.select();
                onChange({ ...design, stil: st });
              }}
              style={[styles.stil, an && styles.stilAn]}
              accessibilityRole="button"
              accessibilityState={{ selected: an }}
            >
              <View style={[{ width: 60, height: 60, overflow: 'hidden', borderRadius: ZWEI ? 0 : 14 }, sechseckRegel()]}>
                <WabenArt design={{ ...design, stil: st }} size={60} />
              </View>
              <View style={styles.stilUnten}>
                <Text style={[styles.stilText, an && styles.wahlTextAn]}>{WABEN_STIL_LABEL[st]}</Text>
                {!pro && WABEN_STILE.indexOf(st) >= PRO_AB_STIL ? <ProMarke klein /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wurzel: { gap: space.lg },

  buehne: { flexDirection: 'row', alignItems: 'center', gap: space.xl, justifyContent: 'center' },
  gross: { width: 132, height: 132, overflow: 'hidden', borderRadius: ZWEI ? 0 : 36 },
  klein: { gap: space.sm, alignItems: 'flex-start' },
  kleinText: { ...type.meta, fontSize: 10, color: color.ink.low },

  karte: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    alignItems: 'stretch',
    ...flaeche(10),
  },
  zeile: { gap: space.sm },
  feld: { alignSelf: 'center', overflow: 'hidden', borderRadius: radius.md },
  label: { ...type.meta, color: color.ink.low },

  wahl: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: color.bgSunken,
  },
  wahlTeil: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  wahlAn: ZWEI
    ? { backgroundColor: color.bordeaux, borderBottomWidth: 1, borderBottomColor: color.signal.primary }
    : { backgroundColor: color.bgElevated },
  wahlText: { ...type.label, fontSize: 13, color: color.ink.low },
  wahlTextAn: { color: color.ink.max },

  aktionen: { flexDirection: 'row', gap: space.sm },
  aktion: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: color.bgSunken,
    ...(ZWEI ? { borderTopWidth: 1, borderTopColor: KANTE } : null),
  },
  aktionText: { ...type.label, fontSize: 13, color: color.ink.high },

  gruppe: { gap: space.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  probe: { alignItems: 'flex-start' },
  probeFeld: { flexDirection: 'row', gap: 6, padding: 8, borderRadius: radius.sm },
  probePunkt: { width: 14, height: 14, borderRadius: ZWEI ? 2 : 7 },

  // Sechs Stile: drei je Zeile. In einer Reihe waeren die Vorschauen zu klein.
  stile: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stilUnten: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatchMarke: { position: 'absolute', right: -4, bottom: -4, zIndex: 2 },
  meisterMarke: { width: 16, height: 16, borderRadius: 8, backgroundColor: color.bordeaux, alignItems: 'center', justifyContent: 'center' },
  stil: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(8),
  },
  stilAn: ZWEI
    ? { backgroundColor: color.bordeaux, borderTopColor: color.signal.primary }
    : { borderColor: color.signal.primary },
  stilText: { ...type.meta, fontSize: 11, color: color.ink.mid },
});
