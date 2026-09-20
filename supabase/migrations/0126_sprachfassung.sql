-- =============================================================================
-- 0126_sprachfassung.sql  ·  Dieselbe Karte in der anderen Sprache finden
--
-- 0121 haengt Uebersetzung und Original ueber `familie` zusammen. Die App
-- konnte bisher nur EINE Richtung gehen: eine Uebersetzung kennt ihr
-- Original (uebersetzt_aus), ein Original aber nicht seine Uebersetzung.
--
-- Fuer die Wischgeste "nach links = andere Sprache" (20.09.) braucht es
-- beide Richtungen. Genau das macht diese Funktion - und nichts sonst:
-- sie gibt die id der anderen freigegebenen Fassung derselben Familie
-- zurueck, oder NULL.
--
-- Warum nicht im Feed mitliefern: die Wischgeste fragt hoechstens einmal
-- je Karte und nur, wenn jemand wirklich wischt. Eine Spalte in jedem
-- Feed-Stapel waere Arbeit fuer zehn Karten, von denen neun nie gewischt
-- werden.
-- =============================================================================

create or replace function public.sprachfassung(p_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $fn$
  select jsonb_build_object('id', z.id, 'language', z.language, 'title', z.title)
    from public.content_items a
    join public.content_items z
      on z.familie = a.familie and z.id <> a.id and z.language <> a.language
   where a.id = p_id
     and z.status = 'approved'
     and a.status = 'approved'
   order by z.created_at
   limit 1;
$fn$;

revoke execute on function public.sprachfassung(uuid) from anon;
grant execute on function public.sprachfassung(uuid) to authenticated;

do $test$
declare
  v_a uuid;
  v_b uuid;
  v_j jsonb;
begin
  select uebersetzt_aus, id into v_a, v_b
    from public.content_items
   where uebersetzt_aus is not null and status = 'approved'
   limit 1;
  if v_a is null then raise notice 'Selbsttest 0126: keine Uebersetzung da'; return; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles order by created_at limit 1),
                      'role', 'authenticated')::text, true);
  -- Beide Richtungen muessen gehen.
  v_j := public.sprachfassung(v_a);
  if (v_j->>'id')::uuid <> v_b then raise exception 'Selbsttest 0126: Original -> Uebersetzung: %', v_j; end if;
  v_j := public.sprachfassung(v_b);
  if (v_j->>'id')::uuid <> v_a then raise exception 'Selbsttest 0126: Uebersetzung -> Original: %', v_j; end if;
  raise notice 'Selbsttest 0126: ok';
end
$test$;

notify pgrst, 'reload schema';
