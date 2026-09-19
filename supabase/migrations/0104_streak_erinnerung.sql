-- =============================================================================
-- 0104_streak_erinnerung.sql  ·  Push, bevor der Streak reisst
--
-- Die Einstellung "Streak - Erinnerung, bevor sie reisst" (notify_streak)
-- gab es seit 0013 - verschickt hat sie nie jemand. Jetzt legt
-- streak_erinnerungen() eine Benachrichtigung an; der Trigger aus 0053 stellt
-- sie wie jede andere sofort per Push zu.
--
-- Wer: notify_streak an, Streak ab 2 Tagen, zuletzt GESTERN aktiv (heute
-- also noch nicht), und es ist dort gerade Abend (18-21 Uhr Ortszeit).
-- Einmal pro Tag (dedupe_key), auch wenn die Funktion oefter laeuft.
--
-- Wann: Es gibt kein pg_cron. pipeline/push.py ruft die Funktion vor dem
-- Versand auf, und der laeuft alle drei Stunden (ingest.yml, :17). In einem
-- Fenster von vier Stunden liegt fuer jede Zeitzone genau ein Lauf.
--
-- Mit PRO und bereitem Streak-Schutz (0096) sagt die Nachricht das - sie
-- soll nicht mit Angst arbeiten, wenn gar nichts reissen kann.
-- =============================================================================

create or replace function public.streak_erinnerungen()
returns int
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  with ziel as (
    select p.id, p.streak_current,
           (now() at time zone coalesce(p.timezone, 'Europe/Vienna'))::date as heute,
           public.ist_pro(p.id)
             and (p.streak_schutz_am is null
                  or p.streak_schutz_am <= (now() at time zone coalesce(p.timezone, 'Europe/Vienna'))::date - 7) as geschuetzt
      from public.profiles p
     where p.notify_streak
       and p.streak_current >= 2
       and p.last_active_date = (now() at time zone coalesce(p.timezone, 'Europe/Vienna'))::date - 1
       and extract(hour from now() at time zone coalesce(p.timezone, 'Europe/Vienna')) between 18 and 21
  ),
  neu as (
    insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
    select z.id, 'streak',
           'Dein ' || z.streak_current || '-Tage-Streak',
           case when z.geschuetzt
                then 'Heute noch nichts gelernt. Dein Streak-Schutz fängt den Tag ab – eine Karte reicht aber auch.'
                else 'Heute noch nichts gelernt. Eine Karte reicht, damit er hält.' end,
           '/',
           'streak:' || z.heute::text
      from ziel z
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from neu;
  return v_n;
end
$fn$;
revoke execute on function public.streak_erinnerungen() from anon, authenticated;

-- Selbsttest: laeuft durch, schreibt nur, wenn gerade jemand im Fenster ist -
-- und rollt das zurueck.
do $test$
begin
  begin
    perform public.streak_erinnerungen();
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0104: ok';
end
$test$;
