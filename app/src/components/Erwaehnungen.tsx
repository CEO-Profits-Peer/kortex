import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputSelectionChangeEventData,
  type TextStyle,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { haptics } from '@/lib/haptics';
import { personName } from '@/lib/name';
import { api } from '@/lib/supabase';
import type { PersonHit } from '@/lib/types.db';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * @name erwaehnen.
 *
 * Zwei Haelften:
 *   ErwaehnungsText  zeigt einen Text, in dem jedes @handle antippbar ist
 *   useErwaehnung    schlaegt beim Tippen von "@ab" passende Leute vor
 *
 * Gespeichert wird nur der Text selbst. Wer erwaehnt wurde, erfaehrt es aus
 * der Glocke (0086) - die Datenbank liest dieselbe Regel wie hier.
 *
 * Die Regel passt zu profiles.handle (a-z, 0-9, _, 3 bis 20 Zeichen). Davor
 * darf kein Buchstabe stehen, damit "mail@beispiel.at" keine Erwaehnung ist.
 */

const MUSTER = /(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{3,20})(?![a-zA-Z0-9_])/g;

export function ErwaehnungsText({
  text,
  style,
  numberOfLines,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const teile: React.ReactNode[] = [];
  let rest = 0;
  for (const m of text.matchAll(MUSTER)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > rest) teile.push(text.slice(rest, start));
    const handle = m[2].toLowerCase();
    teile.push(
      <Text
        key={`${start}-${handle}`}
        style={styles.link}
        suppressHighlighting
        onPress={(e) => {
          // Sonst oeffnet der Tipp zusaetzlich den Beitrag, in dem der Text steht.
          (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
          haptics.light();
          router.push(`/u/${encodeURIComponent(handle)}`);
        }}
      >
        @{m[2]}
      </Text>,
    );
    rest = start + 1 + m[2].length;
  }
  if (rest < text.length) teile.push(text.slice(rest));

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {teile}
    </Text>
  );
}

/** Steht der Cursor gerade hinter "@abc"? Dann Anfang und Suchwort. */
function offeneErwaehnung(text: string, cursor: number): { start: number; q: string } | null {
  const vor = text.slice(0, cursor);
  const m = /(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{1,20})$/.exec(vor);
  if (!m) return null;
  return { start: vor.length - m[2].length - 1, q: m[2] };
}

/**
 * Vorschlaege beim Tippen.
 *
 * Gibt zurueck, was an das Eingabefeld gehoert (onSelectionChange), und eine
 * Leiste, die ueber oder unter dem Feld steht. Ein Tipp auf eine Person
 * ersetzt "@ab" durch "@handle ".
 */
export function useErwaehnung(text: string, setText: (t: string) => void) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [treffer, setTreffer] = useState<PersonHit[]>([]);
  const warte = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ohne gemeldete Cursorposition (manche Browser melden sie erst beim
  // naechsten Tastendruck) gilt das Textende.
  const pos = cursor === null || cursor > text.length ? text.length : cursor;
  const offen = offeneErwaehnung(text, pos);

  useEffect(() => {
    if (warte.current) clearTimeout(warte.current);
    if (!offen) {
      setTreffer([]);
      return;
    }
    const q = offen.q;
    warte.current = setTimeout(() => {
      void api
        .searchPeople(q, 6)
        .then((r) => setTreffer(r.filter((p) => !p.is_me)))
        .catch(() => setTreffer([]));
    }, 180);
    return () => {
      if (warte.current) clearTimeout(warte.current);
    };
  }, [offen?.q, offen?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelectionChange = useCallback(
    (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => setCursor(e.nativeEvent.selection.end),
    [],
  );

  const waehlen = (p: PersonHit) => {
    if (!offen) return;
    haptics.select();
    const neu = `${text.slice(0, offen.start)}@${p.handle} ${text.slice(pos)}`;
    setText(neu);
    setCursor(offen.start + p.handle.length + 2);
    setTreffer([]);
  };

  const leiste =
    offen && treffer.length > 0 ? (
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.leiste}
      >
        {treffer.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => waehlen(p)}
            style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}
            accessibilityLabel={`@${p.handle} erwähnen`}
          >
            <Avatar seed={p.avatar_seed} path={p.avatar_path} size={24} />
            <Text style={styles.personName} numberOfLines={1}>
              {personName(p)}
            </Text>
            <Text style={styles.personHandle} numberOfLines={1}>
              @{p.handle}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    ) : null;

  return { onSelectionChange, leiste };
}

const styles = StyleSheet.create({
  link: { color: color.akzent, fontWeight: '600' },
  leiste: { gap: space.sm, paddingVertical: 2 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  personName: { ...type.body, fontSize: 13, color: color.ink.high, maxWidth: 120 },
  personHandle: { ...type.meta, fontSize: 10, color: color.ink.low, maxWidth: 110 },
});
