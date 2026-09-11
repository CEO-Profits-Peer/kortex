-- =============================================================================
-- 0003_functions.sql  ·  Die gesamte Spiel-Logik als SECURITY DEFINER RPCs
--
-- Prinzip: Der Client ruft Funktionen auf, er schreibt keine Zustaende.
-- Damit ist Cheating auf "falsche Antworten schneller einreichen" reduziert.
-- Jede Funktion setzt search_path = '' und qualifiziert alles voll aus.
-- =============================================================================


-- =============================================================================
-- 1. Profil-Anlage beim Signup
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_handle text;
begin
  v_handle := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'handle',
                                            split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g'));
  if length(v_handle) < 3 then
    v_handle := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  -- Kollisionen aufloesen
  while exists (select 1 from public.profiles p where p.handle = v_handle) loop
    v_handle := substr(v_handle, 1, 14) || substr(md5(random()::text), 1, 5);
  end loop;

  insert into public.profiles (id, handle, birth_year, country_code)
  values (
    new.id,
    v_handle,
    coalesce((new.raw_user_meta_data->>'birth_year')::smallint,
             extract(year from now())::smallint - 18),
    coalesce(new.raw_user_meta_data->>'country_code', 'AT')
  );
  return new;
end
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================================
-- 2. XP-Buchung  (einzige Schreibstelle fuer xp_total / mastery_total / level)
-- =============================================================================

create or replace function public.award_xp(
  p_user     uuid,
  p_xp       int,
  p_mastery  int,
  p_kind     text,
  p_category text default null,
  p_ref_type text default null,
  p_ref_id   text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_inserted int;
  v_new_level smallint;
begin
  insert into public.xp_ledger (user_id, xp_amount, mastery_amount, kind, category_id, ref_type, ref_id)
  values (p_user, p_xp, p_mastery, p_kind, p_category, p_ref_type, p_ref_id)
  on conflict do nothing;                       -- xp_ledger_dedupe_uidx: nie doppelt kassieren
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return false;
  end if;

  update public.profiles
     set xp_total      = xp_total + p_xp,
         mastery_total = mastery_total + p_mastery
   where id = p_user;

  if p_category is not null then
    insert into public.user_categories (user_id, category_id, category_xp, mastery_score, updated_at)
    values (p_user, p_category, p_xp, p_mastery, now())
    on conflict (user_id, category_id) do update
      set category_xp   = user_categories.category_xp + p_xp,
          mastery_score = user_categories.mastery_score + p_mastery,
          updated_at    = now();

    -- Level-Kurve: Level n ab 100 * n^1.6 Mastery. Level 10 ~ 3.980.
    select least(10, greatest(1, floor(power(uc.mastery_score / 100.0, 1/1.6)) + 1))::smallint
      into v_new_level
      from public.user_categories uc
     where uc.user_id = p_user and uc.category_id = p_category;

    update public.user_categories
       set level = v_new_level
     where user_id = p_user and category_id = p_category
       and level < v_new_level;
  end if;

  return true;
end
$fn$;
revoke execute on function public.award_xp from anon, authenticated;   -- nur intern


-- =============================================================================
-- 3. Event-Flush  (Client sendet gebuendelt, Server entscheidet ueber XP)
-- =============================================================================

create or replace function public.flush_events(p_events jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user  uuid := auth.uid();
  v_ev    jsonb;
  v_item  public.content_items;
  v_state public.user_content_state;
  v_xp    int := 0;
  v_read  int := 0;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_array_length(p_events) > 200 then
    raise exception 'batch too large';
  end if;

  for v_ev in select * from jsonb_array_elements(p_events) loop

    insert into public.content_events
      (user_id, content_id, event_type, dwell_ms, visible_pct, payload, client_ts)
    values (
      v_user,
      (v_ev->>'content_id')::uuid,
      v_ev->>'event_type',
      (v_ev->>'dwell_ms')::int,
      (v_ev->>'visible_pct')::smallint,
      coalesce(v_ev->'payload', '{}'::jsonb),
      least((v_ev->>'client_ts')::timestamptz, now())
    );

    select * into v_item from public.content_items where id = (v_ev->>'content_id')::uuid;
    continue when v_item.id is null;

    insert into public.user_content_state (user_id, content_id, total_dwell_ms)
    values (v_user, v_item.id, 0)
    on conflict (user_id, content_id) do nothing;

    update public.user_content_state
       set total_dwell_ms = total_dwell_ms + coalesce((v_ev->>'dwell_ms')::int, 0),
           last_seen_at   = now(),
           is_liked       = case v_ev->>'event_type' when 'like' then true
                                                     when 'unlike' then false
                                                     else is_liked end,
           is_skipped     = case when v_ev->>'event_type' = 'skip' then true else is_skipped end
     where user_id = v_user and content_id = v_item.id
    returning * into v_state;

    -- Lese-Validierung: laengenabhaengige Schwelle bei >= 80 % Sichtbarkeit
    if not v_state.is_read_validated
       and v_state.total_dwell_ms >= v_item.dwell_target_ms
       and coalesce((v_ev->>'visible_pct')::smallint, 0) >= 80 then

      update public.user_content_state
         set is_read_validated = true
       where user_id = v_user and content_id = v_item.id;

      if public.award_xp(v_user, 2, 0, 'read', v_item.primary_category_id,
                         'content', v_item.id::text) then
        v_xp := v_xp + 2;
        v_read := v_read + 1;
      end if;
    end if;

    -- Interesse nachziehen: Like staerker als Lesen, Skip daempft
    if v_ev->>'event_type' in ('like','skip') then
      insert into public.user_categories (user_id, category_id, interest_weight)
      values (v_user, v_item.primary_category_id,
              case v_ev->>'event_type' when 'like' then 1.25 else 0.85 end)
      on conflict (user_id, category_id) do update
        set interest_weight = least(5.0, greatest(0.1,
              user_categories.interest_weight
              * case excluded.interest_weight when 1.25 then 1.15 else 0.92 end)),
            updated_at = now();
    end if;

    -- Explizites Schwierigkeits-Feedback
    if v_ev->>'event_type' in ('too_easy','too_hard') then
      update public.user_categories
         set difficulty_pref = greatest(1, least(5,
               difficulty_pref + case v_ev->>'event_type' when 'too_easy' then 1 else -1 end)),
             updated_at = now()
       where user_id = v_user and category_id = v_item.primary_category_id;
    end if;

  end loop;

  update public.profiles
     set cards_read_total    = cards_read_total + v_read,
         focus_seconds_total = focus_seconds_total +
           coalesce((select sum(coalesce((e->>'dwell_ms')::int,0)) / 1000
                       from jsonb_array_elements(p_events) e), 0)
   where id = v_user;

  perform public.touch_streak(v_user);

  return jsonb_build_object('xp_awarded', v_xp, 'cards_validated', v_read);
end
$fn$;


-- =============================================================================
-- 4. Streak
-- =============================================================================

create or replace function public.touch_streak(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_today date;
  v_last  date;
  v_tz    text;
begin
  select timezone, last_active_date into v_tz, v_last
    from public.profiles where id = p_user;
  v_today := (now() at time zone coalesce(v_tz, 'Europe/Vienna'))::date;

  if v_last = v_today then
    return;
  elsif v_last = v_today - 1 then
    update public.profiles
       set streak_current = streak_current + 1,
           streak_best    = greatest(streak_best, streak_current + 1),
           last_active_date = v_today
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


-- =============================================================================
-- 5. Quiz  (Antwort wird SERVERSEITIG geprueft - der Client kennt sie nie)
-- =============================================================================

create or replace function public.submit_quiz(
  p_content_id uuid,
  p_quiz_index smallint,
  p_answer     smallint
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user    uuid := auth.uid();
  v_item    public.content_items;
  v_quiz    jsonb;
  v_correct boolean;
  v_first   boolean;
  v_xp      int;
  v_mastery int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_item from public.content_items
   where id = p_content_id and status = 'approved';
  if v_item.id is null then raise exception 'unknown content'; end if;

  v_quiz := v_item.quiz_items -> p_quiz_index;
  if v_quiz is null then raise exception 'unknown quiz item'; end if;

  v_correct := (v_quiz->>'correct_index')::smallint = p_answer;

  select quiz_attempts = 0 into v_first
    from public.user_content_state
   where user_id = v_user and content_id = p_content_id;
  v_first := coalesce(v_first, true);

  update public.user_content_state
     set quiz_attempts = quiz_attempts + 1,
         quiz_correct  = quiz_correct + (case when v_correct then 1 else 0 end)
   where user_id = v_user and content_id = p_content_id;

  if v_correct then
    v_xp      := case when v_first then 25 else 8 end;
    v_mastery := case when v_first then 10 else 3 end;
    perform public.award_xp(v_user, v_xp, v_mastery,
              case when v_first then 'quiz_correct' else 'quiz_retry' end,
              v_item.primary_category_id, 'quiz',
              p_content_id::text || ':' || p_quiz_index::text);

    -- Spaced Repetition: richtig beantwortet -> in die Wiederholungsschleife
    insert into public.review_queue (user_id, content_id, quiz_index, category_id,
                                     interval_days, repetitions, due_at)
    values (v_user, p_content_id, p_quiz_index, v_item.primary_category_id,
            1, 1, now() + interval '1 day')
    on conflict (user_id, content_id, quiz_index) do nothing;
  else
    v_xp := 0; v_mastery := 0;
    -- Falsch -> frueher wieder fragen
    insert into public.review_queue (user_id, content_id, quiz_index, category_id, due_at)
    values (v_user, p_content_id, p_quiz_index, v_item.primary_category_id,
            now() + interval '10 minutes')
    on conflict (user_id, content_id, quiz_index) do update
      set due_at = now() + interval '10 minutes',
          ease   = greatest(1.3, review_queue.ease - 0.2),
          lapses = review_queue.lapses + 1;
  end if;

  return jsonb_build_object(
    'correct',       v_correct,
    'correct_index', (v_quiz->>'correct_index')::smallint,
    'explanation',   v_quiz->>'explanation',
    'xp',            v_xp,
    'mastery',       v_mastery
  );
end
$fn$;


-- =============================================================================
-- 6. Spaced Repetition  (SM-2 lite)
-- =============================================================================

create or replace function public.submit_review(p_review_id uuid, p_answer smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user    uuid := auth.uid();
  v_r       public.review_queue;
  v_quiz    jsonb;
  v_correct boolean;
  v_ease    numeric(3,2);
  v_int     smallint;
begin
  select * into v_r from public.review_queue where id = p_review_id and user_id = v_user;
  if v_r.id is null then raise exception 'unknown review'; end if;

  select quiz_items -> v_r.quiz_index into v_quiz
    from public.content_items where id = v_r.content_id;
  v_correct := (v_quiz->>'correct_index')::smallint = p_answer;

  if v_correct then
    v_ease := least(2.80, v_r.ease + 0.10);
    v_int  := case v_r.repetitions when 0 then 1 when 1 then 3
                else least(180, (v_r.interval_days * v_ease)::smallint) end;
    update public.review_queue
       set ease = v_ease, interval_days = v_int, repetitions = repetitions + 1,
           due_at = now() + (v_int || ' days')::interval,
           last_reviewed = now(),
           is_retired = (repetitions + 1 >= 5 and lapses = 0)
     where id = p_review_id;
    -- Wiederholung ist die WERTVOLLSTE Mastery-Quelle: hier entsteht Langzeitwissen.
    perform public.award_xp(v_user, 15, 15, 'review_correct', v_r.category_id,
                            'review', p_review_id::text || ':' || v_r.repetitions::text);
  else
    update public.review_queue
       set ease = greatest(1.30, v_r.ease - 0.20), interval_days = 0, repetitions = 0,
           lapses = lapses + 1, due_at = now() + interval '1 day', last_reviewed = now()
     where id = p_review_id;
  end if;

  return jsonb_build_object('correct', v_correct,
                            'correct_index', (v_quiz->>'correct_index')::smallint,
                            'xp', case when v_correct then 15 else 0 end);
end
$fn$;


-- =============================================================================
-- 7. Der Feed  (Mixer + Ranker, Quoten aus app_config)
-- =============================================================================

create or replace function public.get_feed(p_batch_size int default 10)
returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_p      public.profiles;
  v_mix    jsonb;
  v_n_news int; v_n_know int; v_n_serp int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;

  select value into v_mix from public.app_config where key = 'feed_mix';
  v_mix := coalesce(v_mix, '{"news":0.4,"knowledge":0.4,"serendipity":0.2}'::jsonb);

  v_n_news := floor(p_batch_size * (v_mix->>'news')::numeric);
  v_n_know := floor(p_batch_size * (v_mix->>'knowledge')::numeric);
  v_n_serp := p_batch_size - v_n_news - v_n_know;

  return query
  with seen as (
    select content_id from public.user_content_state where user_id = v_user
  ),
  interests as (
    select category_id, interest_weight, difficulty_pref
      from public.user_categories where user_id = v_user
  ),
  pool as (
    select ci.id                  as content_id,
           ci.content_type        as content_type,
           ci.primary_category_id as category_id,
           -- Ranking: Interesse x Frische x Schwierigkeits-Passung x Quellenvertrauen
           coalesce(i.interest_weight, 0.3)
           * exp(-extract(epoch from (now() - coalesce(ci.published_at, ci.created_at)))
                 / 172800.0)                                      -- Halbwertszeit 48 h
           * (1.0 - abs(ci.difficulty - coalesce(i.difficulty_pref, 2)) * 0.18)
           * (coalesce(s.trust_score, 50) / 100.0)
           * (0.85 + random() * 0.3)                              -- Rauschen gegen Monotonie
             as score
      from public.content_items ci
      left join interests i on i.category_id = ci.primary_category_id
      left join public.sources s on s.id = ci.primary_source_id
     where ci.status = 'approved'
       and ci.language = v_p.language
       and (ci.expires_at is null or ci.expires_at > now())
       and (ci.region_code is null or ci.region_code = v_p.country_code
            or ci.region_code = v_p.region_code)
       and not exists (select 1 from seen where seen.content_id = ci.id)
  ),
  -- Erst nur IDs auswaehlen, dann einmal zurueckjoinen. Wuerde pool die
  -- ganzen Zeilen plus score fuehren, passte das Ergebnis nicht mehr auf
  -- 'setof content_items' (eine Spalte zu viel).
  picked as (
    (select content_id from pool where content_type = 'news'
      order by score desc limit v_n_news)
    union
    (select content_id from pool where content_type in ('knowledge','interactive')
      order by score desc limit v_n_know)
    union
    -- Serendipity: bewusst AUSSERHALB der Interessen, zufaellig
    (select content_id from pool
      where category_id not in (select category_id from interests)
      order by random() limit v_n_serp)
  )
  select ci.* from public.content_items ci
    join picked pk on pk.content_id = ci.id;
end
$fn$;


-- =============================================================================
-- 8. Search Tab:  @handle  ·  #kategorie  ·  Kurse  ·  Volltext
-- =============================================================================

-- Damit der Funktionskoerper schon beim CREATE geprueft werden kann, muss
-- pg_trgm in der aktuellen Session sichtbar sein. Gilt nur bis Transaktionsende;
-- nicht existierende Schemas in der Liste sind unschaedlich.
set local search_path = public, extensions, pg_temp;

-- HINWEIS zum search_path: diese Funktion ist die einzige, die pg_trgm braucht
-- (similarity() und der %-Operator). Wo pg_trgm liegt, haengt vom Projekt ab -
-- je nach Supabase-Version 'public' oder 'extensions'. Deshalb wird der
-- search_path hier NICHT hart gesetzt, sondern unten per ALTER aus dem
-- Katalog ermittelt. Alle Tabellen sind ohnehin voll qualifiziert, es kann
-- also nichts umgebogen werden.
create or replace function public.search_all(p_query text, p_limit int default 20)
returns table (
  kind text, id text, title text, subtitle text, meta jsonb, score real
)
language sql security definer
as $fn$
  with q as (select trim(both from p_query) as raw,
                    lower(regexp_replace(trim(both from p_query), '^[@#]', '')) as term)
  select * from (
    -- #kategorien
    select 'category'::text, c.id, c.display_name,
           coalesce(c.description, ''),
           jsonb_build_object('emoji', c.emoji, 'slug', c.slug,
                              'levelable', c.is_levelable, 'accent', c.accent_hex),
           (similarity(c.slug, (select term from q)) * 1.4)::real
      from public.categories c, q
     where c.is_active and (q.raw not like '@%')
       and (c.slug % q.term or c.display_name ilike '%' || q.term || '%')

    union all
    -- @quellen
    select 'source', s.id, s.display_name, s.handle,
           jsonb_build_object('logo', s.logo_url, 'license', s.license_class,
                              'trust', s.trust_score),
           (similarity(s.handle, (select term from q)) * 1.2)::real
      from public.sources s, q
     where s.is_active and (q.raw not like '#%')
       and (s.handle % q.term or s.display_name ilike '%' || q.term || '%')

    union all
    -- @nutzer
    select 'profile', pp.id::text, coalesce(pp.display_name, pp.handle), '@' || pp.handle,
           jsonb_build_object('avatar_seed', pp.avatar_seed, 'mastery', pp.mastery_total),
           (similarity(pp.handle, (select term from q)))::real
      from public.public_profiles pp, q
     where q.raw not like '#%' and pp.handle % q.term

    union all
    -- Kurse
    select 'course', co.id::text, co.title, co.description,
           jsonb_build_object('category', co.category_id, 'difficulty', co.difficulty,
                              'premium', co.is_premium),
           (similarity(co.slug, (select term from q)) * 1.1)::real
      from public.courses co, q
     where co.is_published and (co.slug % q.term or co.title ilike '%' || q.term || '%')

    union all
    -- Einzelne Cards
    select 'content', ci.id::text, ci.title, coalesce(ci.deck, ''),
           jsonb_build_object('category', ci.primary_category_id, 'type', ci.content_type),
           (similarity(ci.title, (select term from q)) * 0.8)::real
      from public.content_items ci, q
     where ci.status = 'approved' and q.raw not like '@%' and ci.title % q.term
  ) r(kind, id, title, subtitle, meta, score)
  where r.score > 0.1
  order by r.score desc
  limit p_limit;
$fn$;

-- search_path fuer search_all aus dem Katalog setzen: das Schema, in dem
-- pg_trgm tatsaechlich installiert ist, plus pg_temp am Ende.
do $do$
declare
  v_ext_schema text;
begin
  select n.nspname into v_ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';

  if v_ext_schema is null then
    raise exception 'pg_trgm ist nicht installiert';
  end if;

  execute format(
    'alter function public.search_all(text, int) set search_path = %I, pg_temp',
    v_ext_schema
  );
end
$do$;


-- =============================================================================
-- 9. Leaderboard
-- =============================================================================

create or replace function public.get_leaderboard(
  p_scope text default 'region',      -- 'region' | 'friends' | 'global'
  p_limit int default 50
) returns table (rank_pos int, handle text, display_name text, avatar_seed text,
                 mastery_total int, streak_current smallint, is_me boolean)
language sql security definer set search_path = ''
as $fn$
  with me as (select id, region_code from public.profiles where id = auth.uid()),
  scoped as (
    select pp.* from public.public_profiles pp, me
     where case p_scope
             when 'region'  then pp.region_code is not distinct from me.region_code
             when 'friends' then pp.id = me.id or exists (
                    select 1 from public.friendships f
                     where f.status = 'accepted'
                       and ((f.requester_id = me.id and f.addressee_id = pp.id)
                         or (f.addressee_id = me.id and f.requester_id = pp.id)))
             else true
           end
  )
  select (row_number() over (order by s.mastery_total desc))::int,
         s.handle, s.display_name, s.avatar_seed, s.mastery_total, s.streak_current,
         s.id = (select id from me)
    from scoped s
   order by s.mastery_total desc
   limit p_limit;
$fn$;


-- =============================================================================
-- Ausfuehrungsrechte
-- =============================================================================
grant execute on function public.flush_events(jsonb)             to authenticated;
grant execute on function public.submit_quiz(uuid, smallint, smallint) to authenticated;
grant execute on function public.submit_review(uuid, smallint)   to authenticated;
grant execute on function public.get_feed(int)                   to authenticated;
grant execute on function public.search_all(text, int)           to authenticated;
grant execute on function public.get_leaderboard(text, int)      to authenticated;
