-- =============================================================================
-- 0020_display_names.sql  ·  Namen statt Handles, und eine Personen-Leiste
--
-- Drei zusammenhaengende Aenderungen:
--
-- 1. get_following_feed liefert den Anzeigenamen mit. Bisher stand dort nur
--    das Handle, und die App zeigte "@lena_k" statt "Lena K." — technisch
--    korrekt, menschlich falsch. Das Handle bleibt in der Nutzlast, weil der
--    Link aufs Profil darueber laeuft; es wird nur nicht mehr angezeigt.
--
-- 2. search_people sucht auch im Anzeigenamen. Wer "Lena" eintippt, meint
--    nicht das Handle.
--
-- 3. get_top_people: die meistgefolgten Personen fuer die horizontale Leiste
--    oben in der Suche.
-- =============================================================================


-- --- 1. Anzeigename im Freundes-Feed ---------------------------------------
create or replace function public.get_following_feed(p_limit int default 30)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(row order by row->>'at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'kind',         'repost',
      'content_id',   r.content_id,
      'title',        ci.title,
      'deck',         ci.deck,
      'category',     ci.primary_category_id,
      'handle',       p.handle,
      -- coalesce, weil display_name nullable ist: ohne gesetzten Namen ist
      -- das Handle immer noch besser als eine leere Zeile.
      'display_name', coalesce(nullif(trim(p.display_name), ''), p.handle),
      'avatar_seed',  p.avatar_seed,
      'avatar_path',  p.avatar_path,
      'comment',      r.comment,
      'at',           r.created_at
    ) as row
      from public.reposts r
      join public.profiles p       on p.id = r.user_id
      join public.content_items ci on ci.id = r.content_id
     where ci.status = 'approved'
       and r.user_id in (
         select followee_id from public.follows where follower_id = auth.uid()
       )
     order by r.created_at desc
     limit p_limit
  ) t;
$fn$;
grant execute on function public.get_following_feed(int) to authenticated;


-- --- 2. Personensuche findet auch Anzeigenamen -----------------------------
create or replace function public.search_people(p_query text, p_limit int default 20)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  with q as (
    select lower(regexp_replace(trim(p_query), '^@', '')) as term
  )
  -- sort_key ist nur Sortierhilfe und wird vor der Ausgabe entfernt.
  select coalesce(jsonb_agg(x - 'sort_key' order by x->>'sort_key'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',             p.id,
      'handle',         p.handle,
      'display_name',   coalesce(nullif(trim(p.display_name), ''), p.handle),
      'avatar_seed',    p.avatar_seed,
      'avatar_path',    p.avatar_path,
      'follower_count', p.follower_count,
      'i_follow',       exists (select 1 from public.follows f
                                 where f.follower_id = auth.uid() and f.followee_id = p.id),
      'is_me',          p.id = auth.uid(),
      -- Treffer am Wortanfang zuerst, danach nach Reichweite. Ohne das
      -- steht "Marlene" ueber "Lena", wenn Marlene mehr Follower hat.
      'sort_key',       lpad(
                          case when p.handle like q.term || '%'
                                 or lower(coalesce(p.display_name, '')) like q.term || '%'
                               then '0' else '1' end
                          || (999999 - least(p.follower_count, 999999))::text, 8, '0')
    ) as x
    from public.profiles p, q
    where p.handle ilike '%' || q.term || '%'
       or p.display_name ilike '%' || q.term || '%'
    limit p_limit
  ) t;
$fn$;
grant execute on function public.search_people(text, int) to authenticated;


-- =============================================================================
-- 3. Die Leiste oben in der Suche
--
-- Nur Personen mit mindestens einem Follower. Eine Leiste voller frisch
-- angelegter Konten mit null Followern ist keine Empfehlung, sondern eine
-- Liste — und in einer leeren App waere genau das das Ergebnis. Lieber gar
-- keine Leiste als eine nichtssagende.
-- =============================================================================
create or replace function public.get_top_people(p_limit int default 15)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',             p.id,
    'handle',         p.handle,
    'display_name',   coalesce(nullif(trim(p.display_name), ''), p.handle),
    'avatar_seed',    p.avatar_seed,
    'avatar_path',    p.avatar_path,
    'follower_count', p.follower_count,
    'i_follow',       exists (select 1 from public.follows f
                               where f.follower_id = auth.uid() and f.followee_id = p.id),
    'is_me',          p.id = auth.uid()
  ) order by p.follower_count desc, p.created_at asc), '[]'::jsonb)
  from public.profiles p
  where p.follower_count > 0
    and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  limit p_limit;
$fn$;
grant execute on function public.get_top_people(int) to authenticated;

create index if not exists profiles_follower_count_idx
  on public.profiles (follower_count desc)
  where follower_count > 0;
