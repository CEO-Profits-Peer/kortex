import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Slider } from '@/components/Slider';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { api } from '@/lib/supabase';
import type { AnkerStand, ContentItem } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

import { LabErgebnis } from './LabErgebnis';
import { LICHT_ZIELE, ergebnis, werkzeug, type Werkzeug } from './rechnen';

/**
 * Ein LAB-Werkzeug: einstellen, sofort sehen, teilen.
 *
 * Jedes Werkzeug haelt nur seine Eingaben. Das Ergebnis darunter ist dieselbe
 * Karte, die spaeter im Beitrag steht (LabErgebnis) - was man hier sieht,
 * sehen die Follower auch, Zahl fuer Zahl.
 */

type Eingaben = Record<string, unknown>;

function teilen(w: Werkzeug, e: Eingaben) {
  haptics.medium();
  router.push(`/compose?lab=${w.id}&eingaben=${encodeURIComponent(JSON.stringify(e))}`);
}

export function LabScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const w = werkzeug(id);

  return (
    <GridBackground>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title={w?.titel ?? 'LAB'} eyebrow="lab" scrollY={scrollY} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={(e) => {
          scrollY.value = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!w ? (
          <Text style={styles.text}>Dieses Werkzeug gibt es nicht.</Text>
        ) : (
          <>
            <Text style={[styles.kurz, { color: w.farbe }]}>{w.kurz}</Text>
            {w.id === 'zinseszins' ? <Zinseszins w={w} /> : null}
            {w.id === 'geburtstag' ? <Geburtstag w={w} /> : null}
            {w.id === 'reaktion' ? <Reaktion w={w} /> : null}
            {w.id === 'anker' ? <Anker w={w} /> : null}
            {w.id === 'schlaf' ? <Schlaf w={w} /> : null}
            {w.id === 'lesetempo' ? <Lesetempo w={w} /> : null}
            {w.id === 'licht' ? <Licht w={w} /> : null}
          </>
        )}
      </ScrollView>
    </GridBackground>
  );
}

// --- Bausteine -----------------------------------------------------------------

function Regler({
  label,
  wert,
  einheit,
  children,
}: {
  label: string;
  wert: string;
  einheit?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.regler}>
      <View style={styles.reglerKopf}>
        <Text style={styles.reglerLabel}>{label}</Text>
        <Text style={styles.reglerWert}>
          {wert}
          {einheit ? <Text style={styles.reglerEinheit}> {einheit}</Text> : null}
        </Text>
      </View>
      {children}
    </View>
  );
}

function Flaeche({ children }: { children: React.ReactNode }) {
  return <View style={styles.flaeche}>{children}</View>;
}

function Ergebnis({ w, e, nochmal }: { w: Werkzeug; e: Eingaben | null; nochmal?: () => void }) {
  const gueltig = e ? ergebnis(w.id, e) !== null : false;
  return (
    <View style={{ gap: space.md }}>
      {e && gueltig ? <LabErgebnis werkzeugId={w.id} eingaben={e} /> : null}
      <View style={styles.knoepfe}>
        {nochmal ? (
          <View style={{ flex: 1 }}>
            <Button label="Nochmal" variant="ghost" onPress={nochmal} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button label="Teilen" accent={w.farbe} disabled={!e || !gueltig} onPress={() => e && teilen(w, e)} />
        </View>
      </View>
    </View>
  );
}

// --- Zinseszins --------------------------------------------------------------------

function Zinseszins({ w }: { w: Werkzeug }) {
  const [start, setStart] = useState(0);
  const [monatlich, setMonatlich] = useState(50);
  const [rendite, setRendite] = useState(7);
  const [jahre, setJahre] = useState(49);
  const e = { start, monatlich, rendite, jahre };
  const eur = (n: number) => n.toLocaleString('de-AT');

  return (
    <>
      <Flaeche>
        <Regler label="Pro Monat" wert={eur(monatlich)} einheit="€">
          <Slider min={0} max={500} step={10} value={monatlich} onChange={setMonatlich} tint={w.farbe} />
        </Regler>
        <Regler label="Jahre" wert={String(jahre)}>
          <Slider min={1} max={60} value={jahre} onChange={setJahre} tint={w.farbe} />
        </Regler>
        <Regler label="Rendite pro Jahr" wert={rendite.toLocaleString('de-AT')} einheit="%">
          <Slider min={0} max={12} step={0.5} value={rendite} onChange={setRendite} tint={w.farbe} />
        </Regler>
        <Regler label="Zum Start" wert={eur(start)} einheit="€">
          <Slider min={0} max={10_000} step={100} value={start} onChange={setStart} tint={w.farbe} />
        </Regler>
      </Flaeche>
      <Ergebnis w={w} e={e} />
    </>
  );
}

// --- Geburtstage ---------------------------------------------------------------------

function Geburtstag({ w }: { w: Werkzeug }) {
  const [leute, setLeute] = useState(23);
  return (
    <>
      <Flaeche>
        <Regler label="Leute im Raum" wert={String(leute)}>
          <Slider min={2} max={100} value={leute} onChange={setLeute} tint={w.farbe} />
        </Regler>
        <Text style={styles.hinweis}>
          Die meisten tippen auf über 180 Leute, bis zwei am selben Tag Geburtstag haben. Zieh den Regler
          und schau, wann die 50 % fallen.
        </Text>
      </Flaeche>
      <Ergebnis w={w} e={{ leute }} />
    </>
  );
}

// --- Reaktion ----------------------------------------------------------------------------

const RUNDEN = 5;

function Reaktion({ w }: { w: Werkzeug }) {
  const [phase, setPhase] = useState<'bereit' | 'warten' | 'jetzt' | 'zufrueh' | 'fertig'>('bereit');
  const [versuche, setVersuche] = useState<number[]>([]);
  const start = useRef(0);
  const uhr = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (uhr.current) clearTimeout(uhr.current);
  }, []);

  const tippen = () => {
    if (phase === 'bereit' || phase === 'zufrueh') {
      setPhase('warten');
      // Zufaellige Wartezeit: wer den Takt kennt, reagiert nicht, er raet.
      uhr.current = setTimeout(() => {
        start.current = performance.now();
        setPhase('jetzt');
      }, 1200 + Math.random() * 2300);
      return;
    }
    if (phase === 'warten') {
      if (uhr.current) clearTimeout(uhr.current);
      feedback.wrong();
      setPhase('zufrueh');
      return;
    }
    if (phase === 'jetzt') {
      const ms = Math.round(performance.now() - start.current);
      const neu = [...versuche, ms];
      setVersuche(neu);
      haptics.light();
      setPhase(neu.length >= RUNDEN ? 'fertig' : 'bereit');
    }
  };

  const farbe =
    phase === 'jetzt' ? color.signal.success : phase === 'zufrueh' ? color.signal.error : color.bgElevated;
  const text =
    phase === 'bereit'
      ? versuche.length === 0
        ? 'Tippen zum Starten'
        : `${versuche[versuche.length - 1]} ms · Tippen für Runde ${versuche.length + 1}`
      : phase === 'warten'
        ? 'Warten …'
        : phase === 'jetzt'
          ? 'JETZT!'
          : phase === 'zufrueh'
            ? 'Zu früh. Tippen, nochmal.'
            : 'Fertig';

  return (
    <>
      {phase !== 'fertig' ? (
        <Pressable onPressIn={tippen} style={[styles.reaktionsFeld, { backgroundColor: farbe }]}>
          <Text style={[styles.reaktionsText, phase === 'jetzt' && { color: color.bg }]}>{text}</Text>
          <Text style={[styles.hinweis, phase === 'jetzt' && { color: color.bg }]}>
            Runde {Math.min(versuche.length + 1, RUNDEN)} von {RUNDEN} · tippe, sobald es grün wird
          </Text>
        </Pressable>
      ) : null}
      <Ergebnis
        w={w}
        e={phase === 'fertig' ? { versuche } : null}
        nochmal={
          phase === 'fertig'
            ? () => {
                setVersuche([]);
                setPhase('bereit');
              }
            : undefined
        }
      />
    </>
  );
}

// --- Ankereffekt --------------------------------------------------------------------------

const ANKER_FRAGE = 'Wie viel Prozent aller Länder der Welt liegen in Afrika?';

function Anker({ w }: { w: Werkzeug }) {
  const [schritt, setSchritt] = useState<'rad' | 'dreht' | 'vergleich' | 'schaetzen' | 'fertig'>('rad');
  const [anker, setAnker] = useState<10 | 65>(10);
  const [anzeige, setAnzeige] = useState(0);
  const [schaetzung, setSchaetzung] = useState(50);
  const [stand, setStand] = useState<AnkerStand | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const drehen = () => {
    // Das "Rad" ist Absicht Zufall - es zeigt zufaellig 10 oder 65. Genau
    // darum geht es: eine Zahl, die mit der Frage nichts zu tun hat.
    const ziel: 10 | 65 = Math.random() < 0.5 ? 10 : 65;
    setAnker(ziel);
    setSchritt('dreht');
    let n = 0;
    const t = setInterval(() => {
      n++;
      setAnzeige(Math.floor(Math.random() * 100));
      if (n >= 14) {
        clearInterval(t);
        setAnzeige(ziel);
        haptics.medium();
        setSchritt('vergleich');
      }
    }, 70);
  };

  const abschicken = async () => {
    setBusy(true);
    setFehler(null);
    try {
      setStand(await api.labAnker(anker, schaetzung));
      setSchritt('fertig');
    } catch (e) {
      setFehler(fehlerText(e, 'Hat nicht geklappt'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Flaeche>
        {schritt === 'rad' ? (
          <>
            <Text style={styles.text}>
              Erst dreht ein Rad eine Zahl. Dann kommt eine Schätzfrage. Am Ende siehst du, wie sehr die Zahl
              vom Rad alle beeinflusst hat, die mitgemacht haben.
            </Text>
            <Button label="Drehen" accent={w.farbe} onPress={drehen} />
          </>
        ) : null}

        {schritt !== 'rad' ? <Text style={[styles.rad, { color: w.farbe }]}>{anzeige}</Text> : null}

        {schritt === 'vergleich' ? (
          <>
            <Text style={styles.frage}>
              {ANKER_FRAGE.replace('?', '')} – mehr oder weniger als {anker} %?
            </Text>
            <View style={styles.knoepfe}>
              <View style={{ flex: 1 }}>
                <Button label="Weniger" variant="ghost" onPress={() => setSchritt('schaetzen')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Mehr" variant="ghost" onPress={() => setSchritt('schaetzen')} />
              </View>
            </View>
          </>
        ) : null}

        {schritt === 'schaetzen' ? (
          <>
            <Text style={styles.frage}>{ANKER_FRAGE}</Text>
            <Regler label="Deine Schätzung" wert={String(schaetzung)} einheit="%">
              <Slider min={0} max={100} value={schaetzung} onChange={setSchaetzung} tint={w.farbe} />
            </Regler>
            <Button label="Abschicken" accent={w.farbe} busy={busy} onPress={() => void abschicken()} />
            {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}
          </>
        ) : null}

        {schritt === 'fertig' && stand ? (
          <Text style={styles.text}>
            Wer vorher die 10 sah, schätzt im Schnitt {stand.niedrig.schnitt ?? '–'} % ({stand.niedrig.n} Leute).
            Wer die 65 sah: {stand.hoch.schnitt ?? '–'} % ({stand.hoch.n} Leute). Die Zahl vom Rad war Zufall –
            ist der Unterschied groß, hat sie trotzdem gewirkt.
          </Text>
        ) : null}
      </Flaeche>
      {schritt === 'fertig' && stand ? (
        <Ergebnis w={w} e={{ anker, schaetzung, niedrig: stand.niedrig, hoch: stand.hoch }} />
      ) : null}
    </>
  );
}

// --- Schlaf -----------------------------------------------------------------------------------

function Schlaf({ w }: { w: Werkzeug }) {
  const [stunde, setStunde] = useState(6);
  const [minute, setMinute] = useState(30);
  return (
    <>
      <Flaeche>
        <Regler label="Wecker" wert={`${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}>
          <Slider min={0} max={23} value={stunde} onChange={setStunde} tint={w.farbe} format={(n) => `${n} Uhr`} />
          <Slider min={0} max={55} step={5} value={minute} onChange={setMinute} tint={w.farbe} format={(n) => `:${String(n).padStart(2, '0')}`} />
        </Regler>
        <Text style={styles.hinweis}>
          Wer mitten in einem Schlafzyklus geweckt wird, fühlt sich oft gerädert. Das hier ist eine Faustregel,
          keine Messung – dein eigener Rhythmus kann abweichen.
        </Text>
      </Flaeche>
      <Ergebnis w={w} e={{ stunde, minute }} />
    </>
  );
}

// --- Lesetempo -----------------------------------------------------------------------------------

function textAus(k: ContentItem): string {
  return (k.body_blocks ?? [])
    .map((b) => (b.type === 'bullet' ? b.items.join('. ') : b.type === 'stat' ? `${b.value} ${b.label}` : b.text))
    .join('\n\n');
}

function Lesetempo({ w }: { w: Werkzeug }) {
  const [karte, setKarte] = useState<ContentItem | null>(null);
  const [phase, setPhase] = useState<'laden' | 'bereit' | 'lesen' | 'frage' | 'fertig'>('laden');
  const [sekunden, setSekunden] = useState(0);
  const [richtig, setRichtig] = useState<boolean | null>(null);
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const start = useRef(0);

  const laden = useCallback(async () => {
    setPhase('laden');
    setFehler(null);
    setRichtig(null);
    setGewaehlt(null);
    try {
      const auswahl = await api.getFeed(8);
      // Eine Karte mit genug Text und einer Frage.
      const k = auswahl.find((c) => textAus(c).split(/\s+/).length >= 40 && (c.quiz_items?.length ?? 0) > 0);
      if (!k) throw new Error('Gerade keine passende Karte');
      setKarte(k);
      setPhase('bereit');
    } catch (e) {
      setFehler(fehlerText(e, 'Keine Karte gefunden'));
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  const text = karte ? textAus(karte) : '';
  const woerter = text.split(/\s+/).filter(Boolean).length;
  const quiz = karte?.quiz_items?.[0];

  const antworten = async (i: number) => {
    if (!karte || gewaehlt !== null) return;
    setGewaehlt(i);
    try {
      const r = await api.submitQuiz(karte.id, 0, i);
      setRichtig(r.correct);
      if (r.correct) feedback.correct();
      else feedback.wrong();
    } catch {
      setRichtig(null);
    }
    setPhase('fertig');
  };

  return (
    <>
      <Flaeche>
        {phase === 'laden' ? (
          fehler ? <Text style={styles.fehler}>{fehler}</Text> : <ActivityIndicator color={w.farbe} />
        ) : null}

        {phase === 'bereit' && karte ? (
          <>
            <Text style={styles.text}>
              Gleich kommt eine echte Karte mit {woerter} Wörtern. Lies sie in deinem normalen Tempo und tippe
              dann „Fertig". Danach kommt eine Frage dazu.
            </Text>
            <Button
              label="Los"
              accent={w.farbe}
              onPress={() => {
                start.current = performance.now();
                setPhase('lesen');
              }}
            />
          </>
        ) : null}

        {phase === 'lesen' && karte ? (
          <>
            <Text style={styles.leseTitel}>{karte.title}</Text>
            <Text style={styles.leseText}>{text}</Text>
            <Button
              label="Fertig"
              accent={w.farbe}
              onPress={() => {
                setSekunden(Math.round((performance.now() - start.current) / 100) / 10);
                setPhase('frage');
              }}
            />
          </>
        ) : null}

        {(phase === 'frage' || phase === 'fertig') && quiz ? (
          <>
            <Text style={styles.frage}>{quiz.question}</Text>
            {quiz.options.map((o, i) => (
              <Pressable
                key={i}
                onPress={() => void antworten(i)}
                disabled={gewaehlt !== null}
                style={[
                  styles.antwort,
                  gewaehlt === i && { borderColor: richtig ? color.signal.success : color.signal.error },
                ]}
              >
                <Text style={styles.text}>{o}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </Flaeche>
      {phase === 'fertig' ? (
        <Ergebnis
          w={w}
          e={{ woerter, sekunden, richtig }}
          nochmal={() => void laden()}
        />
      ) : null}
    </>
  );
}

// --- Lichtlaufzeit --------------------------------------------------------------------------------

function Licht({ w }: { w: Werkzeug }) {
  const [ziel, setZiel] = useState<string>('sonne');
  return (
    <>
      <Flaeche>
        <Text style={styles.reglerLabel}>Wohin?</Text>
        <View style={styles.chips}>
          {LICHT_ZIELE.map((z) => (
            <Pressable
              key={z.id}
              onPress={() => {
                haptics.select();
                setZiel(z.id);
              }}
              style={[styles.chip, ziel === z.id && { borderColor: w.farbe, backgroundColor: color.bg }]}
            >
              <Text style={[styles.chipText, ziel === z.id && { color: w.farbe }]}>{z.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hinweis}>
          Nichts ist schneller als Licht. Trotzdem sieht man die Sonne immer so, wie sie vor ein paar Minuten war.
        </Text>
      </Flaeche>
      <Ergebnis w={w} e={{ ziel }} />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg },
  kurz: { ...type.label, fontSize: 15 },
  text: { ...type.body, fontSize: 15, lineHeight: 22, color: color.ink.high },
  hinweis: { ...type.meta, fontSize: 11, lineHeight: 16, color: color.ink.low },
  fehler: { ...type.body, fontSize: 14, color: color.signal.error },
  frage: { ...type.title, fontSize: 18, lineHeight: 25, color: color.ink.max },

  flaeche: {
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  regler: { gap: space.xs },
  reglerKopf: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  reglerLabel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  reglerWert: { ...type.mono, fontSize: 18, color: color.ink.max },
  reglerEinheit: { ...type.mono, fontSize: 13, color: color.ink.mid },
  knoepfe: { flexDirection: 'row', gap: space.sm },

  reaktionsFeld: {
    height: 260,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.lg,
  },
  reaktionsText: { ...type.display, fontSize: 30, lineHeight: 36, color: color.ink.max, textAlign: 'center' },

  rad: { ...type.display, fontSize: 64, lineHeight: 70, textAlign: 'center' },

  leseTitel: { ...type.title, fontSize: 19, color: color.ink.max },
  leseText: { ...type.body, fontSize: 16, lineHeight: 24, color: color.ink.high },
  antwort: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.ink.faint,
  },
  chipText: { ...type.label, fontSize: 14, color: color.ink.mid },
});
