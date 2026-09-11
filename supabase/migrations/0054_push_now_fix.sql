-- =============================================================================
-- 0054_push_now_fix.sql  ·  pg_net liegt woanders, als ich angenommen habe
--
-- Der Fehler
-- ----------
-- 0053 rief `extensions.net.http_post(...)` auf. Das ist in PostgreSQL
-- ein DREITEILIGER Name und bedeutet Datenbank `extensions`, Schema
-- `net` - nicht "Schema extensions, Unterschema net", das gibt es nicht.
-- Der Aufruf konnte also gar nicht funktionieren.
--
-- Gemerkt habe ich es nicht sofort, und das ist der lehrreiche Teil: der
-- Aufruf steht in einem `exception when others` (damit ein klemmender
-- Push niemanden am Folgen hindert). Der Block hat den Fehler
-- geschluckt und als `raise warning` abgelegt, wo ihn niemand liest.
-- Sichtbar wurde es erst daran, dass `sent_at` nach zwoelf Sekunden
-- immer noch leer war.
--
-- Die Behebung
-- ------------
-- Nicht raten, nachsehen. Wo pg_net seine Funktionen ablegt, haengt
-- davon ab, wie die Erweiterung installiert wurde - auf Supabase
-- ueblicherweise im Schema `net`, bei einer Installation mit
-- `with schema extensions` eben dort. Statt einen der beiden Namen fest
-- einzutragen und beim naechsten Mal wieder danebenzuliegen, wird das
-- Schema zur Laufzeit aus dem Katalog geholt.
--
-- Und der geschluckte Fehler bekommt eine Spur: gibt es http_post gar
-- nicht, steht das als Warnung mit klarem Text da, statt als leeres
-- Nichts.
-- =============================================================================

create or replace function public.notify_push_now()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_schema text;
begin
  -- Wo liegt http_post? Einmal nachschlagen statt zweimal raten.
  select n.nspname
    into v_schema
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'http_post'
   order by (n.nspname = 'net') desc
   limit 1;

  if v_schema is null then
    raise warning 'notify_push_now: pg_net ist nicht installiert - '
                  'Benachrichtigungen warten auf pipeline/push.py';
    return null;
  end if;

  begin
    execute format(
      'select %I.http_post(url := $1, body := $2, headers := $3, '
      'timeout_milliseconds := $4)', v_schema
    )
    using
      'https://fjnljjsgdigrbsqoewvi.supabase.co/functions/v1/push',
      '{}'::jsonb,
      '{"Content-Type": "application/json"}'::jsonb,
      4000;
  exception when others then
    -- Bleibt geschluckt, damit ein klemmender Push niemanden am Folgen
    -- hindert. Aber mit Text: eine stille Warnung, die nur "etwas ging
    -- schief" sagt, hat mich schon einmal eine Runde gekostet.
    raise warning 'notify_push_now: Aufruf ueber Schema % fehlgeschlagen: %',
                  v_schema, sqlerrm;
  end;

  return null;
end
$fn$;


-- --- Nachsehen, ob es jetzt geht --------------------------------------------
--
-- Gibt zurueck, was die Triggerfunktion vorfindet. Ohne so etwas prueft
-- man den Weg nur indirekt ueber "ist sent_at inzwischen gesetzt?" - und
-- wartet dann zwoelf Sekunden auf eine Antwort, die nichts erklaert.
create or replace function public.push_diagnose()
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_schema text;
  v_offen  int;
begin
  select n.nspname into v_schema
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'http_post'
   order by (n.nspname = 'net') desc
   limit 1;

  select count(*) into v_offen from public.notifications where sent_at is null;

  return jsonb_build_object(
    'pg_net_schema', coalesce(v_schema, '(nicht installiert)'),
    'offene_meldungen', v_offen,
    'trigger_da', exists (
      select 1 from pg_catalog.pg_trigger
       where tgname = 'notifications_push_now' and not tgisinternal
    )
  );
end
$fn$;
revoke execute on function public.push_diagnose() from public, anon, authenticated;
