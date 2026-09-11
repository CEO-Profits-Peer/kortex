-- =============================================================================
-- 0034_follow_lists.sql  ·  Wer folgt wem
--
-- Die Zahlen "Folgen dir" und "Folgt" standen im Profil, waren aber nicht
-- antippbar. Eine Zahl, die man nicht aufklappen kann, ist eine Sackgasse -
-- und bei einem sozialen Netz die falsche: die Liste dahinter ist der Weg,
-- auf dem man neue Leute findet.
--
-- Zwei Funktionen statt einer mit Schalter: "wer folgt dieser Person" und
-- "wem folgt diese Person" sind verschiedene Fragen mit verschiedenen
-- Verknuepfungen. Ein Parameter, der die halbe Abfrage umdreht, liest sich
-- schlechter als zwei kurze Funktionen.
--
-- `i_follow` kommt bei jeder Zeile mit: ohne das muesste die App fuer jede
-- Person einzeln nachfragen, ob ich ihr schon folge - und genau dieser
-- Knopf ist der Grund, warum man sich die Liste ansieht.
-- =============================================================================

create or replace function public.get_followers(p_handle text, p_limit int default 50)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(x order by x->>'sort'), '[]'::jsonb) - 'sort'
  from (
    select jsonb_build_object(
      'id',             p.id,
      'handle',         p.handle,
      'display_name',   coalesce(nullif(trim(p.display_name), ''), p.handle),
      'avatar_seed',    p.avatar_seed,
      'avatar_path',    p.avatar_path,
      'follower_count', p.follower_count,
      'i_follow',       exists (select 1 from public.follows f2
                                 where f2.follower_id = auth.uid()
                                   and f2.followee_id = p.id),
      'is_me',          p.id = auth.uid(),
      -- Die mit der groessten Reichweite zuerst: in einer langen Liste ist
      -- das die nuetzlichste Reihenfolge.
      'sort',           lpad((999999 - least(p.follower_count, 999999))::text, 7, '0')
    ) as x
    from public.follows f
    join public.profiles p on p.id = f.follower_id
    where f.followee_id = (select id from public.profiles where handle = p_handle)
      and auth.uid() is not null
    limit p_limit
  ) t;
$fn$;

create or replace function public.get_following(p_handle text, p_limit int default 50)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select coalesce(jsonb_agg(x order by x->>'sort'), '[]'::jsonb) - 'sort'
  from (
    select jsonb_build_object(
      'id',             p.id,
      'handle',         p.handle,
      'display_name',   coalesce(nullif(trim(p.display_name), ''), p.handle),
      'avatar_seed',    p.avatar_seed,
      'avatar_path',    p.avatar_path,
      'follower_count', p.follower_count,
      'i_follow',       exists (select 1 from public.follows f2
                                 where f2.follower_id = auth.uid()
                                   and f2.followee_id = p.id),
      'is_me',          p.id = auth.uid(),
      'sort',           lpad((999999 - least(p.follower_count, 999999))::text, 7, '0')
    ) as x
    from public.follows f
    join public.profiles p on p.id = f.followee_id
    where f.follower_id = (select id from public.profiles where handle = p_handle)
      and auth.uid() is not null
    limit p_limit
  ) t;
$fn$;

grant execute on function public.get_followers(text, int) to authenticated;
grant execute on function public.get_following(text, int) to authenticated;
