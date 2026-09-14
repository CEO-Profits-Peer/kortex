-- =============================================================================
-- 0081_hashtags.sql  ·  Eine Karte, mehrere Hashtags
--
-- Gewuenscht: mehrere # pro Reel, oben langsam durchlaufend.
--
-- Die Spalte dafuer gibt es seit 0001 (`category_ids text[]`) - gefuellt
-- wurde sie nie mit mehr als der Hauptkategorie. Ab jetzt vergibt das Modell
-- beim Schreiben bis zu zwei weitere (transform/generate.py), und
-- pipeline/hashtags.py fragt sie fuer den Bestand nach.
--
-- Damit ein weiterer Hashtag mehr ist als Beschriftung, muss die Karte auch
-- dort auftauchen, wo er hinfuehrt: wer auf #geldbasics tippt, soll die
-- Zinseszins-Karte finden, die diesen Hashtag traegt. Deshalb zaehlen
-- Kategorie-Feed und Kategorie-Seite ab jetzt `category_ids` mit.
--
-- Die Hauptkategorie bleibt, was sie war: Farbe, XP, Mastery und die
-- Abwechslung im Feed haengen weiter nur an ihr. Ein zweiter Hashtag soll
-- eine Karte auffindbar machen, nicht doppelt belohnen.
-- =============================================================================

create index if not exists content_items_category_ids_gin
  on public.content_items using gin (category_ids);


-- --- Kategorie-Feed (vollstaendig aus 0031, Stufe 0 erweitert) -------------------
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
  v_branch text[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;
  v_langs := public.user_feed_languages(v_user);

  select parent_id into v_parent from public.categories where id = p_category_id;

  select coalesce(max(difficulty_pref), 2) into v_pref
    from public.user_categories
   where user_id = v_user and category_id = p_category_id;

  -- Als Array, damit `&&` (Ueberschneidung) den GIN-Index nutzen kann.
  select coalesce(array_agg(c.id), '{}') into v_branch
    from public.categories c
   where c.id = p_category_id or c.parent_id = p_category_id;

  return query
  with neighbourhood as (
    -- Nachbarschaft: Geschwister unter demselben Elternknoten. Damit laeuft
    -- der Feed weiter, wenn das enge Thema erschoepft ist.
    select c.id from public.categories c
     where v_parent is not null
       and (c.parent_id = v_parent or c.id = v_parent)
       and not (c.id = any(v_branch))
  ),
  seen as (
    select content_id, last_seen_at from public.user_content_state
     where user_id = v_user and is_read_validated
  ),
  candidates as (
    select ci.id,
           case
             -- 0081: auch Karten, die diesen Hashtag nur als weiteren tragen.
             when ci.primary_category_id = any(v_branch)
                  or ci.category_ids && v_branch                            then 0
             when ci.primary_category_id in (select id from neighbourhood) then 1
             else 2
           end as tier,
           (s.content_id is not null) as already_seen,
           ci.difficulty,
           s.last_seen_at,
           coalesce(ci.published_at, ci.created_at) as at
      from public.content_items ci
      left join seen s on s.content_id = ci.id
     where ci.status = 'approved'
       and ci.language = any(v_langs)
       and ci.content_type <> 'course_lesson'
       and (ci.expires_at is null or ci.expires_at > now())
  ),
  picked as (
    select * from candidates
     order by
       tier asc,
       (already_seen and not p_include_read) asc,
       abs(difficulty - v_pref) asc,
       last_seen_at asc nulls first,
       at desc
     limit p_batch_size
  )
  select ci.*
    from picked p
    join public.content_items ci on ci.id = p.id
   order by
     p.tier asc,
     (p.already_seen and not p_include_read) asc,
     abs(p.difficulty - v_pref) asc,
     p.last_seen_at asc nulls first,
     p.at desc;
end
$fn$;

grant execute on function public.get_category_feed(text, int, boolean) to authenticated;


-- --- Kategorie-Seite (vollstaendig aus 0013, zwei Zaehlungen erweitert) -----------
create or replace function public.get_category_detail(p_category_id text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_out jsonb;
begin
  with target as (
    select c.* from public.categories c where c.id = p_category_id and c.is_active
  ),
  branch as (
    select c.id from public.categories c, target t
     where c.id = t.id or c.parent_id = t.id
  ),
  progress as (
    select coalesce(sum(uc.mastery_score), 0)::int as mastery,
           coalesce(max(uc.level), 1)::int         as level,
           coalesce(max(uc.interest_weight), 0)::numeric as weight,
           coalesce(max(uc.difficulty_pref), 2)::int as difficulty_pref
      from public.user_categories uc
     where uc.user_id = auth.uid() and uc.category_id in (select id from branch)
  )
  select jsonb_build_object(
    'id', t.id, 'slug', t.slug, 'name', t.display_name,
    'description', t.description, 'emoji', t.emoji, 'accent', t.accent_hex,
    'levelable', t.is_levelable, 'max_level', t.max_level,
    'level', p.level, 'mastery', p.mastery,
    'difficulty_pref', p.difficulty_pref,
    'is_following', p.weight > 1.0,
    'mastery_for_next',
      case when p.level >= t.max_level then null
           else ceil(100.0 * power(p.level::numeric, 1.6))::int end,
    'cards_total', (
      select count(*) from public.content_items ci
       where ci.status = 'approved'
         and (ci.primary_category_id in (select id from branch)
              or ci.category_ids && array(select id from branch))
         and (ci.expires_at is null or ci.expires_at > now())
    ),
    'cards_read', (
      select count(*) from public.user_content_state ucs
        join public.content_items ci on ci.id = ucs.content_id
       where ucs.user_id = auth.uid() and ucs.is_read_validated
         and (ci.primary_category_id in (select id from branch)
              or ci.category_ids && array(select id from branch))
    ),
    'children', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'slug', c.slug, 'name', c.display_name, 'emoji', c.emoji
             ) order by c.sort_order), '[]'::jsonb)
        from public.categories c, target t2
       where c.parent_id = t2.id and c.is_active
    )
  ) into v_out
  from target t, progress p;

  if v_out is null then
    raise exception 'unknown category: %', p_category_id;
  end if;
  return v_out;
end
$fn$;
grant execute on function public.get_category_detail(text) to authenticated;

notify pgrst, 'reload schema';
