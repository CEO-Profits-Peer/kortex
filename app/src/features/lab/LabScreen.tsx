import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Laden } from '@/components/Laden';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { zeigeProSperre } from '@/components/ProSperre';
import { GridBackground } from '@/components/GridBackground';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Slider } from '@/components/Slider';
import { fehlerText } from '@/lib/fehler';
import { feedback } from '@/lib/feedback';
import { haptics } from '@/lib/haptics';
import { useSzenarien } from '@/lib/labSzenarien';
import { useIchPro } from '@/lib/pro';
import { api } from '@/lib/supabase';
import type { AnkerStand, ContentItem } from '@/lib/types.db';
import { T, lokale } from '@/lib/sprache';
import { flaeche } from '@/theme/design';
import { color, radius, space, type } from '@/theme/tokens';

import { LabErgebnis } from './LabErgebnis';
import { ReaktionVerlauf, reaktionMerken } from './ReaktionVerlauf';
import {
  CO2_MITTEL,
  LICHT_ZIELE,
  PAL,
  VPI_ERSTES,
  VPI_LETZTES,
  ergebnis,
  werkzeug,
  type Co2MittelId,
  type Werkzeug,
} from './rechnen';

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
        <ScreenHeader title={w?.titel ?? 'LAB'} eyebrow={T('lab')} scrollY={scrollY} />
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
          <Text style={styles.text}>{T('Dieses Werkzeug gibt es nicht.')}</Text>
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
            {w.id === 'inflation' ? <Inflation w={w} /> : null}
            {w.id === 'netto' ? <Netto w={w} /> : null}
            {w.id === 'co2' ? <Co2 w={w} /> : null}
            {w.id === 'kredit' ? <Kredit w={w} /> : null}
            {w.id === 'miete' ? <Miete w={w} /> : null}
            {w.id === 'energie' ? <Energie w={w} /> : null}
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
  const ichPro = useIchPro();
  const sz = useSzenarien(w.id);
  const [notiz, setNotiz] = useState<string | null>(null);

  const merken = async () => {
    if (!e || !gueltig) return;
    if (!ichPro.pro) {
      zeigeProSperre('Szenarien merken und untereinander vergleichen gibt es mit PRO.');
      return;
    }
    haptics.light();
    const neu = await sz.merken(e);
    setNotiz(neu ? 'Gemerkt – unten zum Vergleich' : 'Das hast du schon gemerkt');
    setTimeout(() => setNotiz(null), 2000);
  };

  return (
    <View style={{ gap: space.md }}>
      {e && gueltig ? <LabErgebnis werkzeugId={w.id} eingaben={e} /> : null}
      <View style={styles.knoepfe}>
        {nochmal ? (
          <View style={{ flex: 1 }}>
            <Button label={T('Nochmal')} variant="ghost" onPress={nochmal} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button label={T('Merken')} variant="ghost" disabled={!e || !gueltig} onPress={() => void merken()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={T('Teilen')} accent={w.farbe} disabled={!e || !gueltig} onPress={() => e && teilen(w, e)} />
        </View>
      </View>
      {notiz ? <Text style={styles.hinweis}>{notiz}</Text> : null}
      {ichPro.pro && sz.liste.length > 0 ? <Vergleich w={w} sz={sz} aktuell={e} /> : null}
    </View>
  );
}

/**
 * Die gemerkten Szenarien untereinander: grosse Zahl und Satz, jeweils
 * frisch gerechnet. Das aktuelle steht markiert dabei, wenn es gemerkt ist.
 */
function Vergleich({ w, sz, aktuell }: { w: Werkzeug; sz: ReturnType<typeof useSzenarien>; aktuell: Eingaben | null }) {
  const jetzt = aktuell ? JSON.stringify(aktuell) : null;
  return (
    <View style={styles.flaeche}>
      <Text style={styles.reglerLabel}>Vergleich</Text>
      {sz.liste.map((s) => {
        const r = ergebnis(w.id, s.eingaben);
        if (!r) return null;
        const istJetzt = JSON.stringify(s.eingaben) === jetzt;
        return (
          <View key={s.id} style={[styles.szenario, istJetzt && { borderColor: w.farbe }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.szenarioZahl, { color: istJetzt ? w.farbe : color.ink.max }]}>{r.gross}</Text>
              <Text style={styles.hinweis} numberOfLines={2}>
                {r.satz}
              </Text>
            </View>
            <Pressable onPress={() => void sz.entfernen(s.id)} hitSlop={8} accessibilityLabel={T('Entfernen')}>
              <Icon name="cross" size={14} color={color.ink.low} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** Zwei bis vier Modi eines Werkzeugs als Chips - ein Wort je Chip. */
function Umschalter<T extends string>({
  w,
  wert,
  optionen,
  onChange,
}: {
  w: Werkzeug;
  wert: T;
  optionen: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {optionen.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => {
            haptics.select();
            onChange(o.id);
          }}
          style={[styles.chip, wert === o.id && { borderColor: w.farbe, backgroundColor: color.bg }]}
        >
          <Text style={[styles.chipText, wert === o.id && { color: w.farbe }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * "Erst schätzen": das Ergebnis bleibt verdeckt, bis man getippt und
 * aufgelöst hat. Aendert sich eine Eingabe, ist der Tipp wieder offen -
 * sonst gaelte er fuer eine andere Frage.
 */
function useTipp(schluessel: string, start: number) {
  const [an, setAn] = useState(false);
  const [tipp, setTipp] = useState(start);
  const [offen, setOffen] = useState(false);
  const zuletzt = useRef(schluessel);
  useEffect(() => {
    if (zuletzt.current !== schluessel) {
      zuletzt.current = schluessel;
      setOffen(false);
    }
  }, [schluessel]);
  return {
    an,
    tipp,
    setTipp,
    offen,
    umschalten: () => {
      haptics.select();
      setAn((a) => !a);
      setOffen(false);
    },
    aufloesen: () => {
      haptics.medium();
      setOffen(true);
    },
    /** Ergebnis sichtbar? */
    zeigen: !an || offen,
    /** Fuer die Eingaben: der Tipp zaehlt nur, wenn er aufgeloest wurde. */
    extra: an && offen ? { tipp } : {},
  };
}

function TippFeld({
  w,
  t,
  min,
  max,
  step,
  fmt,
}: {
  w: Werkzeug;
  t: ReturnType<typeof useTipp>;
  min: number;
  max: number;
  step?: number;
  fmt: (n: number) => string;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Pressable onPress={t.umschalten} style={styles.tippSchalter} accessibilityRole="switch" accessibilityState={{ checked: t.an }}>
        <View style={[styles.tippPunkt, t.an && { backgroundColor: w.farbe, borderColor: w.farbe }]} />
        <Text style={styles.chipText}>{T('Schätzen')}</Text>
      </Pressable>
      {t.an ? (
        <>
          <Regler label={T('Dein Tipp')} wert={fmt(t.tipp)}>
            <Slider min={min} max={max} step={step} value={Math.min(max, Math.max(min, t.tipp))} onChange={t.setTipp} tint={w.farbe} />
          </Regler>
          {!t.offen ? <Button label={T('Auflösen')} accent={w.farbe} onPress={t.aufloesen} /> : null}
        </>
      ) : null}
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
  const eur = (n: number) => n.toLocaleString(lokale());

  return (
    <>
      <Flaeche>
        <Regler label={T('Pro Monat')} wert={eur(monatlich)} einheit="€">
          <Slider min={0} max={500} step={10} value={monatlich} onChange={setMonatlich} tint={w.farbe} />
        </Regler>
        <Regler label={T('Jahre')} wert={String(jahre)}>
          <Slider min={1} max={60} value={jahre} onChange={setJahre} tint={w.farbe} />
        </Regler>
        <Regler label={T('Rendite pro Jahr')} wert={rendite.toLocaleString(lokale())} einheit="%">
          <Slider min={0} max={12} step={0.5} value={rendite} onChange={setRendite} tint={w.farbe} />
        </Regler>
        <Regler label={T('Zum Start')} wert={eur(start)} einheit="€">
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
  const [modus, setModus] = useState<'paar' | 'ich'>('paar');
  const t = useTipp(`${leute}-${modus}`, 50);
  return (
    <>
      <Flaeche>
        <Umschalter
          w={w}
          wert={modus}
          optionen={[
            { id: 'paar', label: 'Paar' },
            { id: 'ich', label: 'Ich' },
          ]}
          onChange={setModus}
        />
        <Regler label={T('Leute im Raum')} wert={String(leute)}>
          <Slider min={2} max={modus === 'ich' ? 400 : 100} value={leute} onChange={setLeute} tint={w.farbe} />
        </Regler>
        <Text style={styles.hinweis}>
          {modus === 'ich'
            ? 'Wie viele Leute braucht es, bis einer genau an DEINEM Tag Geburtstag hat? Das ist eine ganz andere Frage.'
            : 'Die meisten tippen auf viel zu viele Leute, bis zwei am selben Tag Geburtstag haben. Zieh den Regler und schau, wann die 50 % fallen.'}
        </Text>
        <TippFeld w={w} t={t} min={0} max={100} fmt={(n) => `${n} %`} />
      </Flaeche>
      {t.zeigen ? <Ergebnis w={w} e={{ leute, modus, ...t.extra }} /> : null}
    </>
  );
}

// --- Reaktion ----------------------------------------------------------------------------

const RUNDEN = 5;

function Reaktion({ w }: { w: Werkzeug }) {
  const [phase, setPhase] = useState<'bereit' | 'warten' | 'jetzt' | 'zufrueh' | 'fertig'>('bereit');
  const [versuche, setVersuche] = useState<number[]>([]);
  const [verlauf, setVerlauf] = useState<Parameters<typeof ReaktionVerlauf>[0]['liste'] | null>(null);
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
      if (neu.length >= RUNDEN) {
        void reaktionMerken(neu.reduce((a, b) => a + b, 0) / neu.length).then(setVerlauf);
      }
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
      {phase === 'fertig' && verlauf ? (
        <Flaeche>
          <ReaktionVerlauf liste={verlauf} farbe={w.farbe} />
        </Flaeche>
      ) : null}
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

  const [ligen, setLigen] = useState<Awaited<ReturnType<typeof api.ankerLigen>>>([]);

  const abschicken = async () => {
    setBusy(true);
    setFehler(null);
    try {
      setStand(await api.labAnker(anker, schaetzung));
      // 0102: dieselbe Frage in den eigenen Ligen - Klassenvergleich.
      api.ankerLigen().then(setLigen).catch(() => setLigen([]));
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
            <Text style={styles.text}>{T('Erst dreht ein Rad eine Zahl. Dann kommt eine Schätzfrage. Am Ende siehst du, wie sehr die Zahl vom Rad alle beeinflusst hat, die mitgemacht haben.')}</Text>
            <Button label={T('Drehen')} accent={w.farbe} onPress={drehen} />
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
                <Button label={T('Weniger')} variant="ghost" onPress={() => setSchritt('schaetzen')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={T('Mehr')} variant="ghost" onPress={() => setSchritt('schaetzen')} />
              </View>
            </View>
          </>
        ) : null}

        {schritt === 'schaetzen' ? (
          <>
            <Text style={styles.frage}>{ANKER_FRAGE}</Text>
            <Regler label={T('Deine Schätzung')} wert={String(schaetzung)} einheit="%">
              <Slider min={0} max={100} value={schaetzung} onChange={setSchaetzung} tint={w.farbe} />
            </Regler>
            <Button label={T('Abschicken')} accent={w.farbe} busy={busy} onPress={() => void abschicken()} />
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

        {schritt === 'fertig' && ligen.length > 0 ? (
          <View style={{ gap: space.xs }}>
            <Text style={styles.reglerLabel}>In deinen Ligen</Text>
            {ligen.map((l) => (
              <Text key={l.liga} style={styles.hinweis}>
                {l.liga}:{' '}
                {l.niedrig && l.hoch
                  ? `nach 10 im Schnitt ${l.niedrig.schnitt ?? '–'} %, nach 65 im Schnitt ${l.hoch.schnitt ?? '–'} % (${l.n} Leute)`
                  : `erst ${l.n} von 3 Antworten – schick den Ankereffekt in die Gruppe`}
              </Text>
            ))}
          </View>
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
  const [modus, setModus] = useState<'wecker' | 'bett'>('wecker');
  const [stunde, setStunde] = useState(6);
  const [minute, setMinute] = useState(30);
  return (
    <>
      <Flaeche>
        <Umschalter
          w={w}
          wert={modus}
          optionen={[
            { id: 'wecker', label: 'Wecker' },
            { id: 'bett', label: 'Bettzeit' },
          ]}
          onChange={(m) => {
            setModus(m);
            // Sinnvolle Startzeit je Richtung: morgens aufwachen, abends ins Bett.
            if (m === 'bett') {
              setStunde(22);
              setMinute(30);
            } else {
              setStunde(6);
              setMinute(30);
            }
          }}
        />
        <Regler
          label={modus === 'bett' ? 'Ins Bett um' : 'Wecker'}
          wert={`${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
        >
          <Slider min={0} max={23} value={stunde} onChange={setStunde} tint={w.farbe} format={(n) => `${n} Uhr`} />
          <Slider min={0} max={55} step={5} value={minute} onChange={setMinute} tint={w.farbe} format={(n) => `:${String(n).padStart(2, '0')}`} />
        </Regler>
        <Text style={styles.hinweis}>{T('Wer mitten in einem Schlafzyklus geweckt wird, fühlt sich oft gerädert. Das hier ist eine Faustregel, keine Messung – dein eigener Rhythmus kann abweichen.')}</Text>
      </Flaeche>
      <Ergebnis w={w} e={{ stunde, minute, ...(modus === 'bett' ? { modus } : {}) }} />
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
          fehler ? <Text style={styles.fehler}>{fehler}</Text> : <Laden color={w.farbe} />
        ) : null}

        {phase === 'bereit' && karte ? (
          <>
            <Text style={styles.text}>
              Gleich kommt eine echte Karte mit {woerter} Wörtern. Lies sie in deinem normalen Tempo und tippe
              dann „Fertig". Danach kommt eine Frage dazu.
            </Text>
            <Button
              label={T('Los')}
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
              label={T('Fertig')}
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
  const t = useTipp(ziel, 60);
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
        <Text style={styles.hinweis}>{T('Nichts ist schneller als Licht. Trotzdem sieht man die Sonne immer so, wie sie vor ein paar Minuten war.')}</Text>
        <TippFeld
          w={w}
          t={t}
          min={0}
          max={1_800}
          step={5}
          fmt={(n) => (n < 60 ? `${n} s` : `${Math.floor(n / 60)} min${n % 60 ? ` ${n % 60} s` : ''}`)}
        />
      </Flaeche>
      {t.zeigen ? <Ergebnis w={w} e={{ ziel, ...t.extra }} /> : null}
    </>
  );
}

// --- Inflation ------------------------------------------------------------------------------------

function Inflation({ w }: { w: Werkzeug }) {
  const [land, setLand] = useState<'at' | 'ca'>('at');
  const [betrag, setBetrag] = useState(100);
  const [von, setVon] = useState(2000);
  const [bis, setBis] = useState(VPI_LETZTES);
  const t = useTipp(`${land}-${betrag}-${von}-${bis}`, betrag);
  return (
    <>
      <Flaeche>
        <Umschalter
          w={w}
          wert={land}
          optionen={[
            { id: 'at', label: 'Österreich' },
            { id: 'ca', label: 'Kanada' },
          ]}
          onChange={setLand}
        />
        <Regler label={T('Betrag')} wert={betrag.toLocaleString(lokale())} einheit={land === 'ca' ? '$' : '€'}>
          <Slider min={10} max={1_000} step={10} value={betrag} onChange={setBetrag} tint={w.farbe} />
        </Regler>
        <Regler label={T('Damals')} wert={String(von)}>
          <Slider
            min={VPI_ERSTES}
            max={VPI_LETZTES - 1}
            value={von}
            onChange={(v) => {
              setVon(v);
              if (bis <= v) setBis(v + 1);
            }}
            tint={w.farbe}
          />
        </Regler>
        <Regler label={T('Heute')} wert={String(bis)}>
          <Slider min={VPI_ERSTES + 1} max={VPI_LETZTES} value={bis} onChange={(v) => setBis(Math.max(v, von + 1))} tint={w.farbe} />
        </Regler>
        <Text style={styles.hinweis}>{T('Der Preisindex misst einen Warenkorb, keinen einzelnen Preis. Mieten oder Lebensmittel können schneller gestiegen sein als der Schnitt.')}</Text>
        <TippFeld
          w={w}
          t={t}
          min={betrag}
          max={betrag * 3}
          step={Math.max(1, betrag / 50)}
          fmt={(n) => (land === 'ca' ? `$${Math.round(n).toLocaleString(lokale())}` : `${Math.round(n).toLocaleString(lokale())} €`)}
        />
      </Flaeche>
      {t.zeigen ? <Ergebnis w={w} e={{ betrag, von, bis, ...(land === 'ca' ? { land } : {}), ...t.extra }} /> : null}
    </>
  );
}

// --- Brutto -> Netto -------------------------------------------------------------------------------

function Netto({ w }: { w: Werkzeug }) {
  const [land, setLand] = useState<'at' | 'ca'>('at');
  const [modus, setModus] = useState<'monat' | 'stunde'>('monat');
  const [brutto, setBrutto] = useState(2_500);
  const [jahr, setJahr] = useState(55_000);
  const [lohn, setLohn] = useState(14);
  const [stunden, setStunden] = useState(20);
  const ca = land === 'ca';
  // Kanada rechnet in Jahresgehalt und 52 Wochen - so steht es im Vertrag.
  const e = ca
    ? modus === 'stunde'
      ? { land, modus, lohn, stunden }
      : { land, jahr }
    : modus === 'stunde'
      ? { modus, lohn, stunden }
      : { brutto };
  return (
    <>
      <Flaeche>
        <Umschalter
          w={w}
          wert={land}
          optionen={[
            { id: 'at', label: 'Österreich' },
            { id: 'ca', label: 'Kanada' },
          ]}
          onChange={setLand}
        />
        <Umschalter
          w={w}
          wert={modus}
          optionen={[
            { id: 'monat', label: ca ? 'Jahresgehalt' : 'Monatslohn' },
            { id: 'stunde', label: 'Stundenlohn' },
          ]}
          onChange={setModus}
        />
        {modus === 'monat' && ca ? (
          <Regler label={T('Brutto im Jahr')} wert={jahr.toLocaleString(lokale())} einheit="$">
            <Slider min={10_000} max={200_000} step={1_000} value={jahr} onChange={setJahr} tint={w.farbe} />
          </Regler>
        ) : modus === 'monat' ? (
          <Regler label={T('Brutto im Monat')} wert={brutto.toLocaleString(lokale())} einheit="€">
            <Slider min={300} max={8_000} step={50} value={brutto} onChange={setBrutto} tint={w.farbe} />
          </Regler>
        ) : (
          <>
            <Regler label={T('Pro Stunde')} wert={lohn.toLocaleString(lokale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} einheit={ca ? '$' : '€'}>
              <Slider min={5} max={60} step={0.5} value={lohn} onChange={setLohn} tint={w.farbe} />
            </Regler>
            <Regler label={T('Stunden pro Woche')} wert={String(stunden)}>
              <Slider min={2} max={45} value={stunden} onChange={setStunden} tint={w.farbe} />
            </Regler>
          </>
        )}
        <Text style={styles.hinweis}>
          {ca
            ? 'Angestellt in Ontario, Kanada. Zu viel einbehaltene Steuer kommt mit der Steuererklärung zurück – das ist hier nicht drin.'
            : `Angestellt in Österreich, 14 Gehälter${modus === 'stunde' ? ', ein Monat = 52 ÷ 12 Wochen' : ''}. Bei kleinen Einkommen holt die Arbeitnehmerveranlagung oft noch Geld zurück – das ist hier nicht drin.`}
        </Text>
      </Flaeche>
      <Ergebnis w={w} e={e} />
    </>
  );
}

// --- Wege & CO2 ------------------------------------------------------------------------------------

/** Reglerstellung 0..100 -> 1..10.000 km, logarithmisch: Schulweg und Fernflug auf einem Regler. */
const kmAus = (pos: number) => {
  const km = Math.pow(10, (pos / 100) * 4);
  return km < 20 ? Math.round(km) : km < 200 ? Math.round(km / 5) * 5 : Math.round(km / 50) * 50;
};

function Co2({ w }: { w: Werkzeug }) {
  const [pos, setPos] = useState(50);
  const [mittel, setMittel] = useState<Co2MittelId>('auto');
  const [retour, setRetour] = useState(false);
  const [personen, setPersonen] = useState(1);
  const km = kmAus(pos);
  const auto = mittel === 'auto' || mittel === 'eauto';
  const t = useTipp(`${km}-${mittel}-${retour}-${auto ? personen : ''}`, 10);
  const e = { km, mittel, ...(retour ? { retour } : {}), ...(auto ? { personen } : {}), ...t.extra };
  return (
    <>
      <Flaeche>
        <Regler label={T('Strecke')} wert={km.toLocaleString(lokale())} einheit="km">
          <Slider min={0} max={100} value={pos} onChange={setPos} tint={w.farbe} format={(p) => `${kmAus(p).toLocaleString(lokale())} km`} />
        </Regler>
        <Umschalter
          w={w}
          wert={retour ? 'retour' : 'einfach'}
          optionen={[
            { id: 'einfach', label: 'Einfach' },
            { id: 'retour', label: 'Retour' },
          ]}
          onChange={(v) => setRetour(v === 'retour')}
        />
        <Text style={styles.reglerLabel}>Womit?</Text>
        <Umschalter w={w} wert={mittel} optionen={CO2_MITTEL.map((m) => ({ id: m.id, label: m.label }))} onChange={setMittel} />
        {auto ? (
          <Regler label={T('Leute im Auto')} wert={String(personen)}>
            <Slider min={1} max={5} value={personen} onChange={setPersonen} tint={w.farbe} />
          </Regler>
        ) : null}
        <Text style={styles.hinweis}>
          Pro Person. Züge und Busse im Schnitt besetzt; beim Auto zählt, wie viele wirklich mitfahren.
        </Text>
        <TippFeld w={w} t={t} min={0} max={Math.max(20, Math.round(km * (retour ? 2 : 1) * 0.3))} fmt={(n) => `${n} kg`} />
      </Flaeche>
      {t.zeigen ? <Ergebnis w={w} e={e} /> : null}
    </>
  );
}

// --- Ratenkauf & Handyvertrag ---------------------------------------------------------------

function Kredit({ w }: { w: Werkzeug }) {
  const [modus, setModus] = useState<'rate' | 'vertrag'>('rate');
  const [preis, setPreis] = useState(800);
  const [anzahlung, setAnzahlung] = useState(0);
  const [rate, setRate] = useState(38);
  const [monate, setMonate] = useState(24);
  const eur = (n: number) => n.toLocaleString(lokale());
  return (
    <>
      <Flaeche>
        <Umschalter
          w={w}
          wert={modus}
          optionen={[
            { id: 'rate', label: 'Ratenkauf' },
            { id: 'vertrag', label: 'Handyvertrag' },
          ]}
          onChange={setModus}
        />
        <Regler label={modus === 'vertrag' ? 'Handy bar' : 'Preis bar'} wert={eur(preis)} einheit="€">
          <Slider min={50} max={3_000} step={10} value={preis} onChange={setPreis} tint={w.farbe} />
        </Regler>
        <Regler label={modus === 'vertrag' ? 'Aufpreis pro Monat' : 'Rate pro Monat'} wert={eur(rate)} einheit="€">
          <Slider min={1} max={300} value={rate} onChange={setRate} tint={w.farbe} />
        </Regler>
        <Regler label={T('Monate')} wert={String(monate)}>
          <Slider min={3} max={60} value={monate} onChange={setMonate} tint={w.farbe} />
        </Regler>
        <Regler label={modus === 'vertrag' ? 'Einmalzahlung' : 'Anzahlung'} wert={eur(anzahlung)} einheit="€">
          <Slider min={0} max={Math.max(0, preis - 10)} step={10} value={Math.min(anzahlung, preis - 10)} onChange={setAnzahlung} tint={w.farbe} />
        </Regler>
        <Text style={styles.hinweis}>
          {modus === 'vertrag'
            ? 'Vergleiche den Vertrag MIT Handy mit dem gleichen Tarif OHNE Handy. Der Unterschied pro Monat ist in Wahrheit die Rate für das Gerät.'
            : 'Trag ein, was bar zu zahlen wäre und was die Raten kosten. Heraus kommt der Zins, der in den Raten steckt.'}
        </Text>
      </Flaeche>
      <Ergebnis w={w} e={{ preis, anzahlung: Math.min(anzahlung, preis - 10), rate, monate, ...(modus === 'vertrag' ? { modus } : {}) }} />
    </>
  );
}

// --- Miete ----------------------------------------------------------------------------------

function Miete({ w }: { w: Werkzeug }) {
  const [miete, setMiete] = useState(700);
  const [einkommen, setEinkommen] = useState(2_000);
  const eur = (n: number) => n.toLocaleString(lokale());
  return (
    <>
      <Flaeche>
        <Regler label={T('Wohnen pro Monat')} wert={eur(miete)} einheit="€">
          <Slider min={100} max={3_000} step={10} value={miete} onChange={setMiete} tint={w.farbe} />
        </Regler>
        <Regler label={T('Einkommen netto')} wert={eur(einkommen)} einheit="€">
          <Slider min={300} max={8_000} step={50} value={einkommen} onChange={setEinkommen} tint={w.farbe} />
        </Regler>
        <Text style={styles.hinweis}>{T('Wohnen heißt hier alles: Miete, Betriebskosten, Strom, Gas, Heizung. Beim Einkommen zählt, was wirklich aufs Konto kommt – das rechnet Brutto → Netto aus.')}</Text>
      </Flaeche>
      <Ergebnis w={w} e={{ miete, einkommen }} />
    </>
  );
}

// --- Energie ----------------------------------------------------------------------------------

function Energie({ w }: { w: Werkzeug }) {
  const [modus, setModus] = useState<'tag' | 'snack'>('tag');
  const [alter, setAlter] = useState(16);
  const [geschlecht, setGeschlecht] = useState<'m' | 'w'>('w');
  const [aktivitaet, setAktivitaet] = useState<string>('mittel');
  const [snack, setSnack] = useState(250);
  return (
    <>
      <Flaeche>
        <Umschalter
          w={w}
          wert={modus}
          optionen={[
            { id: 'tag', label: 'Tagesbedarf' },
            { id: 'snack', label: 'Snack' },
          ]}
          onChange={setModus}
        />
        <Regler label={T('Alter')} wert={String(alter)}>
          <Slider min={10} max={80} value={alter} onChange={setAlter} tint={w.farbe} />
        </Regler>
        <Umschalter
          w={w}
          wert={geschlecht}
          optionen={[
            { id: 'w', label: 'Weiblich' },
            { id: 'm', label: 'Männlich' },
          ]}
          onChange={setGeschlecht}
        />
        <Text style={styles.reglerLabel}>Bewegung</Text>
        <Umschalter w={w} wert={aktivitaet} optionen={PAL.map((p) => ({ id: p.id as string, label: p.label }))} onChange={setAktivitaet} />
        {modus === 'snack' ? (
          <Regler label={T('Snack laut Packung')} wert={String(snack)} einheit="kcal">
            <Slider min={20} max={1_500} step={10} value={snack} onChange={setSnack} tint={w.farbe} />
          </Regler>
        ) : null}
        <Text style={styles.hinweis}>{T('Wenig: meist sitzend. Mittel: sitzend mit etwas Gehen und Stehen. Viel: viel auf den Beinen oder regelmäßig Sport. Die Richtwerte gehen von Normalgewicht aus.')}</Text>
      </Flaeche>
      <Ergebnis w={w} e={{ alter, geschlecht, aktivitaet, ...(modus === 'snack' ? { modus, snack } : {}) }} />
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
    ...flaeche(10),
  },
  regler: { gap: space.xs },
  reglerKopf: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  reglerLabel: { ...type.meta, color: color.ink.low, textTransform: 'uppercase', letterSpacing: 1 },
  reglerWert: { ...type.mono, fontSize: 18, color: color.ink.max },
  reglerEinheit: { ...type.mono, fontSize: 13, color: color.ink.mid },
  knoepfe: { flexDirection: 'row', gap: space.sm },
  szenario: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.ink.faint,
    backgroundColor: color.bgSunken,
  },
  szenarioZahl: { ...type.mono, fontSize: 17 },

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
  tippSchalter: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', paddingVertical: 4 },
  tippPunkt: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: color.ink.low },
});
