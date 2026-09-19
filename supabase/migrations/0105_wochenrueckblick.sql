-- =============================================================================
-- 0105_wochenrueckblick.sql  ·  Wochenrueckblick jeden Sonntag
--
-- wochenrueckblick(): die laufende Woche (ab Montag 00:00 Wien, wie die
-- Ligen in 0100) - gelesene Karten, XP, richtige Antworten, aktive Tage,
-- Mastery-Zuwachs je Meisterweg und der Platz in jeder Liga. Alles aus
-- xp_ledger, das nur der Server schreibt.
--
-- wochenrueckblick_erinnerungen(): Sonntag 17-20 Uhr Ortszeit eine
-- Benachrichtigung an alle, die diese Woche gelernt haben und
-- notify_rueckblick nicht abgeschaltet haben. Angestossen wie die
-- Streak-Erinnerung von pipeline/push.py (0104).
--
-- update_my_settings vollstaendig aus 0089, plus notify_rueckblick.
-- =============================================================================

alter table public.profiles add column if not exists notify_rueckblick boolean not null default true;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('follow', 'repost', 'review', 'streak',
                  'post_like', 'post_comment', 'comment_reply', 'post_repost', 'duel',
                  'comment_like', 'mention', 'rueckblick'));

-- --- update_my_settings (vollstaendig aus 0089) -------------------------------------------
create or replace function public.update_my_settings(p_patch jsonb)
returns public.profiles
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_out  public.profiles;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  update public.profiles set
    display_name       = coalesce(p_patch->>'display_name', display_name),
    bio                = case when p_patch ? 'bio' then nullif(trim(p_patch->>'bio'), '') else bio end,
    avatar_path        = case when p_patch ? 'avatar_path' then nullif(p_patch->>'avatar_path', '') else avatar_path end,
    avatar_seed        = case
                           when p_patch->>'avatar_seed' ~ '^v1-[0-7][0-2][01]-[0-9a-f]{2}$'
                              or p_patch->>'avatar_seed' ~ '^v2-[0-9a-z]{4}-[0-9a-f]{19}$'
                             then p_patch->>'avatar_seed'
                           else avatar_seed
                         end,
    language           = coalesce(nullif(p_patch->>'language', ''), language),
    feed_english_pct   = coalesce(
                           least(100, greatest(0, (p_patch->>'feed_english_pct')::smallint)),
                           feed_english_pct),
    country_code       = coalesce(nullif(p_patch->>'country_code', ''), country_code),
    region_code        = case when p_patch ? 'region_code'
                              then nullif(p_patch->>'region_code', '') else region_code end,
    timezone           = coalesce(nullif(p_patch->>'timezone', ''), timezone),
    leaderboard_opt_in = coalesce((p_patch->>'leaderboard_opt_in')::boolean, leaderboard_opt_in),
    likes_public       = coalesce((p_patch->>'likes_public')::boolean, likes_public),
    daily_goal_cards   = coalesce((p_patch->>'daily_goal_cards')::smallint, daily_goal_cards),
    notify_reviews     = coalesce((p_patch->>'notify_reviews')::boolean, notify_reviews),
    notify_streak      = coalesce((p_patch->>'notify_streak')::boolean, notify_streak),
    notify_social      = coalesce((p_patch->>'notify_social')::boolean, notify_social),
    notify_rueckblick  = coalesce((p_patch->>'notify_rueckblick')::boolean, notify_rueckblick),
    beitraege_oeffentlich = coalesce((p_patch->>'beitraege_oeffentlich')::boolean, beitraege_oeffentlich),
    reposts_nur_profil    = coalesce((p_patch->>'reposts_nur_profil')::boolean, reposts_nur_profil),
    home_ohne_reposts     = coalesce((p_patch->>'home_ohne_reposts')::boolean, home_ohne_reposts)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;

grant execute on function public.update_my_settings(jsonb) to authenticated;

-- --- Der Rueckblick ----------------------------------------------------------------------
create or replace function public.wochenrueckblick()
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with start as (select public.liga_wochenstart() as ab),
  buch as (
    select l.* from public.xp_ledger l, start s
     where l.user_id = auth.uid() and l.created_at >= s.ab
  ),
  meister as (
    select split_part(b.category_id, '.', 1) as wurzel, sum(b.mastery_amount)::int as plus
      from buch b where b.category_id is not null and b.mastery_amount > 0
     group by 1
  )
  select jsonb_build_object(
    'ab', (select ab from start),
    'gelesen', (select count(*) from buch where kind = 'read'),
    'xp', (select coalesce(sum(xp_amount), 0) from buch),
    'richtig', (select count(*) from buch where kind in ('quiz_correct', 'review_correct')),
    'tage', (select count(distinct (created_at at time zone 'Europe/Vienna')::date) from buch),
    'streak', (select streak_current from public.profiles where id = auth.uid()),
    'meister', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.display_name, 'emoji', c.emoji,
               'plus', m.plus,
               'stufe', public.meister_stufe(mm.mastery)
             ) order by m.plus desc), '[]'::jsonb)
        from meister m
        join public.categories c on c.id = m.wurzel and c.parent_id is null
        join public.meister_mastery(auth.uid()) mm on mm.wurzel = m.wurzel
    ),
    'ligen', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', x.name,
               'platz', x.platz,
               'von', x.von
             ) order by x.name), '[]'::jsonb)
        from (
          select l.name,
                 (select count(*) + 1 from public.liga_mitglieder m2
                   where m2.liga_id = l.id
                     and (select coalesce(sum(x2.xp_amount), 0) from public.xp_ledger x2, start s2
                           where x2.user_id = m2.user_id and x2.created_at >= s2.ab)
                       > (select coalesce(sum(xp_amount), 0) from buch)) as platz,
                 (select count(*) from public.liga_mitglieder m3 where m3.liga_id = l.id) as von
            from public.ligen l
            join public.liga_mitglieder me on me.liga_id = l.id and me.user_id = auth.uid()
        ) x
    )
  );
$fn$;
revoke execute on function public.wochenrueckblick() from anon;
grant execute on function public.wochenrueckblick() to authenticated;

-- --- Sonntags-Erinnerung -------------------------------------------------------------------
create or replace function public.wochenrueckblick_erinnerungen()
returns int
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_n int;
begin
  with ziel as (
    select p.id, (now() at time zone coalesce(p.timezone, 'Europe/Vienna'))::date as heute
      from public.profiles p
     where p.notify_rueckblick
       and extract(isodow from now() at time zone coalesce(p.timezone, 'Europe/Vienna')) = 7
       and extract(hour from now() at time zone coalesce(p.timezone, 'Europe/Vienna')) between 17 and 20
       and exists (select 1 from public.xp_ledger l
                    where l.user_id = p.id and l.created_at >= public.liga_wochenstart())
  ),
  neu as (
    insert into public.notifications (user_id, kind, title, body, url, dedupe_key)
    select z.id, 'rueckblick', 'Deine Woche',
           'Karten, Meisterwege, Ligen – dein Wochenrückblick ist da.',
           '/rueckblick', 'rueckblick:' || z.heute::text
      from ziel z
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from neu;
  return v_n;
end
$fn$;
revoke execute on function public.wochenrueckblick_erinnerungen() from anon, authenticated;

-- --- Selbsttest ------------------------------------------------------------------------------
do $test$
declare
  v_id uuid;
  v_j  jsonb;
begin
  select id into v_id from public.profiles order by created_at limit 1;
  if v_id is null then raise notice 'Selbsttest 0105: kein Konto'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  begin
    v_j := public.wochenrueckblick();
    if v_j->'gelesen' is null or v_j->'ligen' is null then raise exception 'Selbsttest 0105: unvollstaendig: %', v_j; end if;
    perform public.wochenrueckblick_erinnerungen();
    perform public.update_my_settings('{"notify_rueckblick": false}'::jsonb);
    if (select notify_rueckblick from public.profiles where id = v_id) then
      raise exception 'Selbsttest 0105: Schalter wirkt nicht';
    end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0105: ok';
end
$test$;

notify pgrst, 'reload schema';
