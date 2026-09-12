import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { useIsActiveCard } from '@/lib/activeCard';
import { getPrefs } from '@/lib/prefs';
import { speakSentence, stopSpeech } from '@/lib/speech';
import type { ContentItem } from '@/lib/types.db';
import { color, motion, radius, space, type } from '@/theme/tokens';

import { KineticStage } from './KineticStage';
import {
  estimateBeatMs,
  isKineticScript,
  type KineticBeat,
  type KineticShow,
} from './types';

/**
 * Die Erklaerkarte.
 *
 * Text weicht einer Grafik, die Grafik baut sich auf, eine Stimme spricht
 * dazu, und unten steht immer genau der Satz, der gerade gesprochen wird.
 *
 * Wie der Takt zustande kommt
 * ---------------------------
 * Nicht ueber einen Zeitplan. Jeder Satz wird als EIGENE Aeusserung
 * gesprochen, und der naechste Takt beginnt, wenn die Sprachausgabe fertig
 * meldet. Damit stimmt Bild und Ton auf jedem Geraet - auch bei einer
 * Systemstimme, die doppelt so schnell spricht wie meine.
 *
 * Ohne Ton laeuft dieselbe Abfolge auf geschaetzten Zeiten weiter. Das ist
 * kein Notbehelf, sondern der haeufigere Fall: im Browser ist die
 * Sprachausgabe bis zur ersten Beruehrung gesperrt, und viele schauen
 * stumm. Die Karte muss auch dann funktionieren - deshalb steht der Text
 * unten und nicht nur in der Stimme.
 *
 * Sie laeuft in der Schleife
 * --------------------------
 * Nach dem letzten Takt faengt sie von selbst wieder vorne an - wie ein
 * kurzes Video im Feed. Vorher stand dort ein Ende mit einer Taste
 * "Nochmal", und das war die falsche Entscheidung: es verlangt genau in dem
 * Moment eine Handlung, in dem jemand gerade verstanden hat, dass er den
 * Anfang verpasst hat. Den Anfang sieht man ohnehin selten - man wischt
 * mitten hinein, hoert zwei Saetze und will wissen, wovon die handeln.
 *
 * Was sie ausdruecklich NICHT tut
 * -------------------------------
 * Sie haelt niemanden fest. Kein Vollbild, keine Sperre, kein "erst zu Ende
 * sehen". Wer weiterwischt, wischt weiter - die Karte hoert dann auf zu
 * reden und faengt beim naechsten Mal von vorne an. Eine Erklaerkarte ist
 * ein Angebot im Feed, kein Video mit Werbepause.
 */

/** Eine feste leere Liste - eine frische waere wieder eine neue Identitaet. */
const NO_BEATS: KineticBeat[] = [];

/**
 * Atempause zwischen letztem und erstem Takt.
 *
 * Ohne sie klebt die Pointe am Einstiegssatz und der Durchlauf ist nicht
 * mehr als solcher zu erkennen - es sieht aus, als haette die Karte einen
 * Takt uebersprungen. Eine gute Sekunde reicht: lang genug, dass der letzte
 * Satz stehen bleibt, kurz genug, dass es keine Pause ist, in der man
 * weiterwischt.
 */
const LOOP_PAUSE_MS = 1100;

/**
 * Ab wann eine Fertigmeldung zu schnell kam, um echt zu sein.
 *
 * Kein Satz ist in einer Dreiviertelsekunde gesprochen. Kommt die Meldung
 * trotzdem, wurde nicht gesprochen, sondern abgebrochen: im Browser ist die
 * Sprachausgabe ohne Nutzergeste gesperrt, und je nach Browser meldet sie
 * dann sofort "fertig" oder "Fehler". Beides sah von hier aus gleich aus wie
 * "Satz zu Ende" - und die Karte schaltete alle Takte in Millisekunden
 * durch.
 *
 * Der eigentliche Auslöser ist in lib/speech.ts behoben (abbrechen und
 * sprechen im selben Tick). Diese Grenze bleibt trotzdem: sie deckt jeden
 * anderen Grund ab, aus dem eine Stimme sofort zurueckmeldet - fehlende
 * Systemstimme, stummgeschaltete Seite, ein Browser, der es einfach anders
 * macht. Wer der Meldung blind glaubt, hat genau den Fehler, den niemand
 * als Tonproblem erkennt: die Karte rast, und man versteht nichts.
 */
const TOO_FAST_MS = 750;

export function KineticCard({
  item,
  accent,
}: {
  item: ContentItem;
  accent: string;
}) {
  /**
   * Beides gemerkt, und das ist keine Mikro-Optimierung.
   *
   * `beats` steckt in der Abhaengigkeitsliste des Taktgebers weiter unten.
   * Waere es bei jedem Rendern ein neues Array, wuerde der Taktgeber bei
   * jedem Rendern neu starten - und die Karte kommt nie ueber den ersten
   * Satz hinaus.
   *
   * Genau das ist passiert, und die Rueckkopplung war hübsch: Sprechen
   * meldet den Sprecher an, das Anmelden rendert die Karte neu (die
   * "Hoeren"-Taste zeigt ja den Zustand), das Neurendern startet den
   * Taktgeber neu, der spricht wieder von vorn. Endlos bei Takt eins.
   */
  const script = useMemo(
    () => (isKineticScript(item.kinetic_script) ? item.kinetic_script : null),
    [item.kinetic_script],
  );
  const beats = script?.beats ?? NO_BEATS;

  const isActive = useIsActiveCard(item.id);
  const [beat, setBeat] = useState(0);
  const [paused, setPaused] = useState(false);
  /**
   * Der wievielte Durchlauf. Nur fuer die Anzeige - aber nicht bloss Zierat:
   * ohne sie sieht der zweite Durchlauf genauso aus wie der erste, und man
   * fragt sich, ob man sich verschaut hat.
   */
  const [round, setRound] = useState(0);

  /** Laeuft gerade eine Aeusserung oder ein Zeitgeber? Zum Abbrechen. */
  const cancel = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fuer welchen Takt schon gesprochen wird.
   *
   * Der zweite Riegel gegen dieselbe Rueckkopplung: selbst wenn der Effekt
   * aus einem anderen Grund erneut laeuft, wird derselbe Satz nicht ein
   * zweites Mal angefangen.
   */
  const speaking = useRef<number | null>(null);

  /** Laeuft gerade die Atempause vor dem naechsten Durchlauf? */
  const resting = useRef(false);

  const clearPending = useCallback(() => {
    cancel.current?.();
    cancel.current = null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    speaking.current = null;
  }, []);

  // --- Anfangen, aufhoeren -------------------------------------------------
  //
  // Verlaesst die Karte das Bild, wird zurueckgesetzt. Beim naechsten Mal
  // laeuft sie von vorn. Auf halber Strecke wieder einzusteigen waere
  // schlimmer als neu anzufangen: man haette den Anfang der Erklaerung
  // verpasst und wuesste nicht, dass er fehlt.
  useEffect(() => {
    if (isActive) return;
    clearPending();
    // Nicht in clearPending(): das ruft auch die Pause-Taste auf, und beim
    // Fortsetzen muss noch erkennbar sein, dass die Karte in der Atempause
    // stand.
    resting.current = false;
    setBeat(0);
    setPaused(false);
    setRound(0);
  }, [isActive, clearPending]);

  // --- Der Taktgeber --------------------------------------------------------
  useEffect(() => {
    if (!isActive || paused || beats.length === 0) return;

    const current = beats[beat];
    if (!current) return;
    if (speaking.current === beat) return;
    speaking.current = beat;

    const expected = estimateBeatMs(current.say);

    /**
     * Einen Zeitgeber setzen und den vorherigen dabei WIRKLICH loeschen.
     *
     * Genau das hat gefehlt: in `next` stand `timer.current = null`. Die
     * Referenz war weg, der Zeitgeber lief weiter. Jeder Takt liess so ein
     * Sicherheitsnetz zurueck, das Sekunden spaeter mit einem VERALTETEN
     * Taktindex feuerte und die Karte vorwaerts riss - und weil sie jetzt
     * in der Schleife laeuft, kam pro Runde ein Faden dazu. Nach drei
     * Runden schalteten vier Faeden gleichzeitig. Gemessen: Takte im
     * Abstand von zehn Millisekunden.
     */
    const arm = (ms: number, fn: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fn, ms);
    };

    /** Jeder Takt schaltet genau einmal weiter - und nur der aktuelle. */
    let used = false;
    const next = () => {
      if (used || speaking.current !== beat) return;
      used = true;
      cancel.current = null;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (beat + 1 < beats.length) {
        speaking.current = null;
        setBeat(beat + 1);
        return;
      }

      // Letzter Takt: kurz stehen lassen, dann von vorn.
      //
      // `speaking` wird waehrend der Pause ABSICHTLICH nicht geleert.
      // Sonst genuegt ein beliebiges Neurendern - die Sprechen-Taste, ein
      // neuer Kommentarzaehler -, damit dieser Effekt wieder laeuft, den
      // Takt noch unveraendert vorfindet und den letzten Satz ein zweites
      // Mal anfaengt. Geleert wird er erst zusammen mit dem Ruecksprung.
      stopSpeech();
      resting.current = true;
      timer.current = setTimeout(() => {
        timer.current = null;
        speaking.current = null;
        resting.current = false;
        setBeat(0);
        setRound((r) => r + 1);
      }, LOOP_PAUSE_MS);
    };

    if (getPrefs().audioEnabled) {
      const start = Date.now();
      // Sicherheitsnetz ZUERST spannen: meldet die Sprachausgabe noch im
      // selben Tick einen Fehler, laeuft `onDone` bevor die Rueckgabe von
      // speakSentence zugewiesen ist - und ein danach gesetzter Zeitgeber
      // haengt frei, ohne dass ihn jemand loeschen kann.
      arm(expected + 1800, next);
      cancel.current = speakSentence({
        cardId: item.id,
        text: current.say,
        language: item.language,
        // Die Stimme hat angefangen: ab jetzt wartet der Takt auf ihr
        // Satzende und nicht mehr auf die Uhr.
        //
        // Vorher galt auch dann `geschaetzt + 1800`. Die Schaetzung
        // rechnet mit 14 Zeichen je Sekunde, eine langsam eingestellte
        // Systemstimme braucht mehr - und dann faellt die Notbremse
        // mitten im Satz. Wer schon einmal eine Vorlesestimme auf 0,8
        // gestellt hat, kennt den Effekt.
        //
        // Nachgemessen ist das NICHT: der Browser, in dem geprueft wurde,
        // meldet `speaking: true`, feuert aber kein einziges Ereignis und
        // gibt keinen Ton aus - kein Audiogeraet. Dort greift weiter die
        // Notbremse, und das ist genau richtig so. Diese Zeile kostet
        // nichts, wenn die Meldung nie kommt, und verhindert einen
        // abgeschnittenen Satz, wenn sie kommt.
        onStart: () => arm(expected * 2.2 + 4000, next),
        onDone: () => {
          const elapsed = Date.now() - start;
          if (elapsed < TOO_FAST_MS) {
            // Nicht gesprochen, nur abgebrochen. Der Takt laeuft dann auf
            // Lesezeit weiter, als waere der Ton aus - das ist er faktisch
            // auch.
            cancel.current = null;
            arm(Math.max(expected - elapsed, 600), next);
            return;
          }
          next();
        },
      });
    } else {
      arm(expected, next);
    }

    // Kein Aufraeumen beim erneuten Durchlauf: das Aufraeumen erledigen
    // clearPending() an den Stellen, die wirklich abbrechen (Pause, Karte
    // verlassen, Ausbau). Haenge es hier an den Effekt, bricht jedes
    // Neurendern den laufenden Satz ab.
  }, [isActive, paused, beat, beats, item.id, item.language]);

  useEffect(() => () => clearPending(), [clearPending]);

  if (!script || beats.length === 0) return null;

  const current = beats[beat];
  const previous: KineticShow | null = beat > 0 ? beats[beat - 1].show : null;

  const toggle = () => {
    if (!paused) {
      clearPending();
      setPaused(true);
      return;
    }
    // Wer waehrend der Atempause angehalten hat, steht auf dem letzten
    // Takt. Dort einfach weiterzumachen hiesse, die Pointe ein zweites Mal
    // zu hoeren - gemeint war der naechste Durchlauf.
    if (resting.current) {
      resting.current = false;
      speaking.current = null;
      setBeat(0);
      setRound((r) => r + 1);
    }
    setPaused(false);
  };

  return (
    <View style={styles.root}>
      {/* Kopf: Titel bleibt stehen, damit man nach dem Wischen weiss,
          worum es ueberhaupt geht. */}
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>

      {/* Fortschritt als Striche, einer pro Takt - dasselbe Muster wie in
          Stories, und es sagt sofort, wie lange das noch dauert. */}
      <View style={styles.ticks}>
        {beats.map((_, i) => (
          <Tick key={i} state={i < beat ? 'done' : i === beat ? 'now' : 'todo'} accent={accent} />
        ))}
      </View>

      <View style={styles.stageWrap}>
        <KineticStage
          show={current.show}
          previous={previous}
          accent={accent}
          cardSeed={item.id}
        />
      </View>

      {/* Der gesprochene Satz. Immer nur der aktuelle. */}
      <Caption text={current.say} />

      <View style={styles.controls}>
        <Pressable
          onPress={toggle}
          hitSlop={10}
          style={styles.control}
          accessibilityLabel={paused ? 'Weiter' : 'Pause'}
        >
          <Icon name={paused ? 'listen' : 'listening'} size={15} color={color.ink.mid} />
          <Text style={styles.controlText}>{paused ? 'Weiter' : 'Pause'}</Text>
        </Pressable>

        {/* Ab dem zweiten Durchlauf steht das Zeichen dabei. Es beantwortet
            die einzige Frage, die ein Neuanfang aufwirft: "war das schon
            mal da?" */}
        <View style={styles.counter}>
          {round > 0 ? <Icon name="refresh" size={12} color={color.ink.low} /> : null}
          <Text style={styles.step}>
            {beat + 1} / {beats.length}
          </Text>
        </View>
      </View>
    </View>
  );
}

// --- Fortschrittsstrich ------------------------------------------------------

function Tick({ state, accent }: { state: 'done' | 'now' | 'todo'; accent: string }) {
  const p = useSharedValue(state === 'todo' ? 0 : 1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const to = state === 'todo' ? 0 : 1;
    p.value = reduceMotion ? to : withTiming(to, { duration: motion.fast });
  }, [state, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: 0.28 + 0.72 * p.value,
    backgroundColor: state === 'now' ? accent : color.ink.mid,
  }));

  return <Animated.View style={[styles.tick, state === 'now' && styles.tickNow, anim]} />;
}

// --- Untertitel --------------------------------------------------------------

/**
 * Der gerade gesprochene Satz.
 *
 * Der alte verschwindet, der neue kommt - und zwar nicht gleichzeitig,
 * sondern nacheinander. Zwei Saetze, die sich ueberlagern, sind einen
 * Wimpernschlag lang beide halb lesbar, und das liest sich wie ein Fehler.
 */
function Caption({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const p = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (text === shown) return;
    if (reduceMotion) {
      setShown(text);
      return;
    }
    p.value = withTiming(0, { duration: 130 });
    const t = setTimeout(() => {
      setShown(text);
      p.value = withTiming(1, { duration: 190 });
    }, 140);
    return () => clearTimeout(t);
  }, [text, shown, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 6 }],
  }));

  return (
    <View style={styles.captionWrap}>
      <Animated.Text style={[styles.caption, anim]}>{shown}</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: space.md },

  title: { ...type.label, fontSize: 14, color: color.ink.mid },

  ticks: { flexDirection: 'row', gap: 4, height: 3 },
  tick: { flex: 1, height: 3, borderRadius: 2 },
  tickNow: { flex: 1.6 },

  // Die Buehne bekommt den ganzen freien Platz und zentriert darin. Damit
  // steht eine kurze Aussage genauso mittig wie eine lange Tabelle, statt
  // oben zu kleben.
  stageWrap: { flex: 1, justifyContent: 'center' },

  // Feste Mindesthoehe: sonst springt die Buehne bei jedem Satzwechsel,
  // weil ein zweizeiliger Untertitel mehr Platz braucht als ein einzeiliger.
  captionWrap: { minHeight: 58, justifyContent: 'flex-end' },
  caption: { ...type.body, fontSize: 16, lineHeight: 23, color: color.ink.high },

  controls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
  },
  controlText: { ...type.meta, color: color.ink.mid },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' },
  step: { ...type.mono, fontSize: 11, color: color.ink.low },
});
