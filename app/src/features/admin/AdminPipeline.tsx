import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { color, space, type } from '@/theme/tokens';

import { Gross, Gruppe, Marke, Verlauf, Zeile, seit, zahl, type Ton } from './parts';
import type { AdminRun, AdminRuns } from './types';

/**
 * Die Pipeline - warum an einem Tag 22 Karten kommen und am naechsten 157.
 *
 * Entstanden, weil genau diese Frage am 2026-09-13 nur mit Raten zu
 * beantworten war: die Protokolle stehen bei GitHub hinter einer Anmeldung.
 * Jetzt schreibt jeder Lauf seine Bilanz in die Datenbank (Migration 0074).
 *
 * Die wichtigste Spalte ist nicht "Karten", sondern "warum aufgehoert".
 * Neun Karten nach "Kontingent leer" sind ein ruhiger Tag; neun Karten nach
 * "alles abgearbeitet" heissen, dass die Quellen nichts Neues hatten; neun
 * nach "abgestürzt" sind ein Fehler.
 */

// Der Zeitplan in ingest.yml ("17 */3 * * *"): acht Laeufe am Tag. Als
// Zeilenkommentar, weil das */ im Ausdruck einen Blockkommentar beendet.
const LAEUFE_JE_TAG = 8;

const STOPP: Record<string, { text: string; ton?: Ton }> = {
  durch: { text: 'alles abgearbeitet', ton: 'gut' },
  zeit: { text: 'Zeit um' },
  aufrufe: { text: 'Aufrufdeckel erreicht' },
  artikel: { text: 'Artikeldeckel erreicht' },
  limit: { text: 'Grenze erreicht' },
  ziel: { text: 'Ziel erreicht', ton: 'gut' },
  nichts_offen: { text: 'nichts offen', ton: 'gut' },
  nur_entdecken: { text: 'nur Themensuche' },
  kontingent: { text: 'Kontingent leer', ton: 'warnung' },
  gemini_fehler: { text: 'Gemini-Fehler', ton: 'warnung' },
  absturz: { text: 'abgestürzt', ton: 'warnung' },
  abgeschossen: { text: 'abgeschossen', ton: 'warnung' },
  fehler: { text: 'Fehler', ton: 'warnung' },
};

const SKRIPT: Record<string, string> = {
  ingest: 'Nachrichten',
  evergreen: 'Wissen',
  backfill: 'Erklärkarten',
  kurse: 'Kurse',
};

const AUSLOESER: Record<string, string> = {
  schedule: 'geplant (GitHub)',
  // Vom Cloudflare Worker angestossen (workers/ingest-anstoss, 0079).
  zeitplan: 'geplant',
  workflow_dispatch: 'von Hand',
  lokal: 'lokal',
};

/** Wie viele geplante Laeufe es heute (UTC) bis jetzt haette geben sollen. */
function erwartetHeute(jetzt = new Date()): number {
  const minuten = jetzt.getUTCHours() * 60 + jetzt.getUTCMinutes();
  if (minuten < 17) return 0;
  return Math.min(LAEUFE_JE_TAG, Math.floor((minuten - 17) / 180) + 1);
}

function uhrzeit(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Die drei Skripte eines Workflow-Laufs gehoeren zusammen. */
function durchgaenge(laeufe: AdminRun[]): AdminRun[][] {
  const gruppen = new Map<string, AdminRun[]>();
  for (const l of laeufe) {
    const k = l.github_run_id ? `gh${l.github_run_id}` : `id${l.id}`;
    const g = gruppen.get(k);
    if (g) g.push(l);
    else gruppen.set(k, [l]);
  }
  const reihenfolge = ['ingest', 'evergreen', 'kurse', 'backfill'];
  return [...gruppen.values()].map((g) =>
    g.sort((a, b) => reihenfolge.indexOf(a.skript) - reihenfolge.indexOf(b.skript)),
  );
}

function statusVon(l: AdminRun): { text: string; ton?: Ton } {
  if (l.status === 'laeuft') return { text: 'läuft gerade', ton: 'signal' };
  if (l.status === 'abgebrochen') return { text: 'ohne Abschluss', ton: 'warnung' };
  return STOPP[l.stopp ?? ''] ?? { text: l.stopp ?? l.status };
}

export function AdminPipeline({ data }: { data: AdminRuns }) {
  const heute = data.tage[0];
  const erwartet = erwartetHeute();
  const gruppen = durchgaenge(data.laeufe).slice(0, 25);

  return (
    <View style={styles.root}>
      <View style={styles.kopf}>
        <Gross
          wert={heute?.karten_db ?? 0}
          label="Karten heute"
          ton={(heute?.karten_db ?? 0) > 0 ? 'gut' : 'warnung'}
          fuss="UTC-Tag"
        />
        <View style={styles.kopfLinie} />
        <Gross
          wert={`${heute?.geplant ?? 0}/${erwartet}`}
          label="geplante Läufe"
          ton={(heute?.geplant ?? 0) < erwartet ? 'warnung' : 'gut'}
          fuss="bisher heute"
        />
        <View style={styles.kopfLinie} />
        <Gross
          wert={data.laeufe[0] ? seit(data.laeufe[0].gestartet_at) : '—'}
          label="letzter Lauf"
          fuss={data.laeufe[0] ? AUSLOESER[data.laeufe[0].ausloeser] ?? data.laeufe[0].ausloeser : undefined}
        />
      </View>

      <Gruppe titel="14 Tage">
        <Verlauf tage={[...data.tage].reverse().map((t) => ({ tag: t.tag, anzahl: t.karten_db }))} />
        <View>
          {data.tage.map((t) => {
            const teile = [
              `${t.geplant} von ${LAEUFE_JE_TAG} geplant`,
              t.aufrufe ? `${zahl(t.aufrufe)} Aufrufe` : null,
              t.kontingent_leer ? 'Kontingent leer' : null,
              t.fehler ? `${t.fehler} Fehler` : null,
            ].filter(Boolean);
            return (
              <Zeile
                key={t.tag}
                links={new Date(t.tag).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                unter={t.laeufe > 0 ? teile.join(' · ') : 'keine Bilanz'}
                rechts={`${t.karten_db} Karten`}
                ton={t.fehler > 0 ? 'warnung' : t.karten_db > 0 ? undefined : 'warnung'}
              />
            );
          })}
        </View>
        <Text style={styles.fuss}>
          Karten aus der Datenbank gezählt, nicht aus den Bilanzen – für Tage vor 0074 gibt es
          keine Bilanz, und ein abgeschossener Lauf kann geschrieben haben, ohne es zu melden.
        </Text>
      </Gruppe>

      <Gruppe titel="Durchgänge">
        {gruppen.length === 0 ? (
          <Text style={styles.fuss}>
            Noch keine Bilanz. Ab dem nächsten Lauf schreibt jedes Skript hier mit.
          </Text>
        ) : (
          gruppen.map((g) => {
            const erster = g[0];
            const karten = g.reduce((n, l) => n + (l.trockenlauf ? 0 : l.karten), 0);
            return (
              <View key={`${erster.github_run_id ?? 'id'}-${erster.id}`} style={styles.durchgang}>
                <View style={styles.durchgangKopf}>
                  <Text style={styles.durchgangZeit}>{uhrzeit(erster.gestartet_at)}</Text>
                  <Marke text={AUSLOESER[erster.ausloeser] ?? erster.ausloeser} />
                  {erster.trockenlauf ? <Marke text="Trockenlauf" /> : null}
                  <View style={{ flex: 1 }} />
                  <Text style={styles.durchgangKarten}>{karten} Karten</Text>
                </View>
                {g.map((l) => {
                  const s = statusVon(l);
                  const unter = [
                    `${l.gemini_aufrufe} Aufrufe`,
                    l.wiederholungen ? `${l.wiederholungen} Wiederholungen` : null,
                    l.modell ? `${l.modell}${l.schluessel ? ` · Schlüssel ${l.schluessel}` : ''}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <View key={l.id}>
                      <Zeile
                        links={`${SKRIPT[l.skript] ?? l.skript} · ${l.karten}`}
                        unter={unter}
                        rechts={s.text}
                        ton={s.ton}
                      />
                      {l.fehler ? (
                        <Text style={styles.fehler} numberOfLines={3}>
                          {l.fehler}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </Gruppe>

      <Text style={styles.stand}>Stand {new Date(data.stand).toLocaleString('de-AT')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xl },

  kopf: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  kopfLinie: { width: StyleSheet.hairlineWidth, height: 40, backgroundColor: color.ink.faint },

  durchgang: { gap: 2, paddingBottom: space.sm },
  durchgangKopf: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.xs },
  durchgangZeit: { ...type.mono, fontSize: 12, color: color.ink.high },
  durchgangKarten: { ...type.mono, fontSize: 12, color: color.ink.mid },

  fehler: { ...type.meta, fontSize: 9, lineHeight: 13, color: color.signal.warn, paddingBottom: 4 },
  fuss: { ...type.meta, fontSize: 9, color: color.ink.faint, lineHeight: 14 },
  stand: { ...type.meta, fontSize: 9, color: color.ink.faint, textAlign: 'center' },
});
