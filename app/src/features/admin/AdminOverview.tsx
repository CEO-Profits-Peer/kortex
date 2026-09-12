import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';

import {
  Balken,
  Doppelbalken,
  Gross,
  Gruppe,
  Kennzahl,
  Marke,
  Zeile,
  anteil,
  bytes,
  sekunden,
  seit,
  zahl,
} from './parts';
import type { AdminData } from './types';

/**
 * Die Uebersicht - was man morgens ansieht.
 *
 * Absichtlich getrennt vom Holen und Absichern (app/admin.tsx): damit laesst
 * sich die Seite in /atelier mit erfundenen Zahlen ansehen, ohne sich als
 * Admin anzumelden. Eine Gestaltung, die man nur im Echtbetrieb sehen kann,
 * wird nicht gestaltet, sondern vermutet.
 *
 * Aufbau: drei grosse Zahlen oben, danach Nachschlagewerk. Die erste Fassung
 * hatte zwanzig gleich grosse Kennzahlen in zwanzig Kaesten - man musste
 * jedes Mal von vorn suchen. Eine Uebersicht ohne Rangfolge ist keine.
 */
export function AdminOverview({ data }: { data: AdminData }) {
  const { betrieb, bestand, nutzung, aufmerksamkeit, inhalt } = data;

  const de = bestand.je_sprache.find((s) => s.sprache === 'de')?.karten ?? 0;
  const en = bestand.je_sprache.find((s) => s.sprache === 'en')?.karten ?? 0;

  return (
    <View style={styles.root}>
      {/* --- Die drei, um die es geht ------------------------------------- */}
      <View style={styles.kopf}>
        <Gross
          wert={nutzung.aktiv_15min}
          label="gerade da"
          ton={nutzung.aktiv_15min > 0 ? 'signal' : 'still'}
          fuss="15 min"
        />
        <View style={styles.kopfLinie} />
        <Gross wert={nutzung.aktiv_24h} label="heute aktiv" fuss={`${nutzung.konten} Konten`} />
        <View style={styles.kopfLinie} />
        <Gross
          wert={betrieb.karten_24h}
          label="neue Karten"
          ton={betrieb.karten_24h > 0 ? 'gut' : 'warnung'}
          fuss={`${betrieb.karten_7t} in 7 Tagen`}
        />
      </View>

      {/* --- Betrieb ------------------------------------------------------- */}
      <Gruppe
        titel="Betrieb"
        rechts={
          betrieb.quellen_mit_fehler.length > 0 ? (
            <Marke text={`${betrieb.quellen_mit_fehler.length} Fehler`} ton="warnung" />
          ) : (
            <Marke text="ruhig" ton="gut" />
          )
        }
      >
        <View style={styles.raster}>
          <Kennzahl wert={betrieb.quellen_aktiv} label="aktive Quellen" />
          <Kennzahl
            wert={betrieb.wartet_auf_freigabe}
            label="wartet auf Freigabe"
            ton={betrieb.wartet_auf_freigabe > 0 ? 'warnung' : 'still'}
          />
          <Kennzahl wert={bytes(betrieb.datenbank_bytes)} label="Datenbank" />
          <Kennzahl
            wert={seit(betrieb.quelle_am_laengsten_still?.zuletzt)}
            label={betrieb.quelle_am_laengsten_still?.id ?? 'still'}
          />
        </View>

        {betrieb.quellen_mit_fehler.length > 0 ? (
          <View>
            {betrieb.quellen_mit_fehler.map((q) => (
              <Zeile key={q.id} links={q.id} rechts={q.fehler || 'Fehler'} ton="warnung" />
            ))}
          </View>
        ) : null}
      </Gruppe>

      {/* --- Bestand ------------------------------------------------------- */}
      <Gruppe titel="Bestand">
        <View style={styles.raster}>
          <Kennzahl wert={zahl(bestand.freigegeben)} label="freigegeben" />
          <Kennzahl
            wert={anteil(bestand.erklaerkarten, bestand.freigegeben)}
            label="Erklärkarten"
            ton="signal"
          />
          <Kennzahl wert={zahl(bestand.abgelehnt)} label="abgelehnt" />
          <Kennzahl
            wert={bestand.kategorien_leer.length}
            label="Kategorien leer"
            ton={bestand.kategorien_leer.length > 0 ? 'warnung' : 'gut'}
          />
        </View>

        <View style={styles.sprache}>
          <View style={styles.spracheKopf}>
            <Text style={styles.spracheText}>
              Deutsch <Text style={styles.spracheZahl}>{zahl(de)}</Text>
            </Text>
            <Text style={styles.spracheText}>
              <Text style={[styles.spracheZahl, { color: color.signal.primary }]}>{zahl(en)}</Text>{' '}
              Englisch
            </Text>
          </View>
          <Doppelbalken links={de} rechts={en} />
          <Text style={styles.fuss}>
            {anteil(en, de + en)} Englisch im Bestand · Ziel 50 %
          </Text>
        </View>

        {bestand.kategorien_leer.length > 0 ? (
          <Text style={styles.fuss} numberOfLines={3}>
            leer: {bestand.kategorien_leer.join(', ')}
          </Text>
        ) : null}
      </Gruppe>

      {/* --- Nutzung ------------------------------------------------------- */}
      <Gruppe titel="Nutzung">
        <View style={styles.raster}>
          <Kennzahl wert={nutzung.aktiv_24h} label="24 Stunden" />
          <Kennzahl wert={nutzung.aktiv_7t} label="7 Tage" />
          <Kennzahl wert={nutzung.aktiv_30t} label="30 Tage" />
          <Kennzahl
            wert={nutzung.konten_neu_7t}
            label="neue Konten (7 T)"
            ton={nutzung.konten_neu_7t > 0 ? 'gut' : 'still'}
          />
        </View>

        <View>
          {nutzung.ereignisse_7t.slice(0, 6).map((e) => {
            const max = Math.max(1, ...nutzung.ereignisse_7t.map((x) => x.anzahl));
            return (
              <View key={e.art} style={styles.ereignis}>
                <Zeile links={e.art} rechts={zahl(e.anzahl)} />
                <Balken anteil={e.anzahl / max} hoehe={2} farbe={color.ink.mid} />
              </View>
            );
          })}
        </View>

        {/* "Gerade da" ist kein Präsenzsignal, sondern eine Zählung. Wer das
            nicht danebenschreibt, hält später drei stille Nutzer für einen
            Fehler. */}
        <Text style={styles.fuss}>
          „gerade da" = ein Ereignis in den letzten 15 Minuten. Eine echte
          Präsenzanzeige gibt es nicht.
        </Text>
      </Gruppe>

      {/* --- Aufmerksamkeit ------------------------------------------------- */}
      <Gruppe titel="Aufmerksamkeit">
        <View style={styles.raster}>
          <Kennzahl
            wert={anteil(aufmerksamkeit.gelesen, aufmerksamkeit.paare)}
            label="zu Ende gelesen"
            ton={
              aufmerksamkeit.gelesen / Math.max(1, aufmerksamkeit.paare) < 0.3
                ? 'warnung'
                : 'gut'
            }
          />
          <Kennzahl
            wert={anteil(aufmerksamkeit.geskippt, aufmerksamkeit.paare)}
            label="weggewischt"
          />
          <Kennzahl
            wert={anteil(aufmerksamkeit.geliked, aufmerksamkeit.paare)}
            label="geliked"
            ton="signal"
          />
          <Kennzahl
            wert={sekunden(aufmerksamkeit.verweildauer_median_ms)}
            label="Median je Karte"
          />
        </View>
        <Balken
          anteil={aufmerksamkeit.gelesen / Math.max(1, aufmerksamkeit.paare)}
          farbe={color.signal.success}
        />
        <Text style={styles.fuss}>
          Oberstes Zehntel ab {sekunden(aufmerksamkeit.verweildauer_p90_ms)} ·{' '}
          {zahl(aufmerksamkeit.paare)} Karte-Konto-Paare
        </Text>
      </Gruppe>

      {/* --- Inhalt --------------------------------------------------------- */}
      <Gruppe titel="Was gelesen wird">
        {inhalt.beliebt.length > 0 ? (
          <View>
            {inhalt.beliebt.map((k) => (
              <Zeile
                key={k.titel}
                links={k.titel}
                unter={k.kategorie}
                rechts={`${k.likes} ♥`}
                ton="signal"
              />
            ))}
          </View>
        ) : (
          <Text style={styles.fuss}>Noch kein einziger Like. Zu früh für diese Liste.</Text>
        )}

        {inhalt.weggewischt.length > 0 ? (
          <>
            <Text style={styles.unter}>Am häufigsten weggewischt</Text>
            {inhalt.weggewischt.map((k) => (
              <Zeile key={k.titel} links={k.titel} unter={k.kategorie} rechts={`${k.anzahl}×`} />
            ))}
          </>
        ) : null}

        <Text style={styles.fuss}>
          „zu leicht" {inhalt.zu_leicht} · „zu schwer" {inhalt.zu_schwer}
        </Text>
      </Gruppe>

      <Text style={styles.stand}>Stand {new Date(data.stand).toLocaleString('de-AT')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xl },

  kopf: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  kopfLinie: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: color.ink.faint },

  raster: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 0 },

  sprache: { gap: 6, paddingTop: space.xs },
  spracheKopf: { flexDirection: 'row', justifyContent: 'space-between' },
  spracheText: { ...type.meta, fontSize: 9.5, color: color.ink.low },
  spracheZahl: { ...type.mono, fontSize: 12, color: color.ink.high },

  ereignis: { gap: 2, paddingBottom: 4 },

  unter: { ...type.meta, fontSize: 9, color: color.ink.low, paddingTop: space.sm },
  fuss: { ...type.meta, fontSize: 9, color: color.ink.faint, lineHeight: 14 },
  stand: { ...type.meta, fontSize: 9, color: color.ink.faint, textAlign: 'center' },
});
