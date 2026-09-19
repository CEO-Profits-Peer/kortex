-- =============================================================================
-- 0117_monats_abzeichen.sql  ·  Ein Abzeichen je Monat
--
-- Jeder Monat hat sein eigenes Abzeichen. Verdient wird es mit LERNTAGEN,
-- nicht mit Karten: 8 Tage Bronze, 15 Silber, 22 Gold. Tage statt Karten,
-- weil ein Abzeichen fuer Regelmaessigkeit stehen soll - wer an einem Tag
-- 300 Karten liest, hat einen Tag gelernt. Und 22 statt 30: ein Monat mit
-- ein paar freien Tagen ist ein guter Monat, kein verpasster.
--
-- Ein Lerntag = mindestens eine gelesene Karte (xp_ledger kind 'read') an
-- diesem Tag, Zeitzone Europe/Vienna. Nichts wird gespeichert: das
-- Abzeichen ist eine Rechnung ueber das Buch, also nicht zu mogeln und
-- nicht aus dem Tritt zu bringen. Vergangene Monate sind damit endgueltig.
--
-- Oeffentlich (monats_abzeichen_von): nur die verdienten Stufen, keine Zahlen.
-- =============================================================================

create or replace function public.monats_abzeichen_rechnung(p_user uuid, p_monate int)
returns table (monat date, lerntage int, stufe smallint)
language sql stable security definer set search_path = ''
as $fn$
  with monate as (
    select (date_trunc('month', now() at time zone 'Europe/Vienna') - make_interval(months => g))::date as monat
      from generate_series(0, greatest(1, least(p_monate, 24)) - 1) g
  ),
  tage as (
    select distinct (created_at at time zone 'Europe/Vienna')::date as tag
      from public.xp_ledger
     where user_id = p_user and kind = 'read'
       and created_at >= ((select min(monat) from monate)::timestamp at time zone 'Europe/Vienna')
  )
  select m.monat,
         (select count(*) from tage t where date_trunc('month', t.tag)::date = m.monat)::int,
         (case
            when (select count(*) from tage t where date_trunc('month', t.tag)::date = m.monat) >= 22 then 3
            when (select count(*) from tage t where date_trunc('month', t.tag)::date = m.monat) >= 15 then 2
            when (select count(*) from tage t where date_trunc('month', t.tag)::date = m.monat) >= 8 then 1
            else 0 end)::smallint
    from monate m
   order by m.monat desc;
$fn$;
revoke execute on function public.monats_abzeichen_rechnung(uuid, int) from anon, authenticated;

-- Eigene: 12 Monate mit Zahlen; der laufende mit den Tagen, die noch bleiben.
create or replace function public.meine_monats_abzeichen()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object(
    'heute', (now() at time zone 'Europe/Vienna')::date,
    'uebrig', ((date_trunc('month', now() at time zone 'Europe/Vienna') + interval '1 month')::date
               - (now() at time zone 'Europe/Vienna')::date),
    'monate', coalesce(jsonb_agg(jsonb_build_object(
                'monat', r.monat, 'lerntage', r.lerntage, 'stufe', r.stufe) order by r.monat desc), '[]'::jsonb))
    from public.monats_abzeichen_rechnung(auth.uid(), 12) r
   where auth.uid() is not null;
$fn$;

-- Fremde: nur verdiente, ohne den laufenden Monat, ohne Zahlen.
create or replace function public.monats_abzeichen_von(p_handle text)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('monat', r.monat, 'stufe', r.stufe) order by r.monat desc), '[]'::jsonb)
    from public.profiles p
    cross join lateral public.monats_abzeichen_rechnung(p.id, 12) r
   where lower(p.handle) = lower(p_handle)
     and r.stufe > 0
     and r.monat < date_trunc('month', now() at time zone 'Europe/Vienna')::date
     and auth.uid() is not null;
$fn$;

revoke execute on function public.meine_monats_abzeichen(), public.monats_abzeichen_von(text) from anon;
grant execute on function public.meine_monats_abzeichen(), public.monats_abzeichen_von(text) to authenticated;

do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select user_id into v_id from public.xp_ledger where kind = 'read' order by created_at desc limit 1;
  if v_id is null then raise notice 'Selbsttest 0117: keine Lesedaten'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  v_j := public.meine_monats_abzeichen();
  if jsonb_array_length(v_j->'monate') <> 12 or (v_j->'monate'->0->>'lerntage')::int < 1 then
    raise exception 'Selbsttest 0117: %', v_j;
  end if;
  raise notice 'Selbsttest 0117: ok (%)', v_j->'monate'->0;
end
$test$;

notify pgrst, 'reload schema';
