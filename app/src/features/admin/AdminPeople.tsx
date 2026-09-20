import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Laden } from '@/components/Laden';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { haptics } from '@/lib/haptics';
import { fehlerText } from '@/lib/fehler';
import { T, lokale } from '@/lib/sprache';
import { color, radius, space, type } from '@/theme/tokens';

import {
  Balken,
  Gruppe,
  Kennzahl,
  Marke,
  Verlauf,
  Zeile,
  anteil,
  sekunden,
  seit,
  zahl,
} from './parts';
import type { AdminPerson, AdminPersonHit } from './types';

/**
 * Personen suchen und ansehen.
 *
 * In 0064 stand: das Kontrollzentrum zeigt bewusst keine Einzelpersonen, und
 * wer das braucht, baut es als eigene Funktion mit eigener Begruendung. Die
 * Begruendung steht im Kopf von Migration 0068 - kurz: ohne das ist keine
 * Unterstuetzung moeglich, und die Alternative waere der service_role-
 * Schluessel, der jede Regel dieser Datenbank umgeht.
 *
 * Was hier NICHT steht, ist genauso wichtig: keine Kartentitel, keine
 * Kommentartexte. Statt einer Leseliste die VERTEILUNG der letzten hundert
 * gesehenen Karten. Damit laesst sich "warum sehe ich nur Politik" genauso
 * gut beantworten, ohne jemandem ueber die Schulter zu sehen.
 */
export function AdminPeople({
  suche,
  laden,
}: {
  /** Sucht Personen. Gibt der Bildschirm nicht selbst, weil die PIN oben liegt. */
  suche: (q: string) => Promise<AdminPersonHit[]>;
  laden: (handle: string) => Promise<AdminPerson>;
}) {
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState<AdminPersonHit[] | null>(null);
  const [person, setPerson] = useState<AdminPerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const suchen = useCallback(
    async (text: string) => {
      setBusy(true);
      setFehler(null);
      try {
        setTreffer(await suche(text));
      } catch (e) {
        setFehler(fehlerText(e, 'Suche ging nicht'));
        setTreffer([]);
      } finally {
        setBusy(false);
      }
    },
    [suche],
  );

  // Beim Oeffnen ohne Suchbegriff: die zuletzt Aktiven. Das ist der Fall, den
  // man aufmacht, wenn gerade jemand schreibt, dass etwas nicht geht.
  useEffect(() => {
    void suchen('');
  }, [suchen]);

  const oeffnen = useCallback(
    async (handle: string) => {
      haptics.light();
      setBusy(true);
      setFehler(null);
      try {
        setPerson(await laden(handle));
      } catch (e) {
        setFehler(fehlerText(e, 'Person nicht ladbar'));
      } finally {
        setBusy(false);
      }
    },
    [laden],
  );

  if (person) {
    return (
      <View style={styles.root}>
        <Pressable
          onPress={() => setPerson(null)}
          style={({ pressed }) => [styles.zurueck, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Icon name="back" size={14} color={color.ink.mid} />
          <Text style={styles.zurueckText}>{T('alle Personen')}</Text>
        </Pressable>
        <PersonDetail p={person} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.suchzeile}>
        <Icon name="search" size={15} color={color.ink.low} />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void suchen(q)}
          placeholder={T('@handle oder Name')}
          placeholderTextColor={color.ink.faint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.suchfeld}
        />
        {q ? (
          <Pressable
            onPress={() => {
              setQ('');
              void suchen('');
            }}
            hitSlop={8}
          >
            <Icon name="close" size={14} color={color.ink.low} />
          </Pressable>
        ) : null}
      </View>

      {fehler ? <Text style={styles.fehler}>{fehler}</Text> : null}

      <Gruppe titel={q ? `Treffer für „${q}"` : 'zuletzt aktiv'}>
        {busy && !treffer ? (
          <Laden color={color.signal.primary} style={{ paddingVertical: space.xl }} />
        ) : treffer && treffer.length === 0 ? (
          <Text style={styles.leer}>Niemand gefunden.</Text>
        ) : (
          (treffer ?? []).map((p) => (
            <Pressable
              key={p.handle}
              onPress={() => void oeffnen(p.handle)}
              style={({ pressed }) => [styles.trefferZeile, pressed && { opacity: 0.7 }]}
            >
              <Avatar seed={p.avatar_seed} path={p.avatar_path} size={34} />
              <View style={styles.trefferText}>
                <View style={styles.trefferKopf}>
                  <Text style={styles.trefferName} numberOfLines={1}>
                    {p.name || p.handle}
                  </Text>
                  {p.ist_admin ? <Marke text="ADMIN" ton="signal" /> : null}
                  {p.plan && p.plan !== 'free' ? (
                    <Marke text={p.plan.toUpperCase()} ton="mastery" />
                  ) : null}
                </View>
                <Text style={styles.trefferMeta} numberOfLines={1}>
                  @{p.handle} · {p.land ?? '–'} · {p.sprache.toUpperCase()} · aktiv{' '}
                  {seit(p.zuletzt)}
                </Text>
              </View>
              <View style={styles.trefferZahlen}>
                <Text style={styles.trefferXp}>{zahl(p.xp)}</Text>
                <Text style={styles.trefferMeta}>XP</Text>
              </View>
            </Pressable>
          ))
        )}
      </Gruppe>
    </View>
  );
}

function PersonDetail({ p }: { p: AdminPerson }) {
  const { person, lernen, aufmerksamkeit, aktivitaet, sicht, sozial } = p;
  const maxGewicht = Math.max(1, ...sicht.interessen.map((i) => Number(i.gewicht)));
  const maxSicht = Math.max(1, ...sicht.letzte_100.map((i) => i.anzahl));

  return (
    <View style={{ gap: space.xl }}>
      {/* --- Wer ---------------------------------------------------------- */}
      <View style={styles.kopf}>
        <Avatar seed={person.avatar_seed} path={person.avatar_path} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.trefferKopf}>
            <Text style={styles.name} numberOfLines={1}>
              {person.name || person.handle}
            </Text>
            {person.ist_admin ? <Marke text="ADMIN" ton="signal" /> : null}
            {person.plan && person.plan !== 'free' ? (
              <Marke text={person.plan.toUpperCase()} ton="mastery" />
            ) : null}
          </View>
          <Text style={styles.handle}>@{person.handle}</Text>
          <Text style={styles.meta}>
            seit {new Date(person.seit).toLocaleDateString(lokale())} · zuletzt{' '}
            {seit(person.zuletzt)}
          </Text>
        </View>
      </View>

      {person.bio ? <Text style={styles.bio}>{person.bio}</Text> : null}

      {/* --- Verlauf ------------------------------------------------------ */}
      <Gruppe
        titel={T('30 Tage')}
        rechts={<Marke text={`${aktivitaet.tage_30} aktive Tage`} ton={
          aktivitaet.tage_30 > 7 ? 'gut' : aktivitaet.tage_30 > 1 ? 'still' : 'warnung'
        } />}
      >
        <Verlauf tage={aktivitaet.tage} />
        <Text style={styles.fuss}>
          letztes Ereignis {seit(aktivitaet.letztes_ereignis)}
          {aktivitaet.ereignisse_30.length > 0
            ? ` · ${aktivitaet.ereignisse_30
                .slice(0, 4)
                .map((e) => `${e.art} ${e.anzahl}`)
                .join(' · ')}`
            : ''}
        </Text>
      </Gruppe>

      {/* --- Lernen ------------------------------------------------------- */}
      <Gruppe titel={T('Lernstand')}>
        <View style={styles.raster}>
          <Kennzahl wert={zahl(lernen.xp)} label={T('XP')} ton="signal" />
          <Kennzahl wert={zahl(lernen.mastery)} label={T('Mastery')} ton="mastery" />
          <Kennzahl
            wert={lernen.streak}
            label={`Streak (best ${lernen.streak_best})`}
            ton={lernen.streak > 0 ? 'warnung' : 'still'}
          />
          <Kennzahl wert={zahl(lernen.gelesen)} label={T('Karten gelesen')} />
          <Kennzahl
            wert={`${Math.round(lernen.fokus_sekunden / 60)}m`}
            label={T('Fokuszeit gesamt')}
          />
          <Kennzahl
            wert={lernen.wiederholungen_faellig}
            label={T('Wiederholungen fällig')}
            ton={lernen.wiederholungen_faellig > 0 ? 'warnung' : 'still'}
          />
        </View>
      </Gruppe>

      {/* --- Aufmerksamkeit ------------------------------------------------ */}
      <Gruppe titel={T('Aufmerksamkeit')}>
        <View style={styles.raster}>
          <Kennzahl
            wert={anteil(aufmerksamkeit.gelesen, aufmerksamkeit.paare)}
            label={T('zu Ende gelesen')}
          />
          <Kennzahl
            wert={anteil(aufmerksamkeit.geskippt, aufmerksamkeit.paare)}
            label={T('weggewischt')}
          />
          <Kennzahl
            wert={anteil(aufmerksamkeit.geliked, aufmerksamkeit.paare)}
            label={T('geliked')}
            ton="signal"
          />
          <Kennzahl
            wert={sekunden(aufmerksamkeit.verweildauer_median_ms)}
            label={T('Median je Karte')}
          />
        </View>
        <Text style={styles.fuss}>{zahl(aufmerksamkeit.paare)} gesehene Karten insgesamt</Text>
      </Gruppe>

      {/* --- Was diese Person sieht ---------------------------------------- */}
      <Gruppe titel={T('Feed')}>
        <View style={styles.raster}>
          <Kennzahl wert={`${person.englisch_pct} %`} label={T('Englisch im Feed')} />
          <Kennzahl wert={person.sprache.toUpperCase()} label={T('Oberfläche')} />
          <Kennzahl wert={person.region ?? person.land ?? '–'} label={T('Region')} />
          <Kennzahl wert={person.tagesziel} label={T('Tagesziel')} />
        </View>

        <Text style={styles.unter}>Interessen</Text>
        {sicht.interessen.map((i) => (
          <View key={i.id} style={{ gap: 2, paddingBottom: 4 }}>
            <Zeile
              links={i.name}
              unter={i.gewaehlt ? 'im Onboarding gewählt' : 'abgeleitet'}
              rechts={`${Number(i.gewicht).toFixed(2)}  ·  L${i.level}`}
            />
            <Balken
              anteil={Number(i.gewicht) / maxGewicht}
              hoehe={2}
              farbe={i.gewaehlt ? color.signal.primary : color.ink.mid}
            />
          </View>
        ))}

        <Text style={styles.unter}>{T('Letzte 100 gesehene Karten')}</Text>
        {sicht.letzte_100.map((k) => (
          <View key={k.id} style={{ gap: 2, paddingBottom: 4 }}>
            <Zeile
              links={k.id}
              rechts={`${k.anzahl}  ·  ${k.anzahl - k.sprache_de} EN`}
            />
            <Balken anteil={k.anzahl / maxSicht} hoehe={2} farbe={color.ink.mid} />
          </View>
        ))}
        {/* Absichtlich keine Kartentitel - siehe Kopf und Migration 0068. */}
        <Text style={styles.fuss}>{T('Verteilung, keine Leseliste. Welche Karten das waren, steht hier bewusst nicht.')}</Text>
      </Gruppe>

      {/* --- Sozial -------------------------------------------------------- */}
      <Gruppe titel={T('Sozial')}>
        <View style={styles.raster}>
          <Kennzahl wert={sozial.follower} label={T('Follower')} />
          <Kennzahl wert={sozial.folgt} label={T('folgt')} />
          <Kennzahl wert={sozial.reposts} label={T('Empfehlungen')} />
          <Kennzahl wert={sozial.kommentare} label={T('Kommentare')} />
        </View>
        <Text style={styles.fuss}>
          Rangliste {person.rangliste ? 'sichtbar' : 'ausgeblendet'} · Jahrgang{' '}
          {person.jahrgang ?? '–'} · Onboarding{' '}
          {person.onboarding ? 'fertig' : 'offen'}
        </Text>
      </Gruppe>

      <Text style={styles.stand}>Stand {new Date(p.stand).toLocaleString(lokale())}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.lg },

  suchzeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    height: 42,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    backgroundColor: color.bgElevated,
  },
  suchfeld: { flex: 1, ...type.body, fontSize: 14, color: color.ink.max },

  trefferZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  trefferText: { flex: 1, gap: 2 },
  trefferKopf: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trefferName: { ...type.body, fontSize: 14.5, lineHeight: 19, color: color.ink.max, flexShrink: 1 },
  trefferMeta: { ...type.meta, fontSize: 8.5, color: color.ink.faint },
  trefferZahlen: { alignItems: 'flex-end' },
  trefferXp: { ...type.mono, fontSize: 13, color: color.signal.primary },

  zurueck: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zurueckText: { ...type.meta, fontSize: 9.5, color: color.ink.mid },

  kopf: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { ...type.title, fontSize: 19, lineHeight: 24, color: color.ink.max, flexShrink: 1 },
  handle: { ...type.mono, fontSize: 12, color: color.ink.mid },
  meta: { ...type.meta, fontSize: 9, color: color.ink.faint },
  bio: { ...type.body, fontSize: 13.5, lineHeight: 19, color: color.ink.high },

  raster: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md },

  unter: { ...type.meta, fontSize: 9, color: color.ink.low, paddingTop: space.sm },
  fuss: { ...type.meta, fontSize: 9, color: color.ink.faint, lineHeight: 14 },
  leer: { ...type.body, fontSize: 14, color: color.ink.mid },
  fehler: { ...type.body, fontSize: 13, color: color.signal.error },
  stand: { ...type.meta, fontSize: 9, color: color.ink.faint, textAlign: 'center' },
});
