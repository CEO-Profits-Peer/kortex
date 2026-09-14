-- =============================================================================
-- 0085_selbsttest.sql  ·  Laufen die neuen Funktionen wirklich?
--
-- 0080 bis 0084 haben get_home, get_post, get_user_posts, get_public_profile,
-- den Kategorie-Feed und die Kategorie-Seite neu geschrieben und get_explore
-- und get_my_statistik angelegt. "create or replace" prueft bei plpgsql nur
-- die Syntax - ein falscher Spaltenname faellt erst beim ersten Aufruf auf,
-- und bei get_home hiesse das: Home ist fuer alle kaputt.
--
-- Von aussen laesst sich das nicht pruefen: die Funktionen verlangen
-- auth.uid(), und der Service-Schluessel hat keine. Deshalb hier, einmal, als
-- ein echtes Konto (das mit den meisten Followern). Die Datei schreibt nichts.
-- Scheitert ein Aufruf, bricht `db push` ab, und die Migration wird nicht
-- als eingespielt vermerkt - genau das soll passieren.
-- =============================================================================

do $test$
declare
  v_id     uuid;
  v_handle text;
  v_post   uuid;
  v_j      jsonb;
  v_n      int;
begin
  select id, handle into v_id, v_handle
    from public.profiles
   where onboarding_completed_at is not null
   order by follower_count desc, created_at
   limit 1;
  if v_id is null then
    raise notice 'Selbsttest: kein Konto - uebersprungen';
    return;
  end if;

  -- auth.uid() liest die Kennung aus den JWT-Angaben der Transaktion.
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_id then
    raise exception 'Selbsttest: auth.uid() laesst sich so nicht setzen';
  end if;

  v_j := public.get_home(25, null);
  raise notice 'get_home: % Eintraege', jsonb_array_length(v_j->'eintraege');

  v_j := public.get_explore(20, '{}');
  raise notice 'get_explore: % Beitraege', jsonb_array_length(v_j->'beitraege');

  v_j := public.get_my_statistik();
  raise notice 'get_my_statistik: % Tage Verlauf, % Top-Beitraege',
    jsonb_array_length(v_j->'follower_verlauf'), jsonb_array_length(v_j->'top_beitraege');

  v_j := public.get_public_profile(v_handle);
  raise notice 'get_public_profile: likes_bekommen %', v_j->'likes_bekommen';

  v_j := public.get_user_posts(v_handle, 10, null);
  raise notice 'get_user_posts: gesperrt %, anzahl %', v_j->'gesperrt', v_j->'anzahl';

  select id into v_post from public.posts where status = 'visible' order by created_at desc limit 1;
  if v_post is not null then
    v_j := public.get_post(v_post);
    raise notice 'get_post: gesperrt %', v_j->'gesperrt';
  end if;

  select count(*) into v_n from public.get_category_feed('history', 10, false);
  raise notice 'get_category_feed(history): % Karten', v_n;

  v_j := public.get_category_detail('language');
  raise notice 'get_category_detail(language): % Karten', v_j->'cards_total';

  perform set_config('request.jwt.claims', '', true);
end
$test$;
