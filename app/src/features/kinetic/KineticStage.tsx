import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { BlueprintVisual } from '@/components/BlueprintVisual';
import { color, motion, radius, space, type } from '@/theme/tokens';

import type { KineticShow } from './types';

/**
 * Das Bild eines Taktes.
 *
 * Die eine Regel, die alles andere bestimmt: **was schon da war, bleibt
 * stehen.** Eine Tabellenzeile, die im vorigen Takt schon sichtbar war,
 * wird nicht neu eingeblendet - nur die neue kommt dazu. Ein Balken, der
 * seinen Wert aendert, waechst dorthin, statt zu verschwinden und neu zu
 * erscheinen.
 *
 * Das ist der ganze Unterschied zwischen "es wird etwas erklaert" und "es
 * blinken Bilder". Wenn bei jedem Satz alles neu aufblendet, kann das Auge
 * nicht verfolgen, WAS sich geaendert hat - und genau das ist die
 * Information.
 */

// --- Aussage -----------------------------------------------------------------

function Statement({ show }: { show: Extract<KineticShow, { kind: 'statement' }> }) {
  return (
    <View style={styles.statement}>
      <Text style={styles.statementText} numberOfLines={3} adjustsFontSizeToFit>
        {show.text}
      </Text>
      {show.sub ? <Text style={styles.statementSub}>{show.sub}</Text> : null}
    </View>
  );
}

// --- Tabelle -----------------------------------------------------------------

function Row({
  cells,
  isNew,
  accent,
}: {
  cells: [string, string];
  isNew: boolean;
  accent: string;
}) {
  const p = useSharedValue(isNew ? 0 : 1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isNew) {
      p.value = 1;
      return;
    }
    p.value = reduceMotion ? 1 : withTiming(1, { duration: motion.base });
  }, [isNew, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateX: (1 - p.value) * 14 }],
  }));

  return (
    <Animated.View style={[styles.row, anim]}>
      <Text style={styles.cellLeft} numberOfLines={1}>
        {cells[0]}
      </Text>
      <Text style={[styles.cellRight, isNew && { color: accent }]} numberOfLines={1}>
        {cells[1]}
      </Text>
    </Animated.View>
  );
}

function Table({
  show,
  previous,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'table' }>;
  previous: KineticShow | null;
  accent: string;
}) {
  /**
   * Welche Zeilen sind neu?
   *
   * Verglichen wird gegen den vorigen Takt - aber nur, wenn er dieselbe
   * Tabelle meinte. Der Vergleich laeuft ueber die linke Spalte, weil sich
   * der Wert rechts aendern kann ("Jahr 3" bleibt "Jahr 3", auch wenn der
   * Betrag korrigiert wird).
   */
  const known = useMemo(() => {
    if (!previous || previous.kind !== 'table') return new Set<string>();
    if (previous.id !== show.id) return new Set<string>();
    return new Set(previous.rows.map((r) => r[0]));
  }, [previous, show.id]);

  return (
    <View style={styles.table}>
      {show.head ? (
        <View style={[styles.row, styles.headRow]}>
          <Text style={styles.headCell}>{show.head[0]}</Text>
          <Text style={[styles.headCell, styles.headRight]}>{show.head[1]}</Text>
        </View>
      ) : null}
      {show.rows.map((cells) => (
        <Row key={cells[0]} cells={cells} isNew={!known.has(cells[0])} accent={accent} />
      ))}
    </View>
  );
}

// --- Balken ------------------------------------------------------------------

function Bar({
  label,
  value,
  max,
  unit,
  accent,
  index,
  highlight,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  accent: string;
  index: number;
  highlight: boolean;
}) {
  const w = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const target = max > 0 ? Math.max(0.015, value / max) : 0;

  useEffect(() => {
    w.value = reduceMotion
      ? target
      : withDelay(index * 90, withTiming(target, { duration: motion.slow }));
  }, [target, index, w, reduceMotion]);

  const anim = useAnimatedStyle(() => ({ flex: w.value }));
  const rest = useAnimatedStyle(() => ({ flex: Math.max(0.0001, 1 - w.value) }));

  return (
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.barValue, highlight && { color: accent }]}>
          {formatNumber(value)}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View
          style={[styles.barFill, { backgroundColor: highlight ? accent : color.ink.mid }, anim]}
        />
        <Animated.View style={rest} />
      </View>
    </View>
  );
}

/** Tausendertrennung mit schmalem Leerzeichen - liest sich besser als Punkt. */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '–';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} Mrd.`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} Mio.`;
  return n.toLocaleString('de-DE');
}

function Bars({
  show,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'bars' }>;
  accent: string;
}) {
  const max = Math.max(...show.values, 1);
  // Der letzte Balken ist fast immer die Pointe - der Wert, um den es geht.
  const last = show.values.length - 1;
  return (
    <View style={styles.bars}>
      {show.labels.map((label, i) => (
        <Bar
          key={`${show.id ?? 'b'}-${label}`}
          label={label}
          value={show.values[i] ?? 0}
          max={max}
          unit={show.unit ?? ''}
          accent={accent}
          index={i}
          highlight={i === last}
        />
      ))}
    </View>
  );
}

// --- Zeitstrahl --------------------------------------------------------------

/**
 * Feste Hoehe, damit die Buehne beim Takten nicht springt.
 *
 * Sie muss zu MAX_POINTS passen: sechs Punkte brauchen fuenf
 * Mindestabstaende, und was danach uebrig bleibt, ist der Platz, in dem der
 * Massstab ueberhaupt noch sichtbar werden kann. Bei 210 blieben davon 34
 * Punkte - zu wenig, die Achse sah gleichmaessig verteilt aus. Mehr Hoehe
 * hat die Karte nicht; deshalb begrenzt die Pruefung in der Pipeline auf
 * sechs Punkte.
 */
const TIMELINE_HEIGHT = 260;

/** Naeher als das duerfen sich zwei Punkte nicht kommen - sonst ueberlappen
 *  die Beschriftungen. Sechs Punkte brauchen damit 150 der 234 nutzbaren
 *  Punkte; die restlichen 84 traegt der Massstab. */
const MIN_POINT_GAP = 30;

function TimelinePoint({
  at,
  label,
  note,
  y,
  isNew,
  unit,
  accent,
}: {
  at: number;
  label: string;
  note?: string;
  y: number;
  isNew: boolean;
  unit: string;
  accent: string;
}) {
  const reduceMotion = useReducedMotion();
  const appear = useSharedValue(isNew ? 0 : 1);
  const top = useSharedValue(y);
  const placed = useRef(false);

  /**
   * Der Punkt wandert, wenn die Achse waechst.
   *
   * Das ist der eigentliche Reiz dieser Bildart: kommt 2020 dazu, rutscht
   * 1943 nach oben und der Abstand dazwischen wird sichtbar gestaucht. Beim
   * ERSTEN Setzen darf nichts wandern - sonst kaeme jeder neue Punkt von
   * ganz oben angeflogen, statt dort zu erscheinen, wo er hingehoert.
   */
  useEffect(() => {
    if (!placed.current) {
      placed.current = true;
      top.value = y;
      return;
    }
    top.value = reduceMotion ? y : withTiming(y, { duration: motion.slow });
  }, [y, top, reduceMotion]);

  useEffect(() => {
    if (!isNew) {
      appear.value = 1;
      return;
    }
    appear.value = reduceMotion ? 1 : withTiming(1, { duration: motion.base });
  }, [isNew, appear, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    top: top.value,
    opacity: appear.value,
    transform: [{ translateX: (1 - appear.value) * 14 }],
  }));

  return (
    <Animated.View style={[styles.tlPoint, anim]}>
      <View style={[styles.tlDot, isNew && { backgroundColor: accent }]} />
      <Text style={[styles.tlAt, isNew && { color: accent }]}>
        {formatAt(at)}
        {unit ? ` ${unit}` : ''}
      </Text>
      <View style={styles.tlTexts}>
        <Text style={styles.tlLabel} numberOfLines={1}>
          {label}
        </Text>
        {note ? (
          <Text style={styles.tlNote} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** Jahreszahlen bleiben Jahreszahlen - 1943 ist nicht "1.943". */
function formatAt(n: number): string {
  if (Number.isInteger(n) && n >= 1000 && n <= 2999) return String(n);
  return formatNumber(n);
}

function Timeline({
  show,
  previous,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'timeline' }>;
  previous: KineticShow | null;
  accent: string;
}) {
  const known = useMemo(() => {
    if (!previous || previous.kind !== 'timeline' || previous.id !== show.id) {
      return new Set<number>();
    }
    return new Set(previous.points.map((p) => p.at));
  }, [previous, show.id]);

  /**
   * Wo sitzt welcher Punkt?
   *
   * Massstab ist die Spanne der bisher gezeigten Punkte, nicht eine feste
   * Achse - der letzte Punkt sitzt also immer unten und der erste immer
   * oben. Alles dazwischen liegt anteilig, und das ist die ganze Aussage.
   *
   * Liegen alle auf demselben Wert, gibt es keine Spanne; dann wird
   * gleichmaessig verteilt, damit sich die Punkte nicht uebereinanderlegen.
   */
  const positions = useMemo(() => {
    const values = show.points.map((p) => p.at);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const usable = TIMELINE_HEIGHT - 26;
    const n = show.points.length;
    const even = (i: number) => (n > 1 ? (i / (n - 1)) * usable : 0);

    if (span <= 0) return show.points.map((_, i) => even(i));

    /**
     * Erst jedem Paar seinen Mindestabstand, dann den REST anteilig.
     *
     * Rein anteilig geht nicht: eine Zeitachse haeuft sich fast immer am
     * juengeren Ende (1943, 1957, 2006, 2018, 2020), und die letzten
     * beiden Punkte lagen dann uebereinander.
     *
     * Der erste Versuch war, anteilig zu rechnen und die zu nahen Punkte
     * hinterher auseinanderzuschieben - mit Rueckfall auf gleichmaessige
     * Verteilung, wenn es dann nicht mehr passte. Genau dieser Rueckfall
     * griff im ersten Test sofort, und damit war die Bildart ihre einzige
     * Besonderheit los: eine gleichmaessig verteilte Zeitachse ist eine
     * Tabelle mit Punkten davor.
     *
     * So bleibt der Massstab immer sichtbar - nur eben im Platz, der nach
     * den Mindestabstaenden uebrig ist.
     */
    // Der Mindestabstand haengt daran, wie hoch die obere Zeile ist: mit
    // Unterzeile braucht sie mehr. Ohne diese Unterscheidung schob sich im
    // Test "Transformer / Sprachmodelle" ueber den Punkt darunter - die
    // Rechnung stimmte, sie rechnete nur mit einer Zeilenhoehe, die es
    // nicht gab.
    const gaps = show.points
      .slice(0, -1)
      .map((p) => (p.note ? MIN_POINT_GAP + 12 : MIN_POINT_GAP));
    const needed = gaps.reduce((a, b) => a + b, 0);
    const squeeze = needed > usable ? usable / needed : 1;
    const free = Math.max(0, usable - needed * squeeze);

    const ys = [0];
    for (let i = 1; i < n; i++) {
      const share = (show.points[i].at - show.points[i - 1].at) / span;
      ys.push(ys[i - 1] + gaps[i - 1] * squeeze + share * free);
    }
    return ys;
  }, [show.points]);

  return (
    <View style={[styles.timeline, { height: TIMELINE_HEIGHT }]}>
      <View style={styles.tlAxis} />
      {show.points.map((p, i) => (
        <TimelinePoint
          key={`${p.at}-${p.label}`}
          at={p.at}
          label={p.label}
          note={p.note}
          y={positions[i]}
          isNew={!known.has(p.at)}
          unit={show.unit ?? ''}
          accent={accent}
        />
      ))}
    </View>
  );
}

// --- Anteile -----------------------------------------------------------------

/** Mehr Kaestchen kann man nicht mehr abzaehlen - und darum geht es hier. */
const MAX_CELLS = 100;

/**
 * Kantenlaenge eines Kaestchens samt Fuge.
 *
 * Feste Groesse statt Prozent der Breite, und das ist ein korrigierter
 * Fehler: mit `width: 10%` waren die Kaestchen auf einer 375er Breite 33
 * Punkte gross, das Raster also 330 hoch - die Legende stand danach
 * ausserhalb der Karte und lag ueber dem Untertitel. Hundert Kaestchen
 * muessen in die Buehne passen, nicht die Buehne zu hundert Kaestchen.
 */
const CELL = 17;

function Cell({
  tone,
  delay,
  animate,
}: {
  tone: string;
  delay: number;
  animate: boolean;
}) {
  const p = useSharedValue(animate ? 0 : 1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!animate) {
      p.value = 1;
      return;
    }
    p.value = reduceMotion ? 1 : withDelay(delay, withTiming(1, { duration: motion.fast }));
  }, [animate, delay, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    backgroundColor: tone,
    opacity: 0.25 + 0.75 * p.value,
    transform: [{ scale: 0.7 + 0.3 * p.value }],
  }));

  return <Animated.View style={[styles.cell, anim]} />;
}

function Quantity({
  show,
  previous,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'quantity' }>;
  previous: KineticShow | null;
  accent: string;
}) {
  const prevFilled = useMemo(() => {
    if (!previous || previous.kind !== 'quantity' || previous.id !== show.id) return 0;
    return previous.groups.length;
  }, [previous, show.id]);

  const grid = useMemo(() => {
    // Bei mehr als hundert wird nicht gestapelt, sondern skaliert: aus
    // "3,4 von 8,9 Millionen" werden 38 von 100 Kaestchen. Die Zahl in der
    // Legende bleibt die echte - das Raster ist das Bild dazu, nicht die
    // Quelle.
    const cells = Math.min(Math.round(show.total), MAX_CELLS);
    const scale = show.total > 0 ? cells / show.total : 0;
    const owner: number[] = new Array(cells).fill(-1);
    let at = 0;
    show.groups.forEach((g, gi) => {
      const n = Math.min(cells - at, Math.round(g.value * scale));
      for (let k = 0; k < n; k++) owner[at + k] = gi;
      at += n;
    });
    const cols = cells % 10 === 0 ? 10 : Math.ceil(Math.sqrt(cells));
    // Wenige Kaestchen duerfen groesser sein. "Drei von fuenf" in der
    // Groesse eines Hundertrasters waere ein Briefmarkenbild in der Mitte
    // einer leeren Buehne.
    const size = cells <= 25 ? CELL * 2 : CELL;
    return { owner, cols, size };
  }, [show.total, show.groups]);

  /**
   * Nur die JUENGSTE Gruppe traegt die Signalfarbe - die Regel des
   * Designsystems, und hier ausserdem die Leseanweisung: das Auge soll auf
   * das schauen, was dieser Takt hinzufuegt, nicht auf das ganze Raster.
   */
  const toneOf = (gi: number) => {
    if (gi < 0) return color.ink.faint;
    if (gi === show.groups.length - 1) return accent;
    // Zwei klar unterscheidbare Graustufen im Wechsel. ink.low und ink.mid
    // liegen zu nah beieinander - im Test sahen drei aeltere Gruppen aus
    // wie eine einzige graue Flaeche, und damit war die Aufteilung nicht
    // mehr abzulesen.
    return gi % 2 === 0 ? color.ink.high : color.ink.mid;
  };

  return (
    <View style={styles.quantity}>
      <View style={[styles.grid, { width: grid.cols * grid.size }]}>
        {grid.owner.map((gi, i) => (
          <View key={i} style={[styles.cellSlot, { width: grid.size, height: grid.size }]}>
            <Cell
              tone={toneOf(gi)}
              animate={gi >= prevFilled}
              delay={Math.min(400, (i % grid.cols) * 12 + Math.floor(i / grid.cols) * 22)}
            />
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        {show.groups.map((g, gi) => (
          <View key={g.label} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: toneOf(gi) }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {g.label}
            </Text>
            <Text
              style={[
                styles.legendValue,
                gi === show.groups.length - 1 && { color: accent },
              ]}
            >
              {formatNumber(g.value)}
              {show.unit ? ` ${show.unit}` : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// --- Ablauf ------------------------------------------------------------------

function Step({
  index,
  label,
  note,
  isNew,
  isLast,
  accent,
}: {
  index: number;
  label: string;
  note?: string;
  isNew: boolean;
  isLast: boolean;
  accent: string;
}) {
  const p = useSharedValue(isNew ? 0 : 1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isNew) {
      p.value = 1;
      return;
    }
    p.value = reduceMotion ? 1 : withTiming(1, { duration: motion.base });
  }, [isNew, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: 0.15 + 0.85 * p.value,
    transform: [{ translateY: (1 - p.value) * 10 }],
  }));

  return (
    <Animated.View style={[styles.step, anim]}>
      <View style={styles.stepRail}>
        <View style={[styles.stepBadge, isNew && { borderColor: accent }]}>
          <Text style={[styles.stepNum, isNew && { color: accent }]}>{index + 1}</Text>
        </View>
        {/* Die Verbindung nach unten fehlt beim letzten Schritt - eine Linie
            ins Nichts liest sich als "hier fehlt noch etwas". */}
        {!isLast ? <View style={styles.stepLine} /> : null}
      </View>
      <View style={styles.stepTexts}>
        <Text style={styles.stepLabel}>{label}</Text>
        {note ? <Text style={styles.stepNote}>{note}</Text> : null}
      </View>
    </Animated.View>
  );
}

function Steps({
  show,
  previous,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'steps' }>;
  previous: KineticShow | null;
  accent: string;
}) {
  const known = useMemo(() => {
    if (!previous || previous.kind !== 'steps' || previous.id !== show.id) return 0;
    return previous.steps.length;
  }, [previous, show.id]);

  return (
    <View style={styles.stepsWrap}>
      {show.steps.map((s, i) => (
        <Step
          key={`${i}-${s.label}`}
          index={i}
          label={s.label}
          note={s.note}
          isNew={i >= known}
          isLast={i === show.steps.length - 1}
          accent={accent}
        />
      ))}
    </View>
  );
}

// --- Gegenueberstellung ------------------------------------------------------

function CompareRow({
  label,
  left,
  right,
  isNew,
  accent,
}: {
  label: string;
  left: string;
  right: string;
  isNew: boolean;
  accent: string;
}) {
  const p = useSharedValue(isNew ? 0 : 1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!isNew) {
      p.value = 1;
      return;
    }
    p.value = reduceMotion ? 1 : withTiming(1, { duration: motion.base });
  }, [isNew, p, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 8 }],
  }));

  return (
    <Animated.View style={[styles.cmpRow, anim]}>
      <Text style={styles.cmpLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.cmpCell, isNew && { color: accent }]} numberOfLines={2}>
        {left}
      </Text>
      <Text style={[styles.cmpCell, isNew && { color: accent }]} numberOfLines={2}>
        {right}
      </Text>
    </Animated.View>
  );
}

function Compare({
  show,
  previous,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'compare' }>;
  previous: KineticShow | null;
  accent: string;
}) {
  const known = useMemo(() => {
    if (!previous || previous.kind !== 'compare' || previous.id !== show.id) {
      return new Set<string>();
    }
    return new Set(previous.pairs.map((r) => r.label));
  }, [previous, show.id]);

  return (
    <View style={styles.compare}>
      {/* Die Koepfe stehen von Anfang an. Sie sind die Frage, die die
          Zeilen darunter beantworten - erschienen sie erst mit der ersten
          Zeile, muesste man zweimal hinsehen, um zu verstehen, was womit
          verglichen wird. */}
      <View style={styles.cmpHead}>
        <Text style={styles.cmpLabel} />
        <Text style={styles.cmpHeadCell} numberOfLines={1}>
          {show.left}
        </Text>
        <Text style={styles.cmpHeadCell} numberOfLines={1}>
          {show.right}
        </Text>
      </View>
      {show.pairs.map((r) => (
        <CompareRow
          key={r.label}
          label={r.label}
          left={r.left}
          right={r.right}
          isNew={!known.has(r.label)}
          accent={accent}
        />
      ))}
    </View>
  );
}

// --- Groessenordnungen -------------------------------------------------------

function ScaleRow({
  label,
  value,
  anteil,
  faktor,
  unit,
  isLast,
  accent,
  index,
}: {
  label: string;
  value: number;
  anteil: number;
  faktor: string | null;
  unit: string;
  isLast: boolean;
  accent: string;
  index: number;
}) {
  const w = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    w.value = reduceMotion
      ? anteil
      : withDelay(index * 110, withTiming(anteil, { duration: motion.slow }));
  }, [anteil, index, w, reduceMotion]);

  const anim = useAnimatedStyle(() => ({ flex: Math.max(0.02, w.value) }));
  const rest = useAnimatedStyle(() => ({ flex: Math.max(0.0001, 1 - w.value) }));

  return (
    <View style={styles.scaleBlock}>
      {/* Der Sprung zur vorigen Zeile. Das ist die eigentliche Aussage
          dieser Bildart - nicht wie lang ein Balken ist, sondern wie viele
          Nullen zwischen zwei Zeilen liegen. */}
      {faktor ? <Text style={styles.scaleFactor}>{faktor}</Text> : null}
      <View style={styles.scaleHead}>
        <Text style={styles.scaleLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.scaleValue, isLast && { color: accent }]}>
          {formatNumber(value)}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>
      <View style={styles.scaleTrack}>
        <Animated.View
          style={[
            styles.scaleFill,
            { backgroundColor: isLast ? accent : color.ink.mid },
            anim,
          ]}
        />
        <Animated.View style={rest} />
      </View>
    </View>
  );
}

function Scale({
  show,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'scale' }>;
  accent: string;
}) {
  /**
   * Logarithmisch, nicht linear - das ist der ganze Zweck.
   *
   * Linear waere ein Bakterium neben einem Blauwal ein unsichtbarer Strich
   * neben einem vollen Balken: technisch richtig und vollkommen nutzlos.
   * Auf der Zehnerpotenz-Achse wird aus dem Groessenunterschied eine
   * ablesbare Anzahl von Schritten.
   *
   * Der kleinste Wert bekommt trotzdem eine sichtbare Laenge (0.12), sonst
   * faengt die Reihe mit einem Nichts an.
   */
  const { anteile, faktoren } = useMemo(() => {
    const werte = show.items.map((i) => Math.max(i.value, Number.MIN_VALUE));
    const min = Math.min(...werte);
    const max = Math.max(...werte);
    const spanne = Math.log10(max / min);
    const anteile = werte.map((v) =>
      spanne > 0 ? 0.12 + 0.88 * (Math.log10(v / min) / spanne) : 1,
    );
    const faktoren = werte.map((v, i) => {
      if (i === 0) return null;
      const f = v / werte[i - 1];
      if (f < 2) return null;
      return f >= 1000 ? `× ${Math.round(f / 1000)} 000` : `× ${Math.round(f)}`;
    });
    return { anteile, faktoren };
  }, [show.items]);

  return (
    <View style={styles.scale}>
      {show.items.map((item, i) => (
        <ScaleRow
          key={`${item.label}-${item.value}`}
          label={item.label}
          value={item.value}
          anteil={anteile[i]}
          faktor={faktoren[i]}
          unit={show.unit ?? ''}
          isLast={i === show.items.length - 1}
          accent={accent}
          index={i}
        />
      ))}
    </View>
  );
}

// --- Fragen und aufloesen ----------------------------------------------------

function Guess({
  show,
  accent,
}: {
  show: Extract<KineticShow, { kind: 'guess' }>;
  accent: string;
}) {
  const hatAntwort = Boolean(show.answer && show.answer.trim());
  const p = useSharedValue(hatAntwort ? 0 : 1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!hatAntwort) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = reduceMotion ? 1 : withTiming(1, { duration: motion.slow });
  }, [hatAntwort, show.answer, p, reduceMotion]);

  const antwort = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ scale: 0.86 + 0.14 * p.value }],
  }));

  return (
    <View style={styles.guess}>
      <Text style={styles.guessQuestion} numberOfLines={3}>
        {show.question}
      </Text>
      {hatAntwort ? (
        <Animated.Text style={[styles.guessAnswer, { color: accent }, antwort]}>
          {show.answer}
        </Animated.Text>
      ) : (
        // Der offene Takt. Das Fragezeichen steht da, wo gleich die Antwort
        // steht - gleiche Groesse, gleiche Stelle, damit die Aufloesung
        // nicht springt, sondern einsetzt.
        <Text style={[styles.guessAnswer, styles.guessOpen]}>?</Text>
      )}
      {show.sub ? <Text style={styles.guessSub}>{show.sub}</Text> : null}
    </View>
  );
}

// --- Die Buehne --------------------------------------------------------------

export function KineticStage({
  show,
  previous,
  accent,
  cardSeed,
}: {
  show: KineticShow;
  /** Das Bild des vorigen Taktes - fuer "was ist neu?". */
  previous: KineticShow | null;
  accent: string;
  cardSeed: string;
}) {
  /**
   * Wechselt das Bild die Art oder die Identitaet, wird ueberblendet.
   * Bleibt es dasselbe Bild, laeuft die Bewegung INNERHALB weiter - dann
   * darf hier nichts blenden, sonst flackert die ganze Tabelle bei jeder
   * neuen Zeile.
   */
  const sameVisual =
    previous !== null &&
    previous.kind === show.kind &&
    ('id' in show && 'id' in previous ? show.id === previous.id : true);

  const fade = useSharedValue(sameVisual ? 1 : 0);
  const reduceMotion = useReducedMotion();
  const shown = useRef(show);
  shown.current = show;

  useEffect(() => {
    if (sameVisual) {
      fade.value = 1;
      return;
    }
    fade.value = 0;
    fade.value = reduceMotion ? 1 : withTiming(1, { duration: motion.base });
  }, [show, sameVisual, fade, reduceMotion]);

  const anim = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: 0.985 + 0.015 * fade.value }],
  }));

  return (
    <Animated.View style={[styles.stage, anim]}>
      {show.kind === 'statement' ? <Statement show={show} /> : null}
      {show.kind === 'table' ? (
        <Table show={show} previous={sameVisual ? previous : null} accent={accent} />
      ) : null}
      {show.kind === 'bars' ? <Bars show={show} accent={accent} /> : null}
      {show.kind === 'timeline' ? (
        <Timeline show={show} previous={sameVisual ? previous : null} accent={accent} />
      ) : null}
      {show.kind === 'quantity' ? (
        <Quantity show={show} previous={sameVisual ? previous : null} accent={accent} />
      ) : null}
      {show.kind === 'steps' ? (
        <Steps show={show} previous={sameVisual ? previous : null} accent={accent} />
      ) : null}
      {show.kind === 'compare' ? (
        <Compare show={show} previous={sameVisual ? previous : null} accent={accent} />
      ) : null}
      {show.kind === 'scale' ? <Scale show={show} accent={accent} /> : null}
      {show.kind === 'guess' ? <Guess show={show} accent={accent} /> : null}
      {show.kind === 'figure' ? (
        <View style={styles.figure}>
          <BlueprintVisual seed={show.seed ?? cardSeed} accentHex={accent} height={150} />
          {show.caption ? <Text style={styles.figureCaption}>{show.caption}</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { justifyContent: 'center' },

  statement: { gap: space.sm },
  statementText: {
    ...type.display,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1,
    color: color.ink.max,
  },
  statementSub: { ...type.deck, color: color.ink.mid },

  table: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  headRow: { borderBottomColor: color.ink.low, paddingBottom: 5 },
  headCell: {
    ...type.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.ink.low,
    flex: 1,
  },
  headRight: { textAlign: 'right' },
  cellLeft: { ...type.body, fontSize: 16, color: color.ink.high, flex: 1 },
  cellRight: {
    ...type.mono,
    fontSize: 16,
    color: color.ink.max,
    textAlign: 'right',
    flex: 1,
  },

  bars: { gap: space.lg },
  barBlock: { gap: 6 },
  barHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  barLabel: { ...type.body, fontSize: 15, color: color.ink.mid, flex: 1 },
  barValue: { ...type.mono, fontSize: 15, color: color.ink.high },
  barTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: color.ink.faint,
    overflow: 'hidden',
  },
  barFill: { borderRadius: radius.pill },

  // --- Zeitstrahl ---
  timeline: { position: 'relative' },
  tlAxis: {
    position: 'absolute',
    left: 4,
    top: 6,
    bottom: 6,
    width: StyleSheet.hairlineWidth,
    backgroundColor: color.ink.faint,
  },
  tlPoint: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  // Neun breit ab null heisst: die Mitte liegt bei 4,5 - also genau auf der
  // Achse bei 4. Wer eines von beiden verschiebt, muss das andere mitnehmen.
  tlDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.ink.mid },
  tlAt: { ...type.mono, fontSize: 14, color: color.ink.max, minWidth: 52 },
  tlTexts: { flex: 1 },
  tlLabel: { ...type.body, fontSize: 15, lineHeight: 20, color: color.ink.high },
  tlNote: { ...type.meta, color: color.ink.low },

  // --- Anteile ---
  quantity: { gap: space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  cellSlot: { padding: 2 },
  cell: { flex: 1, borderRadius: 2 },
  legend: { gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { ...type.body, fontSize: 15, color: color.ink.mid, flex: 1 },
  legendValue: { ...type.mono, fontSize: 15, color: color.ink.high },

  // --- Ablauf ---
  stepsWrap: { gap: 0 },
  step: { flexDirection: 'row', gap: space.md },
  stepRail: { alignItems: 'center', width: 26 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { ...type.mono, fontSize: 12, color: color.ink.mid },
  stepLine: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: color.ink.faint },
  stepTexts: { flex: 1, paddingBottom: space.lg, gap: 2 },
  stepLabel: { ...type.body, fontSize: 16, lineHeight: 22, color: color.ink.high },
  stepNote: { ...type.meta, color: color.ink.low },

  // --- Gegenueberstellung ---
  compare: { gap: 2 },
  cmpHead: {
    flexDirection: 'row',
    gap: space.sm,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.low,
  },
  cmpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.ink.faint,
  },
  // 44/28/28: die Beschriftung braucht mehr Platz als die Werte, weil dort
  // ganze Woerter stehen ("Monatliche Kosten") und rechts meist Zahlen.
  cmpLabel: { ...type.meta, color: color.ink.low, width: '44%' },
  cmpHeadCell: {
    ...type.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: color.ink.mid,
    width: '28%',
  },
  cmpCell: { ...type.body, fontSize: 15, lineHeight: 20, color: color.ink.high, width: '28%' },

  // --- Groessenordnungen ---
  scale: { gap: space.md },
  scaleBlock: { gap: 5 },
  scaleFactor: {
    ...type.mono,
    fontSize: 11,
    color: color.ink.low,
    marginLeft: space.sm,
  },
  scaleHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  scaleLabel: { ...type.body, fontSize: 15, color: color.ink.mid, flex: 1 },
  scaleValue: { ...type.mono, fontSize: 15, color: color.ink.high },
  scaleTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.ink.faint,
    overflow: 'hidden',
  },
  scaleFill: { borderRadius: radius.pill },

  // --- Fragen und aufloesen ---
  guess: { gap: space.md, alignItems: 'flex-start' },
  guessQuestion: { ...type.deck, color: color.ink.high },
  guessAnswer: {
    ...type.display,
    fontSize: 52,
    lineHeight: 58,
    letterSpacing: -1.5,
    color: color.ink.max,
  },
  guessOpen: { color: color.ink.faint },
  guessSub: { ...type.meta, color: color.ink.low },

  figure: { gap: space.md },
  figureCaption: { ...type.meta, color: color.ink.low },
});
