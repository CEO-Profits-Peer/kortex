import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SectionTitle } from '@/components/SectionTitle';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Die Darstellung des Kontrollzentrums - ohne Netz, ohne Anmeldung.
 *
 * Absichtlich getrennt von app/admin.tsx: dort steckt das Holen und
 * Absichern, hier nur das Zeigen. Damit laesst sich die Seite in /atelier
 * mit erfundenen Zahlen ansehen, ohne sich als Admin anzumelden - sonst
 * waere die einzige Art, die Gestaltung zu pruefen, sie im Echtbetrieb
 * anzusehen.
 */

export type AdminData = {
  betrieb: {
    quellen_aktiv: number;
    quellen_mit_fehler: { id: string; fehler: string; zuletzt: string | null }[];
    quelle_am_laengsten_still: { id: string; zuletzt: string | null } | null;
    wartet_auf_freigabe: number;
    karten_24h: number;
    karten_7t: number;
    datenbank_bytes: number;
  };
  bestand: {
    freigegeben: number;
    wartend: number;
    abgelehnt: number;
    erklaerkarten: number;
    je_sprache: { sprache: string; karten: number; erklaerkarten: number }[];
    kategorien_leer: string[];
    kategorien_gross: { id: string; karten: number }[];
  };
  nutzung: {
    aktiv_15min: number;
    aktiv_24h: number;
    aktiv_7t: number;
    aktiv_30t: number;
    konten: number;
    konten_neu_7t: number;
    ereignisse_7t: { art: string; anzahl: number }[];
  };
  aufmerksamkeit: {
    paare: number;
    gelesen: number;
    geskippt: number;
    geliked: number;
    verweildauer_median_ms: number;
    verweildauer_p90_ms: number;
  };
  inhalt: {
    beliebt: { titel: string; likes: number; kategorie: string }[];
    weggewischt: { titel: string; anzahl: number; kategorie: string }[];
    lesequote_je_kategorie: { id: string; gesehen: number; gelesen: number }[];
    zu_leicht: number;
    zu_schwer: number;
  };
  stand: string;
};

/** Prozent, aber ohne Division durch null. */
function anteil(teil: number, ganz: number): string {
  if (!ganz) return '—';
  return `${Math.round((100 * teil) / ganz)} %`;
}

function sekunden(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)} s`;
  return `${(ms / 60_000).toFixed(1)} min`.replace('.', ',');
}

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(0)} MB`;
}

/** Eine Kennzahl. Gross die Zahl, klein was sie bedeutet. */
function Wert({
  zahl,
  label,
  ton,
}: {
  zahl: string | number;
  label: string;
  ton?: 'still' | 'signal' | 'warnung';
}) {
  const farbe =
    ton === 'signal' ? color.signal.primary
      : ton === 'warnung' ? color.signal.warn
        : color.ink.max;
  return (
    <View style={styles.wert}>
      <Text style={[styles.wertZahl, { color: farbe }]} numberOfLines={1}>
        {zahl}
      </Text>
      <Text style={styles.wertLabel}>{label}</Text>
    </View>
  );
}

/** Eine Zeile Liste: links was, rechts wie viel. */
function Zeile({ links, rechts, ton }: { links: string; rechts: string; ton?: 'signal' }) {
  return (
    <View style={styles.zeile}>
      <Text style={styles.zeileLinks} numberOfLines={1}>
        {links}
      </Text>
      <Text style={[styles.zeileRechts, ton === 'signal' && { color: color.signal.primary }]}>
        {rechts}
      </Text>
    </View>
  );
}

export function AdminOverview({ data }: { data: AdminData }) {
  const { betrieb, bestand, nutzung, aufmerksamkeit, inhalt } = data;

  return (
    <View style={styles.root}>
      {/* --- Betrieb: das Feld, das man morgens ansieht ------------------- */}
      <View style={styles.block}>
        <SectionTitle>Betrieb</SectionTitle>
        <View style={styles.werte}>
          <Wert zahl={betrieb.karten_24h} label="neue Karten heute" ton="signal" />
          <Wert zahl={betrieb.karten_7t} label="in 7 Tagen" />
          <Wert
            zahl={betrieb.wartet_auf_freigabe}
            label="wartet auf Freigabe"
            ton={betrieb.wartet_auf_freigabe > 0 ? 'warnung' : undefined}
          />
          <Wert zahl={betrieb.quellen_aktiv} label="aktive Quellen" />
        </View>

        {betrieb.quellen_mit_fehler.length > 0 ? (
          <View style={styles.liste}>
            {betrieb.quellen_mit_fehler.map((q) => (
              <Zeile key={q.id} links={q.id} rechts={q.fehler || 'Fehler'} />
            ))}
          </View>
        ) : (
          <Text style={styles.ruhig}>Keine Quelle meldet einen Fehler.</Text>
        )}

        <Text style={styles.fuss}>
          Datenbank {bytes(betrieb.datenbank_bytes)}
          {betrieb.quelle_am_laengsten_still
            ? ` · am längsten still: ${betrieb.quelle_am_laengsten_still.id}`
            : ''}
        </Text>
      </View>

      {/* --- Bestand ------------------------------------------------------ */}
      <View style={styles.block}>
        <SectionTitle>Bestand</SectionTitle>
        <View style={styles.werte}>
          <Wert zahl={bestand.freigegeben} label="freigegeben" />
          <Wert
            zahl={anteil(bestand.erklaerkarten, bestand.freigegeben)}
            label="Erklärkarten"
            ton="signal"
          />
          <Wert zahl={bestand.abgelehnt} label="abgelehnt" />
          <Wert
            zahl={bestand.kategorien_leer.length}
            label="Kategorien ohne Karte"
            ton={bestand.kategorien_leer.length > 0 ? 'warnung' : undefined}
          />
        </View>

        <View style={styles.liste}>
          {bestand.je_sprache.map((s) => (
            <Zeile
              key={s.sprache}
              links={s.sprache === 'de' ? 'Deutsch' : s.sprache === 'en' ? 'Englisch' : s.sprache}
              rechts={`${s.karten} · ${anteil(s.erklaerkarten, s.karten)} Specials`}
            />
          ))}
        </View>

        {bestand.kategorien_leer.length > 0 ? (
          <Text style={styles.fuss} numberOfLines={3}>
            leer: {bestand.kategorien_leer.join(', ')}
          </Text>
        ) : null}
      </View>

      {/* --- Nutzung ------------------------------------------------------ */}
      <View style={styles.block}>
        <SectionTitle>Nutzung</SectionTitle>
        <View style={styles.werte}>
          <Wert
            zahl={nutzung.aktiv_15min}
            label="gerade da"
            ton={nutzung.aktiv_15min > 0 ? 'signal' : undefined}
          />
          <Wert zahl={nutzung.aktiv_24h} label="heute" />
          <Wert zahl={nutzung.aktiv_7t} label="7 Tage" />
          <Wert zahl={nutzung.aktiv_30t} label="30 Tage" />
        </View>
        <View style={styles.liste}>
          <Zeile links="Konten insgesamt" rechts={String(nutzung.konten)} />
          <Zeile links="davon neu in 7 Tagen" rechts={String(nutzung.konten_neu_7t)} />
          {nutzung.ereignisse_7t.slice(0, 6).map((e) => (
            <Zeile key={e.art} links={e.art} rechts={String(e.anzahl)} />
          ))}
        </View>
        {/* "Gerade da" ist kein Präsenzsignal, sondern eine Zählung. Wer
            das nicht danebenschreibt, hält später drei stille Nutzer für
            einen Fehler. */}
        <Text style={styles.fuss}>
          „gerade da" = ein Ereignis in den letzten 15 Minuten. Eine echte
          Präsenzanzeige gibt es nicht.
        </Text>
      </View>

      {/* --- Aufmerksamkeit ----------------------------------------------- */}
      <View style={styles.block}>
        <SectionTitle>Aufmerksamkeit</SectionTitle>
        <View style={styles.werte}>
          <Wert
            zahl={anteil(aufmerksamkeit.gelesen, aufmerksamkeit.paare)}
            label="zu Ende gelesen"
          />
          <Wert
            zahl={anteil(aufmerksamkeit.geskippt, aufmerksamkeit.paare)}
            label="weggewischt"
          />
          <Wert zahl={anteil(aufmerksamkeit.geliked, aufmerksamkeit.paare)} label="geliked" />
          <Wert zahl={sekunden(aufmerksamkeit.verweildauer_median_ms)} label="Median je Karte" />
        </View>
        <Text style={styles.fuss}>
          Oberstes Zehntel ab {sekunden(aufmerksamkeit.verweildauer_p90_ms)} ·{' '}
          {aufmerksamkeit.paare} Karte-Konto-Paare
        </Text>
      </View>

      {/* --- Inhalt -------------------------------------------------------- */}
      <View style={styles.block}>
        <SectionTitle>Was gelesen wird</SectionTitle>
        <Text style={styles.unter}>Beliebt</Text>
        <View style={styles.liste}>
          {inhalt.beliebt.map((k) => (
            <Zeile key={k.titel} links={k.titel} rechts={`${k.likes}`} ton="signal" />
          ))}
        </View>

        <Text style={styles.unter}>Am häufigsten weggewischt</Text>
        <View style={styles.liste}>
          {inhalt.weggewischt.map((k) => (
            <Zeile key={k.titel} links={k.titel} rechts={`${k.anzahl}`} />
          ))}
        </View>

        <Text style={styles.unter}>Lesequote je Kategorie</Text>
        <View style={styles.liste}>
          {inhalt.lesequote_je_kategorie.map((k) => (
            <Zeile
              key={k.id}
              links={k.id}
              rechts={`${k.gelesen}/${k.gesehen} · ${anteil(k.gelesen, k.gesehen)}`}
            />
          ))}
        </View>

        <Text style={styles.fuss}>
          „zu leicht" {inhalt.zu_leicht} · „zu schwer" {inhalt.zu_schwer}
        </Text>
      </View>

      <Text style={styles.stand}>Stand {new Date(data.stand).toLocaleString('de-AT')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xl },
  block: { gap: space.md },

  werte: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  wert: {
    // Zwei je Zeile auf dem Telefon, vier auf einem breiten Schirm - ohne
    // Umbruchpunkte, einfach ueber die Mindestbreite.
    flexGrow: 1,
    flexBasis: 132,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.ink.faint,
    gap: 2,
  },
  wertZahl: { ...type.title, fontSize: 26, lineHeight: 32 },
  wertLabel: { ...type.meta, color: color.ink.low },

  liste: { gap: 1 },
  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 7,
  },
  zeileLinks: { ...type.body, fontSize: 14, color: color.ink.high, flex: 1 },
  zeileRechts: { ...type.mono, fontSize: 12, color: color.ink.mid },

  unter: { ...type.meta, color: color.ink.low, marginTop: space.sm },
  ruhig: { ...type.body, fontSize: 14, color: color.ink.mid },
  fuss: { ...type.meta, color: color.ink.low, lineHeight: 15 },
  stand: { ...type.meta, color: color.ink.faint, textAlign: 'center' },
});
