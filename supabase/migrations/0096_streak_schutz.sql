-- =============================================================================
-- 0096_streak_schutz.sql  ·  PRO: Streak-Schutz, einmal pro Woche
--
-- Wer PRO hat und GENAU einen Tag auslaesst, behaelt seinen Streak - hoechstens
-- einmal in sieben Tagen. Zwei verpasste Tage setzen auch mit PRO zurueck:
-- ein Schutz, der beliebig lange Luecken ueberbrueckt, macht den Streak
-- bedeutungslos, auch fuer alle ohne PRO in der Rangliste.
--
-- Der Schutz wirkt automatisch beim ersten Lernen nach der Luecke, es gibt
-- nichts zu aktivieren (also auch nichts zu vergessen). Der verpasste Tag
-- zaehlt NICHT mit: der Streak geht von n auf n+1, nicht auf n+2.
--
-- streak_schutz_am haelt fest, wann er zuletzt gegriffen hat. Kein
-- Spaltenrecht fuer den Client (wie streak_current, 0002).
--
-- touch_streak vollstaendig aus 0003 (seitdem nicht neu geschrieben).
-- =============================================================================

alter table public.profiles add column if not exists streak_schutz_am date;

create or replace function public.touch_streak(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_today  date;
  v_last   date;
  v_tz     text;
  v_schutz date;
begin
  select timezone, last_active_date, streak_schutz_am into v_tz, v_last, v_schutz
    from public.profiles where id = p_user;
  v_today := (now() at time zone coalesce(v_tz, 'Europe/Vienna'))::date;

  if v_last = v_today then
    return;
  elsif v_last = v_today - 1
     -- 0096: ein Tag Luecke, PRO, und der letzte Schutz liegt mindestens eine
     -- Woche zurueck -> wie ein normaler Folgetag behandeln.
     or (v_last = v_today - 2
         and public.ist_pro(p_user)
         and (v_schutz is null or v_schutz <= v_today - 7)) then
    update public.profiles
       set streak_current = streak_current + 1,
           streak_best    = greatest(streak_best, streak_current + 1),
           last_active_date = v_today,
           streak_schutz_am = case when v_last = v_today - 2 then v_today else streak_schutz_am end
     where id = p_user;
    perform public.award_xp(p_user, 10, 0, 'streak', null, 'day', v_today::text);
  else
    update public.profiles
       set streak_current = 1,
           streak_best    = greatest(streak_best, 1),
           last_active_date = v_today
     where id = p_user;
  end if;
end
$fn$;
revoke execute on function public.touch_streak from anon, authenticated;

-- --- Selbsttest (rollt alles zurueck) ------------------------------------------------
do $test$
declare
  v_id    uuid;
  v_heute date;
  v_s     int;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0096: kein Konto'; return; end if;
  begin
    select (now() at time zone coalesce(timezone, 'Europe/Vienna'))::date into v_heute
      from public.profiles where id = v_id;

    -- Ohne PRO: ein Tag Luecke setzt zurueck.
    update public.profiles set plan = 'free', plan_expires_at = null, streak_current = 5,
           last_active_date = v_heute - 2, streak_schutz_am = null where id = v_id;
    perform public.touch_streak(v_id);
    select streak_current into v_s from public.profiles where id = v_id;
    if v_s <> 1 then raise exception 'Selbsttest 0096: ohne PRO nicht zurueckgesetzt (%)', v_s; end if;

    -- Mit PRO: bleibt, wird 6, Schutz vermerkt.
    update public.profiles set plan = 'gifted', plan_expires_at = now() + interval '1 day',
           streak_current = 5, last_active_date = v_heute - 2, streak_schutz_am = null where id = v_id;
    perform public.touch_streak(v_id);
    select streak_current into v_s from public.profiles where id = v_id;
    if v_s <> 6 then raise exception 'Selbsttest 0096: mit PRO nicht geschuetzt (%)', v_s; end if;

    -- Gleiche Woche nochmal: kein zweiter Schutz.
    update public.profiles set streak_current = 5, last_active_date = v_heute - 2,
           streak_schutz_am = v_heute - 3 where id = v_id;
    perform public.touch_streak(v_id);
    select streak_current into v_s from public.profiles where id = v_id;
    if v_s <> 1 then raise exception 'Selbsttest 0096: zweiter Schutz in einer Woche (%)', v_s; end if;

    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0096: ok';
end
$test$;
