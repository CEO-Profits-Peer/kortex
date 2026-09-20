import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

import { Avatar } from '@/components/Avatar';
import { GridBackground } from '@/components/GridBackground';
import { Icon } from '@/components/Icon';
import { Laden } from '@/components/Laden';
import { ProMarke, zeigeProSperre } from '@/components/ProSperre';
import { ScreenHeader } from '@/components/ScreenHeader';
import { WABEN_FARBEN, WABEN_GRUENDE } from '@/lib/avatarWaben';
import { fehlerText } from '@/lib/fehler';
import { haptics } from '@/lib/haptics';
import {
  MEISTER_SCHWELLEN,
  STUFEN_NAMEN,
  saisonRahmenTitel,
  type MeisterBelohnung,
  type Meisterweg,
  type Meisterwege,
} from '@/lib/meisterwege';
import { useIchPro } from '@/lib/pro';
import { api } from '@/lib/supabase';
import { T, lokale } from '@/lib/sprache';
import { flaeche, sechseckRegelPunkte } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Meisterwege: je Hauptthema fuenf Stufen, freigespielt nur durch Lernen.
 *
 * Oben die Auswahl (Rahmen, Namensfarbe) - nur, was schon frei ist. Darunter
 * jeder Weg mit Fortschritt zur naechsten Stufe und seinen Belohnungen.
 * Gesperrtes zeigt, WAS es bringt und WOFUER - keine Kaufoption, denn es
 * gibt keine (entschieden 18.09.2026). Nur die Goldvariante des Rahmens
 * braucht zusaetzlich PRO.
 */
export function MeisterwegeScreen() {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const pro = useIchPro();
  const [m, setM] = useState<Meisterwege | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [notiz, setNotiz] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      setM(await api.meisterwege());
    } catch (e) {
      setFehler(fehlerText(e, 'Meisterwege laden ging nicht'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  const waehlen = async (rahmen: string | null, name: string | null) => {
    if (!m) return;
    const alt = m;
    setM({ ...m, rahmen, namensfarbe: name });
    haptics.select();
    try {
      await api.meisterWaehlen(rahmen, name);
      setNotiz('Gespeichert');
      setTimeout(() => setNotiz(null), 1800);
    } catch (e) {
      setM(alt);
      setNotiz(fehlerText(e, 'Speichern ging nicht'));
    }
  };

  const alle = m?.wege.flatMap((w) => w.belohnungen.map((b) => ({ ...b, weg: w }))) ?? [];
  // Geteilte Farben einmal zeigen: Wert zaehlt, nicht das Thema.
  const eindeutig = (art: MeisterBelohnung['art']) => {
    const gesehen = new Set<string>();
    return alle.filter((b) => b.art === art && b.frei && !gesehen.has(b.wert) && gesehen.add(b.wert));
  };
  const rahmenFrei = eindeutig('rahmen');
  // 0108: Saison-Rahmen stehen nicht in den Wegen - verdient ist er, wenn
  // genug gelesen wurde; Gold zusaetzlich nur mit PRO (prueft der Server).
  const saison = m?.saison ?? null;
  if (saison && saison.gelesen >= saison.ziel) {
    for (const code of [`saison-${saison.id}`, ...(pro.pro ? [`saison-${saison.id}-gold`] : [])]) {
      rahmenFrei.push({ id: code, stufe: 0, art: 'rahmen', wert: code, titel: saisonRahmenTitel(code) ?? code, pro: code.endsWith('-gold'), frei: true, weg: m!.wege[0] });
    }
  }
  const namenFrei = eindeutig('name');

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={T('Meisterwege')} eyebrow={T('profil')} scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{T('Jedes Thema hat fünf Stufen. Du steigst nur durch richtige Antworten auf – kaufen lässt sich hier nichts.')}</Text>

        {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
        {!m && !fehler ? <Laden size="large" style={{ marginTop: space.xxl }} /> : null}

        {m ? (
          <>
            {/* --- Auswahl ------------------------------------------------------ */}
            <View style={styles.karte}>
              <Text style={styles.abschnitt}>{T('Rahmen')}</Text>
              {rahmenFrei.length === 0 ? (
                <Text style={styles.leer}>{T('Ab Stufe 2 in einem Thema bekommst du deinen ersten Rahmen.')}</Text>
              ) : (
                <View style={styles.reihe}>
                  <Wahl an={!m.rahmen} onPress={() => void waehlen(null, m.namensfarbe)} label={T('Ohne')}>
                    <Avatar seed="v2-1000-0000000000000000000" size={40} />
                  </Wahl>
                  {rahmenFrei.map((b) => (
                    <Wahl key={b.id} an={m.rahmen === b.wert} onPress={() => void waehlen(b.wert, m.namensfarbe)} label={b.titel}>
                      <Avatar seed="v2-1000-0000000000000000000" size={40} rahmen={b.wert} />
                    </Wahl>
                  ))}
                </View>
              )}

              <Text style={[styles.abschnitt, { marginTop: space.md }]}>Namensfarbe</Text>
              {namenFrei.length === 0 ? (
                <Text style={styles.leer}>{T('Ab Stufe 3 färbt ein Thema deinen Namen in Beiträgen und im Profil.')}</Text>
              ) : (
                <View style={styles.reihe}>
                  <Wahl an={!m.namensfarbe} onPress={() => void waehlen(m.rahmen, null)} label={T('Normal')}>
                    <Text style={[styles.namensProbe, { color: color.ink.max }]}>Aa</Text>
                  </Wahl>
                  {namenFrei.map((b) => (
                    <Wahl key={b.id} an={m.namensfarbe === b.wert} onPress={() => void waehlen(m.rahmen, b.wert)} label={b.titel}>
                      <Text style={[styles.namensProbe, { color: b.wert }]}>Aa</Text>
                    </Wahl>
                  ))}
                </View>
              )}
              <Pressable onPress={() => router.push('/avatar')} style={styles.link} hitSlop={6}>
                <Text style={styles.linkText}>Freigespielte Profilbild-Farben stehen im Editor</Text>
                <Icon name="chevron" size={12} color={color.akzent} />
              </Pressable>
              {notiz ? <Text style={styles.notiz}>{notiz}</Text> : null}
            </View>

            {/* --- Saison (0108) ----------------------------------------------- */}
            {saison ? (
              <View style={styles.karte}>
                <View style={styles.wegKopf}>
                  <Avatar seed="v2-1000-0000000000000000000" size={40} rahmen={`saison-${saison.id}`} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.wegName}>Saison: {saison.name}</Text>
                    <View style={styles.balken}>
                      <View style={{ flex: Math.min(1, saison.gelesen / saison.ziel), backgroundColor: '#D9803A' }} />
                      <View style={{ flex: 1 - Math.min(1, saison.gelesen / saison.ziel) }} />
                    </View>
                    <Text style={styles.klein}>
                      {saison.gelesen >= saison.ziel
                        ? 'Verdient – der Rahmen bleibt dir auch nach der Saison.'
                        : saison.laeuft
                          ? `${saison.gelesen} / ${saison.ziel} Karten gelesen · bis ${new Date(saison.bis).toLocaleDateString(lokale(), { day: 'numeric', month: 'long' })}`
                          : 'Diese Saison ist vorbei.'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.klein}>{T('Mit PRO gibt es denselben Rahmen zusätzlich in Gold – verdienen musst du ihn trotzdem selbst.')}</Text>
              </View>
            ) : null}

            {/* --- Wege ------------------------------------------------------- */}
            {m.wege.map((w) => (
              <Weg
                key={w.id}
                w={w}
                offen={offen === w.id}
                umschalten={() => {
                  haptics.light();
                  setOffen(offen === w.id ? null : w.id);
                }}
                pro={pro.pro}
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </GridBackground>
  );
}

function Wahl({ an, onPress, label, children }: { an: boolean; onPress: () => void; label: string; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={styles.wahl} accessibilityRole="button" accessibilityState={{ selected: an }} accessibilityLabel={label}>
      <View style={[styles.wahlBild, an && { borderColor: color.signal.primary }]}>{children}</View>
      <Text style={[styles.wahlText, an && { color: color.ink.max }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Weg({ w, offen, umschalten, pro }: { w: Meisterweg; offen: boolean; umschalten: () => void; pro: boolean }) {
  const farbe = w.farbe ?? color.signal.primary;
  const unten = w.stufe === 0 ? 0 : MEISTER_SCHWELLEN[w.stufe - 1];
  const anteil = w.naechste ? Math.min(1, Math.max(0, (w.mastery - unten) / (w.naechste - unten))) : 1;
  return (
    <View style={styles.karte}>
      <Pressable onPress={umschalten} style={styles.wegKopf} accessibilityRole="button" accessibilityState={{ expanded: offen }}>
        <Text style={styles.emoji}>{w.emoji ?? '•'}</Text>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.wegZeile}>
            <Text style={styles.wegName} numberOfLines={1}>
              {w.name}
            </Text>
            <Text style={[styles.stufe, { color: w.stufe > 0 ? farbe : color.ink.low }]}>
              {w.stufe > 0 ? `Stufe ${w.stufe} · ${STUFEN_NAMEN[w.stufe]}` : 'noch keine Stufe'}
            </Text>
          </View>
          <Stufen stufe={w.stufe} farbe={farbe} />
          <View style={styles.balken}>
            <View style={{ flex: anteil, backgroundColor: farbe }} />
            <View style={{ flex: 1 - anteil }} />
          </View>
          <Text style={styles.klein}>
            {w.naechste ? `${w.mastery} / ${w.naechste} Mastery bis Stufe ${w.stufe + 1}` : `${w.mastery} Mastery – ganz oben`}
          </Text>
        </View>
        <Icon name="chevron" size={14} color={color.ink.low} />
      </Pressable>

      {offen ? (
        <View style={styles.belohnungen}>
          {w.belohnungen.map((b) => (
            <Belohnung key={b.id} b={b} pro={pro} />
          ))}
          <Pressable onPress={() => router.push(`/category/${encodeURIComponent(w.id)}`)} style={styles.link} hitSlop={6}>
            <Text style={[styles.linkText, { color: farbe }]}>Weiterlernen</Text>
            <Icon name="chevron" size={12} color={farbe} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Fuenf kleine Sechsecke: erreicht gefuellt, offen nur umrandet. */
function Stufen({ stufe, farbe }: { stufe: number; farbe: string }) {
  const g = 14;
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Svg key={i} width={g} height={g}>
          <Polygon
            points={sechseckRegelPunkte(g, 1)}
            fill={i <= stufe ? farbe : 'none'}
            stroke={i <= stufe ? farbe : color.ink.faint}
            strokeWidth={1}
          />
        </Svg>
      ))}
    </View>
  );
}

function Belohnung({ b, pro }: { b: MeisterBelohnung; pro: boolean }) {
  const art =
    b.art === 'rahmen' ? 'Rahmen' : b.art === 'name' ? 'Namensfarbe' : b.art === 'grund' ? 'Profilbild-Grund' : 'Wabenfarbe';
  const probe =
    b.art === 'rahmen' ? (
      <Avatar seed="v2-1000-0000000000000000000" size={32} rahmen={b.wert} />
    ) : b.art === 'name' ? (
      <Text style={[styles.namensProbe, { color: b.wert, fontSize: 16 }]}>Aa</Text>
    ) : (
      <Svg width={28} height={28}>
        <Polygon
          points={sechseckRegelPunkte(28, 1)}
          fill={b.art === 'grund' ? WABEN_GRUENDE[Number(b.wert)] : WABEN_FARBEN[Number(b.wert)]}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />
      </Svg>
    );
  const proFehlt = b.pro && !pro;
  return (
    <Pressable
      disabled={!proFehlt}
      onPress={() => zeigeProSperre('Die Goldvariante jedes Rahmens gibt es mit PRO – freispielen musst du sie trotzdem selbst.')}
      style={[styles.belohnung, !b.frei && { opacity: 0.55 }]}
    >
      <View style={styles.probe}>{probe}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.belohnungTitel}>{b.titel}</Text>
        <Text style={styles.klein}>
          {art} · Stufe {b.stufe}
          {b.pro ? ' · PRO' : ''}
        </Text>
      </View>
      {b.frei ? (
        <Icon name="check" size={14} color={color.signal.success} />
      ) : proFehlt ? (
        <ProMarke klein />
      ) : (
        <Icon name="lock" size={14} color={color.ink.low} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  intro: { ...type.body, fontSize: 14, lineHeight: 20, color: color.ink.mid },
  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
  karte: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
    ...flaeche(10),
  },
  abschnitt: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  leer: { ...type.body, fontSize: 13, lineHeight: 19, color: color.ink.mid },
  reihe: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  wahl: { alignItems: 'center', gap: 4, width: 64 },
  wahlBild: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  wahlText: { ...type.meta, fontSize: 10, color: color.ink.low, textAlign: 'center' },
  namensProbe: { ...type.title, fontSize: 20 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: space.xs },
  linkText: { ...type.label, fontSize: 13, color: color.akzent },
  notiz: { ...type.meta, color: color.ink.mid },

  wegKopf: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  emoji: { fontSize: 26, width: 34, textAlign: 'center' },
  wegZeile: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm },
  wegName: { ...type.label, fontSize: 16, color: color.ink.max, flexShrink: 1 },
  stufe: { ...type.meta, fontSize: 11 },
  balken: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: color.ink.faint },
  klein: { ...type.meta, fontSize: 11, color: color.ink.low },

  belohnungen: { gap: space.sm, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.ink.faint },
  belohnung: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  probe: { width: 40, alignItems: 'center' },
  belohnungTitel: { ...type.label, fontSize: 14, color: color.ink.high },
});
