-- =============================================================================
-- 0026_search_and_person_feed.sql
--
-- Zwei Dinge, die beide denselben Grund haben: Personen sollen sich wie
-- Personen anfuehlen und nicht wie Datensaetze.
--
--   1. Suche nach dem NAMEN, nicht nur nach dem Handle. Wer "Lena" eintippt,
--      meint Lena - nicht "@lena_k_2007". Das Handle war bisher das einzige,
--      wonach search_all bei Profilen gesucht hat.
--
--   2. Ein Repost im Profil fuehrt in den FEED, nicht in die Kategorie. Wer
--      auf etwas tippt, das eine Person empfohlen hat, will das sehen - und
--      danach am liebsten mehr von dieser Person.
-- =============================================================================


-- --- 1. Suche findet Anzeigenamen -------------------------------------------
--
-- Nur der Profil-Zweig aendert sich. Die uebrigen Zweige stehen unveraendert
-- hier, weil `create or replace function` die ganze Funktion ersetzt.
create or replace function public.search_all(p_query text, p_limit int default 20)
returns table (
  kind text, id text, title text, subtitle text, meta jsonb, score real
)
language sql security definer
as $fn$
  with q as (select trim(both from p_query) as raw,
                    lower(regexp_replace(trim(both from p_query), '^[@#]', '')) as term)
  select * from (
    -- #kategorien
    select 'category'::text, c.id, c.display_name,
           coalesce(c.description, ''),
           jsonb_build_object('emoji', c.emoji, 'slug', c.slug,
                              'levelable', c.is_levelable, 'accent', c.accent_hex),
           (similarity(c.slug, (select term from q)) * 1.4)::real
      from public.categories c, q
     where c.is_active and (q.raw not like '@%')
       and (c.slug % q.term or c.display_name ilike '%' || q.term || '%')

    union all
    -- @quellen
    select 'source', s.id, s.display_name, s.handle,
           jsonb_build_object('logo', s.logo_url, 'license', s.license_class,
                              'trust', s.trust_score),
           (similarity(s.handle, (select term from q)) * 1.2)::real
      from public.sources s, q
     where s.is_active and (q.raw not like '#%')
       and (s.handle % q.term or s.display_name ilike '%' || q.term || '%')

    union all
    -- @nutzer  ·  jetzt auch ueber den Anzeigenamen
    --
    -- Zwei Vergleiche, das bessere Ergebnis zaehlt: `similarity` auf dem
    -- Handle faengt Tippfehler ("lena_k" fuer "lenak"), `ilike` auf dem
    -- Namen faengt Teilworte ("Lena" in "Lena Kaufmann"). Nur eines von
    -- beidem laesst jeweils die Haelfte der Treffer liegen.
    select 'profile', pp.id::text,
           coalesce(nullif(trim(pp.display_name), ''), pp.handle),
           '@' || pp.handle,
           jsonb_build_object('avatar_seed', pp.avatar_seed, 'mastery', pp.mastery_total),
           greatest(
             similarity(pp.handle, (select term from q)),
             -- Treffer am Wortanfang zaehlen mehr als irgendwo in der Mitte.
             case
               when lower(coalesce(pp.display_name, '')) like (select term from q) || '%'
                 then 0.9
               when lower(coalesce(pp.display_name, '')) like '%' || (select term from q) || '%'
                 then 0.6
               else 0
             end
           )::real
      from public.public_profiles pp, q
     where q.raw not like '#%'
       and (pp.handle % q.term
            or pp.display_name ilike '%' || q.term || '%')

    union all
    -- Kurse
    select 'course', co.id::text, co.title, co.description,
           jsonb_build_object('category', co.category_id, 'difficulty', co.difficulty,
                              'premium', co.is_premium),
           (similarity(co.slug, (select term from q)) * 1.1)::real
      from public.courses co, q
     where co.is_published and (co.slug % q.term or co.title ilike '%' || q.term || '%')

    union all
    -- Einzelne Cards
    select 'content', ci.id::text, ci.title, coalesce(ci.deck, ''),
           jsonb_build_object('category', ci.primary_category_id, 'type', ci.content_type),
           (similarity(ci.title, (select term from q)) * 0.8)::real
      from public.content_items ci, q
     where ci.status = 'approved'
       and (q.raw not like '@%') and (q.raw not like '#%')
       and ci.title ilike '%' || q.term || '%'
  -- Spaltennamen ausdruecklich: ohne sie heisst die letzte Spalte im
  -- Unterabfrage-Ergebnis nicht "score", und das ORDER BY darunter findet
  -- sie nicht.
  ) hits(kind, id, title, subtitle, meta, score)
  order by score desc
  limit p_limit;
$fn$;

-- search_path bleibt dynamisch, weil similarity() aus pg_trgm kommt und die
-- Erweiterung je nach Projekt in einem anderen Schema liegt. Dieselbe
-- Behandlung wie in 0003.
do $do$
declare v_ext_schema text;
begin
  select n.nspname into v_ext_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  execute format('alter function public.search_all(text, int) set search_path = %I, pg_temp',
                 v_ext_schema);
end $do$;

grant execute on function public.search_all(text, int) to authenticated;


-- =============================================================================
-- 2. Der Feed einer Person
--
-- Reihenfolge, und zwar genau diese:
--
--   1. die Karte, auf die getippt wurde;
--   2. die uebrigen Reposts dieser Person, neueste zuerst;
--   3. ihre Likes, falls oeffentlich - Reposts zuerst, weil ein Repost eine
--      bewusste Empfehlung ist und ein Like nur ein Daumen im Vorbeigehen;
--   4. danach uebernimmt der normale Feed. Das passiert in der App, nicht
--      hier: `get_feed` kennt schon die Interessen, die Wiederholungen und
--      das Nachrutschen. Das hier nachzubauen hiesse, zwei Feeds zu pflegen,
--      die auseinanderlaufen.
--
-- Genau ein Grund, warum das eine eigene Funktion ist und keine Abfrage in
-- der App: `content_items` ist per RLS gesperrt, und die Likes einer anderen
-- Person darf nur sehen, wer darf. Beides entscheidet der Server.
-- =============================================================================
create or replace function public.get_person_feed(
  p_handle text,
  p_start  uuid default null,
  p_limit  int  default 30
) returns setof public.content_items
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  v_me    uuid := auth.uid();
  v_them  uuid;
  v_public boolean;
begin
  if v_me is null then raise exception 'nicht angemeldet'; end if;

  select id, likes_public into v_them, v_public
    from public.profiles where handle = p_handle;
  if v_them is null then raise exception 'unbekanntes Handle: %', p_handle; end if;

  return query
  with picked as (
    -- Rang 0: die angetippte Karte. Sie steht immer vorn, egal woher sie kommt.
    select p_start as content_id, 0 as tier, now() as at
     where p_start is not null

    union all
    -- Rang 1: Reposts
    select r.content_id, 1, r.created_at
      from public.reposts r
     where r.user_id = v_them
       and (p_start is null or r.content_id <> p_start)

    union all
    -- Rang 2: Likes, nur wenn die Person sie oeffentlich zeigt
    select ucs.content_id, 2, ucs.last_seen_at
      from public.user_content_state ucs
     where v_public
       and ucs.user_id = v_them
       and ucs.is_liked
       and (p_start is null or ucs.content_id <> p_start)
       and not exists (
         select 1 from public.reposts r2
          where r2.user_id = v_them and r2.content_id = ucs.content_id
       )
  ),
  ranked as (
    select content_id, min(tier) as tier, max(at) as at
      from picked
     group by content_id
  )
  select ci.*
    from ranked
    join public.content_items ci on ci.id = ranked.content_id
   where ci.status = 'approved'
   order by ranked.tier, ranked.at desc
   limit p_limit;
end
$fn$;

grant execute on function public.get_person_feed(text, uuid, int) to authenticated;
