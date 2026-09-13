-- =============================================================================
-- 0070_reading_speed.sql  ·  Leseziel nach dem Tempo, in dem wirklich gelesen wird
--
-- Bisher galt eine Karte als gelesen nach Wortzahl / 3 Sekunden, hoechstens
-- 20 s. Drei Woerter pro Sekunde sind 180 Woerter pro Minute - das Tempo eines
-- langsamen Lesers. Uebliches stilles Lesen liegt bei Erwachsenen um 240.
--
-- Neu: Wortzahl / 4 Sekunden, hoechstens 15 s, mindestens weiterhin 4 s.
--
-- Was die Daten dazu sagen - und was nicht
-- ----------------------------------------
-- Angefangen hat es mit einer Zahl aus dem Kontrollzentrum: Verweildauer im
-- Median 7 s, Ziel 17 bis 20 s, nur 37 % gelesen. Das sah nach einer zu
-- strengen Schwelle aus. Nachgemessen am 2026-09-13 an 387 Karte-Konto-Paaren
-- ist es das nur zum kleinen Teil:
--
--   Text, geliked             2,4 Woerter/s   Verweildauer-Median 22,7 s
--   Text, nicht weggewischt   1,5 Woerter/s                       26,9 s
--   Text, weggewischt        12,5 Woerter/s                        4,3 s
--
-- Wer wirklich liest, braucht LAENGER als das alte Ziel. Der Median von 7 s
-- entsteht aus den Wischern, und die sind kein Lesen, egal wo die Schwelle
-- steht.
--
-- Durchgerechnet am selben Bestand:
--
--   3 W/s, max 20 s (bisher)   37,0 % gelesen   0 davon unter 6 s angesehen
--   4 W/s, max 15 s (neu)      39,5 %           1
--   5 W/s, max 12 s            44,2 %           1
--
-- Die neue Regel nimmt schnellen, echten Lesern die Wartezeit, ohne das
-- Ueberfliegen zu belohnen. Die Lesequote bewegt sie kaum - und das ist die
-- eigentliche Erkenntnis: der Hebel fuer mehr Lesen ist, dass weniger
-- weggewischt wird, nicht, dass Wischen als Lesen zaehlt. Schaerfer als 5 W/s
-- waere genau das.
--
-- Was sich NICHT rueckwirkend aendert: bereits vergebene Lese-Markierungen
-- bleiben, noch nicht vergebene werden beim naechsten Ereignis zu dieser
-- Karte neu geprueft (flush_events vergleicht jedes Mal mit dem aktuellen
-- Wert). XP werden also nicht nachtraeglich verteilt.
--
-- Die App liest den Wert mit jeder Karte vom Server (useDwellTracking.ts) -
-- sie folgt ohne eigene Aenderung.
--
-- Wie die Spalte geaendert wird
-- -----------------------------
-- `dwell_target_ms` ist eine berechnete, gespeicherte Spalte. Ab PostgreSQL 17
-- laesst sich der Ausdruck direkt ersetzen; davor nur ueber Loeschen und neu
-- Anlegen. Welche Version dieses Projekt hat, laesst sich von hier aus nicht
-- nachsehen - deshalb entscheidet der Block selbst. Loeschen ist ungefaehrlich:
-- keine Sicht und kein Index haengt an der Spalte, und die Funktionen, die sie
-- lesen, loesen den Namen erst beim Aufruf auf.
-- =============================================================================

do $umbau$
declare
  v_ausdruck constant text := 'greatest(4000, least(15000, (word_count * 1000) / 4))';
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'alter table public.content_items alter column dwell_target_ms set expression as ('
            || v_ausdruck || ')';
  else
    execute 'alter table public.content_items drop column dwell_target_ms';
    execute 'alter table public.content_items add column dwell_target_ms int generated always as ('
            || v_ausdruck || ') stored';
  end if;
end
$umbau$;

comment on column public.content_items.dwell_target_ms is
  'Leseziel: Wortzahl / 4 s (240 Woerter/min), 4 bis 15 s. Begruendung und Messung: Migration 0070.';

-- PostgREST merkt sich das Schema. Ohne Neuladen liefert die API die Spalte
-- im Fall "loeschen und neu anlegen" bis zum naechsten Neustart nicht mit.
notify pgrst, 'reload schema';
