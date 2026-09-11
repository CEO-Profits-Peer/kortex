-- =============================================================================
-- 0015_endless_feed.sql  ·  Der Feed darf nie leer sein
--
-- Rueckmeldung aus dem Test: "Feed geht noch nicht so gut" und "wenn man
-- sucht soll man auch wenn vom Topic nichts mehr da ist weiterscrollen
-- koennen".
--
-- Ursache: Beide Feeds filterten strikt auf ungelesene Karten in der
-- passenden Kategorie. Bei 36 Demo-Karten ist nach 36 Wischern Schluss, und
-- in einer Nischenkategorie schon nach dreien. Der Nutzer landet dann auf
-- einem leeren Bildschirm - was aussieht, als sei die App kaputt.
--
-- Loesung: drei Stufen statt einer harten Grenze.
--
--   Stufe 1  ungelesen, passend            (der Normalfall)
--   Stufe 2  ungelesen, ausserhalb         (Nachbarschaft bzw. ganzer Bestand)
--   Stufe 3  bereits gelesen, aelteste     (Wiederholung statt Leere)
--
-- Stufe 3 ist kein Notbehelf, sondern passt zum Produkt: eine Karte nach
-- Tagen nochmal zu sehen, schadet dem Lernen nicht. Was zuletzt gesehen
-- wurde, kommt zuletzt wieder.
-- =============================================================================

create or replace function public.get_feed(p_batch_size int default 10)
returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_p      public.profiles;
  v_langs  text[];
  v_mix    jsonb;
  v_n_news int; v_n_know int; v_n_serp int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;
  if v_p.id is null then raise exception 'no profile'; end if;

  v_langs := public.user_feed_languages(v_user);

  select value into v_mix from public.app_config where key = 'feed_mix';
  v_mix := coalesce(v_mix, '{"news":0.4,"knowledge":0.4,"serendipity":0.2}'::jsonb);

  v_n_news := floor(p_batch_size * (v_mix->>'news')::numeric);
  v_n_know := floor(p_batch_size * (v_mix->>'knowledge')::numeric);
  v_n_serp := p_batch_size - v_n_news - v_n_know;

  return query
  with seen as (
    select content_id, last_seen_at from public.user_content_state where user_id = v_user
  ),
  interests as (
    select category_id, interest_weight, difficulty_pref
      from public.user_categories where user_id = v_user
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
           * (case when ci.language = v_p.language then 1.0 else 0.55 end)
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
    union
    (select content_id from fresh
      order by in_bubble asc, random() limit v_n_serp)
  ),
  -- Stufe 3: auffuellen mit dem, was am laengsten zurueckliegt.
  refill as (
    select content_id from pool
     where already_seen
       and content_id not in (select content_id from picked)
     order by last_seen_at asc nulls first
     limit greatest(0, p_batch_size - (select count(*) from picked))
  )
  select ci.* from public.content_items ci
   where ci.id in (select content_id from picked union select content_id from refill);
end
$fn$;
grant execute on function public.get_feed(int) to authenticated;


-- =============================================================================
-- Kategorie-Feed: dieselbe Logik, aber die zweite Stufe ist die Nachbarschaft
--
-- Wer #zinseszins geoeffnet hat und alles gelesen hat, bekommt als Naechstes
-- Karten aus #finanzen - thematisch verwandt, nicht beliebig. Erst danach der
-- restliche Bestand.
-- =============================================================================

create or replace function public.get_category_feed(
  p_category_id  text,
  p_batch_size   int default 10,
  p_include_read boolean default false
) returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_p      public.profiles;
  v_langs  text[];
  v_parent text;
  v_pref   int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;
  v_langs := public.user_feed_languages(v_user);

  select parent_id into v_parent from public.categories where id = p_category_id;

  select coalesce(max(difficulty_pref), 2) into v_pref
    from public.user_categories
   where user_id = v_user and category_id = p_category_id;

  return query
  with branch as (
    select c.id from public.categories c
     where c.id = p_category_id or c.parent_id = p_category_id
  ),
  -- Nachbarschaft: Geschwister unter demselben Elternknoten.
  neighbourhood as (
    select c.id from public.categories c
     where v_parent is not null
       and (c.parent_id = v_parent or c.id = v_parent)
       and c.id not in (select id from branch)
  ),
  seen as (
    select content_id, last_seen_at from public.user_content_state
     where user_id = v_user and is_read_validated
  ),
  candidates as (
    select ci.*,
           case
             when ci.primary_category_id in (select id from branch)        then 0
             when ci.primary_category_id in (select id from neighbourhood) then 1
             else 2
           end as tier,
           (s.content_id is not null) as already_seen,
           s.last_seen_at
      from public.content_items ci
      left join seen s on s.content_id = ci.id
     where ci.status = 'approved'
       and ci.language = any(v_langs)
       and ci.content_type <> 'course_lesson'
       and (ci.expires_at is null or ci.expires_at > now())
  )
  select (c).* from (
    select c from candidates c
     order by
       -- Erst Thema, dann Nachbarschaft, dann alles Uebrige.
       c.tier asc,
       -- Innerhalb jeder Stufe: ungelesenes zuerst.
       (c.already_seen and not p_include_read) asc,
       -- Passende Schwierigkeit vor unpassender.
       abs(c.difficulty - v_pref) asc,
       c.last_seen_at asc nulls first,
       coalesce(c.published_at, c.created_at) desc
     limit p_batch_size
  ) t(c);
end
$fn$;
grant execute on function public.get_category_feed(text, int, boolean) to authenticated;


-- =============================================================================
-- Kurs-Feed bleibt bewusst endlich
--
-- Ein Kurs hat Anfang und Ende - das ist sein Sinn. Hier gibt es kein
-- Auffuellen; wer durch ist, ist durch.
-- =============================================================================
