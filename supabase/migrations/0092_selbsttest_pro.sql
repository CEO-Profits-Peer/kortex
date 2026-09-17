-- =============================================================================
-- 0092_selbsttest_pro.sql  ·  Laufen die in 0091 neu geschriebenen Funktionen?
--
-- create or replace prueft plpgsql nur auf Syntax. Ein falscher Spaltenname in
-- get_user_posts wuerde erst beim ersten Profilaufruf auffallen. Deshalb hier
-- einmal jeder Aufruf als echtes Konto, und create_post mit Rollback.
-- =============================================================================

do $test$
declare
  v_id     uuid;
  v_handle text;
  v_post   uuid;
  v_j      jsonb;
begin
  select p.id, p.handle into v_id, v_handle
    from public.profiles p
   where exists (select 1 from public.posts po where po.user_id = p.id and po.status = 'visible')
   order by p.follower_count desc limit 1;
  if v_id is null then raise notice 'Selbsttest 0092: kein Konto mit Beitraegen'; return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);

  v_j := public.get_user_posts(v_handle, 10, null);
  raise notice 'get_user_posts: % Beitraege', jsonb_array_length(v_j->'posts');
  v_j := public.get_public_profile(v_handle);
  raise notice 'get_public_profile: pro %', v_j->'pro';
  v_j := public.get_home(10, null);
  raise notice 'get_home: % Eintraege', jsonb_array_length(v_j->'eintraege');

  select id into v_post from public.posts where user_id = v_id and status = 'visible' order by created_at desc limit 1;
  v_j := public.post_json(v_post, v_id);
  if v_j->'angepinnt' is null or v_j->'wer'->'pro' is null then
    raise exception 'Selbsttest 0092: post_json ohne angepinnt/pro';
  end if;

  begin
    v_j := public.post_anpinnen(v_post, true);
    v_j := public.create_post('Selbsttest Umfrage', 'umfrage', null, null,
                              '{"optionen": ["1990", "2000", "2010"]}'::jsonb);
    if v_j->>'status' <> 'visible' then raise exception 'Selbsttest 0092: Umfrage blockiert: %', v_j; end if;
    raise exception 'selbsttest_ok';
  exception when others then
    if sqlerrm <> 'selbsttest_ok' then raise; end if;
  end;
  raise notice 'Selbsttest 0092: ok';
end
$test$;
