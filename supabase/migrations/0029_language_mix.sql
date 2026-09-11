-- =============================================================================
-- 0029_language_mix.sql  ·  Ein Regler statt einer Entscheidung
--
-- Bisher richtete sich der Feed nach `profiles.language` - also nach der
-- Sprache der Oberflaeche - und schaltete Englisch nur dann dazu, wenn es
-- von der eigenen Sprache weniger als sechzig Karten gab. Zwei Probleme:
--
--   · Wer Englisch kann, will es vielleicht MEHR, nicht als Notloesung.
--   · Wer nur Deutsch will, bekam es trotzdem dazu, sobald der Vorrat
--     duenn wurde - ohne Einfluss darauf.
--
-- Jetzt ein Anteil: 0 heisst nur Deutsch, 100 heisst nur Englisch, alles
-- dazwischen mischt. Die beiden Optionen "Nur Deutsch" und "Nur Englisch"
-- sind damit einfach die Enden des Reglers, und es braucht keine zweite
-- Einstellung daneben, die dasselbe anders sagt.
--
-- Bewusst zwischen DEUTSCH und ENGLISCH und nicht zwischen "meiner Sprache"
-- und Englisch: Inhalte gibt es nur in diesen beiden. Ein Regler, dessen
-- eine Seite je nach Konto etwas anderes bedeutet, ist nicht erklaerbar.
--
-- Die Sprache der OBERFLAECHE bleibt davon unberuehrt - das ist weiter
-- `profiles.language`. Wer die App auf Deutsch bedient und englische
-- Inhalte liest, ist ein voellig normaler Fall.
-- =============================================================================

alter table public.profiles
  add column if not exists feed_english_pct smallint not null default 25;

alter table public.profiles
  drop constraint if exists profiles_feed_english_pct_check;
alter table public.profiles
  add constraint profiles_feed_english_pct_check
  check (feed_english_pct between 0 and 100);

comment on column public.profiles.feed_english_pct is
  'Anteil englischer Inhalte im Feed. 0 = nur Deutsch, 100 = nur Englisch.';

-- Bestehende Konten: wer die App auf Englisch bedient, bekommt englische
-- Inhalte. Deutsche Konten starten mit einem Viertel Englisch - ungefaehr
-- das, was die bisherige Nothilfe-Regel geliefert hat, nur jetzt sichtbar
-- und aenderbar.
update public.profiles set feed_english_pct = 100 where language = 'en';


-- --- Welche Sprachen ueberhaupt in den Topf kommen ---------------------------
create or replace function public.user_feed_languages(p_user uuid)
returns text[]
language sql stable security definer set search_path = ''
as $fn$
  select case
    when (select feed_english_pct from public.profiles where id = p_user) <= 0
      then array['de']
    when (select feed_english_pct from public.profiles where id = p_user) >= 100
      then array['en']
    else array['de', 'en']
  end;
$fn$;
revoke execute on function public.user_feed_languages(uuid) from anon, authenticated;


-- =============================================================================
-- Das Gewicht im Feed
--
-- Der Regler entscheidet nicht nur, WAS in den Topf kommt, sondern auch wie
-- schwer es wiegt. Sonst waere jede Stellung zwischen 1 und 99 dieselbe:
-- beide Sprachen drin, Mischung dem Zufall ueberlassen.
--
-- Die Untergrenze von 0,15 ist Absicht. Bei Stellung 10 soll Englisch
-- selten sein, nicht unmoeglich - sonst wirkt der Regler wie ein Schalter
-- mit drei Stufen, und die Feinheit dazwischen waere gelogen.
-- =============================================================================
create or replace function public.language_weight(p_lang text, p_pct smallint)
returns real
language sql immutable
as $fn$
  select greatest(0.15,
    case when p_lang = 'en' then p_pct / 100.0 else (100 - p_pct) / 100.0 end
  )::real;
$fn$;
grant execute on function public.language_weight(text, smallint) to authenticated;


create or replace function public.get_feed(p_batch_size int default 10)
returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_p      public.profiles;
  v_langs  text[];
  v_n_news int;
  v_n_know int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;

  v_langs := public.user_feed_languages(v_user);
  v_n_news := greatest(1, (p_batch_size * 4) / 10);
  v_n_know := greatest(1, p_batch_size - v_n_news);

  return query
  with interests as (
    select uc.category_id, uc.interest_weight, uc.difficulty_pref
      from public.user_categories uc
     where uc.user_id = v_user
  ),
  seen as (
    select ucs.content_id, ucs.last_seen_at
      from public.user_content_state ucs
     where ucs.user_id = v_user
  ),
  pool as (
    select ci.id                  as content_id,
           ci.content_type        as content_type,
           (i.interest_weight is not null) as in_bubble,
           (s2.content_id is not null)     as already_seen,
           s2.last_seen_at,
           coalesce(i.interest_weight, 0.3)
           * exp(-extract(epoch from (now() - coalesce(ci.published_at, ci.created_at)))
                 / 172800.0)
           * (1.0 - abs(ci.difficulty - coalesce(i.difficulty_pref, 2)) * 0.18)
           * (coalesce(s.trust_score, 50) / 100.0)
           * public.language_weight(ci.language, v_p.feed_english_pct)
           * (0.85 + random() * 0.3)
             as score
      from public.content_items ci
      join public.categories cat on cat.id = ci.primary_category_id
      left join lateral (
        select ui.interest_weight, ui.difficulty_pref
          from interests ui
         where ui.category_id = ci.primary_category_id
            or ui.category_id = cat.parent_id
         order by (ui.category_id = ci.primary_category_id) desc
         limit 1
      ) i on true
      left join public.sources s on s.id = ci.primary_source_id
      left join seen s2 on s2.content_id = ci.id
     where ci.status = 'approved'
       and ci.language = any(v_langs)
       and ci.content_type <> 'course_lesson'
       and (ci.expires_at is null or ci.expires_at > now())
       and (ci.region_code is null or ci.region_code = v_p.country_code
            or ci.region_code = v_p.region_code)
  ),
  fresh as (select * from pool where not already_seen),
  picked as (
    (select content_id from fresh where content_type = 'news'
      order by score desc limit v_n_news)
    union
    (select content_id from fresh where content_type in ('knowledge','interactive')
      order by score desc limit v_n_know)
  ),
  -- Stufe 2: reicht das Frische nicht, kommt Gelesenes nach - aeltestes
  -- zuerst, damit es sich wie eine Wiederholung anfuehlt und nicht wie
  -- eine Wiederholung von gerade eben.
  filled as (
    select content_id from picked
    union
    (select content_id from pool
      where already_seen
        and content_id not in (select content_id from picked)
      order by last_seen_at asc nulls first
      limit greatest(0, p_batch_size - (select count(*) from picked)))
  )
  select ci.*
    from filled f
    join public.content_items ci on ci.id = f.content_id
   order by random()
   limit p_batch_size;
end
$fn$;

grant execute on function public.get_feed(int) to authenticated;


-- --- Die Einstellung schreibbar machen ---------------------------------------
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
    language           = coalesce(nullif(p_patch->>'language', ''), language),
    -- Geklemmt statt abgelehnt: ein Regler kann durch Rundung auf 101
    -- kommen, und dafuer soll die Einstellung nicht scheitern.
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
    notify_streak      = coalesce((p_patch->>'notify_streak')::boolean, notify_streak)
  where id = v_user
  returning * into v_out;

  return v_out;
end
$fn$;

grant execute on function public.update_my_settings(jsonb) to authenticated;
