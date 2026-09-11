-- =============================================================================
-- 0006_auth_fixes.sql
--
-- handle_new_user() ging davon aus, dass jeder neue Account eine E-Mail hat.
-- Bei anonymen Anmeldungen (supabase.auth.signInAnonymously) ist auth.users.email
-- NULL - split_part(NULL,...) ergibt NULL, length(NULL) < 3 ergibt NULL statt
-- true, der Fallback greift nicht und der INSERT scheitert an handle NOT NULL.
--
-- Anonyme Anmeldung ist der schnellste Weg zu einem testbaren Prototyp:
-- kein Passwort, keine E-Mail-Bestaetigung, trotzdem ein echter Account mit
-- RLS, XP und Streak. Spaeter kann derselbe Account per updateUser() eine
-- E-Mail bekommen, ohne dass Fortschritt verloren geht.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_base   text;
  v_handle text;
  v_try    int := 0;
begin
  -- Reihenfolge: explizit mitgegebenes Handle -> E-Mail-Praefix -> anonym
  v_base := lower(regexp_replace(
    coalesce(
      new.raw_user_meta_data ->> 'handle',
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    '[^a-z0-9_]', '', 'g'
  ));

  if v_base is null or length(v_base) < 3 then
    v_base := 'grid' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  v_base   := left(v_base, 14);
  v_handle := v_base;

  while exists (select 1 from public.profiles p where p.handle = v_handle) loop
    v_try := v_try + 1;
    v_handle := left(v_base, 14) || substr(md5(random()::text), 1, 5);
    if v_try > 20 then
      v_handle := 'grid' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, handle, birth_year, country_code, language)
  values (
    new.id,
    v_handle,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'birth_year', '')::smallint,
      (extract(year from now()) - 18)::smallint
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'country_code', ''), 'AT'),
    coalesce(nullif(new.raw_user_meta_data ->> 'language', ''), 'de')
  )
  on conflict (id) do nothing;

  return new;
end
$fn$;


-- =============================================================================
-- Bootstrap der Interessen
--
-- Ohne Zeilen in user_categories liefert get_feed() jeder Karte das
-- Interessengewicht 0.3 - der Feed funktioniert, wirkt aber beliebig. Bis das
-- Onboarding steht, bekommt jeder neue Account die sieben Wurzelkategorien
-- mit neutralem Gewicht. Das Onboarding ueberschreibt sie spaeter mit
-- is_explicit = true.
-- =============================================================================

create or replace function public.bootstrap_interests()
returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into public.user_categories (user_id, category_id, interest_weight, is_explicit)
  select new.id, c.id, 1.0, false
    from public.categories c
   where c.parent_id is null and c.is_active
  on conflict (user_id, category_id) do nothing;
  return new;
end
$fn$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.bootstrap_interests();


-- =============================================================================
-- Eigenes Profil komfortabel laden
--
-- Der Client koennte profiles direkt abfragen, aber ein RPC haelt die Form
-- stabil, wenn spaeter Felder dazukommen.
-- =============================================================================

create or replace function public.get_my_profile()
returns public.profiles
language sql stable security definer set search_path = ''
as $fn$
  select * from public.profiles where id = auth.uid();
$fn$;
grant execute on function public.get_my_profile() to authenticated;


-- =============================================================================
-- get_feed, finale Fassung
--
-- Zwei Korrekturen gegenueber 0005:
--
-- 1) Interessen vererben sich nach unten. Wer 'tech' gewaehlt hat, muss auch
--    'tech.ai' bekommen - sonst faellt beim Start jede Unterkategorie auf das
--    Grundgewicht 0.3 und der Feed wirkt beliebig. Geloest per LATERAL, das
--    zuerst den exakten Treffer und sonst den Elternknoten nimmt.
--
-- 2) Serendipity hat jetzt einen Rueckfall. Bevorzugt kommen Karten AUSSERHALB
--    der Interessen; gibt es davon zu wenige, wird mit zufaelligen aufgefuellt,
--    statt den Batch unvollstaendig zu lassen.
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
    select content_id from public.user_content_state where user_id = v_user
  ),
  interests as (
    select category_id, interest_weight, difficulty_pref
      from public.user_categories where user_id = v_user
  ),
  pool as (
    select ci.id                  as content_id,
           ci.content_type        as content_type,
           (i.interest_weight is not null) as in_bubble,
           coalesce(i.interest_weight, 0.3)
           * exp(-extract(epoch from (now() - coalesce(ci.published_at, ci.created_at)))
                 / 172800.0)                                   -- Halbwertszeit 48 h
           * (1.0 - abs(ci.difficulty - coalesce(i.difficulty_pref, 2)) * 0.18)
           * (coalesce(s.trust_score, 50) / 100.0)
           * (case when ci.language = v_p.language then 1.0 else 0.55 end)
           * (0.85 + random() * 0.3)                           -- Rauschen gegen Monotonie
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
     where ci.status = 'approved'
       and ci.language = any(v_langs)
       and ci.content_type <> 'course_lesson'
       and (ci.expires_at is null or ci.expires_at > now())
       and (ci.region_code is null or ci.region_code = v_p.country_code
            or ci.region_code = v_p.region_code)
       and not exists (select 1 from seen where seen.content_id = ci.id)
  ),
  picked as (
    (select content_id from pool where content_type = 'news'
      order by score desc limit v_n_news)
    union
    (select content_id from pool where content_type in ('knowledge','interactive')
      order by score desc limit v_n_know)
    union
    -- Blase zuerst verlassen; reicht das nicht, mit Zufall auffuellen.
    (select content_id from pool
      order by in_bubble asc, random() limit v_n_serp)
  )
  select ci.* from public.content_items ci
    join picked pk on pk.content_id = ci.id;
end
$fn$;
grant execute on function public.get_feed(int) to authenticated;
