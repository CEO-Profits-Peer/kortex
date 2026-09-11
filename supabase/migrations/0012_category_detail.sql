-- =============================================================================
-- 0012_category_detail.sql  ·  Der Such-Tab und das Kategorie-Leveln
--
-- Die Idee: #zinseszins antippen -> gefilterter Feed derselben Komponente ->
-- Test -> user_categories.level steigt -> die naechsten Karten sind schwerer.
--
-- Zwei Funktionen dafuer:
--   get_category_detail()  Fortschritt, Level, naechste Stufe
--   get_category_feed()    Karten NUR aus dieser Kategorie (inkl. Unterkategorien)
-- =============================================================================

create or replace function public.get_category_detail(p_category_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with target as (
    select c.* from public.categories c where c.id = p_category_id and c.is_active
  ),
  -- Unterkategorien zaehlen mit: wer #tech oeffnet, sieht auch #ki.
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
    'id',           t.id,
    'slug',         t.slug,
    'name',         t.display_name,
    'description',  t.description,
    'emoji',        t.emoji,
    'accent',       t.accent_hex,
    'levelable',    t.is_levelable,
    'max_level',    t.max_level,
    'level',        p.level,
    'mastery',      p.mastery,
    'difficulty_pref', p.difficulty_pref,
    'is_following', p.weight > 1.0,
    -- Level n ab 100 * (n-1)^1.6 Mastery - dieselbe Kurve wie in award_xp.
    'mastery_for_next',
      case when p.level >= t.max_level then null
           else ceil(100.0 * power(p.level::numeric, 1.6))::int end,
    'cards_total', (
      select count(*) from public.content_items ci
       where ci.status = 'approved' and ci.primary_category_id in (select id from branch)
    ),
    'cards_read', (
      select count(*) from public.user_content_state ucs
        join public.content_items ci on ci.id = ucs.content_id
       where ucs.user_id = auth.uid() and ucs.is_read_validated
         and ci.primary_category_id in (select id from branch)
    ),
    'children', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id, 'slug', c.slug, 'name', c.display_name, 'emoji', c.emoji
             ) order by c.sort_order), '[]'::jsonb)
        from public.categories c, target t2
       where c.parent_id = t2.id and c.is_active
    )
  )
  from target t, progress p;
$fn$;
grant execute on function public.get_category_detail(text) to authenticated;


-- =============================================================================
-- Gefilterter Feed. Bewusst dieselbe Rueckgabeform wie get_feed(), damit der
-- Client dieselbe Komponente benutzen kann - kein zweiter Feed-Renderer.
-- =============================================================================

create or replace function public.get_category_feed(
  p_category_id text,
  p_batch_size  int default 10,
  p_include_read boolean default false
) returns setof public.content_items
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user  uuid := auth.uid();
  v_p     public.profiles;
  v_langs text[];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_p from public.profiles where id = v_user;
  v_langs := public.user_feed_languages(v_user);

  return query
  with branch as (
    select c.id from public.categories c
     where c.id = p_category_id or c.parent_id = p_category_id
  ),
  seen as (
    select content_id from public.user_content_state
     where user_id = v_user and is_read_validated
  )
  select ci.*
    from public.content_items ci
   where ci.status = 'approved'
     and ci.primary_category_id in (select id from branch)
     and ci.language = any(v_langs)
     and (ci.expires_at is null or ci.expires_at > now())
     and (p_include_read or ci.id not in (select content_id from seen))
   -- Innerhalb einer Kategorie steigt die Schwierigkeit mit dem Niveau des
   -- Nutzers: erst passende, dann leichtere, dann schwerere Karten.
   order by abs(ci.difficulty - coalesce(
              (select max(difficulty_pref) from public.user_categories
                where user_id = v_user and category_id in (select id from branch)), 2)) asc,
            coalesce(ci.published_at, ci.created_at) desc
   limit p_batch_size;
end
$fn$;
grant execute on function public.get_category_feed(text, int, boolean) to authenticated;


-- =============================================================================
-- Einer Kategorie folgen / entfolgen (aus dem Such-Tab heraus)
-- =============================================================================

create or replace function public.set_category_following(
  p_category_id text,
  p_following   boolean
) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  insert into public.user_categories (user_id, category_id, interest_weight, is_explicit)
  values (v_user, p_category_id, case when p_following then 2.5 else 0.6 end, p_following)
  on conflict (user_id, category_id) do update
    set interest_weight = case when p_following then 2.5 else 0.6 end,
        is_explicit     = p_following,
        updated_at      = now();
end
$fn$;
grant execute on function public.set_category_following(text, boolean) to authenticated;
