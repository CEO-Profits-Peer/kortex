-- =============================================================================
-- 0005_i18n.sql  ·  Mehrsprachigkeit
--
-- Warum jetzt und nicht spaeter: i18n nachzuruesten ist eine der teuersten
-- Umbauten ueberhaupt, weil jeder hartcodierte String einzeln gesucht werden
-- muss. Ab Zeile 1 mitzudenken kostet fast nichts.
--
-- Zwei getrennte Ebenen:
--   UI-Strings  -> app/src/locales/*.json  (i18next, nicht in der DB)
--   Datenstrings-> hier, als jsonb {"de":"...","en":"..."}
--   Card-Inhalte-> content_items.language, EINE Zeile pro Sprache.
--                  Cards werden NICHT maschinell uebersetzt, sondern pro
--                  Sprache aus eigenen Quellen erzeugt. Uebersetzte News
--                  klingen uebersetzt, und genau das ist der Slop-Verdacht.
-- =============================================================================

-- Fallback-Kette: gewuenschte Sprache -> 'de' -> 'en' -> erster vorhandener Wert
create or replace function public.i18n(p_field jsonb, p_lang text)
returns text
language sql immutable parallel safe set search_path = ''
as $fn$
  select coalesce(
    p_field ->> p_lang,
    p_field ->> 'de',
    p_field ->> 'en',
    (select value from jsonb_each_text(p_field) limit 1)
  );
$fn$;
grant execute on function public.i18n(jsonb, text) to authenticated;


-- --- Kategorien ---------------------------------------------------------------
alter table public.categories
  add column if not exists name_i18n jsonb not null default '{}'::jsonb,
  add column if not exists description_i18n jsonb not null default '{}'::jsonb,
  -- slug bleibt sprachneutral und stabil: '#zinseszins' ist die ID des
  -- Hashtags, nicht sein Anzeigename. Die Anzeige kommt aus name_i18n.
  add column if not exists slug_i18n jsonb not null default '{}'::jsonb;

update public.categories
   set name_i18n = jsonb_build_object('de', display_name)
 where name_i18n = '{}'::jsonb;

-- --- Achievements -------------------------------------------------------------
alter table public.achievements
  add column if not exists title_i18n jsonb not null default '{}'::jsonb,
  add column if not exists description_i18n jsonb not null default '{}'::jsonb;

-- --- Interaktions-Templates ---------------------------------------------------
alter table public.interaction_templates
  add column if not exists name_i18n jsonb not null default '{}'::jsonb;

-- --- Kurse --------------------------------------------------------------------
-- courses.language existiert bereits. Ein Kurs ist immer einsprachig;
-- Uebersetzungen sind eigene Kurse, verknuepft ueber translation_group.
alter table public.courses
  add column if not exists translation_group uuid;
create index if not exists courses_translation_group_idx
  on public.courses (translation_group) where translation_group is not null;

-- --- Content ------------------------------------------------------------------
-- Cards derselben Story in verschiedenen Sprachen teilen sich die cluster_id.
create index if not exists content_items_language_idx
  on public.content_items (language, status, published_at desc);

-- --- Quellen ------------------------------------------------------------------
-- Eine Quelle liefert genau eine Sprache. Mehrsprachige Anbieter bekommen
-- pro Sprache eine eigene Zeile ('eu-commission-de', 'eu-commission-en').
alter table public.sources
  add column if not exists content_languages text[] not null default array['de'];

update public.sources
   set content_languages = array[default_language]
 where content_languages = array['de'] and default_language <> 'de';


-- --- Unterstuetzte Sprachen ---------------------------------------------------
insert into public.app_config (key, value, description) values
('languages', '{
   "launch":    ["de","en"],
   "planned":   [],
   "later":     ["fr","es","it","tr"],
   "ui_fallback": "en",
   "content_fallback_to_english": true
 }', 'de und en ab Tag 1 gleichwertig: die erste Testgruppe sitzt in Oesterreich UND in Kanada. content_fallback_to_english: wenn in der Nutzersprache zu wenig Cards da sind, mit englischen auffuellen statt einen leeren Feed zu zeigen.')
on conflict (key) do update set value = excluded.value, description = excluded.description;


-- --- get_feed sprachbewusst machen -------------------------------------------
-- Ersetzt die Sprachbedingung aus 0003: statt hart auf die Profilsprache zu
-- filtern, wird bei zu duennem Bestand mit Englisch aufgefuellt.
create or replace function public.user_feed_languages(p_user uuid)
returns text[]
language sql stable security definer set search_path = ''
as $fn$
  select case
    when (select count(*) from public.content_items ci
           join public.profiles p on p.id = p_user
          where ci.status = 'approved' and ci.language = p.language
            and (ci.expires_at is null or ci.expires_at > now())) < 60
     and (select (value->>'content_fallback_to_english')::boolean
            from public.app_config where key = 'languages')
    then array[(select language from public.profiles where id = p_user), 'en']
    else array[(select language from public.profiles where id = p_user)]
  end;
$fn$;
revoke execute on function public.user_feed_languages(uuid) from anon, authenticated;


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
           ci.primary_category_id as category_id,
           coalesce(i.interest_weight, 0.3)
           * exp(-extract(epoch from (now() - coalesce(ci.published_at, ci.created_at)))
                 / 172800.0)                                      -- Halbwertszeit 48 h
           * (1.0 - abs(ci.difficulty - coalesce(i.difficulty_pref, 2)) * 0.18)
           * (coalesce(s.trust_score, 50) / 100.0)
           -- Muttersprache schlaegt Fallback-Sprache
           * (case when ci.language = v_p.language then 1.0 else 0.55 end)
           * (0.85 + random() * 0.3)
             as score
      from public.content_items ci
      left join interests i on i.category_id = ci.primary_category_id
      left join public.sources s on s.id = ci.primary_source_id
     where ci.status = 'approved'
       and ci.language = any(v_langs)
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
    (select content_id from pool
      where category_id not in (select category_id from interests)
      order by random() limit v_n_serp)
  )
  select ci.* from public.content_items ci
    join picked pk on pk.content_id = ci.id;
end
$fn$;
grant execute on function public.get_feed(int) to authenticated;
